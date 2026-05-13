import { Hono } from "@hono/hono";
import { getCompanyDb } from "../lib/db.ts";
import { verifyToken } from "../lib/jwt.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

function bearerToken(authHeader: string | undefined): string {
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

app.post("/api/time_entries.php", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims || claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
  const emp = getCompanyDb(claims["company_id"] as number)
    .prepare("SELECT * FROM employees WHERE id = ? AND active = 1").get(claims["user_id"] as number) as Record<string, unknown> | undefined;
  if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) return c.json({ success: false, error: "entries puuttuu" }, 400);

  const db = getCompanyDb(emp.company_id as number);
  const stmt = db.prepare(
    "INSERT INTO time_entries (company_id, employee_id, entry_date, start_time, end_time, hours, km, project, comment) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  const ids: number[] = [];
  for (const e of entries) {
    const rawDate = String(e.date ?? new Date().toLocaleDateString("fi-FI")).trim();
    const parts = rawDate.split("-");
    const isoDate = parts.length === 3 && parts[0].length === 2
      ? `${parts[2]}-${parts[1]}-${parts[0]}`
      : rawDate;
    const result = stmt.run(
      emp.company_id as number, emp.id as number, isoDate,
      String(e.start ?? "").trim(), String(e.end ?? "").trim(),
      Number(e.hours ?? 0), Number(e.mileage ?? 0),
      String(e.project ?? "").trim(), String(e.notes ?? "").trim()
    );
    ids.push(Number(result.lastInsertRowid));
  }
  writeAudit(emp.company_id as number, { event: "time_entry.created", actorType: "employee", actorId: emp.id as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length } });
  return c.json({ success: true, saved: ids.length, ids });
});

app.get("/api/time_entries.php", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);

  const view = c.req.query("view");

  if (view === "mine") {
    if (claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
    const emp = getCompanyDb(claims["company_id"] as number)
      .prepare("SELECT * FROM employees WHERE id = ? AND active = 1").get(claims["user_id"] as number);
    if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);
    const entries = getCompanyDb(claims["company_id"] as number).prepare(
      "SELECT * FROM time_entries WHERE employee_id = ? AND status != 'deleted' ORDER BY entry_date DESC, start_time DESC"
    ).all(claims["user_id"] as number);
    return c.json({ success: true, entries });
  }

  const userType = claims["user_type"] as string;
  if (userType !== "admin" && userType !== "supervisor") return c.json({ success: false, error: "Unauthorized" }, 401);
  const companyId = claims["company_id"] as number;
  const reviewerId = claims["user_id"] as number;
  const db = getCompanyDb(companyId);

  // Verify reviewer exists
  const table = userType === "admin" ? "company_admins" : "supervisors";
  const reviewer = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND active = 1`).get(reviewerId) as Record<string, unknown> | undefined;
  if (!reviewer) return c.json({ success: false, error: "Unauthorized" }, 401);

  const employeeId = c.req.query("employee_id") ? Number(c.req.query("employee_id")) : null;
  const statusFilter = c.req.query("status") ?? "";
  const dateFrom = c.req.query("date_from") ?? "";
  const dateTo = c.req.query("date_to") ?? "";

  const where: string[] = ["te.company_id = ?", "te.status != 'deleted'"];
  const params: unknown[] = [companyId];

  if (employeeId) {
    if (userType === "supervisor") {
      const chk = db.prepare("SELECT 1 FROM supervisor_employees WHERE supervisor_id = ? AND employee_id = ?")
        .get(reviewerId, employeeId);
      if (!chk) return c.json({ success: false, error: "Ei pääsyä tähän työntekijään" }, 403);
    }
    where.push("te.employee_id = ?");
    params.push(employeeId);
  } else if (userType === "supervisor") {
    where.push("te.employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?)");
    params.push(reviewerId);
  }

  if (statusFilter) { where.push("te.status = ?"); params.push(statusFilter); }
  if (dateFrom) { where.push("te.entry_date >= ?"); params.push(dateFrom); }
  if (dateTo) { where.push("te.entry_date <= ?"); params.push(dateTo); }

  const sql = `
    SELECT te.*, e.name AS employee_name,
           CASE
             WHEN te.reviewed_by_type = 'supervisor' THEN s.first_name || ' ' || s.last_name
             WHEN te.reviewed_by_type = 'admin' THEN a.name
             ELSE NULL
           END AS reviewed_by_name
    FROM time_entries te
    JOIN employees e ON e.id = te.employee_id
    LEFT JOIN supervisors s ON s.id = te.reviewed_by_id AND te.reviewed_by_type = 'supervisor'
    LEFT JOIN company_admins a ON a.id = te.reviewed_by_id AND te.reviewed_by_type = 'admin'
    WHERE ${where.join(" AND ")}
    ORDER BY te.entry_date DESC, te.start_time DESC
  `;
  const entries = db.prepare(sql).all(...(params as Parameters<ReturnType<typeof db.prepare>["all"]>));
  return c.json({ success: true, entries });
});

app.delete("/api/time_entries.php", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims || claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
  const emp = getCompanyDb(claims["company_id"] as number)
    .prepare("SELECT * FROM employees WHERE id = ? AND active = 1").get(claims["user_id"] as number);
  if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = body.id ? Number(body.id) : null;
  if (!id) return c.json({ success: false, error: "id vaaditaan" }, 400);

  const db = getCompanyDb(claims["company_id"] as number);
  const entry = db.prepare(
    "SELECT id FROM time_entries WHERE id = ? AND employee_id = ? AND status IN ('pending','clarified')"
  ).get(id, claims["user_id"] as number);
  if (!entry) return c.json({ success: false, error: "Kirjausta ei löydy" }, 404);

  db.prepare("UPDATE time_entries SET status = 'deleted' WHERE id = ?").run(id);
  writeAudit(claims["company_id"] as number, { event: "time_entry.deleted", actorType: "employee", actorId: claims["user_id"] as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", resourceId: String(id) });
  return c.json({ success: true });
});

export default app;
