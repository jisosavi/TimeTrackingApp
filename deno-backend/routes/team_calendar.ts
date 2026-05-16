import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
import { initials } from "../lib/conflicts.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

type Actor = {
  id: number;
  company_id: number;
  _type: "admin" | "supervisor";
};

export interface CalendarSpan {
  type: "holiday" | "absence";
  status: string;
  start_date: string;
  end_date: string;
  label: string | null;
}

export interface CalendarPerson {
  id: number;
  name: string;
  initials: string;
  spans: CalendarSpan[];
}

function teamEmployeeIds(actor: Actor): number[] {
  const db = getCompanyDb(actor.company_id);
  if (actor._type === "admin") {
    return (
      db
        .prepare("SELECT id FROM employees WHERE company_id = ? AND active = 1")
        .all(actor.company_id) as { id: number }[]
    ).map((r) => r.id);
  }
  return (
    db
      .prepare("SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?")
      .all(actor.id) as { employee_id: number }[]
  ).map((r) => r.employee_id);
}

// Returns spans for a set of employees within [rangeStart, rangeEnd]
function fetchSpans(
  db: ReturnType<typeof getCompanyDb>,
  empIds: number[],
  rangeStart: string,
  rangeEnd: string,
): Map<number, CalendarSpan[]> {
  const result = new Map<number, CalendarSpan[]>();
  for (const id of empIds) result.set(id, []);

  if (empIds.length === 0) return result;
  const ph = empIds.map(() => "?").join(",");

  const propRows = db.prepare(
    `SELECT hp.employee_id, hp.start_date, hp.end_date, hp.label, hp.status
     FROM holiday_proposals hp
     WHERE hp.employee_id IN (${ph})
       AND hp.status NOT IN ('withdrawn')
       AND hp.start_date <= ? AND hp.end_date >= ?`,
  ).all(...empIds, rangeEnd, rangeStart) as {
    employee_id: number;
    start_date: string;
    end_date: string;
    label: string | null;
    status: string;
  }[];

  for (const r of propRows) {
    result.get(r.employee_id)!.push({
      type: "holiday",
      status: r.status,
      start_date: r.start_date,
      end_date: r.end_date,
      label: r.label,
    });
  }

  const absRows = db.prepare(
    `SELECT ar.employee_id, ar.start_date, ar.end_date, ar.reason AS label, ar.status
     FROM absence_records ar
     WHERE ar.employee_id IN (${ph})
       AND ar.status NOT IN ('rejected','withdrawn')
       AND ar.start_date <= ? AND ar.end_date >= ?`,
  ).all(...empIds, rangeEnd, rangeStart) as {
    employee_id: number;
    start_date: string;
    end_date: string;
    label: string | null;
    status: string;
  }[];

  for (const r of absRows) {
    result.get(r.employee_id)!.push({
      type: "absence",
      status: r.status,
      start_date: r.start_date,
      end_date: r.end_date,
      label: r.label,
    });
  }

  return result;
}

// ── GET /api/team_calendar?month=YYYY-MM  (or ?year=YYYY) ────────────────

app.get("/api/team_calendar", requireAdminOrSupervisor, (c) => {
  const actor = c.get("user") as Actor;
  const db = getCompanyDb(actor.company_id);
  const empIds = teamEmployeeIds(actor);

  const monthParam = c.req.query("month"); // YYYY-MM
  const yearParam = c.req.query("year");   // YYYY

  let rangeStart: string;
  let rangeEnd: string;
  let mode: "month" | "year";

  if (yearParam && /^\d{4}$/.test(yearParam)) {
    rangeStart = `${yearParam}-01-01`;
    rangeEnd = `${yearParam}-12-31`;
    mode = "year";
  } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-");
    const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
    rangeStart = `${monthParam}-01`;
    rangeEnd = `${monthParam}-${String(daysInMonth).padStart(2, "0")}`;
    mode = "month";
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const days = new Date(y, now.getMonth() + 1, 0).getDate();
    rangeStart = `${y}-${m}-01`;
    rangeEnd = `${y}-${m}-${String(days).padStart(2, "0")}`;
    mode = "month";
  }

  if (empIds.length === 0) {
    return c.json({ people: [], stats: { total: 0, off_any_day: 0, range_start: rangeStart, range_end: rangeEnd, mode } });
  }

  // Fetch employee names
  const ph = empIds.map(() => "?").join(",");
  const empRows = db.prepare(
    `SELECT id, name FROM employees WHERE id IN (${ph}) AND active = 1`,
  ).all(...empIds) as { id: number; name: string }[];

  const spansByEmp = fetchSpans(db, empIds, rangeStart, rangeEnd);

  const people: CalendarPerson[] = empRows.map((e) => ({
    id: e.id,
    name: e.name,
    initials: initials(e.name),
    spans: spansByEmp.get(e.id) ?? [],
  }));

  // Stats: how many employees have at least one approved/pending span in range
  const offAnyDay = people.filter((p) => p.spans.length > 0).length;

  return c.json({
    people,
    stats: {
      total: empRows.length,
      off_any_day: offAnyDay,
      range_start: rangeStart,
      range_end: rangeEnd,
      mode,
    },
  });
});

export default app;
