import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import {
  getCompanyCreds,
  getHolidayYears,
  createHoliday,
  type HolidayYear,
} from "../lib/salaxy.ts";
import { initials, conflictWarning } from "../lib/conflicts.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

type Actor = {
  id: number;
  company_id: number;
  _type: "admin" | "supervisor";
};

async function teamEmployeeIds(actor: Actor): Promise<number[]> {
  if (actor._type === "admin") {
    const rows = await sql`SELECT id FROM employees WHERE company_id = ${actor.company_id} AND active = TRUE`;
    return rows.map((r) => Number(r.id));
  }
  const rows = await sql`SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ${actor.id}`;
  return rows.map((r) => Number(r.employee_id));
}

function determineSeason(startDate: string, year: HolidayYear): "summer" | "winter" {
  if (startDate >= year.summerSeason.start && startDate <= year.summerSeason.end) return "summer";
  return "winter";
}

app.get("/api/supervisor/holiday_proposals", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const statusFilter = c.req.query("status") ?? "pending";
  const teamIds = await teamEmployeeIds(actor);

  if (teamIds.length === 0) return c.json({ proposals: [] });

  const rows = statusFilter === "all"
    ? await sql`
        SELECT hp.*, e.name AS employee_name FROM holiday_proposals hp
        JOIN employees e ON e.id = hp.employee_id
        WHERE hp.company_id = ${actor.company_id} AND hp.employee_id IN ${sql(teamIds)}
        ORDER BY hp.created_at DESC`
    : await sql`
        SELECT hp.*, e.name AS employee_name FROM holiday_proposals hp
        JOIN employees e ON e.id = hp.employee_id
        WHERE hp.company_id = ${actor.company_id} AND hp.employee_id IN ${sql(teamIds)} AND hp.status = ${statusFilter}
        ORDER BY hp.created_at DESC`;

  const proposals = await Promise.all(
    (rows as Record<string, unknown>[]).map(async (p) => ({
      ...p,
      conflict_warning: await conflictWarning(
        actor.company_id,
        p.employee_id as number,
        p.start_date as string,
        p.end_date as string,
        teamIds,
      ),
    }))
  );

  return c.json({ proposals });
});

app.post("/api/supervisor/review_proposal", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const teamIds = await teamEmployeeIds(actor);

  let body: { proposalId?: number; decision?: string; note?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const { proposalId, decision, note = null } = body;
  if (!proposalId || !decision) return c.json({ error: "missing_fields" }, 400);
  if (!["approve", "reject", "clarify"].includes(decision)) return c.json({ error: "invalid_decision" }, 400);
  if ((decision === "reject") && !note?.trim()) return c.json({ error: "note_required" }, 400);

  const [proposal] = await sql`SELECT * FROM holiday_proposals WHERE id = ${proposalId} AND company_id = ${actor.company_id}`;
  if (!proposal) return c.json({ error: "not_found" }, 404);
  if (!teamIds.includes(Number(proposal.employee_id))) return c.json({ error: "forbidden" }, 403);
  if (proposal.status !== "pending") return c.json({ error: "not_pending" }, 409);

  const now = new Date().toISOString();
  const decidedBy = actor._type === "supervisor" ? actor.id : null;

  let newStatus: string;
  if (decision === "approve") newStatus = "approved";
  else if (decision === "reject") newStatus = "rejected";
  else newStatus = "clarifying";

  await sql`
    UPDATE holiday_proposals
    SET status = ${newStatus}, decided_by = ${decidedBy}, decided_at = ${now}, decision_note = ${note ?? null}, updated_at = ${now}
    WHERE id = ${proposalId}
  `;

  const auditEvent = decision === "approve"
    ? "holiday_proposal.approved"
    : decision === "reject"
    ? "holiday_proposal.rejected"
    : "holiday_proposal.clarified";

  writeAudit(actor.company_id, {
    event: auditEvent,
    actorType: actor._type,
    actorId: actor.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "holiday_proposal",
    resourceId: String(proposalId),
    after: { status: newStatus, note },
  });

  if (decision === "approve") {
    const [emp] = await sql`SELECT * FROM employees WHERE id = ${proposal.employee_id} AND company_id = ${actor.company_id}`;
    const salaxyId = emp?.salaxy_employment_id as string | null;
    if (salaxyId) {
      try {
        const creds = await getCompanyCreds(actor.company_id);
        const years = await getHolidayYears(salaxyId, creds);
        const startDate = proposal.start_date as string;
        const endDate = proposal.end_date as string;
        const matchedYear = years.find(
          (y) => startDate >= y.startDate && startDate <= y.endDate,
        );
        if (matchedYear) {
          const season = determineSeason(startDate, matchedYear);
          const holiday = await createHoliday(salaxyId, matchedYear.id, {
            startDate,
            endDate,
            season,
            note: (proposal.note as string | null) ?? null,
          }, creds);
          await sql`UPDATE holiday_proposals SET salaxy_holiday_id = ${holiday.id}, updated_at = ${new Date().toISOString()} WHERE id = ${proposalId}`;
          writeAudit(actor.company_id, {
            event: "salaxy.holiday.synced",
            actorType: actor._type,
            actorId: actor.id,
            resource: "holiday_proposal",
            resourceId: String(proposalId),
            meta: { salaxy_holiday_id: holiday.id },
          });
        }
      } catch (err) {
        console.error("[supervisor_time_off] Salaxy sync failed", err);
      }
    }
  }

  const [updated] = await sql`SELECT * FROM holiday_proposals WHERE id = ${proposalId}`;
  return c.json({ proposal: updated });
});

