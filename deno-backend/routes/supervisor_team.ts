import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/supervisor_team.php", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const supervisorId = Number(c.req.query("supervisor_id") ?? 0);
  if (!supervisorId) return c.json({ success: false, error: "supervisor_id vaaditaan" }, 400);

  const sup = db.prepare("SELECT id FROM supervisors WHERE id = ? AND company_id = ?")
    .get(supervisorId, admin.company_id as number);
  if (!sup) return c.json({ success: false, error: "Esihenkilöä ei löydy" }, 404);

  const employees = db.prepare(
    `SELECT e.id, e.name,
            CASE WHEN se.employee_id IS NOT NULL THEN 1 ELSE 0 END AS in_team,
            (SELECT GROUP_CONCAT(s2.first_name || " " || s2.last_name, ", ")
             FROM supervisor_employees se2
             JOIN supervisors s2 ON s2.id = se2.supervisor_id
             WHERE se2.employee_id = e.id AND se2.supervisor_id != ?) AS other_supervisors
     FROM employees e
     LEFT JOIN supervisor_employees se ON se.employee_id = e.id AND se.supervisor_id = ?
     WHERE e.company_id = ? AND e.active = 1
     ORDER BY e.name ASC`
  ).all(supervisorId, supervisorId, admin.company_id as number);
  return c.json({ success: true, employees });
});

app.post("/api/supervisor_team.php", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const body = await c.req.json().catch(() => ({}));
  const supervisorId = Number(body.supervisor_id ?? 0);
  const employeeIds: number[] = Array.isArray(body.employee_ids) ? body.employee_ids.map(Number) : [];

  if (!supervisorId) return c.json({ success: false, error: "supervisor_id vaaditaan" }, 400);

  const sup = db.prepare("SELECT id FROM supervisors WHERE id = ? AND company_id = ?")
    .get(supervisorId, admin.company_id as number);
  if (!sup) return c.json({ success: false, error: "Esihenkilöä ei löydy" }, 404);

  db.prepare("DELETE FROM supervisor_employees WHERE supervisor_id = ?").run(supervisorId);
  if (employeeIds.length) {
    const ins = db.prepare("INSERT OR IGNORE INTO supervisor_employees (supervisor_id, employee_id) VALUES (?, ?)");
    for (const eid of employeeIds) ins.run(supervisorId, eid);
  }
  return c.json({ success: true, team_size: employeeIds.length });
});

export default app;
