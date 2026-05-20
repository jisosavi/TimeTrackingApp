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

// ─── Holiday & Absence types ───────────────────────────────────────────────

export interface HolidaySeason {
  start: string;
  end: string;
}

export interface HolidayYear {
  id: string;
  year: number;
  startDate: string;
  endDate: string;
  accruedDays: number;
  plannedDays: number;
  paidDays: number;
  summerSeason: HolidaySeason;
  winterSeason: HolidaySeason;
  accrualRule: string;
  monthlyAccrual: number;
}

export type AbsenceCauseCode =
  | "undefined" | "unpaidLeave" | "personalReason" | "illness"
  | "partTimeSickLeave" | "parentalLeave" | "specialMaternityLeave"
  | "rehabilitation" | "childIllness" | "partTimeChildCareLeave"
  | "training" | "jobAlternationLeave" | "studyLeave" | "industrialAction"
  | "interruptionInWorkProvision" | "leaveOfAbsence" | "militaryRefresherTraining"
  | "militaryService" | "layOff" | "childCareLeave" | "midWeekHoliday"
  | "accruedHoliday" | "occupationalAccident" | "annualLeave"
  | "partTimeAbsenceDueToRehabilitation" | "other";

export interface Absence {
  id: string;
  causeCode: AbsenceCauseCode;
  startDate: string;
  endDate: string;
  days: number;
  isPaid: boolean;
  affectsAccrual: boolean;
  note?: string | null;
}

export interface Holiday {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  season: "summer" | "winter";
  note?: string | null;
}

export interface AbsencePayload {
  causeCode: AbsenceCauseCode;
  startDate: string;
  endDate: string;
  days?: number;
  isPaid?: boolean;
  affectsAccrual?: boolean;
  note?: string | null;
}

export interface HolidayPayload {
  startDate: string;
  endDate: string;
  season: "summer" | "winter";
  note?: string | null;
}

interface SalaxyHolidayYearRaw {
  id: string;
  year: number;
  period?: { start?: string; end?: string };
  spec?: { code?: string; accrualFixed?: number };
  accrual?: { total?: number; defaultAccrual?: number };
  leaves?: {
    planned?: Array<{ period?: { daysCount?: number } }>;
    paid?: Array<{ holidayDays?: number }>;
  };
}

function mapHolidayYear(raw: SalaxyHolidayYearRaw): HolidayYear {
  const y = raw.year;
  return {
    id: raw.id,
    year: y,
    startDate: raw.period?.start ?? "",
    endDate: raw.period?.end ?? "",
    accruedDays: raw.accrual?.total ?? 0,
    plannedDays: (raw.leaves?.planned ?? []).reduce((s, p) => s + (p.period?.daysCount ?? 0), 0),
    paidDays: (raw.leaves?.paid ?? []).reduce((s, p) => s + (p.holidayDays ?? 0), 0),
    summerSeason: { start: `${y}-05-02`, end: `${y}-09-30` },
    winterSeason: { start: `${y}-10-01`, end: `${y + 1}-04-30` },
    accrualRule: raw.spec?.code ?? "",
    monthlyAccrual: raw.accrual?.defaultAccrual ?? 0,
  };
}

// ─── In-memory cache (30 s TTL, keyed by employeeSalaxyId or employeeSalaxyId:year) ───

const CACHE_TTL_MS = 30_000;
type CacheEntry<T> = { data: T; ts: number };
const _holidayYearsCache = new Map<string, CacheEntry<HolidayYear[]>>();
const _absencesCache = new Map<string, CacheEntry<Absence[]>>();

function _invalidateEmployeeCache(employeeSalaxyId: string): void {
  _holidayYearsCache.delete(employeeSalaxyId);
  for (const key of _absencesCache.keys()) {
    if (key.startsWith(`${employeeSalaxyId}:`)) _absencesCache.delete(key);
  }
}

// ─── API functions ─────────────────────────────────────────────────────────

