import { Hono } from "@hono/hono";
import { requireSuperAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.delete("/api/super_admin/delete_company", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const companyId = body.company_id ? Number(body.company_id) : null;
  const confirmSlug = String(body.confirm_slug ?? "").trim();
  if (!companyId || !confirmSlug) return c.json({ success: false, error: "company_id and confirm_slug required" }, 400);

  const [company] = await sql`SELECT id, slug FROM companies WHERE id = ${companyId}`;
  if (!company) return c.json({ success: false, error: "Company not found" }, 404);
  if (company["slug"] !== confirmSlug) return c.json({ success: false, error: "Slug does not match" }, 422);

  await sql`DELETE FROM payroll_export_calculations WHERE payroll_export_id IN (SELECT id FROM payroll_exports WHERE company_id = ${companyId})`;
  await sql`DELETE FROM payroll_exports WHERE company_id = ${companyId}`;
  await sql`DELETE FROM time_entries WHERE company_id = ${companyId}`;
  await sql`DELETE FROM supervisor_employees WHERE supervisor_id IN (SELECT id FROM supervisors WHERE company_id = ${companyId})`;
  await sql`DELETE FROM supervisors WHERE company_id = ${companyId}`;
  await sql`DELETE FROM employees WHERE company_id = ${companyId}`;
  await sql`DELETE FROM company_admins WHERE company_id = ${companyId}`;
  await sql`DELETE FROM holiday_proposals WHERE company_id = ${companyId}`;
  await sql`DELETE FROM absence_records WHERE company_id = ${companyId}`;
  await sql`DELETE FROM pin_rate_limit WHERE company_id = ${companyId}`;
  await sql`DELETE FROM salaxy_tokens WHERE company_id = ${companyId}`;
  await sql`DELETE FROM audit_log WHERE company_id = ${companyId}`;
  writeAudit(0, {
    event: "company.deleted",
    actorType: "superadmin",
    actorId: ((c.get("claims") as Record<string, unknown>)["user_id"] as number),
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "company",
    resourceId: String(companyId),
    before: { id: companyId, slug: company["slug"] },
  });
  await sql`DELETE FROM companies WHERE id = ${companyId}`;
  return c.json({ success: true });
});

const ALLOWED_FEATURES = ["time_app_enabled", "supervisor_ui_enabled", "approvals_enabled"] as const;

app.post("/api/super_admin/set_feature", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const companyId = Number(body.company_id ?? 0);
  const feature = String(body.feature ?? "").trim();
  const enabled = !!body.enabled;

  if (!companyId) return c.json({ success: false, error: "company_id required" }, 400);
  if (!ALLOWED_FEATURES.includes(feature as typeof ALLOWED_FEATURES[number])) {
    return c.json({ success: false, error: "Invalid feature" }, 400);
  }

  const [existing] = await sql`SELECT id FROM companies WHERE id = ${companyId}`;
  if (!existing) return c.json({ success: false, error: "Company not found" }, 404);

  await sql.unsafe(`UPDATE companies SET ${feature} = $1 WHERE id = $2`, [enabled, companyId]);
  const [company] = await sql`
    SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
           ui_language, salaxy_company_id AS business_id, salaxy_api_url, salaxy_username
    FROM companies WHERE id = ${companyId}
  `;
  writeAudit(0, {
    event: "company.feature_set",
    actorType: "superadmin",
    actorId: ((c.get("claims") as Record<string, unknown>)["user_id"] as number),
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "company",
    resourceId: String(companyId),
    after: { feature, enabled },
  });
  return c.json({ success: true, company });
});

