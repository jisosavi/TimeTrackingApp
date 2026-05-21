import { Hono } from "@hono/hono";
import { sql } from "../lib/db.ts";
import { generateToken, hashPin } from "../lib/jwt.ts";
import {
  checkPinRateLimit,
  recordPinFailure,
  recordPinSuccess,
} from "../lib/pin_rate_limit.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

app.post("/api/validate_pin", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.pin) {
    return c.json({ valid: false, error: "PIN puuttuu" }, 400);
  }

  const pin = String(body.pin).trim();
  const slug = String(body.slug ?? "").trim();
  const deviceId = String(body.device_id ?? "").trim();

  if (!pin) return c.json({ valid: false, error: "PIN on tyhjä" }, 400);

  try {
    if (!slug) return c.json({ valid: false, error: "Company not found" }, 400);
    const [company] = await sql`SELECT id FROM companies WHERE slug = ${slug} AND active = TRUE LIMIT 1`;
    if (!company) return c.json({ valid: false, error: "Company not found" }, 400);
    const companyId = Number(company.id);

    if (deviceId) {
      const rl = await checkPinRateLimit(deviceId, companyId);
      if ("error" in rl) {
        return c.json({ valid: false, lockout: rl.error, ...rl }, 429);
      }
    }

    const pinHash = await hashPin(pin);
    const [employee] = await sql`
      SELECT id, name, pin_locked, salaxy_employment_id, company_id
      FROM employees
      WHERE pin = ${pinHash} AND company_id = ${companyId} AND active = TRUE
      LIMIT 1
    `;

    if (employee) {
      if (employee.pin_locked) {
        writeAudit(companyId, { event: "auth.pin.failure", actorType: "employee", actorId: Number(employee.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(employee.id), outcome: "error", meta: { reason: "pin_locked" } });
        return c.json({ valid: false, lockout: "locked" }, 403);
      }

      if (deviceId) {
        await recordPinSuccess(deviceId, companyId, Number(employee.id), "employee");
      }

      const [empData] = await sql`SELECT ui_language FROM employees WHERE id = ${employee.id} LIMIT 1`;
      const [compData] = await sql`SELECT ui_language FROM companies WHERE id = ${companyId} LIMIT 1`;

      const compLang = (compData?.ui_language as string | null) ?? "en";
      const effectiveLang = (empData?.ui_language as string | null) ?? compLang;
      const token = await generateToken(Number(employee.id), "employee", companyId);
      writeAudit(companyId, { event: "auth.pin.success", actorType: "employee", actorId: Number(employee.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(employee.id) });

      return c.json({
        valid: true,
        token,
        id: employee.id,
        name: employee.name,
        companyId,
        employmentId: employee.salaxy_employment_id ?? null,
        ui_language: effectiveLang,
      });
    } else {
      const result: Record<string, unknown> = { valid: false, error: "Väärä PIN" };
      if (deviceId) {
        const rl = await recordPinFailure(deviceId, companyId);
        if ("error" in rl) {
          writeAudit(companyId, { event: "auth.pin.failure", actorType: "employee", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "rate_limited" } });
          return c.json({ valid: false, lockout: rl.error, ...rl }, 429);
        }
        result["attempts_remaining"] = rl.attempts_remaining;
      }
      writeAudit(companyId, { event: "auth.pin.failure", actorType: "employee", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "wrong_pin" } });
      return c.json(result, 401);
    }
  } catch (e) {
    console.error("validate_pin error:", e);
    return c.json({ valid: false, error: "Palvelinvirhe" }, 500);
  }
});

export default app;
