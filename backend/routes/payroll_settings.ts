import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/payroll_settings", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const [row] = await sql`
    SELECT payroll_period, payday_1, payday_2, payroll_settings_updated_at, salaxy_company_id
    FROM companies WHERE id = ${admin.company_id as number}
  `;
  const settings = row ?? { payroll_period: "monthly", payday_1: 15, payday_2: 0, payroll_settings_updated_at: null, salaxy_company_id: null };
  return c.json({ success: true, settings });
});

app.post("/api/payroll_settings", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const period = ["monthly", "biweekly"].includes(body.payroll_period) ? body.payroll_period : "monthly";
  const payday1 = Math.max(0, Math.min(31, Number(body.payday_1 ?? 15)));
  const payday2 = Math.max(0, Math.min(31, Number(body.payday_2 ?? 0)));
  const now = new Date().toISOString();
  await sql`
    UPDATE companies
    SET payroll_period = ${period}, payday_1 = ${payday1}, payday_2 = ${payday2}, payroll_settings_updated_at = ${now}
    WHERE id = ${admin.company_id as number}
  `;
  return c.json({ success: true, updated_at: now });
});

export default app;
