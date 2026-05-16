import { Hono } from "@hono/hono";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";
import { generateToken, hashPin } from "../lib/jwt.ts";
import {
  checkPinRateLimit,
  recordPinFailure,
  recordPinSuccess,
} from "../lib/pin_rate_limit.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

app.post("/validate_pin", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.pin) {
    return c.json({ valid: false, error: "PIN puuttuu" }, 400);
  }

  const pin = String(body.pin).trim();
  const slug = String(body.slug ?? "").trim();
  const deviceId = String(body.device_id ?? "").trim();

  if (!pin) return c.json({ valid: false, error: "PIN on tyhjä" }, 400);

  try {
    const masterDb = getMasterDb();
    let companyId: number | null = null;

    if (slug) {
      const company = masterDb
        .prepare("SELECT id FROM companies WHERE slug = ? AND active = 1 LIMIT 1")
        .get(slug) as { id: number } | undefined;
      if (company) companyId = company.id;
    }

    if (companyId === null) {
      return c.json({ valid: false, error: "Company not found" }, 400);
    }

    const companyDb = getCompanyDb(companyId);

    if (deviceId) {
      const rl = checkPinRateLimit(companyDb, deviceId, companyId);
      if ("error" in rl) {
        return c.json({ valid: false, lockout: rl.error, ...rl }, 429);
      }
    }

    const pinHash = await hashPin(pin);
    const employee = companyDb
      .prepare(
        "SELECT id, name, pin_locked, salaxy_employment_id AS employmentId, company_id AS companyId FROM employees WHERE pin = ? AND active = 1 LIMIT 1",
      )
      .get(pinHash) as
      | { id: number; name: string; pin_locked: number; employmentId: string | null; companyId: number }
      | undefined;

    if (employee) {
      if (employee.pin_locked === 1) {
        writeAudit(companyId, { event: "auth.pin.failure", actorType: "employee", actorId: employee.id, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(employee.id), outcome: "error", meta: { reason: "pin_locked" } });
        return c.json({ valid: false, lockout: "locked" }, 403);
      }

      if (deviceId) {
        recordPinSuccess(companyDb, deviceId, companyId, employee.id, "employee");
      }

      const empData = companyDb
        .prepare("SELECT ui_language FROM employees WHERE id = ? LIMIT 1")
        .get(employee.id) as { ui_language: string | null } | undefined;
      const compData = masterDb
        .prepare("SELECT ui_language FROM companies WHERE id = ? LIMIT 1")
        .get(companyId) as { ui_language: string | null } | undefined;

      const compLang = compData?.ui_language ?? "en";
      const effectiveLang = empData?.ui_language ?? compLang;
      const token = await generateToken(employee.id, "employee", companyId);
      writeAudit(companyId, { event: "auth.pin.success", actorType: "employee", actorId: employee.id, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "employee", resourceId: String(employee.id) });

      return c.json({
        valid: true,
        token,
        id: employee.id,
        name: employee.name,
        companyId,
        employmentId: employee.employmentId ?? null,
        ui_language: effectiveLang,
      });
    } else {
      const result: Record<string, unknown> = { valid: false, error: "Väärä PIN" };
      if (deviceId) {
        const rl = recordPinFailure(companyDb, deviceId, companyId);
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
