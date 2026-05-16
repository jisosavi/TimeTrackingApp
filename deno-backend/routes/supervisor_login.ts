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

app.post("/api/supervisor_login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const pin = String(body?.pin ?? "").trim();
  const slug = String(body?.slug ?? "").trim();
  const deviceId = String(body?.device_id ?? "").trim();

  if (!pin) return c.json({ success: false, error: "PIN puuttuu" }, 400);

  const masterDb = getMasterDb();
  let companyId: number | null = null;
  let company: Record<string, unknown> | undefined;

  if (slug) {
    company = masterDb
      .prepare(
        "SELECT id, name, ui_language, approvals_enabled FROM companies WHERE slug = ? AND active = 1 LIMIT 1",
      )
      .get(slug) as Record<string, unknown> | undefined;
    if (company) companyId = company.id as number;
  }

  if (!companyId || !company) {
    return c.json({ success: false, error: "Company not found" }, 404);
  }

  if (!company.approvals_enabled) {
    return c.json(
      { success: false, error: "Supervisor approvals are not enabled for this company." },
      403,
    );
  }

  const companyDb = getCompanyDb(companyId);

  if (deviceId) {
    const rl = checkPinRateLimit(companyDb, deviceId, companyId);
    if ("error" in rl) {
      return c.json({ success: false, lockout: rl.error, ...rl }, 429);
    }
  }

  const pinHash = await hashPin(pin);
  const supervisor = companyDb
    .prepare("SELECT * FROM supervisors WHERE pin = ? AND active = 1 LIMIT 1")
    .get(pinHash) as Record<string, unknown> | undefined;

  if (!supervisor) {
    const result: Record<string, unknown> = { success: false, error: "Väärä PIN" };
    if (deviceId) {
      const rl = recordPinFailure(companyDb, deviceId, companyId);
      if ("error" in rl) {
        writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "rate_limited" } });
        return c.json({ success: false, lockout: rl.error, ...rl }, 429);
      }
      result["attempts_remaining"] = rl.attempts_remaining;
    }
    writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "wrong_pin" } });
    return c.json(result, 401);
  }

  if (supervisor.pin_locked === 1) {
    writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorId: supervisor.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(supervisor.id), outcome: "error", meta: { reason: "pin_locked" } });
    return c.json({ success: false, lockout: "locked" }, 403);
  }

  if (deviceId) {
    recordPinSuccess(companyDb, deviceId, companyId, supervisor.id as number, "supervisor");
  }

  const compLang = (company.ui_language as string) ?? "en";
  const supLang = (supervisor.ui_language as string | null) ?? null;
  const effectiveLang = supLang ?? compLang;
  const token = await generateToken(supervisor.id as number, "supervisor", companyId);
  writeAudit(companyId, { event: "auth.pin.success", actorType: "supervisor", actorId: supervisor.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(supervisor.id) });

  return c.json({
    success: true,
    token,
    supervisor: {
      id: supervisor.id,
      first_name: supervisor.first_name,
      last_name: supervisor.last_name,
      email: supervisor.email,
    },
    company_name: (company.name as string) ?? "",
    ui_language: effectiveLang,
  });
});

export default app;
