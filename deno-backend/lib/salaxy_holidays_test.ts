import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  getHolidayYears,
  getAbsences,
  createAbsence,
  updateAbsence,
  deleteAbsence,
  createHoliday,
  type SalaxyCreds,
  type HolidayYear,
  type Absence,
  type Holiday,
} from "./salaxy.ts";

// ─── Test helpers ──────────────────────────────────────────────────────────

const TEST_CREDS: SalaxyCreds = {
  apiUrl: "https://api.test.salaxy.com/v03/api",
  tokenUrl: "https://api.test.salaxy.com/oauth2/token",
  username: "u",
  password: "p",
  companyId: 0,
};

interface FetchRecord {
  url: string;
  method: string;
  body: unknown;
  authHeader: string | null;
}

// Installs a mock fetch that:
//   - serves the token endpoint automatically
//   - routes data-endpoint calls through the provided handler
// Returns an array that accumulates every non-token fetch call for assertions.
function mockFetch(
  dataHandler: (url: string, init: RequestInit) => Response,
): FetchRecord[] {
  const calls: FetchRecord[] = [];
  globalThis.fetch = async (
    urlInput: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      urlInput instanceof Request ? urlInput.url : String(urlInput);
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url.includes("/oauth2/token")) {
      return new Response(
        JSON.stringify({ access_token: "test-token" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : null,
      authHeader: headers["Authorization"] ?? null,
    });
    return dataHandler(url, init ?? {});
  };
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── getHolidayYears ───────────────────────────────────────────────────────

Deno.test("getHolidayYears: fetches correct URL and returns parsed array", async () => {
  const empId = "hy-emp-1";
  const fixture: HolidayYear[] = [{
    id: "hy1", year: 2024,
    startDate: "2024-01-01", endDate: "2024-12-31",
    accruedDays: 30, plannedDays: 10, paidDays: 5,
    summerSeason: { start: "2024-05-02", end: "2024-09-30" },
    winterSeason: { start: "2024-10-01", end: "2025-04-30" },
    accrualRule: "14dayRule", monthlyAccrual: 2.5,
  }];

  const calls = mockFetch((_url) => jsonResponse(fixture));

  const result = await getHolidayYears(empId, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/holidayYears`);
  assertEquals(calls[0].method, "GET");
  assertEquals(calls[0].authHeader, "Bearer test-token");
  assertEquals(result, fixture);
});

Deno.test("getHolidayYears: cache hit avoids second fetch", async () => {
  const empId = "hy-emp-2";
  const fixture: HolidayYear[] = [{ id: "hy2", year: 2024, startDate: "", endDate: "", accruedDays: 0, plannedDays: 0, paidDays: 0, summerSeason: { start: "", end: "" }, winterSeason: { start: "", end: "" }, accrualRule: "", monthlyAccrual: 0 }];

  const calls = mockFetch((_url) => jsonResponse(fixture));

  await getHolidayYears(empId, TEST_CREDS);
  const cached = await getHolidayYears(empId, TEST_CREDS);

  assertEquals(calls.length, 1, "should only fetch once within TTL");
  assertEquals(cached, fixture);
});

Deno.test("getHolidayYears: re-fetches after TTL expires", async () => {
  const empId = "hy-emp-3";
  const fixture: HolidayYear[] = [];
  const calls = mockFetch((_url) => jsonResponse(fixture));

  const origNow = Date.now;
  await getHolidayYears(empId, TEST_CREDS);
  Date.now = () => origNow() + 31_000;
  try {
    await getHolidayYears(empId, TEST_CREDS);
    assertEquals(calls.length, 2, "should re-fetch after TTL");
  } finally {
    Date.now = origNow;
  }
});

Deno.test("getHolidayYears: throws on Salaxy error", async () => {
  const empId = "hy-emp-err";
  mockFetch((_url) => jsonResponse({ message: "not found" }, 404));

  await assertRejects(
    () => getHolidayYears(empId, TEST_CREDS),
    Error,
    "404",
  );
});

// ─── getAbsences ───────────────────────────────────────────────────────────

Deno.test("getAbsences: fetches correct URL including year query param", async () => {
  const empId = "abs-emp-1";
  const year = 2024;
  const fixture: Absence[] = [{
    id: "a1", reason: "Kertausharjoitus",
    startDate: "2024-03-04", endDate: "2024-03-08",
    days: 5, isPaid: true, affectsAccrual: false, note: null,
  }];

  const calls = mockFetch((_url) => jsonResponse(fixture));

  const result = await getAbsences(empId, year, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/absences?year=${year}`);
  assertEquals(result, fixture);
});

Deno.test("getAbsences: cache is keyed by employee+year (different years = separate fetches)", async () => {
  const empId = "abs-emp-2";
  const calls = mockFetch((_url) => jsonResponse([]));

  await getAbsences(empId, 2023, TEST_CREDS);
  await getAbsences(empId, 2024, TEST_CREDS);
  await getAbsences(empId, 2023, TEST_CREDS); // cache hit
  await getAbsences(empId, 2024, TEST_CREDS); // cache hit

  assertEquals(calls.length, 2, "one fetch per unique employee+year");
});

Deno.test("getAbsences: cache hit within TTL", async () => {
  const empId = "abs-emp-3";
  const calls = mockFetch((_url) => jsonResponse([]));

  await getAbsences(empId, 2024, TEST_CREDS);
  await getAbsences(empId, 2024, TEST_CREDS);

  assertEquals(calls.length, 1);
});

// ─── createAbsence ─────────────────────────────────────────────────────────

Deno.test("createAbsence: POSTs correct URL and body, returns Absence", async () => {
  const empId = "abs-emp-4";
  const payload = { reason: "Kertausharjoitus", startDate: "2024-06-01", endDate: "2024-06-05", days: 5 };
  const created: Absence = { id: "new-abs", reason: "Kertausharjoitus", startDate: "2024-06-01", endDate: "2024-06-05", days: 5, isPaid: true, affectsAccrual: false };

  const calls = mockFetch((_url) => jsonResponse(created));

  const result = await createAbsence(empId, payload, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/absences`);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].body, payload);
  assertEquals(result, created);
});

Deno.test("createAbsence: busts cache so next getAbsences re-fetches", async () => {
  const empId = "abs-emp-5";
  const year = 2024;
  let callCount = 0;

  mockFetch((url) => {
    callCount++;
    if (url.includes("/absences?year=")) return jsonResponse([]);
    return jsonResponse({ id: "x", reason: "Kertausharjoitus", startDate: "2024-06-01", endDate: "2024-06-01", days: 1, isPaid: false, affectsAccrual: false });
  });

  await getAbsences(empId, year, TEST_CREDS);     // fetch 1: primes cache
  assertEquals(callCount, 1);

  await createAbsence(empId, { reason: "Kertausharjoitus", startDate: "2024-06-01", endDate: "2024-06-01" }, TEST_CREDS); // fetch 2: mutation + busts cache
  assertEquals(callCount, 2);

  await getAbsences(empId, year, TEST_CREDS);     // fetch 3: cache gone, re-fetches
  assertEquals(callCount, 3);
});

Deno.test("createAbsence: throws on Salaxy error", async () => {
  const empId = "abs-emp-err2";
  mockFetch((_url) => jsonResponse({ error: "bad request" }, 400));

  await assertRejects(
    () => createAbsence(empId, { reason: "Kertausharjoitus", startDate: "2024-01-01", endDate: "2024-01-01" }, TEST_CREDS),
    Error,
    "400",
  );
});

// ─── updateAbsence ─────────────────────────────────────────────────────────

Deno.test("updateAbsence: sends PATCH to correct URL with body", async () => {
  const empId = "abs-emp-6";
  const absenceId = "abs-99";
  const payload = { endDate: "2024-06-10", days: 10 };
  const updated: Absence = { id: absenceId, reason: "Kertausharjoitus", startDate: "2024-06-01", endDate: "2024-06-10", days: 10, isPaid: true, affectsAccrual: false };

  const calls = mockFetch((_url) => jsonResponse(updated));

  const result = await updateAbsence(empId, absenceId, payload, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/absences/${absenceId}`);
  assertEquals(calls[0].method, "PATCH");
  assertEquals(calls[0].body, payload);
  assertEquals(result, updated);
});

Deno.test("updateAbsence: busts cache for employee", async () => {
  const empId = "abs-emp-7";
  const year = 2024;
  let callCount = 0;

  mockFetch((url) => {
    callCount++;
    if (url.includes("/absences?year=")) return jsonResponse([]);
    return jsonResponse({ id: "x", reason: "Kertausharjoitus", startDate: "2024-01-01", endDate: "2024-01-01", days: 1, isPaid: false, affectsAccrual: false });
  });

  await getAbsences(empId, year, TEST_CREDS);
  await updateAbsence(empId, "abs-1", { note: "updated" }, TEST_CREDS);
  await getAbsences(empId, year, TEST_CREDS);

  assertEquals(callCount, 3);
});

// ─── deleteAbsence ─────────────────────────────────────────────────────────

Deno.test("deleteAbsence: sends DELETE to correct URL with no body, returns void", async () => {
  const empId = "abs-emp-8";
  const absenceId = "del-abs-1";
  const calls = mockFetch((_url) => new Response(null, { status: 204 }));

  const result = await deleteAbsence(empId, absenceId, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/absences/${absenceId}`);
  assertEquals(calls[0].method, "DELETE");
  assertEquals(calls[0].body, null);
  assertEquals(result, undefined);
});

Deno.test("deleteAbsence: busts cache for employee", async () => {
  const empId = "abs-emp-9";
  let callCount = 0;

  mockFetch((url) => {
    callCount++;
    if (url.includes("/absences?year=")) return jsonResponse([]);
    return new Response(null, { status: 204 });
  });

  await getAbsences(empId, 2024, TEST_CREDS);
  await deleteAbsence(empId, "abs-x", TEST_CREDS);
  await getAbsences(empId, 2024, TEST_CREDS);

  assertEquals(callCount, 3);
});

// ─── createHoliday ─────────────────────────────────────────────────────────

Deno.test("createHoliday: POSTs to correct URL including holidayYearId", async () => {
  const empId = "hol-emp-1";
  const holidayYearId = "hy-2024";
  const payload = { startDate: "2024-07-01", endDate: "2024-07-14", season: "summer" as const, note: "summer holidays" };
  const created: Holiday = { id: "hol-1", startDate: "2024-07-01", endDate: "2024-07-14", days: 14, season: "summer" };

  const calls = mockFetch((_url) => jsonResponse(created));

  const result = await createHoliday(empId, holidayYearId, payload, TEST_CREDS);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `${TEST_CREDS.apiUrl}/employees/${empId}/holidayYears/${holidayYearId}/holidays`);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].body, payload);
  assertEquals(result, created);
});

Deno.test("createHoliday: busts holidayYears cache for employee", async () => {
  const empId = "hol-emp-2";
  let callCount = 0;

  mockFetch((url) => {
    callCount++;
    if (url.includes("/holidayYears") && !url.includes("/holidays")) return jsonResponse([]);
    return jsonResponse({ id: "hol-x", startDate: "2024-07-01", endDate: "2024-07-14", days: 14, season: "summer" });
  });

  await getHolidayYears(empId, TEST_CREDS);
  await createHoliday(empId, "hy-2024", { startDate: "2024-07-01", endDate: "2024-07-14", season: "summer" }, TEST_CREDS);
  await getHolidayYears(empId, TEST_CREDS);

  assertEquals(callCount, 3);
});

Deno.test("createHoliday: throws on Salaxy error", async () => {
  const empId = "hol-emp-err";
  mockFetch((_url) => jsonResponse({ error: "conflict" }, 409));

  await assertRejects(
    () => createHoliday(empId, "hy-x", { startDate: "2024-07-01", endDate: "2024-07-14", season: "summer" }, TEST_CREDS),
    Error,
    "409",
  );
});