app.patch("/api/super_admin/update_company", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id ?? 0);
  if (!id) return c.json({ success: false, error: "id required" }, 400);

  const [existing] = await sql`SELECT id FROM companies WHERE id = ${id}`;
  if (!existing) return c.json({ success: false, error: "Company not found" }, 404);

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ success: false, error: "Name is required" }, 400);
    await sql`UPDATE companies SET name = ${name} WHERE id = ${id}`;
  }
  if ("slug" in body) {
    const slug = String(body.slug ?? "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]{1,2}$/.test(slug)) {
      return c.json({ success: false, error: "Slug must be 2–40 lowercase letters, numbers or hyphens" }, 400);
    }
    const [dup] = await sql`SELECT id FROM companies WHERE slug = ${slug} AND id != ${id}`;
    if (dup) return c.json({ success: false, error: "Slug already taken" }, 409);
    await sql`UPDATE companies SET slug = ${slug} WHERE id = ${id}`;
  }
  if ("business_id" in body) await sql`UPDATE companies SET salaxy_company_id = ${String(body.business_id ?? "").trim() || null} WHERE id = ${id}`;
  if ("salaxy_account_id" in body) await sql`UPDATE companies SET salaxy_account_id = ${String(body.salaxy_account_id ?? "").trim() || null} WHERE id = ${id}`;
  if ("country_code" in body) { const cc = String(body.country_code ?? "").trim(); if (cc) await sql`UPDATE companies SET country_code = ${cc} WHERE id = ${id}`; }

  let salaxyCredsChanged = false;
  if ("salaxy_api_url" in body) { await sql`UPDATE companies SET salaxy_api_url = ${String(body.salaxy_api_url ?? "").trim() || null} WHERE id = ${id}`; salaxyCredsChanged = true; }
  if ("salaxy_username" in body) { await sql`UPDATE companies SET salaxy_username = ${String(body.salaxy_username ?? "").trim() || null} WHERE id = ${id}`; salaxyCredsChanged = true; }
  if ("salaxy_password" in body && String(body.salaxy_password ?? "").trim()) { await sql`UPDATE companies SET salaxy_password = ${String(body.salaxy_password).trim()} WHERE id = ${id}`; salaxyCredsChanged = true; }
  if (salaxyCredsChanged) await sql`DELETE FROM salaxy_tokens WHERE company_id = ${id}`;

  const [company] = await sql`
    SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
           ui_language, salaxy_company_id AS business_id, salaxy_account_id,
           salaxy_api_url, salaxy_username, country_code
    FROM companies WHERE id = ${id}
  `;
  writeAudit(0, {
    event: "company.updated",
    actorType: "superadmin",
    actorId: ((c.get("claims") as Record<string, unknown>)["user_id"] as number),
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "company",
    resourceId: String(id),
    after: { name: company["name"], slug: company["slug"] },
  });
  return c.json({ success: true, company });
});

app.get("/api/super_admin/audit_log", requireSuperAdmin, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Number(c.req.query("offset") ?? 0);
  const companyFilter = c.req.query("company") ?? "all";
  const eventPrefix   = c.req.query("event") ?? "";
  const outcome       = c.req.query("outcome") ?? "";
  const actorType     = c.req.query("actor_type") ?? "";
  const search        = c.req.query("search") ?? "";

  const params: unknown[] = [];
  const where: string[] = [];

  if (companyFilter === "master") {
    where.push("company_id IS NULL");
  } else if (companyFilter !== "all" && companyFilter) {
    params.push(Number(companyFilter));
    where.push(`company_id = $${params.length}`);
  }

  if (eventPrefix) {
    params.push(`${eventPrefix}%`);
    where.push(`event LIKE $${params.length}`);
  }

  if (outcome) {
    params.push(outcome);
    where.push(`outcome = $${params.length}`);
  }

  if (actorType) {
    params.push(actorType);
    where.push(`actor_type = $${params.length}`);
  }

  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    const n = params.length;
    where.push(
      `(event ILIKE $${n} OR COALESCE(actor_ip,'') ILIKE $${n} OR COALESCE(resource_id,'') ILIKE $${n} OR COALESCE(after_json,'') ILIKE $${n} OR COALESCE(meta_json,'') ILIKE $${n})`,
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countParams = [...params];
  params.push(limit, offset);

  const rows = await sql.unsafe(
    `SELECT id, company_id, ts, event, actor_type, actor_id, actor_ip, resource, resource_id, before_json, after_json, outcome, meta_json
     FROM audit_log ${whereClause} ORDER BY ts DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const [{ count }] = await sql.unsafe(`SELECT COUNT(*) AS count FROM audit_log ${whereClause}`, countParams);
  const companies    = await sql`SELECT id, name, slug FROM companies ORDER BY name`;

  return c.json({ rows, total: Number(count), companies });
});

export default app;
