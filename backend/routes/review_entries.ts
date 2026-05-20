import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.post("/api/review_entries", requireAdminOrSupervisor, async (c) => {
  const reviewer = c.get("user") as Record<string, unknown>;
  const claims = c.get("claims") as Record<string, unknown>;
  const userType = claims["user_type"] as string;
  const companyId = reviewer.company_id as number;
  const reviewerId = reviewer.id as number;

  const body = await c.req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  const action = String(body.action ?? "").trim();
  const rejectionNote = String(body.rejection_note ?? "").trim();
  const field = String(body.field ?? "").trim() === "km_status" ? "km_status" : "status";

  if (!ids.length || !["approve", "reject", "delete"].includes(action)) {
    return c.json({ success: false, error: "ids ja action (approve|reject|delete) vaaditaan" }, 400);
  }

  const db = getCompanyDb(companyId);
  const placeholders = ids.map(() => "?").join(",");

  let allowed: { id: number }[];
  if (userType === "supervisor") {
    allowed = db.prepare(
      `SELECT id FROM time_entries WHERE id IN (${placeholders}) AND company_id = ? AND employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?)`
    ).all(...ids, companyId, reviewerId) as { id: number }[];
  } else {
    allowed = db.prepare(
      `SELECT id FROM time_entries WHERE id IN (${placeholders}) AND company_id = ?`
    ).all(...ids, companyId) as { id: number }[];
  }

  if (allowed.length !== ids.length) {
    return c.json({ success: false, error: "Osa kirjauksista ei kuulu sinulle tai yrityksellesi" }, 403);
  }

  if (action === "delete") {
    db.prepare(`UPDATE time_entries SET status = 'deleted' WHERE id IN (${placeholders})`).run(...ids);
    writeAudit(companyId, { event: "time_entry.deleted", actorType: userType as "admin" | "supervisor", actorId: reviewerId, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length } });
    return c.json({ success: true, updated: ids.length, status: "deleted" });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();

  if (field === "km_status") {
    const kmNote = action === "reject" ? rejectionNote : null;
    db.prepare(`UPDATE time_entries SET km_status = ?, km_rejection_note = ? WHERE id IN (${placeholders})`).run(newStatus, kmNote, ...ids);
  } else {
    db.prepare(
      `UPDATE time_entries SET status = ?, reviewed_by_type = ?, reviewed_by_id = ?, reviewed_at = ?, rejection_note = ? WHERE id IN (${placeholders})`
    ).run(newStatus, userType, reviewerId, now, action === "reject" ? rejectionNote : null, ...ids);
  }

  const event = action === "approve" ? "time_entry.approved" : "time_entry.rejected";
  writeAudit(companyId, { event, actorType: userType as "admin" | "supervisor", actorId: reviewerId, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length, field, status: newStatus, rejection_note: action === "reject" ? rejectionNote : undefined } });

  return c.json({ success: true, updated: ids.length, status: newStatus });
});

export default app;
