import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { hashPin } from "../lib/jwt.ts";
import { clearPinRateLimitForUser } from "../lib/pin_rate_limit.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

const VALID_LANGS = ["en", "fi", "sv", "et", "uk", "xh"];

app.get("/api/employees", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const employees = await sql`
    SELECT e.id, e.name, e.ssn, e.salaxy_employment_id, e.active, e.ui_language,
           e.email, e.phone, e.birth_year, e.pin_locked,
           CASE WHEN EXISTS(
             SELECT 1 FROM pin_rate_limit prl
             WHERE prl.last_employee_id = e.id AND prl.last_employee_type = 'employee'
               AND prl.locked = FALSE AND prl.locked_until IS NOT NULL
               AND prl.locked_until > EXTRACT(EPOCH FROM NOW())::BIGINT
           ) THEN TRUE ELSE FALSE END AS pin_temp_locked,
           COALESCE((SELECT ROUND(SUM(te.hours), 1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_hours,
           COALESCE((SELECT ROUND(SUM(te.km), 1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_km,
           COALESCE((SELECT COUNT(*) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status IN ('pending','clarified')), 0) AS pending_count,
           COALESCE((SELECT ROUND(SUM(te.hours), 1) FROM time_entries te
             WHERE te.employee_id = e.id AND te.status = 'approved'
               AND LEFT(te.entry_date, 7) = to_char(CURRENT_DATE, 'YYYY-MM')), 0) AS hours_this_period,
           (SELECT te.entry_date FROM time_entries te WHERE te.employee_id = e.id
            ORDER BY te.entry_date DESC, te.submitted_at DESC LIMIT 1) AS last_entry_at
    FROM employees e WHERE e.company_id = ${companyId} ORDER BY e.name ASC
  `;
  return c.json({ success: true, employees });
});

app.post("/api/employees", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const body = await c.req.json().catch(() => ({}));

  if (body.action === "unlock_pin") {
    const id = body.id ? Number(body.id) : null;
    if (!id) return c.json({ success: false, error: "id required" }, 400);
    await sql`UPDATE employees SET pin_locked = FALSE WHERE id = ${id} AND company_id = ${companyId}`;
    await clearPinRateLimitForUser(companyId, id, "employee");
    writeAudit(companyId, { event: "employee.pin_unlocked", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(id) });
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
  const active = body.active !== undefined ? Number(body.active) !== 0 : true;
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
    const [dup] = id
      ? await sql`SELECT id FROM employees WHERE pin = ${pinHash} AND company_id = ${companyId} AND id != ${id}`
      : await sql`SELECT id FROM employees WHERE pin = ${pinHash} AND company_id = ${companyId}`;
    if (dup) return c.json({ success: false, error: "Tämä PIN on jo käytössä." }, 409);
  } else {
    const [cur] = await sql`SELECT pin FROM employees WHERE id = ${id!} AND company_id = ${companyId}`;
    pinHash = (cur?.pin as string) ?? "";
  }

  let savedId: number | unknown = id;
  if (id) {
    const [before] = await sql`SELECT name, active, salaxy_employment_id, email, phone, birth_year, ui_language FROM employees WHERE id = ${id} AND company_id = ${companyId}`;
    if (langProvided) {
      await sql`
        UPDATE employees
        SET name=${name}, pin=${pinHash}, ssn=${ssn}, salaxy_employment_id=${employmentId}, active=${active},
            ui_language=${uiLanguage}, email=${email}, phone=${phone}, birth_year=${birthYear}
        WHERE id=${id} AND company_id=${companyId}
      `;
    } else {
      await sql`
        UPDATE employees
        SET name=${name}, pin=${pinHash}, ssn=${ssn}, salaxy_employment_id=${employmentId}, active=${active},
            ui_language=COALESCE(${uiLanguage}, ui_language), email=${email}, phone=${phone}, birth_year=${birthYear}
        WHERE id=${id} AND company_id=${companyId}
      `;
    }
    const [after] = await sql`SELECT name, active, salaxy_employment_id, email, phone, birth_year, ui_language FROM employees WHERE id = ${id} AND company_id = ${companyId}`;
    writeAudit(companyId, { event: "employee.updated", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(id), before, after });
  } else {
    const [result] = await sql`
      INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active, ui_language, email, phone, birth_year)
      VALUES (${companyId}, ${pinHash}, ${name}, ${ssn}, ${employmentId}, 'employee', ${active}, ${uiLanguage}, ${email}, ${phone}, ${birthYear})
      RETURNING id
    `;
    savedId = result.id;
    writeAudit(companyId, { event: "employee.created", actorType: "admin", actorId: admin.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(savedId), after: { name, active, salaxy_employment_id: employmentId } });
  }

  const [employee] = await sql`
    SELECT id, name, ssn, salaxy_employment_id, active, ui_language, email, phone, birth_year
    FROM employees WHERE id = ${savedId} AND company_id = ${companyId}
  `;
  return c.json({ success: true, employee });
});

export default app;
