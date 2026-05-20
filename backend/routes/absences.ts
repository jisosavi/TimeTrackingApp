import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import { getCompanyCreds, createAbsence } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/absences", requireEmployee, (c) => {
  const emp = c.get("user") as { id: number; company_id: number };
  const statusFilter = c.req.query("status");
  const db = getCompanyDb(emp.company_id);

  const absences = statusFilter && statusFilter !== "all"
    ? db.prepare(
        "SELECT * FROM absence_records WHERE employee_id = ? AND status = ? ORDER BY start_date DESC"
      ).all(emp.id, statusFilter)
    : db.prepare(
        "SELECT * FROM absence_records WHERE employee_id = ? ORDER BY start_date DESC"
      ).all(emp.id);

  return c.json({ absences });
});

app.post("/api/absences", requireEmployee, async (c) => {
  const emp = c.get("user") as {
    id: number;
    company_id: number;
    salaxy_employment_id: string | null;
  };

  let body: {
    startDate?: string;
    endDate?: string;
    isPaid?: boolean;
    affectsAccrual?: boolean;
    note?: string | null;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const { startDate, endDate, isPaid = true, affectsAccrual = true, note = null } = body;
  if (!startDate || !endDate) return c.json({ error: "missing_dates" }, 400);
  if (endDate < startDate) return c.json({ error: "invalid_range" }, 400);

  const days = computeWorkDays(startDate, endDate);
  if (days === 0) return c.json({ error: "no_work_days" }, 400);

  const db = getCompanyDb(emp.company_id);
  const now = new Date().toISOString();

  const result = db.prepare(
    `INSERT INTO absence_records
       (employee_id, reason, start_date, end_date, days, is_paid, affects_accrual, status, note, created_at, updated_at)
     VALUES (?, 'Kertausharjoitus', ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`
  ).run(
    emp.id, startDate, endDate, days,
    isPaid ? 1 : 0, affectsAccrual ? 1 : 0,
    note ?? null, now, now,
  );

  const absenceId = result.lastInsertRowid;

  writeAudit(emp.company_id, {
    event: "absence.created",
    actorType: "employee",
    actorId: emp.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "absence",
    resourceId: String(absenceId),
    after: { startDate, endDate, days, isPaid, affectsAccrual, reason: "Kertausharjoitus" },
  });

  // Degrade gracefully if Salaxy is unavailable
  const salaxyId = emp.salaxy_employment_id;
  if (salaxyId) {
    try {
      const creds = getCompanyCreds(emp.company_id);
      const salaxyAbsence = await createAbsence(salaxyId, {
        causeCode: "militaryRefresherTraining",
        startDate,
        endDate,
        days,
        isPaid,
        affectsAccrual,
        note: note ?? null,
      }, creds);
      db.prepare("UPDATE absence_records SET salaxy_absence_id = ?, updated_at = ? WHERE id = ?")
        .run(salaxyAbsence.id, new Date().toISOString(), absenceId);
      writeAudit(emp.company_id, {
        event: "salaxy.absence.synced",
        actorType: "employee",
        actorId: emp.id,
        resource: "absence",
        resourceId: String(absenceId),
        meta: { salaxy_absence_id: salaxyAbsence.id },
      });
    } catch (err) {
      console.error("[absences] Salaxy sync failed", err);
    }
  }

  const absence = db.prepare("SELECT * FROM absence_records WHERE id = ?").get(absenceId);
  return c.json({ absence }, 201);
});

function computeWorkDays(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default app;
