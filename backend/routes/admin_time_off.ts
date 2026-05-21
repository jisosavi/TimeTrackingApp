import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import { getCompanyCreds, getHolidayYears, createAbsence, getPlannedHolidays } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

type Actor = { id: number; company_id: number; _type: "admin" | "supervisor" };

function computeWorkDays(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

async function supervisorTeamIds(supervisorId: number): Promise<number[]> {
  const rows = await sql`SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ${supervisorId}`;
  return rows.map((r) => Number(r.employee_id));
}

app.get("/api/admin/time_off_stats", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;

  const monthParam = c.req.query("month");
  const today = new Date().toISOString().slice(0, 10);
  const ym = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const monthStart = `${ym}-01`;
  const [y, m] = ym.split("-");
  const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
  const monthEnd = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  const empIds = actor._type === "admin"
    ? (await sql`SELECT id FROM employees WHERE company_id = ${actor.company_id} AND active = TRUE`).map((r) => Number(r.id))
    : await supervisorTeamIds(actor.id);

  if (empIds.length === 0) {
    return c.json({ on_holiday_this_month: [], active_absences_today: [] });
  }

  const holidayRows = await sql`
    SELECT e.name AS employee_name, hp.start_date, hp.end_date, hp.work_days
    FROM holiday_proposals hp
    JOIN employees e ON e.id = hp.employee_id
    WHERE hp.company_id = ${actor.company_id} AND hp.employee_id IN ${sql(empIds)}
      AND hp.status = 'approved'
      AND hp.start_date <= ${monthEnd} AND hp.end_date >= ${monthStart}
    ORDER BY hp.start_date
  `;

  const absenceRows = await sql`
    SELECT e.name AS employee_name, ar.reason, ar.end_date
    FROM absence_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.company_id = ${actor.company_id} AND ar.employee_id IN ${sql(empIds)}
      AND ar.status IN ('approved','pending')
      AND ar.start_date <= ${today} AND ar.end_date >= ${today}
    ORDER BY ar.start_date
  `;

  return c.json({
    on_holiday_this_month: holidayRows,
    active_absences_today: absenceRows,
  });
});

app.get("/api/admin/holiday_year_summary", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const empIdStr = c.req.query("employeeId");
  if (!empIdStr) return c.json({ error: "missing_employee_id" }, 400);
  const empId = parseInt(empIdStr, 10);
  if (isNaN(empId)) return c.json({ error: "invalid_employee_id" }, 400);

  if (actor._type === "supervisor") {
    const teamIds = await supervisorTeamIds(actor.id);
    if (!teamIds.includes(empId)) return c.json({ error: "forbidden" }, 403);
  }

  const [emp] = await sql`SELECT * FROM employees WHERE id = ${empId} AND company_id = ${actor.company_id}`;
  if (!emp) return c.json({ error: "not_found" }, 404);

  const salaxyId = emp.salaxy_employment_id as string | null;
  if (!salaxyId) return c.json({ summary: null, salaxy_url: null });

  try {
    const creds = await getCompanyCreds(actor.company_id);
    const years = await getHolidayYears(salaxyId, creds);
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = years.find((y) => today >= y.startDate && today <= y.endDate) ??
      (years.length > 0 ? years[years.length - 1]! : null);
    const salaxyBase = creds.apiUrl.replace(/\/api\/?$/, "");
    const salaxyUrl = `${salaxyBase}/employees/${salaxyId}`;
    return c.json({ summary: currentYear, salaxy_url: salaxyUrl });
  } catch (err) {
    console.error("[admin_time_off] holiday year summary failed", err);
    return c.json({ summary: null, salaxy_url: null });
  }
});

