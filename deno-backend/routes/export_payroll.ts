import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { getCompanyDb, getMasterDb } from "../lib/db.ts";
import { getCompanyCreds, exportEmployeeEntries, salaxyRequest, type EntryForExport } from "../lib/salaxy.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

interface PayrollSettings {
  payroll_period: string;
  payday_1: number;
  payday_2: number;
}

interface Period {
  start: string;
  end: string;
  label: string;
  num: number;
  paydayDate: string;
}

function getLastDayOfMonth(year: number, mon: number): number {
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

function getPeriodForDate(dateYmd: string, s: PayrollSettings): Period {
  const d = new Date(dateYmd + "T12:00:00Z");
  const year = d.getUTCFullYear();
  const mon = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const ym = `${year}-${String(mon).padStart(2, "0")}`;
  const last = getLastDayOfMonth(year, mon);

  let start: string, end: string, label: string, num: number, pdSetting: number;

  if (s.payroll_period === "biweekly") {
    if (day <= 15) {
      num = 1; start = `${ym}-01`; end = `${ym}-15`; pdSetting = s.payday_1 ?? 15;
      label = `Palkkakausi ${year}/${String(mon).padStart(2, "0")} jakso 1 (1.–15.${mon}.)`;
    } else {
      num = 2; start = `${ym}-16`; end = `${ym}-${String(last).padStart(2, "0")}`; pdSetting = s.payday_2 ?? 0;
      label = `Palkkakausi ${year}/${String(mon).padStart(2, "0")} jakso 2 (16.–${last}.${mon}.)`;
    }
  } else {
    num = 1; start = `${ym}-01`; end = `${ym}-${String(last).padStart(2, "0")}`; pdSetting = s.payday_1 ?? 15;
    label = `Palkkakausi ${year}/${String(mon).padStart(2, "0")} (1.–${last}.${mon}.)`;
  }

  const pdDay = pdSetting === 0 ? last : Math.min(pdSetting, last);
  return { start, end, label, num, paydayDate: `${ym}-${String(pdDay).padStart(2, "0")}` };
}

function getPeriodsForRange(dateFrom: string, dateTo: string, s: PayrollSettings): Map<string, Period> {
  const periods = new Map<string, Period>();
  let cur = new Date(dateFrom + "T12:00:00Z");
  const end = new Date(dateTo + "T12:00:00Z");
  while (cur <= end) {
    const ymd = cur.toISOString().slice(0, 10);
    const p = getPeriodForDate(ymd, s);
    if (!periods.has(p.start)) periods.set(p.start, p);
    const next = new Date(p.end + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    cur = next;
  }
  return periods;
}

app.get("/api/export_payroll", requireAdmin, (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const db = getCompanyDb(companyId);

  const dateFrom = c.req.query("date_from") ?? "";
  const dateTo = c.req.query("date_to") ?? "";
  if (!dateFrom || !dateTo) return c.json({ success: false, error: "date_from ja date_to vaaditaan" }, 400);

  const settingsRow = getMasterDb().prepare(
    "SELECT payroll_period, payday_1, payday_2 FROM companies WHERE id = ?"
  ).get(companyId) as PayrollSettings | undefined;
  const settings: PayrollSettings = settingsRow ?? { payroll_period: "monthly", payday_1: 15, payday_2: 0 };

  const byPeriod = new Map<string, Record<string, unknown>>();
  for (const [pk, p] of getPeriodsForRange(dateFrom, dateTo, settings)) {
    const ex = db.prepare(
      "SELECT salaxy_payroll_id FROM payroll_exports WHERE company_id = ? AND period_start = ? AND period_end = ?"
    ).get(companyId, p.start, p.end) as { salaxy_payroll_id: string } | undefined;
    byPeriod.set(pk, {
      period_start: p.start, period_end: p.end, period_label: p.label,
      existing_payroll_id: ex?.salaxy_payroll_id ?? null,
      employees: {},
    });
  }

  const entries = db.prepare(
    `SELECT te.*, e.name AS employee_name, e.salaxy_employment_id
     FROM time_entries te JOIN employees e ON e.id = te.employee_id
     WHERE te.company_id = ? AND te.status = 'approved' AND te.entry_date >= ? AND te.entry_date <= ?
     ORDER BY te.entry_date ASC, e.name ASC`
  ).all(companyId, dateFrom, dateTo) as Record<string, unknown>[];

  for (const row of entries) {
    const pk = getPeriodForDate(row.entry_date as string, settings).start;
    const eid = row.employee_id as number;
    const pd = byPeriod.get(pk);
    if (!pd) continue;
    const emps = pd.employees as Record<number, Record<string, unknown>>;
    if (!emps[eid]) {
      emps[eid] = { employee_id: eid, employee_name: row.employee_name, salaxy_employment_id: row.salaxy_employment_id, total_hours: 0, total_km: 0, pending_hours: 0, pending_km: 0, entries: [] };
    }
    const isDual = Number(row.hours) > 0 && Number(row.km) > 0;
    const exportableKm = isDual && row.km_status !== "approved" ? 0 : Number(row.km);
    emps[eid].total_hours = Number(emps[eid].total_hours) + Number(row.hours);
    emps[eid].total_km = Number(emps[eid].total_km) + exportableKm;
    if (!Number(row.exported_to_salaxy)) {
      emps[eid].pending_hours = Number(emps[eid].pending_hours) + Number(row.hours);
      emps[eid].pending_km = Number(emps[eid].pending_km) + exportableKm;
    }
    (emps[eid].entries as unknown[]).push(row);
  }

  const periods = [];
  for (const pd of byPeriod.values()) {
    pd.employees = Object.values(pd.employees as Record<number, unknown>);
    periods.push(pd);
  }
  return c.json({ success: true, periods });
});

app.post("/api/export_payroll", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const db = getCompanyDb(companyId);

  const body = await c.req.json().catch(() => ({}));
  const dateFrom = String(body.date_from ?? "").trim();
  const dateTo = String(body.date_to ?? "").trim();
  const employeeIds: number[] = Array.isArray(body.employee_ids) ? body.employee_ids.map(Number) : [];
  const force = !!body.force;

  if (!dateFrom || !dateTo) return c.json({ success: false, error: "date_from ja date_to vaaditaan" }, 400);

  const settingsRow = getMasterDb().prepare(
    "SELECT payroll_period, payday_1, payday_2 FROM companies WHERE id = ?"
  ).get(companyId) as PayrollSettings | undefined;
  const settings: PayrollSettings = settingsRow ?? { payroll_period: "monthly", payday_1: 15, payday_2: 0 };

  const allPeriods = getPeriodsForRange(dateFrom, dateTo, settings);
  const creds = getCompanyCreds(companyId);

  // Load entries grouped by period → salaxy_employment_id
  const entriesByPeriod = new Map<string, Map<string, EntryForExport[]>>();

  if (employeeIds.length) {
    const placeholders = employeeIds.map(() => "?").join(",");
    const exportedFilter = force ? "" : "AND te.exported_to_salaxy = 0";
    const rows = db.prepare(
      `SELECT te.*, e.salaxy_employment_id FROM time_entries te JOIN employees e ON e.id = te.employee_id
       WHERE te.company_id = ? AND te.status = 'approved' ${exportedFilter}
         AND te.entry_date >= ? AND te.entry_date <= ? AND te.employee_id IN (${placeholders})
       ORDER BY te.entry_date ASC`
    ).all(companyId, dateFrom, dateTo, ...employeeIds) as Record<string, unknown>[];

    for (const row of rows) {
      const pk = getPeriodForDate(row.entry_date as string, settings).start;
      const eid = String(row.salaxy_employment_id ?? "");
      if (!entriesByPeriod.has(pk)) entriesByPeriod.set(pk, new Map());
      const byEmp = entriesByPeriod.get(pk)!;
      if (!byEmp.has(eid)) byEmp.set(eid, []);
      const parts = String(row.entry_date).split("-");
      const ddmmyyyy = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(row.entry_date);
      const isDual = Number(row.hours) > 0 && Number(row.km) > 0;
      const exportableKm = isDual && row.km_status !== "approved" ? 0 : Number(row.km);
      byEmp.get(eid)!.push({
        id: Number(row.id), date: ddmmyyyy,
        start: String(row.start_time ?? ""), end: String(row.end_time ?? ""),
        hours: Number(row.hours), mileage: exportableKm,
        project: String(row.project ?? ""), notes: String(row.comment ?? ""),
      });
    }
  }

  const fallbackRow = db.prepare(
    "SELECT salaxy_employment_id FROM employees WHERE company_id = ? AND salaxy_employment_id IS NOT NULL AND active = 1 LIMIT 1"
  ).get(companyId) as { salaxy_employment_id: string } | undefined;
  const fallbackEmpId = fallbackRow?.salaxy_employment_id ?? null;

  let totalSent = 0, totalAdded = 0, totalAlready = 0;
  const errors: unknown[] = [];
  const exportedIds: number[] = [];
  const payrollLinks: Record<string, string> = {};

  for (const [pk, p] of allPeriods) {
    const empEntries = entriesByPeriod.get(pk) ?? new Map<string, EntryForExport[]>();

    // Get or create Salaxy payroll for this period
    let exportRow = db.prepare(
      "SELECT id, salaxy_payroll_id FROM payroll_exports WHERE company_id = ? AND period_start = ? AND period_end = ?"
    ).get(companyId, p.start, p.end) as { id: number; salaxy_payroll_id: string } | undefined;

    let payrollId: string;
    let exportId: number;
    let needCreate = true;

    if (exportRow) {
      const check = await salaxyRequest("GET", `/payroll/${exportRow.salaxy_payroll_id}`, null, creds);
      if (check.success && (check.data as Record<string, unknown>)?.id) {
        payrollId = exportRow.salaxy_payroll_id;
        exportId = exportRow.id;
        needCreate = false;
      }
    }

    if (needCreate) {
      const refEmpId = empEntries.keys().next().value ?? fallbackEmpId;
      if (!refEmpId) {
        errors.push({ period: pk, error: "No Salaxy employment ID available to create payroll" });
        continue;
      }
      const createResp = await salaxyRequest("POST", "/payroll", {
        employmentId: refEmpId,
        status: "Draft",
        input: { title: p.label, payDay: p.paydayDate },
      }, creds);
      if (!createResp.success || !(createResp.data as Record<string, unknown>)?.id) {
        errors.push({ period: pk, error: "Palkkalistan luonti epäonnistui", detail: createResp.data });
        continue;
      }
      payrollId = String((createResp.data as Record<string, unknown>).id);
      if (exportRow) {
        exportId = exportRow.id;
        db.prepare("UPDATE payroll_exports SET salaxy_payroll_id = ? WHERE id = ?").run(payrollId, exportId);
        db.prepare("DELETE FROM payroll_export_calculations WHERE payroll_export_id = ?").run(exportId);
      } else {
        const ins = db.prepare(
          "INSERT INTO payroll_exports (company_id, period_start, period_end, salaxy_payroll_id) VALUES (?,?,?,?)"
        ).run(companyId, p.start, p.end, payrollId);
        exportId = Number(ins.lastInsertRowid);
      }
    }

    payrollLinks[pk] = payrollId!;

    for (const [empSalaxyId, empEnts] of empEntries) {
      const calcRow = db.prepare(
        "SELECT salaxy_calculation_id FROM payroll_export_calculations WHERE payroll_export_id = ? AND salaxy_employment_id = ?"
      ).get(exportId!, empSalaxyId) as { salaxy_calculation_id: string } | undefined;

      const r = await exportEmployeeEntries(payrollId!, empEnts, calcRow?.salaxy_calculation_id ?? null, empSalaxyId, creds);
      const funcOk = r.success as boolean;
      const saveOk = (r.saveResponse as Record<string, unknown>)?.success as boolean;

      if (funcOk && saveOk) {
        const newCalcId = r.finalCalculationId as string | undefined;
        if (newCalcId && newCalcId !== calcRow?.salaxy_calculation_id) {
          db.prepare(
            "INSERT OR REPLACE INTO payroll_export_calculations (payroll_export_id, salaxy_employment_id, salaxy_calculation_id) VALUES (?,?,?)"
          ).run(exportId!, empSalaxyId, newCalcId);
        }
        for (const entry of empEnts) exportedIds.push(entry.id);
        totalSent += empEnts.length;
        totalAdded += (r.newEntryCount as number) ?? empEnts.length;
        totalAlready += (r.skipEntryCount as number) ?? 0;
      } else {
        errors.push({ employee: empSalaxyId, entryCount: empEnts.length, funcError: r.error, saveResponse: r.saveResponse });
      }
    }
  }

  if (exportedIds.length) {
    const ph = exportedIds.map(() => "?").join(",");
    const now = new Date().toISOString();
    db.prepare(`UPDATE time_entries SET exported_to_salaxy = 1, exported_at = ? WHERE id IN (${ph})`).run(now, ...exportedIds);
  }

  writeAudit(companyId, {
    event: "payroll.exported",
    actorType: "admin",
    actorId: (admin as Record<string, unknown>).id as number,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "payroll_export",
    outcome: errors.length > 0 && totalSent === 0 ? "error" : "ok",
    after: { date_from: dateFrom, date_to: dateTo, total_sent: totalSent, total_added: totalAdded, errors: errors.length, entry_ids: exportedIds },
  });

  return c.json({
    success: true, total_sent: totalSent, total_added: totalAdded, total_already: totalAlready,
    errors: errors.length, errors_detail: errors,
    payrolls: Object.entries(payrollLinks).map(([start, id]) => ({ period_start: start, salaxy_payroll_id: id })),
  });
});

export default app;
