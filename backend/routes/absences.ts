import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import { getCompanyCreds, createAbsence } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

const ALLOWED_CAUSE_CODES = new Set([
  "illness", "partTimeSickLeave", "childIllness", "parentalLeave",
  "specialMaternityLeave", "childCareLeave", "partTimeChildCareLeave",
  "rehabilitation", "partTimeAbsenceDueToRehabilitation", "occupationalAccident",
  "unpaidLeave", "personalReason", "leaveOfAbsence", "training",
  "studyLeave", "jobAlternationLeave", "militaryRefresherTraining",
  "militaryService", "layOff", "other",
]);

app.get("/api/absences", requireEmployee, async (c) => {
  const emp = c.get("user") as { id: number; company_id: number };
  const statusFilter = c.req.query("status");

  const absences = statusFilter && statusFilter !== "all"
    ? await sql`SELECT * FROM absence_records WHERE company_id = ${emp.company_id} AND employee_id = ${emp.id} AND status = ${statusFilter} ORDER BY start_date DESC`
    : await sql`SELECT * FROM absence_records WHERE company_id = ${emp.company_id} AND employee_id = ${emp.id} ORDER BY start_date DESC`;

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
    causeCode?: string;
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
  const causeCode = body.causeCode && ALLOWED_CAUSE_CODES.has(body.causeCode) ? body.causeCode : "other";
  if (!startDate || !endDate) return c.json({ error: "missing_dates" }, 400);
  if (endDate < startDate) return c.json({ error: "invalid_range" }, 400);

  const days = computeCalendarDays(startDate, endDate);

  const now = new Date().toISOString();
  const [result] = await sql`
    INSERT INTO absence_records
      (company_id, employee_id, reason, start_date, end_date, days, is_paid, affects_accrual, status, note, created_at, updated_at)
    VALUES (${emp.company_id}, ${emp.id}, ${causeCode}, ${startDate}, ${endDate}, ${days}, ${isPaid}, ${affectsAccrual}, 'pending', ${note ?? null}, ${now}, ${now})
    RETURNING id
  `;
  const absenceId = Number(result.id);

  writeAudit(emp.company_id, {
    event: "absence.created",
    actorType: "employee",
    actorId: emp.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "absence",
    resourceId: String(absenceId),
    after: { startDate, endDate, days, isPaid, affectsAccrual, reason: causeCode },
  });

  const salaxyId = emp.salaxy_employment_id;
  if (salaxyId) {
    try {
      const creds = await getCompanyCreds(emp.company_id);
      const salaxyAbsence = await createAbsence(salaxyId, {
        causeCode: causeCode as import("../lib/salaxy.ts").AbsenceCauseCode,
        startDate,
        endDate,
        days,
        isPaid,
        affectsAccrual,
        note: note ?? null,
      }, creds);
      await sql`UPDATE absence_records SET salaxy_absence_id = ${salaxyAbsence.id}, updated_at = ${new Date().toISOString()} WHERE id = ${absenceId}`;
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

  const [absence] = await sql`SELECT * FROM absence_records WHERE id = ${absenceId}`;
  return c.json({ absence }, 201);
});

function computeCalendarDays(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export default app;
