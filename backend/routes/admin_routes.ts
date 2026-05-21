import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/admin/country_setting", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const [row] = await sql`SELECT country_code FROM companies WHERE id = ${admin.company_id as number}`;
  return c.json({ success: true, country_code: (row?.country_code as string | null) ?? "FI" });
});

app.patch("/api/admin/country_setting", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const cc = String(body.country_code ?? "").trim();
  if (!cc) return c.json({ success: false, error: "country_code required" }, 400);
  await sql`UPDATE companies SET country_code = ${cc} WHERE id = ${admin.company_id as number}`;
  return c.json({ success: true, country_code: cc });
});

app.post("/api/admin/mark_holidays", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const holidays: { date?: string; name?: string }[] = Array.isArray(body.holidays) ? body.holidays : [];
  if (!holidays.length) return c.json({ success: false, error: "holidays array required" }, 400);

  let updated = 0;
  for (const h of holidays) {
    const date = String(h.date ?? "").trim();
    const name = String(h.name ?? "").trim();
    if (!date || !name) continue;
    const result = await sql`
      UPDATE time_entries
      SET comment = CASE
        WHEN comment IS NULL OR comment = '' THEN ${name}
        ELSE comment || ' | ' || ${name}
      END
      WHERE entry_date = ${date} AND company_id = ${admin.company_id as number} AND status IN ('pending', 'approved')
    `;
    updated += Number(result.count);
  }
  return c.json({ success: true, updated });
});

export default app;
