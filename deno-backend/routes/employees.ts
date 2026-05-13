import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { hashPin } from "../lib/jwt.ts";
import { clearPinRateLimitForUser } from "../lib/pin_rate_limit.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

const VALID_LANGS = ["en", "fi", "sv", "et", "uk", "xh"];

app.get("/api/employees.php", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const employees = db.prepare(`
    SELECT e.id, e.name, e.ssn, e.salaxy_employment_id AS employmentId, e.active, e.ui_language,
           e.email, e.phone, e.birth_year, e.pin_locked,
           CASE WHEN EXISTS(
             SELECT 1 FROM pin_rate_limit prl
             WHERE prl.last_employee_id = e.id AND prl.last_employee_type = 'employee'
               AND prl.locked = 0 AND prl.locked_until IS NOT NULL
               AND prl.locked_until > CAST(strftime('%s','now') AS INTEGER)
           ) THEN 1 ELSE 0 END AS pin_temp_locked,
           COALESCE((SELECT ROUND(SUM(te.hours),1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_hours,
           COALESCE((SELECT ROUND(SUM(te.km),1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_km,
           COALESCE((SELECT COUNT(*) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_count,
           COALESCE((SELECT ROUND(SUM(te.hours),1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status = 'approved'
               AND strftime('%Y-%m', te.entry_date) = strftime('%Y-%m','now')), 0) AS hours_this_period,
           (SELECT te.entry_date FROM time_entries te WHERE te.employee_id = e.id
            ORDER BY te.entry_date DESC, te.submitted_at DESC LIMIT 1) AS last_entry_at
    FROM employees e WHERE e.company_id = ? ORDER BY e.name ASC
  `).all(admin.company_id as number);
  return c.json({ success: true, employees });
});

app.post("/api/employees.php", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const body = await c.req.json().catch(() => ({}));

  if (body.action === "unlock_pin") {
    const id = body.id ? Number(body.id) : null;
    if (!id) return c.json({ success: false, error: "id required" }, 400);
    db.prepare("UPDATE employees SET pin_locked = 0 WHERE id = ? AND company_id = ?").run(id, admin.company_id as number);
    clearPinRateLimitForUser(db, admin.company_id as number, id, "employee");
    writeAudit(admin.company_id as number, { event: "employee.pin_unlocked", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(id) });
    return c.json({ success: true });
  }

  const id = body.id ? Number(body.id) : null;
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  const ssn = String(body.ssn ?? "").trim();
  const employmentId = String(body.employmentId ?? "").trim();
  const email = String(body.email ?? "").trim() || null;
  const phone = String(body.phone ?? "").trim() || null;
  const birthYear = (body.birth_year !== undefined && body.birth_year !== "") ? Number(body.birth_year) : null;
  const active = body.active !== undefined ? Number(body.active) : 1;
  const langProvided = "ui_language" in body;
  let uiLanguage: string | null = langProvided ? String(body.ui_language ?? "").trim() : null;
  if (uiLanguage && !VALID_LANGS.includes(uiLanguage)) uiLanguage = null;
  if (uiLanguage === "") uiLanguage = null;

  if (!name) return c.json({ success: false, error: "Nimi on pakollinen." }, 400);
  if (!id && !pin) return c.json({ success: false, error: "PIN on pakollinen uudelle työntekijälle." }, 400);
  if (pin && !/^\d{3,6}$/.test(pin)) return c.json({ success: false, error: "PIN-koodin on oltava 3–6 numeroa." }, 400);

  let pinHash: string;
  if (pin) {
    pinHash = await hashPin(pin);
    const dupSql = id
      ? "SELECT id FROM employees WHERE pin = ? AND company_id = ? AND id != ?"
      : "SELECT id FROM employees WHERE pin = ? AND company_id = ?";
    const dup = id
      ? db.prepare(dupSql).get(pinHash, admin.company_id as number, id)
      : db.prepare(dupSql).get(pinHash, admin.company_id as number);
    if (dup) return c.json({ success: false, error: "Tämä PIN on jo käytössä." }, 409);
  } else {
    const cur = db.prepare("SELECT pin FROM employees WHERE id = ? AND company_id = ?")
      .get(id!, admin.company_id as number) as { pin: string } | undefined;
    pinHash = cur?.pin ?? "";
  }

  let savedId = id;
  if (id) {
    const before = db.prepare("SELECT name, active, salaxy_employment_id, email, phone, birth_year, ui_language FROM employees WHERE id = ? AND company_id = ?").get(id, admin.company_id as number);
    const uiLangExpr = langProvided ? "?" : "COALESCE(?, ui_language)";
    db.prepare(
      `UPDATE employees SET name=?, pin=?, ssn=?, salaxy_employment_id=?, active=?, ui_language=${uiLangExpr}, email=?, phone=?, birth_year=? WHERE id=? AND company_id=?`
    ).run(name, pinHash, ssn, employmentId, active, uiLanguage, email, phone, birthYear, id, admin.company_id as number);
    const after = db.prepare("SELECT name, active, salaxy_employment_id, email, phone, birth_year, ui_language FROM employees WHERE id = ? AND company_id = ?").get(id, admin.company_id as number);
    writeAudit(admin.company_id as number, { event: "employee.updated", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(id), before, after });
  } else {
    const result = db.prepare(
      "INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active, ui_language, email, phone, birth_year) VALUES (?,?,?,?,?,'employee',?,?,?,?,?)"
    ).run(admin.company_id as number, pinHash, name, ssn, employmentId, active, uiLanguage, email, phone, birthYear);
    savedId = Number(result.lastInsertRowid);
    writeAudit(admin.company_id as number, { event: "employee.created", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(savedId), after: { name, active, salaxy_employment_id: employmentId } });
  }

  const employee = db.prepare(
    "SELECT id, name, ssn, salaxy_employment_id AS employmentId, active, ui_language, email, phone, birth_year FROM employees WHERE id = ? AND company_id = ?"
  ).get(savedId!, admin.company_id as number);
  return c.json({ success: true, employee });
});

export default app;
