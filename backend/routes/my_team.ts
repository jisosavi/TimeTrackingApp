import { Hono } from "@hono/hono";
import { requireSupervisor } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/my_team", requireSupervisor, (c) => {
  const sup = c.get("user") as Record<string, unknown>;
  const members = getCompanyDb(sup.company_id as number).prepare(
    `SELECT e.id, e.name, e.email, e.phone, e.birth_year
     FROM employees e
     JOIN supervisor_employees se ON se.employee_id = e.id
     WHERE se.supervisor_id = ? AND e.company_id = ? AND e.active = 1
     ORDER BY e.name ASC`
  ).all(sup.id as number, sup.company_id as number);
  return c.json({ success: true, members });
});

export default app;
