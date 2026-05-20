import { Hono } from "@hono/hono";
import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/company_admins", requireSuperAdmin, (c) => {
  const companyId = Number(c.req.query("company_id") ?? 0);
  if (!companyId) return c.json({ success: false, error: "company_id required" }, 400);
  const admins = getCompanyDb(companyId).prepare(
    "SELECT id, email, name, role, active FROM company_admins WHERE company_id = ? ORDER BY email ASC"
  ).all(companyId);
  return c.json({ success: true, admins });
});

app.post("/api/company_admins", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const companyId = Number(body.company_id ?? 0);
  const id = body.id ? Number(body.id) : null;
  const email = String(body.email ?? "").trim();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "").trim();
  const active = body.active !== undefined ? Number(body.active) : 1;

  if (!companyId || !email) return c.json({ success: false, error: "company_id ja email vaaditaan" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ success: false, error: "Virheellinen sähköpostiosoite" }, 400);

  const db = getCompanyDb(companyId);
  let savedId = id;

  if (id) {
    if (password) {
      if (password.length < 6) return c.json({ success: false, error: "Salasanan on oltava vähintään 6 merkkiä" }, 400);
      const hash = await bcrypt.hash(password, 10);
      db.prepare("UPDATE company_admins SET email=?, name=?, password_hash=?, active=? WHERE id=? AND company_id=?")
        .run(email, name, hash, active, id, companyId);
    } else {
      db.prepare("UPDATE company_admins SET email=?, name=?, active=? WHERE id=? AND company_id=?")
        .run(email, name, active, id, companyId);
    }
  } else {
    if (!password) return c.json({ success: false, error: "Salasana vaaditaan uudelle adminille" }, 400);
    if (password.length < 6) return c.json({ success: false, error: "Salasanan on oltava vähintään 6 merkkiä" }, 400);
    const existing = db.prepare("SELECT id FROM company_admins WHERE email = ?").get(email);
    if (existing) return c.json({ success: false, error: "Sähköposti on jo käytössä" }, 409);
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO company_admins (company_id, email, name, password_hash, role, active) VALUES (?,?,?,?,'company_admin',?)"
    ).run(companyId, email, name, hash, active);
    savedId = Number(result.lastInsertRowid);
  }

  const admin = db.prepare("SELECT id, email, name, role, active FROM company_admins WHERE id = ?").get(savedId!);
  return c.json({ success: true, admin });
});

app.delete("/api/company_admins", requireSuperAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id ?? 0);
  const companyId = Number(body.company_id ?? 0);
  if (!id || !companyId) return c.json({ success: false, error: "id and company_id required" }, 400);
  getCompanyDb(companyId).prepare("DELETE FROM company_admins WHERE id = ? AND company_id = ?").run(id, companyId);
  return c.json({ success: true });
});

export default app;
