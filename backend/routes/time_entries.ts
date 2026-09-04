import { Hono } from "@hono/hono";
import { sql } from "../lib/db.ts";
import { verifyToken } from "../lib/jwt.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

function bearerToken(authHeader: string | undefined): string {
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

app.post("/api/time_entries", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims || claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
  const companyId = claims["company_id"] as number;
  const [emp] = await sql`SELECT * FROM employees WHERE id = ${claims["user_id"] as number} AND company_id = ${companyId} AND active = TRUE`;
  if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) return c.json({ success: false, error: "entries puuttuu" }, 400);

  // When the company uses Salaxy dimensions, every entry must carry a valid code:
  // the free-text project field is not offered in that mode.
  const [activeDim] = await sql`
    SELECT dimension_id FROM company_dimensions
    WHERE company_id = ${companyId} AND enabled = TRUE AND scope = 'row'
  ` as { dimension_id: string }[];
  const dimensionId = activeDim?.dimension_id ?? null;
  const optionText = new Map<string, string>();
  if (dimensionId) {
    const opts = await sql`
      SELECT value, option_text FROM company_dimension_options
      WHERE company_id = ${companyId} AND dimension_id = ${dimensionId} AND active = TRUE
    ` as { value: string; option_text: string }[];
    for (const o of opts) optionText.set(o.value, o.option_text);
  }

  const ids: unknown[] = [];
  for (const e of entries) {
    const rawDate = String(e.date ?? new Date().toLocaleDateString("fi-FI")).trim();
    const parts = rawDate.split("-");
    const isoDate = parts.length === 3 && parts[0].length === 2
      ? `${parts[2]}-${parts[1]}-${parts[0]}`
      : rawDate;
    let project = String(e.project ?? "").trim();
    const dimensionValue = String(e.dimensionValue ?? "").trim();

    if (dimensionId) {
      if (!dimensionValue || !optionText.has(dimensionValue)) {
        return c.json({ success: false, error: "Kustannuspaikka puuttuu tai on tuntematon" }, 400);
      }
      // project carries the human-readable label; the code is the authoritative value.
      project = optionText.get(dimensionValue)!;
    }

    const [result] = await sql`
      INSERT INTO time_entries (company_id, employee_id, entry_date, start_time, end_time, hours, km, project, comment)
      VALUES (${companyId}, ${emp.id}, ${isoDate}, ${String(e.start ?? "").trim()}, ${String(e.end ?? "").trim()},
              ${Number(e.hours ?? 0)}, ${Number(e.mileage ?? 0)}, ${project}, ${String(e.notes ?? "").trim()})
      RETURNING id
    `;
    ids.push(result.id);

    if (dimensionId) {
      await sql`
        INSERT INTO time_entry_dimensions (entry_id, dimension_id, value, percent)
        VALUES (${result.id as number}, ${dimensionId}, ${dimensionValue}, 100)
      `;
    }
  }
  writeAudit(companyId, { event: "time_entry.created", actorType: "employee", actorId: Number(emp.id), actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", after: { ids, count: ids.length } });
  return c.json({ success: true, saved: ids.length, ids });
});

app.get("/api/time_entries", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);

  const view = c.req.query("view");
  const companyId = claims["company_id"] as number;

  if (view === "mine") {
    if (claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
    const [emp] = await sql`SELECT id FROM employees WHERE id = ${claims["user_id"] as number} AND company_id = ${companyId} AND active = TRUE`;
    if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);
    const entries = await sql`
      SELECT * FROM time_entries
      WHERE employee_id = ${claims["user_id"] as number} AND company_id = ${companyId} AND status != 'deleted'
      ORDER BY entry_date DESC, start_time DESC
    `;
    return c.json({ success: true, entries });
  }

  const userType = claims["user_type"] as string;
  if (userType !== "admin" && userType !== "supervisor") return c.json({ success: false, error: "Unauthorized" }, 401);
  const reviewerId = claims["user_id"] as number;

  const table = userType === "admin" ? "company_admins" : "supervisors";
  const [reviewer] = await sql.unsafe(`SELECT id FROM ${table} WHERE id = $1 AND company_id = $2 AND active = TRUE`, [reviewerId, companyId]);
  if (!reviewer) return c.json({ success: false, error: "Unauthorized" }, 401);

  const employeeId = c.req.query("employee_id") ? Number(c.req.query("employee_id")) : null;
  const statusFilter = c.req.query("status") ?? "";
  const dateFrom = c.req.query("date_from") ?? "";
  const dateTo = c.req.query("date_to") ?? "";

  const conditions: string[] = ["te.company_id = $1"];
  const params: unknown[] = [companyId];
  let pIdx = 2;

  if (employeeId) {
    if (userType === "supervisor") {
      const [chk] = await sql`SELECT 1 FROM supervisor_employees WHERE supervisor_id = ${reviewerId} AND employee_id = ${employeeId}`;
      if (!chk) return c.json({ success: false, error: "Ei pääsyä tähän työntekijään" }, 403);
    }
    conditions.push(`te.employee_id = $${pIdx++}`);
    params.push(employeeId);
  } else if (userType === "supervisor") {
    conditions.push(`te.employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = $${pIdx++})`);
    params.push(reviewerId);
  }

  if (statusFilter) { conditions.push(`te.status = $${pIdx++}`); params.push(statusFilter); }
  if (dateFrom) { conditions.push(`te.entry_date >= $${pIdx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`te.entry_date <= $${pIdx++}`); params.push(dateTo); }

  const query = `
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
    WHERE ${conditions.join(" AND ")}
    ORDER BY te.entry_date DESC, te.start_time DESC
  `;
  const entries = await sql.unsafe(query, params);
  return c.json({ success: true, entries });
});

app.delete("/api/time_entries", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims || claims["user_type"] !== "employee") return c.json({ success: false, error: "Unauthorized" }, 401);
  const companyId = claims["company_id"] as number;
  const [emp] = await sql`SELECT id FROM employees WHERE id = ${claims["user_id"] as number} AND company_id = ${companyId} AND active = TRUE`;
  if (!emp) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = body.id ? Number(body.id) : null;
  if (!id) return c.json({ success: false, error: "id vaaditaan" }, 400);

  const [entry] = await sql`
    SELECT id FROM time_entries
    WHERE id = ${id} AND employee_id = ${claims["user_id"] as number} AND company_id = ${companyId} AND status IN ('pending','clarified')
  `;
  if (!entry) return c.json({ success: false, error: "Kirjausta ei löydy" }, 404);

  const deletionReason = String(body.deletion_reason ?? "").trim();
  await sql`UPDATE time_entries SET status = 'deleted', deletion_reason = ${deletionReason || null} WHERE id = ${id}`;
  writeAudit(companyId, { event: "time_entry.deleted", actorType: "employee", actorId: claims["user_id"] as number, actorIp: reqIp(c.req.header("x-forwarded-for")), resource: "time_entry", resourceId: String(id), after: { deletion_reason: deletionReason || undefined } });
  return c.json({ success: true });
});

export default app;
