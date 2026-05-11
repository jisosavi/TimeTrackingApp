import type { Context, Next } from "@hono/hono";
import { getCompanyDb, getMasterDb } from "./db.ts";
import { verifyToken } from "./jwt.ts";

function bearerToken(c: Context): string | null {
  const h = c.req.header("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function requireEmployee(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims || claims["user_type"] !== "employee") {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const emp = getCompanyDb(claims["company_id"] as number)
    .prepare("SELECT * FROM employees WHERE id = ? AND active = 1")
    .get(claims["user_id"] as number);
  if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("claims", claims);
  c.set("user", emp);
  await next();
}

export async function requireSupervisor(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims || claims["user_type"] !== "supervisor") {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const sup = getCompanyDb(claims["company_id"] as number)
    .prepare("SELECT * FROM supervisors WHERE id = ? AND active = 1")
    .get(claims["user_id"] as number);
  if (!sup) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("claims", claims);
  c.set("user", sup);
  await next();
}

export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims || claims["user_type"] !== "admin") {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const admin = getCompanyDb(claims["company_id"] as number)
    .prepare("SELECT * FROM company_admins WHERE id = ? AND active = 1")
    .get(claims["user_id"] as number);
  if (!admin) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("claims", claims);
  c.set("user", admin);
  await next();
}

export async function requireSuperAdmin(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims || claims["user_type"] !== "superadmin") {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const admin = getMasterDb()
    .prepare("SELECT * FROM super_admins WHERE id = ? AND active = 1")
    .get(claims["user_id"] as number);
  if (!admin) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("claims", claims);
  c.set("user", admin);
  await next();
}

export async function requireAdminOrSupervisor(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);
  const db = getCompanyDb(claims["company_id"] as number);
  if (claims["user_type"] === "admin") {
    const admin = db
      .prepare("SELECT * FROM company_admins WHERE id = ? AND active = 1")
      .get(claims["user_id"] as number);
    if (admin) {
      c.set("claims", claims);
      c.set("user", { ...(admin as object), _type: "admin" });
      return await next();
    }
  }
  if (claims["user_type"] === "supervisor") {
    const sup = db
      .prepare("SELECT * FROM supervisors WHERE id = ? AND active = 1")
      .get(claims["user_id"] as number);
    if (sup) {
      c.set("claims", claims);
      c.set("user", { ...(sup as object), _type: "supervisor" });
      return await next();
    }
  }
  return c.json({ success: false, error: "Unauthorized" }, 401);
}
