import { Hono } from "@hono/hono";
import { Database } from "@db/sqlite";
import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "../lib/auth.ts";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";
import { DB_DIR, SALAXY_API_URL, SALAXY_PASSWORD, SALAXY_USERNAME } from "../lib/config.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

function countActiveEmployees(companyId: number): number {
  try {
    const row = getCompanyDb(companyId).prepare("SELECT COUNT(*) AS n FROM employees WHERE active = 1").get() as { n: number };
    return row.n;
  } catch {
    return 0;
  }
}

function getLastActivity(dbFile: string | null | undefined): string | null {
  if (!dbFile) return null;
  try {
    const db = new Database(`${DB_DIR}/${dbFile}`, { readonly: true });
    const row = db.prepare("SELECT MAX(submitted_at) AS v FROM time_entries").get() as { v: string | null };
    db.close();
    return row?.v ?? null;
  } catch {
    return null;
  }
}

app.get("/api/companies.php", requireSuperAdmin, (c) => {
  const companies = getMasterDb().prepare(
    `SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
            ui_language, salaxy_company_id AS business_id, salaxy_account_id, db_file,
            salaxy_api_url, salaxy_username, country_code
     FROM companies ORDER BY name ASC`
  ).all() as Record<string, unknown>[];

  for (const co of companies) {
    co["employee_count"] = countActiveEmployees(co["id"] as number);
    co["last_activity_at"] = getLastActivity(co["db_file"] as string | null);
  }
  return c.json({ success: true, companies });
});

app.post("/api/companies.php", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getMasterDb();

  // Update existing
  const id = body.id ? Number(body.id) : null;
  if (id) {
    const existing = db.prepare("SELECT id FROM companies WHERE id = ?").get(id);
    if (!existing) return c.json({ success: false, error: "Company not found" }, 404);

    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      if (name) db.prepare("UPDATE companies SET name = ? WHERE id = ?").run(name, id);
    }
    if ("slug" in body) {
      const slug = String(body.slug ?? "").trim();
      if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) {
        return c.json({ success: false, error: "Slug must be at least 2 lowercase letters, numbers or hyphens" }, 400);
      }
      const dup = db.prepare("SELECT id FROM companies WHERE slug = ? AND id != ?").get(slug, id);
      if (dup) return c.json({ success: false, error: "Slug already taken" }, 409);
      db.prepare("UPDATE companies SET slug = ? WHERE id = ?").run(slug, id);
    }
    if ("active" in body) db.prepare("UPDATE companies SET active = ? WHERE id = ?").run(Number(body.active), id);
    if ("approvals_enabled" in body) db.prepare("UPDATE companies SET approvals_enabled = ? WHERE id = ?").run(Number(body.approvals_enabled), id);
    if ("time_app_enabled" in body) db.prepare("UPDATE companies SET time_app_enabled = ? WHERE id = ?").run(Number(body.time_app_enabled), id);
    if ("supervisor_ui_enabled" in body) db.prepare("UPDATE companies SET supervisor_ui_enabled = ? WHERE id = ?").run(Number(body.supervisor_ui_enabled), id);
    if ("ui_language" in body) {
      const lang = String(body.ui_language ?? "").trim();
      if (["en", "fi", "sv", "et", "uk", "xh"].includes(lang)) db.prepare("UPDATE companies SET ui_language = ? WHERE id = ?").run(lang, id);
    }
    const businessId = "business_id" in body ? body.business_id : ("salaxy_company_id" in body ? body.salaxy_company_id : undefined);
    if (businessId !== undefined) db.prepare("UPDATE companies SET salaxy_company_id = ? WHERE id = ?").run(String(businessId).trim() || null, id);

    let salaxyCredsChanged = false;
    if ("salaxy_api_url" in body) { db.prepare("UPDATE companies SET salaxy_api_url = ? WHERE id = ?").run(String(body.salaxy_api_url ?? "").trim() || null, id); salaxyCredsChanged = true; }
    if ("salaxy_username" in body) { db.prepare("UPDATE companies SET salaxy_username = ? WHERE id = ?").run(String(body.salaxy_username ?? "").trim() || null, id); salaxyCredsChanged = true; }
    if ("salaxy_password" in body && String(body.salaxy_password ?? "").trim()) { db.prepare("UPDATE companies SET salaxy_password = ? WHERE id = ?").run(String(body.salaxy_password).trim(), id); salaxyCredsChanged = true; }
    if (salaxyCredsChanged) { try { Deno.removeSync(`${DB_DIR}/salaxy_token_${id}.json`); } catch { /* ok */ } }
    if ("country_code" in body) { const cc = String(body.country_code ?? "").trim(); if (cc) db.prepare("UPDATE companies SET country_code = ? WHERE id = ?").run(cc, id); }

    const co = db.prepare(
      `SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
              ui_language, salaxy_company_id AS business_id, db_file, salaxy_api_url, salaxy_username, country_code
       FROM companies WHERE id = ?`
    ).get(id) as Record<string, unknown>;
    co["employee_count"] = countActiveEmployees(id);
    co["last_activity_at"] = getLastActivity(co["db_file"] as string | null);
    return c.json({ success: true, company: co });
  }

  // Create new
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!name || !slug || !email || !password) return c.json({ success: false, error: "name, slug, email and password are required" }, 400);
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) return c.json({ success: false, error: "Slug must be at least 2 lowercase letters, numbers or hyphens" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ success: false, error: "Invalid email address" }, 400);
  if (password.length < 6) return c.json({ success: false, error: "Password must be at least 6 characters" }, 400);
  if (db.prepare("SELECT id FROM companies WHERE slug = ?").get(slug)) return c.json({ success: false, error: "Slug already taken" }, 409);

  const salaxyAccountId = String(body.salaxy_account_id ?? "").trim() || null;
  const result = db.prepare(
    "INSERT INTO companies (name, slug, salaxy_account_id, salaxy_api_url, salaxy_username, salaxy_password) VALUES (?,?,?,?,?,?)"
  ).run(name, slug, salaxyAccountId, SALAXY_API_URL, SALAXY_USERNAME, SALAXY_PASSWORD);
  const companyId = Number(result.lastInsertRowid);
  db.prepare("UPDATE companies SET db_file = ? WHERE id = ?").run(`companies/${companyId}.sqlite`, companyId);

  const hash = await bcrypt.hash(password, 10);
  getCompanyDb(companyId).prepare(
    "INSERT INTO company_admins (company_id, email, password_hash, name, role, active) VALUES (?,?,?,?,'company_admin',1)"
  ).run(companyId, email, hash, email);

  return c.json({ success: true, company: { id: companyId, name, slug, employee_count: 0 } }, 201);
});

export default app;
