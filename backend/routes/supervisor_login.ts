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

app.post("/api/supervisor_login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const pin = String(body?.pin ?? "").trim();
  const slug = String(body?.slug ?? "").trim();
  const deviceId = String(body?.device_id ?? "").trim();

  if (!pin) return c.json({ success: false, error: "PIN puuttuu" }, 400);

  const [company] = slug
    ? await sql`
        SELECT id, name, ui_language, approvals_enabled
        FROM companies WHERE slug = ${slug} AND active = TRUE LIMIT 1`
    : [];

  if (!company) {
    return c.json({ success: false, error: "Company not found" }, 404);
  }
  const companyId = Number(company.id);

  if (!company.approvals_enabled) {
    return c.json(
      { success: false, error: "Supervisor approvals are not enabled for this company." },
      403,
    );
  }

  if (deviceId) {
    const rl = await checkPinRateLimit(deviceId, companyId);
    if ("error" in rl) {
      return c.json({ success: false, lockout: rl.error, ...rl }, 429);
    }
  }

  const pinHash = await hashPin(pin);
  const [supervisor] = await sql`
    SELECT * FROM supervisors WHERE pin = ${pinHash} AND company_id = ${companyId} AND active = TRUE LIMIT 1
  `;

  if (!supervisor) {
    const result: Record<string, unknown> = { success: false, error: "Väärä PIN" };
    if (deviceId) {
      const rl = await recordPinFailure(deviceId, companyId);
      if ("error" in rl) {
        writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "rate_limited" } });
        return c.json({ success: false, lockout: rl.error, ...rl }, 429);
      }
      result["attempts_remaining"] = rl.attempts_remaining;
    }
    writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorIp: reqIp(c.req.header("x-forwarded-for")), outcome: "error", meta: { reason: "wrong_pin" } });
    return c.json(result, 401);
  }

  if (supervisor.pin_locked) {
    writeAudit(companyId, { event: "auth.pin.failure", actorType: "supervisor", actorId: Number(supervisor.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(supervisor.id), outcome: "error", meta: { reason: "pin_locked" } });
    return c.json({ success: false, lockout: "locked" }, 403);
  }

  if (deviceId) {
    await recordPinSuccess(deviceId, companyId, Number(supervisor.id), "supervisor");
  }

  const compLang = (company.ui_language as string | null) ?? "en";
  const supLang = (supervisor.ui_language as string | null) ?? null;
  const effectiveLang = supLang ?? compLang;
  const token = await generateToken(Number(supervisor.id), "supervisor", companyId);
  writeAudit(companyId, { event: "auth.pin.success", actorType: "supervisor", actorId: Number(supervisor.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "supervisor", resourceId: String(supervisor.id) });

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
