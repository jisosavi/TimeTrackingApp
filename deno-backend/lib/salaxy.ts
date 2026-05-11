import { DB_DIR, SALAXY_API_URL, SALAXY_PASSWORD, SALAXY_TOKEN_URL, SALAXY_USERNAME } from "./config.ts";
import { getMasterDb } from "./db.ts";

export interface SalaxyCreds {
  apiUrl: string;
  tokenUrl: string;
  username: string;
  password: string;
  companyId: number;
}

export interface SalaxyResponse {
  success: boolean;
  httpCode: number;
  data: unknown;
}

export interface EntryForExport {
  id: number;
  date: string;
  start: string;
  end: string;
  hours: number;
  mileage: number;
  project: string;
  notes: string;
}

export function getCompanyCreds(companyId: number): SalaxyCreds {
  const row = getMasterDb().prepare(
    "SELECT salaxy_api_url, salaxy_username, salaxy_password FROM companies WHERE id = ?"
  ).get(companyId) as { salaxy_api_url: string | null; salaxy_username: string | null; salaxy_password: string | null } | undefined;
  return {
    apiUrl: row?.salaxy_api_url || SALAXY_API_URL,
    tokenUrl: SALAXY_TOKEN_URL,
    username: row?.salaxy_username || SALAXY_USERNAME,
    password: row?.salaxy_password || SALAXY_PASSWORD,
    companyId,
  };
}

export async function getSalaxyToken(creds: SalaxyCreds): Promise<string | null> {
  const tokenFile = `${DB_DIR}/salaxy_token_${creds.companyId}.json`;
  try {
    const cached = JSON.parse(await Deno.readTextFile(tokenFile));
    if (cached?.access_token && cached?.fetched_at && Date.now() / 1000 - cached.fetched_at < 23 * 3600) {
      return cached.access_token;
    }
  } catch { /* cache miss */ }

  const res = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "password", username: creds.username, password: creds.password, skin: "salaxy.min" }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token) return null;

  await Deno.writeTextFile(tokenFile, JSON.stringify({ access_token: data.access_token, fetched_at: Math.floor(Date.now() / 1000) })).catch(() => {});
  return data.access_token;
}

export async function salaxyRequest(method: string, endpoint: string, data: unknown, creds: SalaxyCreds): Promise<SalaxyResponse> {
  const token = await getSalaxyToken(creds);
  if (!token) return { success: false, httpCode: 0, data: null };

  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    signal: AbortSignal.timeout(30000),
  };
  if (data !== null && data !== undefined && method !== "GET") {
    opts.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(creds.apiUrl + endpoint, opts);
    const body = await res.json().catch(() => null);
    return { success: res.ok, httpCode: res.status, data: body };
  } catch (e) {
    return { success: false, httpCode: 0, data: String(e) };
  }
}

function buildDescription(entry: EntryForExport): string {
  const parts: string[] = [];
  if (entry.date) parts.push(entry.date);
  if (entry.start && entry.end) parts.push(`${entry.start}-${entry.end}`);
  else if (entry.start) parts.push(`alkaen ${entry.start}`);
  if (entry.project) parts.push(entry.project);
  if (entry.notes) parts.push(entry.notes);
  return parts.join(" | ");
}

async function getEmployeeDefaultHourlyPrice(employmentId: string, creds: SalaxyCreds): Promise<number | null> {
  const resp = await salaxyRequest("POST", "/calculations/update-from-employment?save=false&updateRows=true", {
    workflow: { status: "PayrollDraft" },
    employer: { isSelf: true },
    worker: { employmentId },
  }, creds);
  if (!resp.success || !Array.isArray((resp.data as Record<string, unknown>)?.rows)) return null;
  for (const row of (resp.data as { rows: Record<string, unknown>[] }).rows) {
    if (row.rowType === "hourlySalary" && row.price != null) return Number(row.price);
  }
  return null;
}

interface CalcResult {
  success: boolean;
  calculationId: string | null;
  calcObject: Record<string, unknown>;
  isNew: boolean;
  error?: string;
  createHttpCode?: number;
  createData?: unknown;
}

async function getOrCreateCalculation(payrollId: string, existingCalcId: string | null, employmentId: string, creds: SalaxyCreds): Promise<CalcResult> {
  if (existingCalcId) {
    const r = await salaxyRequest("GET", `/calculations/${existingCalcId}`, null, creds);
    if (r.success && r.data) {
      return { success: true, calculationId: existingCalcId, calcObject: r.data as Record<string, unknown>, isNew: false };
    }
  }

  const templateResp = await salaxyRequest("POST", "/calculations/update-from-employment?save=false&updateRows=true", {
    workflow: { status: "PayrollDraft" },
    employer: { isSelf: true },
    worker: { employmentId },
  }, creds);

  if (!templateResp.success || !templateResp.data) {
    return { success: false, calculationId: null, calcObject: {}, isNew: true, error: "Get calculation template failed", createHttpCode: templateResp.httpCode, createData: templateResp.data };
  }

  return { success: true, calculationId: null, calcObject: templateResp.data as Record<string, unknown>, isNew: true };
}

