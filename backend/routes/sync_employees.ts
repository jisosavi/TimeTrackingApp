import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { hashPin } from "../lib/jwt.ts";
import { getCompanyCreds, salaxyRequest } from "../lib/salaxy.ts";
import { SALAXY_TOKEN_URL } from "../lib/config.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.post("/api/sync_employees_from_salaxy", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const db = getCompanyDb(companyId);

  const creds = getCompanyCreds(companyId);
  if (!creds.username || !creds.password) {
    return c.json({ success: false, error: "Salaxy credentials not configured" }, 422);
  }

  const body = await c.req.json().catch(() => ({}));
  const clearFirst = !!body.clear;
  let deleted = 0;

  if (clearFirst) {
    const row = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE company_id = ?").get(companyId) as { n: number };
    deleted = row.n;
    db.prepare("DELETE FROM time_entries WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)").run(companyId);
    db.prepare("DELETE FROM supervisor_employees WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)").run(companyId);
    db.prepare("DELETE FROM pin_rate_limit WHERE company_id = ?").run(companyId);
    db.prepare("DELETE FROM employees WHERE company_id = ?").run(companyId);
  }

  // Fetch employees from Salaxy
  const tokenUrlCreds = { ...creds, tokenUrl: SALAXY_TOKEN_URL };
  const resp = await salaxyRequest("GET", "/employments", null, tokenUrlCreds);
  const salaxyEmployees: { id: string; firstName: string; lastName: string; ssn: string | null }[] = [];

  if (resp.success) {
    const items = (resp.data as Record<string, unknown>)?.items;
    if (Array.isArray(items)) {
      for (const item of items as Record<string, unknown>[]) {
        if (!item.otherPartyInfo) continue;
        const op = item.otherPartyInfo as Record<string, unknown>;
        const av = (op.avatar ?? {}) as Record<string, unknown>;
        salaxyEmployees.push({
          id: String(item.id ?? ""),
          firstName: String(av.firstName ?? ""),
          lastName: String(av.lastName ?? ""),
          ssn: String(item.otherId ?? op.officialId ?? "") || null,
        });
      }
    }
  }

  if (!salaxyEmployees.length) {
    return c.json({ success: true, message: "No employees found in Salaxy", added: 0, updated: 0, total: 0, deleted });
  }

  let added = 0, updated = 0;

  for (const emp of salaxyEmployees) {
    if (!emp.id) continue;
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    if (!fullName) continue;

    const existing = db.prepare("SELECT id FROM employees WHERE company_id = ? AND salaxy_employment_id = ?")
      .get(companyId, emp.id) as { id: number } | undefined;

    if (existing) {
      db.prepare("UPDATE employees SET name = ?, ssn = COALESCE(?, ssn), salaxy_employment_id = ? WHERE id = ?")
        .run(fullName, emp.ssn || null, emp.id, existing.id);
      updated++;
    } else {
      const nameMatch = db.prepare("SELECT id FROM employees WHERE company_id = ? AND name = ? LIMIT 1")
        .get(companyId, fullName) as { id: number } | undefined;
      if (nameMatch) {
        db.prepare("UPDATE employees SET salaxy_employment_id = ?, ssn = COALESCE(?, ssn) WHERE id = ?")
          .run(emp.id, emp.ssn || null, nameMatch.id);
        updated++;
        continue;
      }

      // Generate unique 6-digit PIN
      let pinHash: string;
      do {
        const pin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
        pinHash = await hashPin(pin);
      } while (db.prepare("SELECT id FROM employees WHERE company_id = ? AND pin = ?").get(companyId, pinHash));

      db.prepare("INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active) VALUES (?,?,?,?,?,'employee',1)")
        .run(companyId, pinHash, fullName, emp.ssn || null, emp.id);
      added++;
    }
  }

  return c.json({ success: true, added, updated, total: salaxyEmployees.length, deleted });
});

export default app;
