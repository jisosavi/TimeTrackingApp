import { Hono } from "@hono/hono";
import { verifyToken } from "../lib/jwt.ts";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";

const app = new Hono();
const VALID_LANGS = ["en", "fi", "sv", "et", "uk", "xh"];

function bearerToken(authHeader: string | undefined): string {
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

app.post("/api/update_language.php", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const lang = String(body.lang ?? "").trim();
  const targetType = String(body.target_type ?? "").trim();

  const isClear = lang === "";
  if (!isClear && !VALID_LANGS.includes(lang)) {
    return c.json({ success: false, error: "Invalid language" }, 400);
  }
  const langValue = isClear ? null : lang;

  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);

  const userType = claims["user_type"] as string;
  const companyId = claims["company_id"] as number;
  const userId = claims["user_id"] as number;

  if (targetType === "employee") {
    if (userType !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
    getCompanyDb(companyId).prepare("UPDATE employees SET ui_language = ? WHERE id = ?").run(langValue, userId);
    return c.json({ success: true });
  }

  if (targetType === "supervisor_self") {
    if (userType !== "supervisor") return c.json({ success: false, error: "Unauthorized" }, 401);
    getCompanyDb(companyId).prepare("UPDATE supervisors SET ui_language = ? WHERE id = ?").run(langValue, userId);
    return c.json({ success: true });
  }

  if (targetType === "admin") {
    if (userType !== "admin") return c.json({ success: false, error: "Unauthorized" }, 401);
    getCompanyDb(companyId).prepare("UPDATE company_admins SET ui_language = ? WHERE id = ?").run(langValue, userId);
    return c.json({ success: true });
  }

  if (targetType === "superadmin") {
    if (userType !== "superadmin") return c.json({ success: false, error: "Unauthorized" }, 401);
    getMasterDb().prepare("UPDATE super_admins SET ui_language = ? WHERE id = ?").run(langValue, userId);
    return c.json({ success: true });
  }

  if (targetType === "company") {
    if (userType !== "admin") return c.json({ success: false, error: "Unauthorized" }, 401);
    getMasterDb().prepare("UPDATE companies SET ui_language = ? WHERE id = ?").run(langValue, companyId);
    return c.json({ success: true });
  }

  return c.json({ success: false, error: "Unknown target type" }, 400);
});

export default app;
