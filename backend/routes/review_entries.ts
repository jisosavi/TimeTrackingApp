import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
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
  const deletionReason = String(body.deletion_reason ?? "").trim();
  const field = String(body.field ?? "").trim() === "km_status" ? "km_status" : "status";

  if (!ids.length || !["approve", "reject", "delete"].includes(action)) {
    return c.json({ success: false, error: "ids ja action (approve|reject|delete) vaaditaan" }, 400);
  }

  let allowed: { id: unknown }[];
  if (userType === "supervisor") {
    allowed = await sql`
      SELECT id FROM time_entries
      WHERE id IN ${sql(ids)} AND company_id = ${companyId}
        AND employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ${reviewerId})
    `;
  } else {
    allowed = await sql`
      SELECT id FROM time_entries
      WHERE id IN ${sql(ids)} AND company_id = ${companyId}
    `;
  }

  if (allowed.length !== ids.length) {
    return c.json({ success: false, error: "Osa kirjauksista ei kuulu sinulle tai yrityksellesi" }, 403);
  }

  if (action === "delete") {
    await sql`UPDATE time_entries SET status = 'deleted', deletion_reason = ${deletionReason || null} WHERE id IN ${sql(ids)}`;
    writeAudit(companyId, { event: "time_entry.deleted", actorType: userType as "admin" | "supervisor", actorId: reviewerId, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length, deletion_reason: deletionReason || undefined } });
    return c.json({ success: true, updated: ids.length, status: "deleted" });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();

  if (field === "km_status") {
    const kmNote = action === "reject" ? rejectionNote : null;
    await sql`UPDATE time_entries SET km_status = ${newStatus}, km_rejection_note = ${kmNote} WHERE id IN ${sql(ids)}`;
  } else {
    await sql`
      UPDATE time_entries
      SET status = ${newStatus}, reviewed_by_type = ${userType}, reviewed_by_id = ${reviewerId},
          reviewed_at = ${now}, rejection_note = ${action === "reject" ? rejectionNote : null}
      WHERE id IN ${sql(ids)}
    `;
  }

  const event = action === "approve" ? "time_entry.approved" : "time_entry.rejected";
  writeAudit(companyId, { event, actorType: userType as "admin" | "supervisor", actorId: reviewerId, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length, field, status: newStatus, rejection_note: action === "reject" ? rejectionNote : undefined } });

  return c.json({ success: true, updated: ids.length, status: newStatus });
});

export default app;
