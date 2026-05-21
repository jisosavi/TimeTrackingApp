import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/supervisor_team", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const supervisorId = Number(c.req.query("supervisor_id") ?? 0);
  if (!supervisorId) return c.json({ success: false, error: "supervisor_id vaaditaan" }, 400);

  const [sup] = await sql`SELECT id FROM supervisors WHERE id = ${supervisorId} AND company_id = ${admin.company_id as number}`;
  if (!sup) return c.json({ success: false, error: "Esihenkilöä ei löydy" }, 404);

  const employees = await sql`
    SELECT e.id, e.name,
           CASE WHEN se.employee_id IS NOT NULL THEN 1 ELSE 0 END AS in_team,
           (SELECT STRING_AGG(s2.first_name || ' ' || s2.last_name, ', ')
            FROM supervisor_employees se2
            JOIN supervisors s2 ON s2.id = se2.supervisor_id
            WHERE se2.employee_id = e.id AND se2.supervisor_id != ${supervisorId}) AS other_supervisors
    FROM employees e
    LEFT JOIN supervisor_employees se ON se.employee_id = e.id AND se.supervisor_id = ${supervisorId}
    WHERE e.company_id = ${admin.company_id as number} AND e.active = TRUE
    ORDER BY e.name ASC
  `;
  return c.json({ success: true, employees });
});

app.post("/api/supervisor_team", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const supervisorId = Number(body.supervisor_id ?? 0);
  const employeeIds: number[] = Array.isArray(body.employee_ids) ? body.employee_ids.map(Number) : [];

  if (!supervisorId) return c.json({ success: false, error: "supervisor_id vaaditaan" }, 400);

  const [sup] = await sql`SELECT id FROM supervisors WHERE id = ${supervisorId} AND company_id = ${admin.company_id as number}`;
  if (!sup) return c.json({ success: false, error: "Esihenkilöä ei löydy" }, 404);

  await sql`DELETE FROM supervisor_employees WHERE supervisor_id = ${supervisorId}`;
  for (const eid of employeeIds) {
    await sql`INSERT INTO supervisor_employees (supervisor_id, employee_id) VALUES (${supervisorId}, ${eid}) ON CONFLICT DO NOTHING`;
  }
  return c.json({ success: true, team_size: employeeIds.length });
});

export default app;