export async function getHolidayYears(employeeSalaxyId: string, creds: SalaxyCreds): Promise<HolidayYear[]> {
  const cached = _holidayYearsCache.get(employeeSalaxyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const r = await salaxyRequest("GET", `/holidays/employment/${employeeSalaxyId}`, null, creds);
  if (!r.success) throw new Error(`Salaxy getHolidayYears ${r.httpCode}: ${JSON.stringify(r.data)}`);

  const data = (Array.isArray(r.data) ? r.data : []).map((raw) => mapHolidayYear(raw as SalaxyHolidayYearRaw));
  _holidayYearsCache.set(employeeSalaxyId, { data, ts: Date.now() });
  return data;
}

function mapAbsencePeriod(p: Record<string, unknown>): Absence {
  const period = (p.period ?? {}) as Record<string, unknown>;
  return {
    id: String(p.id ?? ""),
    causeCode: (p.causeCode ?? "other") as AbsenceCauseCode,
    startDate: String(period.start ?? ""),
    endDate: String(period.end ?? ""),
    days: Number(period.daysCount ?? 0),
    isPaid: Boolean(p.isPaid),
    affectsAccrual: Boolean(p.isHolidayAccrual),
    note: (p.notes ?? null) as string | null,
  };
}

export async function getAbsences(employeeSalaxyId: string, year: number, creds: SalaxyCreds): Promise<Absence[]> {
  const cacheKey = `${employeeSalaxyId}:${year}`;
  const cached = _absencesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const r = await salaxyRequest("GET", `/absences/employment/${employeeSalaxyId}`, null, creds);
  if (!r.success) {
    if (r.httpCode === 404) { _absencesCache.set(cacheKey, { data: [], ts: Date.now() }); return []; }
    throw new Error(`Salaxy getAbsences ${r.httpCode}: ${JSON.stringify(r.data)}`);
  }

  const doc = r.data as Record<string, unknown>;
  const periods = (Array.isArray(doc.periods) ? doc.periods : []) as Record<string, unknown>[];
  const data = periods.map(mapAbsencePeriod).filter((a) => {
    const y1 = new Date(a.startDate).getFullYear();
    const y2 = new Date(a.endDate).getFullYear();
    return y1 === year || y2 === year;
  });
  _absencesCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export async function createAbsence(employeeSalaxyId: string, payload: AbsencePayload, creds: SalaxyCreds): Promise<Absence> {
  // GET existing WorkerAbsences doc or fetch empty template
  let doc: Record<string, unknown>;
  const existing = await salaxyRequest("GET", `/absences/employment/${employeeSalaxyId}`, null, creds);
  if (existing.success && existing.data) {
    doc = existing.data as Record<string, unknown>;
  } else {
    const tmpl = await salaxyRequest("GET", "/absences/new", null, creds);
    if (!tmpl.success || !tmpl.data) throw new Error(`Salaxy absences/new ${tmpl.httpCode}: ${JSON.stringify(tmpl.data)}`);
    doc = tmpl.data as Record<string, unknown>;
    doc.employmentId = employeeSalaxyId;
  }

  const periods = (Array.isArray(doc.periods) ? doc.periods : []) as Record<string, unknown>[];
  periods.push({
    period: { start: payload.startDate, end: payload.endDate, daysCount: payload.days ?? 0 },
    causeCode: payload.causeCode,
    isPaid: payload.isPaid ?? true,
    isHolidayAccrual: payload.affectsAccrual ?? true,
    notes: payload.note ?? null,
  });
  doc.periods = periods;

  const saved = await salaxyRequest("POST", "/absences", doc, creds);
  if (!saved.success) throw new Error(`Salaxy createAbsence ${saved.httpCode}: ${JSON.stringify(saved.data)}`);

  const savedDoc = saved.data as Record<string, unknown>;
  const savedPeriods = (Array.isArray(savedDoc.periods) ? savedDoc.periods : []) as Record<string, unknown>[];
  const matched = savedPeriods.filter((p) => {
    const pd = (p.period ?? {}) as Record<string, unknown>;
    return pd.start === payload.startDate && pd.end === payload.endDate;
  }).at(-1);
  if (!matched) throw new Error("Salaxy createAbsence: created period not found in response");

  _invalidateEmployeeCache(employeeSalaxyId);
  return mapAbsencePeriod(matched);
}

export async function updateAbsence(employeeSalaxyId: string, absenceId: string, payload: Partial<AbsencePayload>, creds: SalaxyCreds): Promise<Absence> {
  const r = await salaxyRequest("PATCH", `/employees/${employeeSalaxyId}/absences/${absenceId}`, payload, creds);
  if (!r.success) throw new Error(`Salaxy updateAbsence ${r.httpCode}: ${JSON.stringify(r.data)}`);
  _invalidateEmployeeCache(employeeSalaxyId);
  return r.data as Absence;
}

export async function deleteAbsence(employeeSalaxyId: string, absenceId: string, creds: SalaxyCreds): Promise<void> {
  const r = await salaxyRequest("DELETE", `/employees/${employeeSalaxyId}/absences/${absenceId}`, null, creds);
  if (!r.success) throw new Error(`Salaxy deleteAbsence ${r.httpCode}: ${JSON.stringify(r.data)}`);
  _invalidateEmployeeCache(employeeSalaxyId);
}

export async function createHoliday(employeeSalaxyId: string, holidayYearId: string, payload: HolidayPayload, creds: SalaxyCreds): Promise<Holiday> {
  const r = await salaxyRequest("POST", `/employees/${employeeSalaxyId}/holidayYears/${holidayYearId}/holidays`, payload, creds);
  if (!r.success) throw new Error(`Salaxy createHoliday ${r.httpCode}: ${JSON.stringify(r.data)}`);
  _invalidateEmployeeCache(employeeSalaxyId);
  return r.data as Holiday;
}
