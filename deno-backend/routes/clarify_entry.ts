import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.post("/api/clarify_entry.php", requireEmployee, async (c) => {
  const emp = c.get("user") as Record<string, unknown>;
  const body = await c.req.json().catch(() => ({}));
  const id = body.id ? Number(body.id) : null;
  const action = String(body.action ?? "").trim();

  if (!id || !["clarify", "clarify_km", "delete"].includes(action)) {
    return c.json({ success: false, error: "id ja action (clarify|clarify_km|delete) vaaditaan" }, 400);
  }

  const db = getCompanyDb(emp.company_id as number);

  if (action === "clarify_km") {
    const entry = db.prepare(
      "SELECT id FROM time_entries WHERE id = ? AND employee_id = ? AND km_status = 'rejected'"
    ).get(id, emp.id as number);
    if (!entry) return c.json({ success: false, error: "Km-kirjausta ei löydy tai se ei ole hylätty" }, 404);

    const clarification = String(body.clarification ?? "").trim();
    if (!clarification) return c.json({ success: false, error: "Selvitysteksti ei voi olla tyhjä" }, 400);

    db.prepare("UPDATE time_entries SET km_status = 'pending', km_employee_clarification = ? WHERE id = ?")
      .run(clarification, id);
    writeAudit(emp.company_id as number, { event: "time_entry.km_clarified", actorType: "employee", actorId: emp.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", resourceId: String(id) });
    return c.json({ success: true, action: "km_clarified" });
  }

  const entry = db.prepare(
    "SELECT id FROM time_entries WHERE id = ? AND employee_id = ? AND status = 'rejected'"
  ).get(id, emp.id as number);
  if (!entry) return c.json({ success: false, error: "Kirjausta ei löydy tai se ei ole hylätty" }, 404);

  if (action === "delete") {
    db.prepare("UPDATE time_entries SET status = 'deleted' WHERE id = ?").run(id);
    writeAudit(emp.company_id as number, { event: "time_entry.deleted", actorType: "employee", actorId: emp.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", resourceId: String(id) });
    return c.json({ success: true, action: "deleted" });
  }

  const clarification = String(body.clarification ?? "").trim();
  if (!clarification) return c.json({ success: false, error: "Selvitysteksti ei voi olla tyhjä" }, 400);

  db.prepare(
    "UPDATE time_entries SET status = 'clarified', employee_clarification = ?, clarification_at = ? WHERE id = ?"
  ).run(clarification, new Date().toISOString(), id);
  writeAudit(emp.company_id as number, { event: "time_entry.clarified", actorType: "employee", actorId: emp.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", resourceId: String(id) });
  return c.json({ success: true, action: "clarified" });
});

export default app;
