import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
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

async function teamEmployeeIds(actor: Actor): Promise<number[]> {
  if (actor._type === "admin") {
    const rows = await sql`SELECT id FROM employees WHERE company_id = ${actor.company_id} AND active = TRUE`;
    return rows.map((r) => Number(r.id));
  }
  const rows = await sql`SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ${actor.id}`;
  return rows.map((r) => Number(r.employee_id));
}

async function fetchSpans(
  companyId: number,
  empIds: number[],
  rangeStart: string,
  rangeEnd: string,
): Promise<Map<number, CalendarSpan[]>> {
  const result = new Map<number, CalendarSpan[]>();
  for (const id of empIds) result.set(id, []);

  if (empIds.length === 0) return result;

  const propRows = await sql`
    SELECT hp.employee_id, hp.start_date, hp.end_date, hp.label, hp.status
    FROM holiday_proposals hp
    WHERE hp.company_id = ${companyId} AND hp.employee_id IN ${sql(empIds)}
      AND hp.status NOT IN ('withdrawn')
      AND hp.start_date <= ${rangeEnd} AND hp.end_date >= ${rangeStart}
  `;

  for (const r of propRows) {
    result.get(Number(r.employee_id))?.push({
      type: "holiday",
      status: r.status as string,
      start_date: r.start_date as string,
      end_date: r.end_date as string,
      label: r.label as string | null,
    });
  }

  const absRows = await sql`
    SELECT ar.employee_id, ar.start_date, ar.end_date, ar.reason AS label, ar.status
    FROM absence_records ar
    WHERE ar.company_id = ${companyId} AND ar.employee_id IN ${sql(empIds)}
      AND ar.status NOT IN ('rejected','withdrawn')
      AND ar.start_date <= ${rangeEnd} AND ar.end_date >= ${rangeStart}
  `;

  for (const r of absRows) {
    result.get(Number(r.employee_id))?.push({
      type: "absence",
      status: r.status as string,
      start_date: r.start_date as string,
      end_date: r.end_date as string,
      label: r.label as string | null,
    });
  }

  return result;
}

app.get("/api/team_calendar", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const empIds = await teamEmployeeIds(actor);

  const monthParam = c.req.query("month");
  const yearParam = c.req.query("year");

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

  const empRows = await sql`SELECT id, name FROM employees WHERE id IN ${sql(empIds)} AND active = TRUE`;

  const spansByEmp = await fetchSpans(actor.company_id, empIds, rangeStart, rangeEnd);

  const people: CalendarPerson[] = (empRows as { id: unknown; name: unknown }[]).map((e) => ({
    id: Number(e.id),
    name: e.name as string,
    initials: initials(e.name as string),
    spans: spansByEmp.get(Number(e.id)) ?? [],
  }));

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
