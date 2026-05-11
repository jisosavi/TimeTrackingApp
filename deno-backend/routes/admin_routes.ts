import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/admin/country_setting.php", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const row = getMasterDb().prepare("SELECT country_code FROM companies WHERE id = ?")
    .get(admin.company_id as number) as { country_code: string | null } | undefined;
  return c.json({ success: true, country_code: row?.country_code ?? "FI" });
});

app.patch("/api/admin/country_setting.php", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const cc = String(body.country_code ?? "").trim();
  if (!cc) return c.json({ success: false, error: "country_code required" }, 400);
  getMasterDb().prepare("UPDATE companies SET country_code = ? WHERE id = ?")
    .run(cc, admin.company_id as number);
  return c.json({ success: true, country_code: cc });
});

app.post("/api/admin/mark_holidays.php", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const holidays: { date?: string; name?: string }[] = Array.isArray(body.holidays) ? body.holidays : [];
  if (!holidays.length) return c.json({ success: false, error: "holidays array required" }, 400);

  const db = getCompanyDb(admin.company_id as number);
  let updated = 0;
  const stmt = db.prepare(
    `UPDATE time_entries
     SET comment = CASE
       WHEN comment IS NULL OR comment = '' THEN ?
       ELSE comment || ' | ' || ?
     END
     WHERE entry_date = ? AND status IN ('pending', 'approved')`
  );
  for (const h of holidays) {
    const date = String(h.date ?? "").trim();
    const name = String(h.name ?? "").trim();
    if (!date || !name) continue;
    const result = stmt.run(name, name, date);
    updated += result.changes;
  }
  return c.json({ success: true, updated });
});

export default app;