const EMPTY_ROW_FIELDS = {
  source: "undefined", sourceId: null,
  accounting: { vatPercent: null, vatEntries: null, dimensions: [], entry: null },
  period: null, data: {},
};

export async function exportEmployeeEntries(
  payrollId: string,
  entries: EntryForExport[],
  existingCalcId: string | null,
  employmentId: string,
  creds: SalaxyCreds,
): Promise<Record<string, unknown>> {
  const calcResult = await getOrCreateCalculation(payrollId, existingCalcId, employmentId, creds);
  if (!calcResult.success) {
    return { success: false, error: calcResult.error ?? "Failed to get/create calculation", createHttpCode: calcResult.createHttpCode, createData: calcResult.createData };
  }

  const { calculationId, calcObject, isNew } = calcResult;
  const defaultHourlyPriceFetched = await getEmployeeDefaultHourlyPrice(employmentId, creds);

  let baseRows = (calcObject.rows as Record<string, unknown>[]) ?? [];
  let templateHourlyPrice: number | null = null;

  if (isNew) {
    const newBase: Record<string, unknown>[] = [];
    let removed = false;
    for (const r of baseRows) {
      if (!removed && r.rowType === "hourlySalary") {
        templateHourlyPrice = r.price != null ? Number(r.price) : null;
        removed = true;
      } else {
        newBase.push(r);
      }
    }
    baseRows = newBase;
  }

  const defaultHourlyPrice = templateHourlyPrice ?? defaultHourlyPriceFetched ?? 0;
  let maxIdx = baseRows.reduce((c, r) => Math.max(c, (r.rowIndex as number) ?? -1), -1);

  const existingMsgs: Record<string, boolean> = {};
  if (!isNew) {
    for (const row of baseRows) {
      const msg = String(row.message ?? "");
      if (msg) existingMsgs[msg] = true;
    }
  }

  const addedRows: Record<string, unknown>[] = [];
  let newEntryCount = 0, skipEntryCount = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours ?? 0);
    const mileage = Number(entry.mileage ?? 0);
    let entryIsNew = false;

    if (hours > 0) {
      const msg = buildDescription(entry);
      if (!existingMsgs[msg]) {
        addedRows.push({ rowIndex: ++maxIdx, rowType: "hourlySalary", count: hours, price: defaultHourlyPrice, unit: "hours", message: msg, ...EMPTY_ROW_FIELDS });
        entryIsNew = true;
      }
    }

    if (mileage > 0) {
      const msg = `${entry.date}${entry.project ? " | " + entry.project : ""} | km-korvaus`;
      if (!existingMsgs[msg]) {
        addedRows.push({ rowIndex: ++maxIdx, rowType: "milageOwnCar", count: mileage, price: 0.25, unit: "km", message: msg, ...EMPTY_ROW_FIELDS });
        entryIsNew = true;
      }
    }

    if (entryIsNew) newEntryCount++; else skipEntryCount++;
  }

  if (addedRows.length === 0 && !isNew) {
    return { success: true, isNewCalculation: false, calculationId, finalCalculationId: calculationId, saveResponse: { success: true }, newEntryCount: 0, skipEntryCount: entries.length };
  }

  calcObject.rows = [...baseRows, ...addedRows];
  if (isNew) calcObject.info = { ...((calcObject.info as Record<string, unknown>) ?? {}), payrollId };

  const saveResponse = await salaxyRequest("POST", "/calculations/update-from-employment?save=true&updateRows=false", calcObject, creds);
  if (!saveResponse.success || !(saveResponse.data as Record<string, unknown>)?.id) {
    return { success: false, error: "Save calculation failed", isNewCalculation: isNew, saveResponse };
  }

  const finalCalcId = String((saveResponse.data as Record<string, unknown>).id);
  const result: Record<string, unknown> = { success: true, isNewCalculation: isNew, calculationId, finalCalculationId: finalCalcId, saveResponse, newEntryCount, skipEntryCount };

  if (isNew) {
    result.addCalcResponse = await salaxyRequest("POST", `/payroll/${payrollId}/add-calc?ids=${finalCalcId}`, null, creds);
  }

  return result;
}
