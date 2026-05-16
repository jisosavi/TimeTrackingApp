import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { hashPin } from "../lib/jwt.ts";
import { clearPinRateLimitForUser } from "../lib/pin_rate_limit.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

const VALID_LANGS = ["en", "fi", "sv", "et", "uk", "xh"];

app.get("/api/supervisors", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const supervisors = db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.ssn, s.salaxy_id, s.active, s.ui_language, s.pin_locked,
           CASE WHEN EXISTS(
             SELECT 1 FROM pin_rate_limit prl
             WHERE prl.last_employee_id = s.id AND prl.last_employee_type = 'supervisor'
               AND prl.locked = 0 AND prl.locked_until IS NOT NULL
               AND prl.locked_until > CAST(strftime('%s','now') AS INTEGER)
           ) THEN 1 ELSE 0 END AS pin_temp_locked,
           COUNT(se.employee_id) AS team_size
    FROM supervisors s
    LEFT JOIN supervisor_employees se ON se.supervisor_id = s.id
    WHERE s.company_id = ?
    GROUP BY s.id
    ORDER BY s.last_name ASC, s.first_name ASC
  `).all(admin.company_id as number);
  return c.json({ success: true, supervisors });
});

app.post("/api/supervisors", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const body = await c.req.json().catch(() => ({}));

  if (body.action === "unlock_pin") {
    const id = body.id ? Number(body.id) : null;
    if (!id) return c.json({ success: false, error: "id required" }, 400);
    db.prepare("UPDATE supervisors SET pin_locked = 0 WHERE id = ? AND company_id = ?").run(id, admin.company_id as number);
    clearPinRateLimitForUser(db, admin.company_id as number, id, "supervisor");
    writeAudit(admin.company_id as number, { event: "supervisor.pin_unlocked", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(id) });
    return c.json({ success: true });
  }

  const id = body.id ? Number(body.id) : null;
  const firstName = String(body.first_name ?? "").trim();
  const lastName = String(body.last_name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  const ssn = String(body.ssn ?? "").trim();
  const salaxyId = String(body.salaxy_id ?? "").trim();
  const active = body.active !== undefined ? Number(body.active) : 1;
  const langProvided = "ui_language" in body;
  let uiLanguage: string | null = langProvided ? String(body.ui_language ?? "").trim() : null;
  if (uiLanguage && !VALID_LANGS.includes(uiLanguage)) uiLanguage = null;
  if (uiLanguage === "") uiLanguage = null;

  if (!firstName || !lastName || !email || !phone) {
    return c.json({ success: false, error: "Etunimi, sukunimi, email ja puhelin ovat pakollisia." }, 400);
  }
  if (!id && !pin) return c.json({ success: false, error: "PIN on pakollinen uudelle esihenkilölle." }, 400);
  if (pin && !/^\d{3,6}$/.test(pin)) return c.json({ success: false, error: "PIN-koodin on oltava 3–6 numeroa." }, 400);

  let pinHash: string | undefined;
  if (pin) {
    pinHash = await hashPin(pin);
    const dupSql = id
      ? "SELECT id FROM supervisors WHERE pin = ? AND company_id = ? AND id != ?"
      : "SELECT id FROM supervisors WHERE pin = ? AND company_id = ?";
    const dup = id
      ? db.prepare(dupSql).get(pinHash, admin.company_id as number, id)
      : db.prepare(dupSql).get(pinHash, admin.company_id as number);
    if (dup) return c.json({ success: false, error: "Tämä PIN on jo käytössä toisella esihenkilöllä." }, 409);
  }

  let savedId = id;
  if (id) {
    const before = db.prepare("SELECT first_name, last_name, email, phone, active, salaxy_id, ui_language FROM supervisors WHERE id = ? AND company_id = ?").get(id, admin.company_id as number);
    if (!pinHash) {
      const cur = db.prepare("SELECT pin FROM supervisors WHERE id = ? AND company_id = ?")
        .get(id, admin.company_id as number) as { pin: string } | undefined;
      pinHash = cur?.pin ?? "";
    }
    const uiLangExpr = langProvided ? "?" : "COALESCE(?, ui_language)";
    db.prepare(
      `UPDATE supervisors SET first_name=?, last_name=?, email=?, phone=?, pin=?, ssn=?, salaxy_id=?, active=?, ui_language=${uiLangExpr} WHERE id=? AND company_id=?`
    ).run(firstName, lastName, email, phone, pinHash, ssn, salaxyId, active, uiLanguage, id, admin.company_id as number);
    const after = db.prepare("SELECT first_name, last_name, email, phone, active, salaxy_id, ui_language FROM supervisors WHERE id = ? AND company_id = ?").get(id, admin.company_id as number);
    writeAudit(admin.company_id as number, { event: "supervisor.updated", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(id), before, after });
  } else {
    const result = db.prepare(
      "INSERT INTO supervisors (company_id, first_name, last_name, email, phone, pin, ssn, salaxy_id, active, ui_language) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(admin.company_id as number, firstName, lastName, email, phone, pinHash!, ssn, salaxyId, active, uiLanguage);
    savedId = Number(result.lastInsertRowid);
    writeAudit(admin.company_id as number, { event: "supervisor.created", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(savedId), after: { first_name: firstName, last_name: lastName, email, active } });
  }

  const supervisor = db.prepare(
    "SELECT id, first_name, last_name, email, phone, ssn, salaxy_id, active, ui_language, pin_locked FROM supervisors WHERE id = ?"
  ).get(savedId!);
  return c.json({ success: true, supervisor });
});

app.delete("/api/supervisors", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const db = getCompanyDb(admin.company_id as number);
  const body = await c.req.json().catch(() => ({}));
  const id = body.id ? Number(body.id) : null;
  if (!id) return c.json({ success: false, error: "id vaaditaan" }, 400);
  const before = db.prepare("SELECT first_name, last_name, email FROM supervisors WHERE id = ? AND company_id = ?").get(id, admin.company_id as number);
  db.prepare("DELETE FROM supervisor_employees WHERE supervisor_id = ?").run(id);
  db.prepare("DELETE FROM supervisors WHERE id = ? AND company_id = ?").run(id, admin.company_id as number);
  writeAudit(admin.company_id as number, { event: "supervisor.deleted", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(id), before });
  return c.json({ success: true });
});

export default app;
