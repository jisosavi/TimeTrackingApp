import type { Context, Next } from "@hono/hono";
import { sql } from "./db.ts";
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
  const [emp] = await sql`
    SELECT * FROM employees
    WHERE id = ${claims["user_id"] as number} AND company_id = ${claims["company_id"] as number} AND active = TRUE
  `;
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
  const [sup] = await sql`
    SELECT * FROM supervisors
    WHERE id = ${claims["user_id"] as number} AND company_id = ${claims["company_id"] as number} AND active = TRUE
  `;
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
  const [admin] = await sql`
    SELECT * FROM company_admins
    WHERE id = ${claims["user_id"] as number} AND company_id = ${claims["company_id"] as number} AND active = TRUE
  `;
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
  const [admin] = await sql`
    SELECT * FROM super_admins WHERE id = ${claims["user_id"] as number} AND active = TRUE
  `;
  if (!admin) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("claims", claims);
  c.set("user", admin);
  await next();
}

export async function requireAdminOrSupervisor(c: Context, next: Next): Promise<Response | void> {
  const claims = await verifyToken(bearerToken(c) ?? "").catch(() => null);
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);
  const companyId = claims["company_id"] as number;

  if (claims["user_type"] === "admin") {
    const [admin] = await sql`
      SELECT * FROM company_admins
      WHERE id = ${claims["user_id"] as number} AND company_id = ${companyId} AND active = TRUE
    `;
    if (admin) {
      c.set("claims", claims);
      c.set("user", { ...admin, _type: "admin" });
      return await next();
    }
  }
  if (claims["user_type"] === "supervisor") {
    const [sup] = await sql`
      SELECT * FROM supervisors
      WHERE id = ${claims["user_id"] as number} AND company_id = ${companyId} AND active = TRUE
    `;
    if (sup) {
      c.set("claims", claims);
      c.set("user", { ...sup, _type: "supervisor" });
      return await next();
    }
  }
  return c.json({ success: false, error: "Unauthorized" }, 401);
}
