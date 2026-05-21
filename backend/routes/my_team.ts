import { Hono } from "@hono/hono";
import { requireSupervisor } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/my_team", requireSupervisor, async (c) => {
  const sup = c.get("user") as Record<string, unknown>;
  const members = await sql`
    SELECT e.id, e.name, e.email, e.phone, e.birth_year
    FROM employees e
    JOIN supervisor_employees se ON se.employee_id = e.id
    WHERE se.supervisor_id = ${sup.id as number} AND e.company_id = ${sup.company_id as number} AND e.active = TRUE
    ORDER BY e.name ASC
  `;
  return c.json({ success: true, members });
});

export default app;
