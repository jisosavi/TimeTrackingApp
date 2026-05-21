import { Hono } from "@hono/hono";
import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { SALAXY_API_URL, SALAXY_PASSWORD, SALAXY_USERNAME } from "../lib/config.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

async function countActiveEmployees(companyId: number): Promise<number> {
  try {
    const [row] = await sql`SELECT COUNT(*) AS n FROM employees WHERE company_id = ${companyId} AND active = TRUE`;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

async function getLastActivity(companyId: number): Promise<string | null> {
  try {
    const [row] = await sql`SELECT MAX(submitted_at) AS v FROM time_entries WHERE company_id = ${companyId}`;
    return (row?.v as string | null) ?? null;
  } catch {
    return null;
  }
}

app.get("/api/companies", requireSuperAdmin, async (c) => {
  const companies = await sql`
    SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
           ui_language, salaxy_company_id AS business_id, salaxy_account_id,
           salaxy_api_url, salaxy_username, country_code
    FROM companies ORDER BY name ASC
  `;

  for (const co of companies) {
    co["employee_count"] = await countActiveEmployees(co["id"] as number);
    co["last_activity_at"] = await getLastActivity(co["id"] as number);
  }
  return c.json({ success: true, companies });
});

app.post("/api/companies", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const id = body.id ? Number(body.id) : null;
  if (id) {
    const [existing] = await sql`SELECT id FROM companies WHERE id = ${id}`;
    if (!existing) return c.json({ success: false, error: "Company not found" }, 404);

    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      if (name) await sql`UPDATE companies SET name = ${name} WHERE id = ${id}`;
    }
    if ("slug" in body) {
      const slug = String(body.slug ?? "").trim();
      if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) {
        return c.json({ success: false, error: "Slug must be at least 2 lowercase letters, numbers or hyphens" }, 400);
      }
      const [dup] = await sql`SELECT id FROM companies WHERE slug = ${slug} AND id != ${id}`;
      if (dup) return c.json({ success: false, error: "Slug already taken" }, 409);
      await sql`UPDATE companies SET slug = ${slug} WHERE id = ${id}`;
    }
    if ("active" in body) await sql`UPDATE companies SET active = ${!!Number(body.active)} WHERE id = ${id}`;
    if ("approvals_enabled" in body) await sql`UPDATE companies SET approvals_enabled = ${!!Number(body.approvals_enabled)} WHERE id = ${id}`;
    if ("time_app_enabled" in body) await sql`UPDATE companies SET time_app_enabled = ${!!Number(body.time_app_enabled)} WHERE id = ${id}`;
    if ("supervisor_ui_enabled" in body) await sql`UPDATE companies SET supervisor_ui_enabled = ${!!Number(body.supervisor_ui_enabled)} WHERE id = ${id}`;
    if ("ui_language" in body) {
      const lang = String(body.ui_language ?? "").trim();
      if (["en", "fi", "sv", "et", "uk", "xh"].includes(lang)) await sql`UPDATE companies SET ui_language = ${lang} WHERE id = ${id}`;
    }
    const businessId = "business_id" in body ? body.business_id : ("salaxy_company_id" in body ? body.salaxy_company_id : undefined);
    if (businessId !== undefined) await sql`UPDATE companies SET salaxy_company_id = ${String(businessId).trim() || null} WHERE id = ${id}`;

    let salaxyCredsChanged = false;
    if ("salaxy_api_url" in body) { await sql`UPDATE companies SET salaxy_api_url = ${String(body.salaxy_api_url ?? "").trim() || null} WHERE id = ${id}`; salaxyCredsChanged = true; }
    if ("salaxy_username" in body) { await sql`UPDATE companies SET salaxy_username = ${String(body.salaxy_username ?? "").trim() || null} WHERE id = ${id}`; salaxyCredsChanged = true; }
    if ("salaxy_password" in body && String(body.salaxy_password ?? "").trim()) { await sql`UPDATE companies SET salaxy_password = ${String(body.salaxy_password).trim()} WHERE id = ${id}`; salaxyCredsChanged = true; }
    if (salaxyCredsChanged) await sql`DELETE FROM salaxy_tokens WHERE company_id = ${id}`;
    if ("country_code" in body) { const cc = String(body.country_code ?? "").trim(); if (cc) await sql`UPDATE companies SET country_code = ${cc} WHERE id = ${id}`; }

    const [co] = await sql`
      SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
             ui_language, salaxy_company_id AS business_id, salaxy_api_url, salaxy_username, country_code
      FROM companies WHERE id = ${id}
    `;
    const company = co as Record<string, unknown>;
    company["employee_count"] = await countActiveEmployees(id);
    company["last_activity_at"] = await getLastActivity(id);
    return c.json({ success: true, company });
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
  const [slugTaken] = await sql`SELECT id FROM companies WHERE slug = ${slug}`;
  if (slugTaken) return c.json({ success: false, error: "Slug already taken" }, 409);

  const salaxyAccountId = String(body.salaxy_account_id ?? "").trim() || null;
  const [result] = await sql`
    INSERT INTO companies (name, slug, salaxy_account_id, salaxy_api_url, salaxy_username, salaxy_password)
    VALUES (${name}, ${slug}, ${salaxyAccountId}, ${SALAXY_API_URL}, ${SALAXY_USERNAME}, ${SALAXY_PASSWORD})
    RETURNING id
  `;
  const companyId = Number(result.id);

  const hash = await bcrypt.hash(password, 10);
  await sql`
    INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
    VALUES (${companyId}, ${email}, ${hash}, ${email}, 'company_admin', TRUE)
  `;

  return c.json({ success: true, company: { id: companyId, name, slug, employee_count: 0 } }, 201);
});

export default app;
