import { Hono } from "@hono/hono";
import { requireSuperAdmin } from "../lib/auth.ts";
import { getMasterDb } from "../lib/db.ts";
import { DB_DIR } from "../lib/config.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.delete("/api/super_admin/delete_company", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const companyId = body.company_id ? Number(body.company_id) : null;
  const confirmSlug = String(body.confirm_slug ?? "").trim();
  if (!companyId || !confirmSlug) return c.json({ success: false, error: "company_id and confirm_slug required" }, 400);

  const db = getMasterDb();
  const company = db.prepare("SELECT id, slug, db_file FROM companies WHERE id = ?").get(companyId) as Record<string, unknown> | undefined;
  if (!company) return c.json({ success: false, error: "Company not found" }, 404);
  if (company["slug"] !== confirmSlug) return c.json({ success: false, error: "Slug does not match" }, 422);

  if (company["db_file"]) { try { Deno.removeSync(`${DB_DIR}/${company["db_file"]}`); } catch { /* ok */ } }
  try { Deno.removeSync(`${DB_DIR}/salaxy_token_${companyId}.json`); } catch { /* ok */ }
  db.prepare("DELETE FROM companies WHERE id = ?").run(companyId);
  return c.json({ success: true });
});

const ALLOWED_FEATURES = ["time_app_enabled", "supervisor_ui_enabled", "approvals_enabled"] as const;

app.post("/api/super_admin/set_feature", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const companyId = Number(body.company_id ?? 0);
  const feature = String(body.feature ?? "").trim();
  const enabled = body.enabled ? 1 : 0;

  if (!companyId) return c.json({ success: false, error: "company_id required" }, 400);
  if (!ALLOWED_FEATURES.includes(feature as typeof ALLOWED_FEATURES[number])) {
    return c.json({ success: false, error: "Invalid feature" }, 400);
  }

  const db = getMasterDb();
  if (!db.prepare("SELECT id FROM companies WHERE id = ?").get(companyId)) {
    return c.json({ success: false, error: "Company not found" }, 404);
  }

  db.prepare(`UPDATE companies SET ${feature} = ? WHERE id = ?`).run(enabled, companyId);
  const company = db.prepare(
    `SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
            ui_language, salaxy_company_id AS business_id, db_file, salaxy_api_url, salaxy_username
     FROM companies WHERE id = ?`
  ).get(companyId);
  return c.json({ success: true, company });
});

app.patch("/api/super_admin/update_company", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id ?? 0);
  if (!id) return c.json({ success: false, error: "id required" }, 400);

  const db = getMasterDb();
  if (!db.prepare("SELECT id FROM companies WHERE id = ?").get(id)) {
    return c.json({ success: false, error: "Company not found" }, 404);
  }

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ success: false, error: "Name is required" }, 400);
    db.prepare("UPDATE companies SET name = ? WHERE id = ?").run(name, id);
  }
  if ("slug" in body) {
    const slug = String(body.slug ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]{1,2}$/.test(slug)) {
      return c.json({ success: false, error: "Slug must be 2–40 lowercase letters, numbers or hyphens" }, 400);
    }
    if (db.prepare("SELECT id FROM companies WHERE slug = ? AND id != ?").get(slug, id)) {
      return c.json({ success: false, error: "Slug already taken" }, 409);
    }
    db.prepare("UPDATE companies SET slug = ? WHERE id = ?").run(slug, id);
  }
  if ("business_id" in body) db.prepare("UPDATE companies SET salaxy_company_id = ? WHERE id = ?").run(String(body.business_id ?? "").trim() || null, id);
  if ("salaxy_account_id" in body) db.prepare("UPDATE companies SET salaxy_account_id = ? WHERE id = ?").run(String(body.salaxy_account_id ?? "").trim() || null, id);
  if ("country_code" in body) { const cc = String(body.country_code ?? "").trim(); if (cc) db.prepare("UPDATE companies SET country_code = ? WHERE id = ?").run(cc, id); }

  let salaxyCredsChanged = false;
  if ("salaxy_api_url" in body) { db.prepare("UPDATE companies SET salaxy_api_url = ? WHERE id = ?").run(String(body.salaxy_api_url ?? "").trim() || null, id); salaxyCredsChanged = true; }
  if ("salaxy_username" in body) { db.prepare("UPDATE companies SET salaxy_username = ? WHERE id = ?").run(String(body.salaxy_username ?? "").trim() || null, id); salaxyCredsChanged = true; }
  if ("salaxy_password" in body && String(body.salaxy_password ?? "").trim()) { db.prepare("UPDATE companies SET salaxy_password = ? WHERE id = ?").run(String(body.salaxy_password).trim(), id); salaxyCredsChanged = true; }
  if (salaxyCredsChanged) { try { Deno.removeSync(`${DB_DIR}/salaxy_token_${id}.json`); } catch { /* ok */ } }

  const company = db.prepare(
    `SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
            ui_language, salaxy_company_id AS business_id, salaxy_account_id, db_file,
            salaxy_api_url, salaxy_username, country_code
     FROM companies WHERE id = ?`
  ).get(id);
  return c.json({ success: true, company });
});

export default app;
