import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getMasterDb } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/payroll_settings", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const row = getMasterDb().prepare(
    "SELECT payroll_period, payday_1, payday_2, payroll_settings_updated_at, salaxy_company_id FROM companies WHERE id = ?"
  ).get(admin.company_id as number) as Record<string, unknown> | undefined;
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
  getMasterDb().prepare(
    "UPDATE companies SET payroll_period = ?, payday_1 = ?, payday_2 = ?, payroll_settings_updated_at = ? WHERE id = ?"
  ).run(period, payday1, payday2, now, admin.company_id as number);
  return c.json({ success: true, updated_at: now });
});

export default app;