app.get("/api/supervisor/pending_absences", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const teamIds = await teamEmployeeIds(actor);
  if (teamIds.length === 0) return c.json({ absences: [] });
  const absences = await sql`
    SELECT ar.*, e.name AS employee_name
    FROM absence_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.company_id = ${actor.company_id}
      AND ar.employee_id IN ${sql(teamIds)}
      AND ar.status = 'pending'
    ORDER BY ar.created_at DESC
  `;
  return c.json({ absences });
});

app.post("/api/supervisor/review_absence", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  let body: { absenceId?: number; decision?: string; note?: string | null };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid_json" }, 400); }
  const { absenceId, decision, note = null } = body;
  if (!absenceId || !["approve", "reject"].includes(decision ?? "")) {
    return c.json({ error: "missing_fields" }, 400);
  }
  const teamIds = await teamEmployeeIds(actor);
  const [absence] = await sql`SELECT * FROM absence_records WHERE id = ${absenceId} AND company_id = ${actor.company_id}`;
  if (!absence) return c.json({ error: "not_found" }, 404);
  if (!teamIds.includes(Number(absence.employee_id))) return c.json({ error: "forbidden" }, 403);
  if (absence.status !== "pending") return c.json({ error: "not_pending" }, 409);
  const newStatus = decision === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();
  await sql`
    UPDATE absence_records
    SET status = ${newStatus}, decided_by = ${actor.id}, decided_at = ${now},
        decision_note = ${note ?? null}, updated_at = ${now}
    WHERE id = ${absenceId}
  `;
  writeAudit(actor.company_id, {
    event: decision === "approve" ? "absence.approved" : "absence.rejected",
    actorType: actor._type,
    actorId: actor.id,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "absence",
    resourceId: String(absenceId),
    after: { status: newStatus, note },
  });
  const [updated] = await sql`SELECT * FROM absence_records WHERE id = ${absenceId}`;
  return c.json({ absence: updated });
});

