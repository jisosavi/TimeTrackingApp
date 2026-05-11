import { Hono } from "@hono/hono";
import bcrypt from "bcryptjs";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";
import { generateToken } from "../lib/jwt.ts";

const app = new Hono();

app.post("/api/admin_login.php", async (c) => {
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
      const db = getMasterDb();
      const admin = db
        .prepare("SELECT * FROM super_admins WHERE email = ? AND active = 1")
        .get(email) as Record<string, unknown> | undefined;

      if (!admin || !(await bcrypt.compare(password, admin.password_hash as string))) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const token = await generateToken(admin.id as number, "superadmin", 0);
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
      const masterDb = getMasterDb();
      const company = masterDb
        .prepare(
          "SELECT id, name, slug, active, approvals_enabled, ui_language FROM companies WHERE slug = ? AND active = 1",
        )
        .get(slug) as Record<string, unknown> | undefined;

      if (!company) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const companyId = company.id as number;
      const db = getCompanyDb(companyId);
      const admin = db
        .prepare("SELECT * FROM company_admins WHERE email = ? AND active = 1")
        .get(email) as Record<string, unknown> | undefined;

      if (!admin || !(await bcrypt.compare(password, admin.password_hash as string))) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }

      const compLang = (company.ui_language as string) ?? "en";
      const adminLang = (admin.ui_language as string | null) ?? null;
      const effectiveLang = adminLang ?? compLang ?? "en";
      const token = await generateToken(admin.id as number, "admin", companyId);

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
