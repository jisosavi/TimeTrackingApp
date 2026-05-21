import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/holiday_proposals", requireEmployee, async (c) => {
  const emp = c.get("user") as Record<string, unknown>;
  const companyId = emp.company_id as number;
  const empId = emp.id as number;
  const statusFilter = c.req.query("status");

  const proposals = statusFilter && statusFilter !== "all"
    ? statusFilter === "rejected"
      ? await sql`SELECT * FROM holiday_proposals WHERE company_id = ${companyId} AND employee_id = ${empId} AND status IN ('rejected','clarifying') ORDER BY start_date ASC`
      : await sql`SELECT * FROM holiday_proposals WHERE company_id = ${companyId} AND employee_id = ${empId} AND status = ${statusFilter} ORDER BY start_date ASC`
    : await sql`SELECT * FROM holiday_proposals WHERE company_id = ${companyId} AND employee_id = ${empId} ORDER BY start_date ASC`;

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

  const [overlap] = await sql`
    SELECT id FROM holiday_proposals
    WHERE company_id = ${emp.company_id} AND employee_id = ${emp.id}
      AND status NOT IN ('rejected','withdrawn')
      AND start_date <= ${end_date} AND end_date >= ${start_date}
  `;
  if (overlap) return c.json({ error: "overlap" }, 409);

  const now = new Date().toISOString();
  const [result] = await sql`
    INSERT INTO holiday_proposals
      (company_id, employee_id, start_date, end_date, work_days, label, note, source, status, created_at, updated_at)
    VALUES (${emp.company_id}, ${emp.id}, ${start_date}, ${end_date}, ${workDays}, ${label ?? null}, ${note ?? null}, 'calendar', 'pending', ${now}, ${now})
    RETURNING id
  `;
  const proposalId = Number(result.id);

  writeAudit(emp.company_id, {
    event: "holiday_proposal.created",
    actorType: "employee",
    actorId: emp.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "holiday_proposal",
    resourceId: String(proposalId),
    after: { start_date, end_date, work_days: workDays },
  });

  const [proposal] = await sql`SELECT * FROM holiday_proposals WHERE id = ${proposalId}`;
  return c.json({ proposal }, 201);
});

app.post("/api/holiday_proposals/:id/clarify", requireEmployee, async (c) => {
  const emp = c.get("user") as { id: number; company_id: number };
  const proposalId = Number(c.req.param("id"));

  let body: { text?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid_json" }, 400); }
  if (!body.text?.trim()) return c.json({ error: "missing_text" }, 400);

  const [proposal] = await sql`
    SELECT * FROM holiday_proposals WHERE id = ${proposalId} AND company_id = ${emp.company_id} AND employee_id = ${emp.id}
  `;
  if (!proposal) return c.json({ error: "not_found" }, 404);
  if (proposal.status !== "clarifying") return c.json({ error: "not_clarifying" }, 409);

  const now = new Date().toISOString();
  await sql`
    UPDATE holiday_proposals
    SET status = 'pending', employee_clarification = ${body.text.trim()}, updated_at = ${now}
    WHERE id = ${proposalId}
  `;

  writeAudit(emp.company_id, {
    event: "holiday_proposal.clarified",
    actorType: "employee",
    actorId: emp.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "holiday_proposal",
    resourceId: String(proposalId),
    after: { employee_clarification: body.text.trim() },
  });

  return c.json({ ok: true });
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
