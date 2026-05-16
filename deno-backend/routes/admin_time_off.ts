import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import { getCompanyCreds, getHolidayYears, createAbsence } from "../lib/salaxy.ts";

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

function supervisorTeamIds(db: ReturnType<typeof getCompanyDb>, supervisorId: number): number[] {
  return (db.prepare("SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?").all(supervisorId) as { employee_id: number }[]).map((r) => r.employee_id);
}

// ── GET /api/admin/time_off_stats?month=YYYY-MM ───────────────────────────

app.get("/api/admin/time_off_stats", requireAdminOrSupervisor, (c) => {
  const actor = c.get("user") as Actor;
  const db = getCompanyDb(actor.company_id);

  const monthParam = c.req.query("month");
  const today = new Date().toISOString().slice(0, 10);
  const ym = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const monthStart = `${ym}-01`;
  const [y, m] = ym.split("-");
  const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
  const monthEnd = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  // Scope: admin = all employees, supervisor = team
  const empIds = actor._type === "admin"
    ? (db.prepare("SELECT id FROM employees WHERE company_id = ? AND active = 1").all(actor.company_id) as { id: number }[]).map((r) => r.id)
    : supervisorTeamIds(db, actor.id);

  if (empIds.length === 0) {
    return c.json({ on_holiday_this_month: [], active_absences_today: [] });
  }

  const ph = empIds.map(() => "?").join(",");

  const holidayRows = db.prepare(
    `SELECT e.name AS employee_name, hp.start_date, hp.end_date, hp.work_days
     FROM holiday_proposals hp
     JOIN employees e ON e.id = hp.employee_id
     WHERE hp.employee_id IN (${ph})
       AND hp.status = 'approved'
       AND hp.start_date <= ? AND hp.end_date >= ?
     ORDER BY hp.start_date`,
  ).all(...empIds, monthEnd, monthStart) as { employee_name: string; start_date: string; end_date: string; work_days: number }[];

  const absenceRows = db.prepare(
    `SELECT e.name AS employee_name, ar.reason, ar.end_date
     FROM absence_records ar
     JOIN employees e ON e.id = ar.employee_id
     WHERE ar.employee_id IN (${ph})
       AND ar.status IN ('approved','pending')
       AND ar.start_date <= ? AND ar.end_date >= ?
     ORDER BY ar.start_date`,
  ).all(...empIds, today, today) as { employee_name: string; reason: string; end_date: string }[];

  return c.json({
    on_holiday_this_month: holidayRows,
    active_absences_today: absenceRows,
  });
});

// ── GET /api/admin/holiday_year_summary?employeeId=N ─────────────────────

app.get("/api/admin/holiday_year_summary", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const empIdStr = c.req.query("employeeId");
  if (!empIdStr) return c.json({ error: "missing_employee_id" }, 400);
  const empId = parseInt(empIdStr, 10);
  if (isNaN(empId)) return c.json({ error: "invalid_employee_id" }, 400);

  const db = getCompanyDb(actor.company_id);

  if (actor._type === "supervisor") {
    if (!supervisorTeamIds(db, actor.id).includes(empId)) return c.json({ error: "forbidden" }, 403);
  }

  const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(empId) as Record<string, unknown> | undefined;
  if (!emp) return c.json({ error: "not_found" }, 404);

  const salaxyId = emp.salaxy_employment_id as string | null;
  if (!salaxyId) return c.json({ summary: null, salaxy_url: null });

  try {
    const creds = getCompanyCreds(actor.company_id);
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

// ── POST /api/admin/record_absence.php ───────────────────────────────────────

app.post("/api/admin/record_absence", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const db = getCompanyDb(actor.company_id);

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
    if (!supervisorTeamIds(db, actor.id).includes(employeeId)) return c.json({ error: "forbidden" }, 403);
  }

  const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) as Record<string, unknown> | undefined;
  if (!emp) return c.json({ error: "not_found" }, 404);

  const days = computeWorkDays(startDate, endDate);
  if (days === 0) return c.json({ error: "no_work_days" }, 400);

  const now = new Date().toISOString();

  const result = db.prepare(
    `INSERT INTO absence_records
       (employee_id, reason, start_date, end_date, days, is_paid, affects_accrual, status, note, created_at, updated_at)
     VALUES (?, 'Kertausharjoitus', ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
  ).run(employeeId, startDate, endDate, days, isPaid ? 1 : 0, affectsAccrual ? 1 : 0, note ?? null, now, now);

  const absenceId = result.lastInsertRowid;

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
      const creds = getCompanyCreds(actor.company_id);
      const salaxyAbsence = await createAbsence(salaxyId, {
        reason: "Kertausharjoitus",
        startDate,
        endDate,
        days,
        isPaid,
        affectsAccrual,
        note: note ?? null,
      }, creds);
      db.prepare("UPDATE absence_records SET salaxy_absence_id = ?, updated_at = ? WHERE id = ?")
        .run(salaxyAbsence.id, new Date().toISOString(), absenceId);
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

  return c.json({ absence: db.prepare("SELECT * FROM absence_records WHERE id = ?").get(absenceId) }, 201);
});

export default app;