app.get("/api/supervisor/day_view", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const dateParam = c.req.query("date");
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return c.json({ error: "invalid_date" }, 400);
  }

  const teamIds = await teamEmployeeIds(actor);
  if (teamIds.length === 0) return c.json({ offToday: [], inToday: [], weekStrip: [] });

  const propRows = await sql`
    SELECT hp.id as source_id, hp.start_date, hp.end_date, hp.work_days as total_days, hp.label, hp.status,
           e.id as employee_id, e.name as employee_name
    FROM holiday_proposals hp
    JOIN employees e ON e.id = hp.employee_id
    WHERE hp.company_id = ${actor.company_id} AND hp.employee_id IN ${sql(teamIds)}
      AND hp.status IN ('pending','approved')
      AND hp.start_date <= ${dateParam} AND hp.end_date >= ${dateParam}
  `;

  const absRows = await sql`
    SELECT ar.id as source_id, ar.start_date, ar.end_date, ar.days as total_days, ar.reason as label, ar.status,
           e.id as employee_id, e.name as employee_name
    FROM absence_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.company_id = ${actor.company_id} AND ar.employee_id IN ${sql(teamIds)}
      AND ar.status IN ('pending','approved')
      AND ar.start_date <= ${dateParam} AND ar.end_date >= ${dateParam}
  `;

  const dateMs = new Date(dateParam + "T12:00:00").getTime();

  function dayIndex(startDate: string): number {
    const startMs = new Date(startDate + "T12:00:00").getTime();
    return Math.round((dateMs - startMs) / 86400000) + 1;
  }

  const offIds = new Set<number>();
  const offToday = [
    ...(propRows as Record<string, unknown>[]).map((r) => {
      offIds.add(Number(r.employee_id));
      return {
        employee_id: Number(r.employee_id),
        employee_name: r.employee_name as string,
        initials: initials(r.employee_name as string),
        type: "holiday" as const,
        label: r.label as string | null,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        total_days: Number(r.total_days),
        day_index: dayIndex(r.start_date as string),
        status: r.status as string,
        source_id: Number(r.source_id),
      };
    }),
    ...(absRows as Record<string, unknown>[]).map((r) => {
      offIds.add(Number(r.employee_id));
      return {
        employee_id: Number(r.employee_id),
        employee_name: r.employee_name as string,
        initials: initials(r.employee_name as string),
        type: "absence" as const,
        label: r.label as string | null,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        total_days: Number(r.total_days),
        day_index: dayIndex(r.start_date as string),
        status: r.status as string,
        source_id: Number(r.source_id),
      };
    }),
  ];

  const allTeamRows = await sql`
    SELECT id as employee_id, name as employee_name FROM employees
    WHERE id IN ${sql(teamIds)} AND active = TRUE
  `;

  const inToday = (allTeamRows as { employee_id: unknown; employee_name: unknown }[])
    .filter((r) => !offIds.has(Number(r.employee_id)))
    .map((r) => ({ employee_id: Number(r.employee_id), employee_name: r.employee_name as string, initials: initials(r.employee_name as string) }));

  const d = new Date(dateParam + "T12:00:00");
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);

  const weekStrip = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const iso = day.toISOString().slice(0, 10);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    let offCount = 0;
    if (!isWeekend) {
      const pEmpRows = await sql`
        SELECT DISTINCT employee_id FROM holiday_proposals
        WHERE company_id = ${actor.company_id} AND employee_id IN ${sql(teamIds)}
          AND status IN ('pending','approved') AND start_date <= ${iso} AND end_date >= ${iso}
      `;
      const aEmpRows = await sql`
        SELECT DISTINCT employee_id FROM absence_records
        WHERE company_id = ${actor.company_id} AND employee_id IN ${sql(teamIds)}
          AND status IN ('pending','approved') AND start_date <= ${iso} AND end_date >= ${iso}
      `;
      const offSet = new Set<number>();
      for (const r of pEmpRows) offSet.add(Number(r.employee_id));
      for (const r of aEmpRows) offSet.add(Number(r.employee_id));
      offCount = offSet.size;
    }

    weekStrip.push({ date: iso, off_count: offCount, is_weekend: isWeekend });
  }

  return c.json({ offToday, inToday, weekStrip, team_total: teamIds.length });
});

export default app;
