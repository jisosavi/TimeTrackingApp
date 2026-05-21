import { Hono } from "@hono/hono";
import bcrypt from "bcryptjs";
import { sql } from "../lib/db.ts";
import { generateToken } from "../lib/jwt.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

app.post("/api/admin_login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ success: false, error: "Email and password are required" }, 400);
  }

  const email = String(body.email).trim();
  const password = String(body.password);
  const slug = String(body.slug ?? "").trim();

  try {
    if (!slug) {
      // Super-admin login
      const [admin] = await sql`SELECT * FROM super_admins WHERE email = ${email} AND active = TRUE`;

      if (!admin || !(await bcrypt.compare(password, admin.password_hash as string))) {
        writeAudit(0, { event: "auth.login.failure", actorType: "superadmin", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { email } });
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const token = await generateToken(Number(admin.id), "superadmin", 0);
      writeAudit(0, { event: "auth.login.success", actorType: "superadmin", actorId: Number(admin.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "super_admin", resourceId: String(admin.id) });
      return c.json({
        success: true,
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: "superadmin",
          company_id: 0,
          ui_language: (admin.ui_language as string) ?? "en",
        },
        company: { name: "", slug: "", active: 1, approvals_enabled: 0, ui_language: "en" },
        ui_language: (admin.ui_language as string) ?? "en",
      });
    } else {
      // Company admin login
      const [company] = await sql`
        SELECT id, name, slug, active, approvals_enabled, ui_language
        FROM companies WHERE slug = ${slug} AND active = TRUE
      `;

      if (!company) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const companyId = Number(company.id);
      const [admin] = await sql`
        SELECT * FROM company_admins WHERE email = ${email} AND company_id = ${companyId} AND active = TRUE
      `;

      if (!admin || !(await bcrypt.compare(password, admin.password_hash as string))) {
        writeAudit(companyId, { event: "auth.login.failure", actorType: "admin", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { email } });
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const compLang = (company.ui_language as string) ?? "en";
      const adminLang = (admin.ui_language as string | null) ?? null;
      const effectiveLang = adminLang ?? compLang ?? "en";
      const token = await generateToken(Number(admin.id), "admin", companyId);
      writeAudit(companyId, { event: "auth.login.success", actorType: "admin", actorId: Number(admin.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "company_admin", resourceId: String(admin.id) });

      return c.json({
        success: true,
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          company_id: companyId,
          ui_language: effectiveLang,
        },
        company: {
          name: company.name,
          slug: company.slug,
          active: Number(company.active),
          approvals_enabled: Number(company.approvals_enabled),
          ui_language: compLang,
        },
        ui_language: effectiveLang,
      });
    }
  } catch (e) {
    console.error("admin_login error:", e);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

export default app;
