import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/holiday_proposals", requireEmployee, (c) => {
  const emp = c.get("user") as Record<string, unknown>;
  const statusFilter = c.req.query("status");
  const db = getCompanyDb(emp.company_id as number);

  const proposals = statusFilter && statusFilter !== "all"
    ? statusFilter === "rejected"
      ? db.prepare(
          "SELECT * FROM holiday_proposals WHERE employee_id = ? AND status IN ('rejected','clarifying') ORDER BY start_date ASC"
        ).all(emp.id as number)
      : db.prepare(
          "SELECT * FROM holiday_proposals WHERE employee_id = ? AND status = ? ORDER BY start_date ASC"
        ).all(emp.id as number, statusFilter)
    : db.prepare(
        "SELECT * FROM holiday_proposals WHERE employee_id = ? ORDER BY start_date ASC"
      ).all(emp.id as number);

  return c.json({ proposals });
});

app.post("/api/holiday_proposals", requireEmployee, async (c) => {
  const emp = c.get("user") as { id: number; company_id: number };

  let body: { start_date?: string; end_date?: string; label?: string | null; note?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const { start_date, end_date, label = null, note = null } = body;
  if (!start_date || !end_date) return c.json({ error: "missing_dates" }, 400);
  if (end_date < start_date) return c.json({ error: "invalid_range" }, 400);

  const workDays = computeWorkDays(start_date, end_date);
  if (workDays === 0) return c.json({ error: "no_work_days" }, 400);

  const db = getCompanyDb(emp.company_id);

  // Check for overlapping non-cancelled proposals
  const overlap = db.prepare(
    `SELECT id FROM holiday_proposals
     WHERE employee_id = ? AND status NOT IN ('rejected','withdrawn')
       AND start_date <= ? AND end_date >= ?`
  ).get(emp.id, end_date, start_date);
  if (overlap) return c.json({ error: "overlap" }, 409);

  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO holiday_proposals
       (employee_id, start_date, end_date, work_days, label, note, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'calendar', 'pending', ?, ?)`
  ).run(emp.id, start_date, end_date, workDays, label ?? null, note ?? null, now, now);

  const proposalId = result.lastInsertRowid;

  writeAudit(emp.company_id, {
    event: "holiday_proposal.created",
    actorType: "employee",
    actorId: emp.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "holiday_proposal",
    resourceId: String(proposalId),
    after: { start_date, end_date, work_days: workDays },
  });

  const proposal = db.prepare("SELECT * FROM holiday_proposals WHERE id = ?").get(proposalId);
  return c.json({ proposal }, 201);
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