app.post("/api/admin/record_absence", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;

  let body: {
    employeeId?: number;
    startDate?: string;
    endDate?: string;
    isPaid?: boolean;
    affectsAccrual?: boolean;
    note?: string | null;
  };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid_json" }, 400); }

  const { employeeId, startDate, endDate, isPaid = true, affectsAccrual = true, note = null } = body;
  if (!employeeId || !startDate || !endDate) return c.json({ error: "missing_fields" }, 400);
  if (endDate < startDate) return c.json({ error: "invalid_range" }, 400);

  if (actor._type === "supervisor") {
    const teamIds = await supervisorTeamIds(actor.id);
    if (!teamIds.includes(employeeId)) return c.json({ error: "forbidden" }, 403);
  }

  const [emp] = await sql`SELECT * FROM employees WHERE id = ${employeeId} AND company_id = ${actor.company_id}`;
  if (!emp) return c.json({ error: "not_found" }, 404);

  const days = computeWorkDays(startDate, endDate);
  if (days === 0) return c.json({ error: "no_work_days" }, 400);

  const now = new Date().toISOString();
  const [result] = await sql`
    INSERT INTO absence_records
      (company_id, employee_id, reason, start_date, end_date, days, is_paid, affects_accrual, status, note, created_at, updated_at)
    VALUES (${actor.company_id}, ${employeeId}, 'Kertausharjoitus', ${startDate}, ${endDate}, ${days}, ${isPaid}, ${affectsAccrual}, 'approved', ${note ?? null}, ${now}, ${now})
    RETURNING id
  `;
  const absenceId = Number(result.id);

  writeAudit(actor.company_id, {
    event: "absence.created",
    actorType: actor._type,
    actorId: actor.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "absence",
    resourceId: String(absenceId),
    after: { employeeId, startDate, endDate, days, isPaid, affectsAccrual, reason: "Kertausharjoitus" },
  });

  const salaxyId = emp.salaxy_employment_id as string | null;
  if (salaxyId) {
    try {
      const creds = await getCompanyCreds(actor.company_id);
      const salaxyAbsence = await createAbsence(salaxyId, {
        causeCode: "militaryRefresherTraining",
        startDate,
        endDate,
        days,
        isPaid,
        affectsAccrual,
        note: note ?? null,
      }, creds);
      await sql`UPDATE absence_records SET salaxy_absence_id = ${salaxyAbsence.id}, updated_at = ${new Date().toISOString()} WHERE id = ${absenceId}`;
      writeAudit(actor.company_id, {
        event: "salaxy.absence.synced",
        actorType: actor._type,
        actorId: actor.id,
        resource: "absence",
        resourceId: String(absenceId),
        meta: { salaxy_absence_id: salaxyAbsence.id },
      });
    } catch (err) {
      console.error("[admin_time_off] Salaxy absence sync failed", err);
    }
  }

  const [absence] = await sql`SELECT * FROM absence_records WHERE id = ${absenceId}`;
  return c.json({ absence }, 201);
});

// deno-lint-ignore no-explicit-any
app.post("/api/admin/sync_holidays_from_salaxy", requireAdminOrSupervisor, async (c: any) => {
  const actor = c.get("user") as Actor;

  const empRows = await sql`
    SELECT id, salaxy_employment_id FROM employees
    WHERE company_id = ${actor.company_id} AND active = TRUE AND salaxy_employment_id IS NOT NULL
  `;
  if (empRows.length === 0) return c.json({ imported: 0, skipped: 0 });

  let creds;
  try { creds = await getCompanyCreds(actor.company_id); } catch {
    return c.json({ error: "salaxy_unavailable" }, 502);
  }

  const now = new Date().toISOString();
  let imported = 0, skipped = 0;

  for (const emp of empRows) {
    const salaxyId = emp.salaxy_employment_id as string;
    const empId = Number(emp.id);
    let holidays;
    try { holidays = await getPlannedHolidays(salaxyId, creds); } catch { continue; }

    for (const h of holidays) {
      const [existing] = await sql`SELECT id FROM holiday_proposals WHERE company_id = ${actor.company_id} AND salaxy_holiday_id = ${h.id}`;
      if (existing) { skipped++; continue; }
      await sql`
        INSERT INTO holiday_proposals
          (company_id, employee_id, start_date, end_date, work_days, source, status, salaxy_holiday_id, created_at, updated_at)
        VALUES
          (${actor.company_id}, ${empId}, ${h.startDate}, ${h.endDate}, ${h.days}, 'salaxy_sync', 'approved', ${h.id}, ${now}, ${now})
      `;
      imported++;
    }
  }

  return c.json({ imported, skipped });
});

export default app;
