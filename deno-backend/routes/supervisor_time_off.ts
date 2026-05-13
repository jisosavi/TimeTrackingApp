import { Hono } from "@hono/hono";
import { requireAdminOrSupervisor } from "../lib/auth.ts";
import { getCompanyDb } from "../lib/db.ts";
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

// ── helpers ───────────────────────────────────────────────────────────────────

function teamEmployeeIds(actor: Actor): number[] {
  const db = getCompanyDb(actor.company_id);
  if (actor._type === "admin") {
    return (db.prepare("SELECT id FROM employees WHERE company_id = ? AND active = 1").all(actor.company_id) as { id: number }[]).map((r) => r.id);
  }
  return (db.prepare("SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?").all(actor.id) as { employee_id: number }[]).map((r) => r.employee_id);
}

function computeWorkDays(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T12:00:00");
  const end = new Date(endIso + "T12:00:00");
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function determineSeason(startDate: string, year: HolidayYear): "summer" | "winter" {
  if (startDate >= year.summerSeason.start && startDate <= year.summerSeason.end) return "summer";
  return "winter";
}

// ── GET /api/supervisor/holiday_proposals.php ─────────────────────────────────

app.get("/api/supervisor/holiday_proposals.php", requireAdminOrSupervisor, (c) => {
  const actor = c.get("user") as Actor;
  const statusFilter = c.req.query("status") ?? "pending";
  const db = getCompanyDb(actor.company_id);
  const teamIds = teamEmployeeIds(actor);

  if (teamIds.length === 0) return c.json({ proposals: [] });

  const placeholders = teamIds.map(() => "?").join(",");
  const rows = statusFilter === "all"
    ? db.prepare(
        `SELECT hp.*, e.name AS employee_name FROM holiday_proposals hp
         JOIN employees e ON e.id = hp.employee_id
         WHERE hp.employee_id IN (${placeholders})
         ORDER BY hp.created_at DESC`,
      ).all(...teamIds)
    : db.prepare(
        `SELECT hp.*, e.name AS employee_name FROM holiday_proposals hp
         JOIN employees e ON e.id = hp.employee_id
         WHERE hp.employee_id IN (${placeholders}) AND hp.status = ?
         ORDER BY hp.created_at DESC`,
      ).all(...teamIds, statusFilter);

  const proposals = (rows as Record<string, unknown>[]).map((p) => ({
    ...p,
    conflict_warning: conflictWarning(
      db,
      p.employee_id as number,
      p.start_date as string,
      p.end_date as string,
      teamIds,
    ),
  }));

  return c.json({ proposals });
});

// ── POST /api/supervisor/review_proposal.php ──────────────────────────────────

app.post("/api/supervisor/review_proposal.php", requireAdminOrSupervisor, async (c) => {
  const actor = c.get("user") as Actor;
  const db = getCompanyDb(actor.company_id);
  const teamIds = teamEmployeeIds(actor);

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

  const proposal = db.prepare("SELECT * FROM holiday_proposals WHERE id = ?").get(proposalId) as Record<string, unknown> | undefined;
  if (!proposal) return c.json({ error: "not_found" }, 404);
  if (!teamIds.includes(proposal.employee_id as number)) return c.json({ error: "forbidden" }, 403);
  if (proposal.status !== "pending") return c.json({ error: "not_pending" }, 409);

  const now = new Date().toISOString();
  const decidedBy = actor._type === "supervisor" ? actor.id : null;

  let newStatus: string;
  if (decision === "approve") newStatus = "approved";
  else if (decision === "reject") newStatus = "rejected";
  else newStatus = "clarifying";

  db.prepare(
    `UPDATE holiday_proposals SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?`,
  ).run(newStatus, decidedBy, now, note ?? null, now, proposalId);

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

  // Salaxy sync on approve
  if (decision === "approve") {
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(proposal.employee_id as number) as Record<string, unknown> | undefined;
    const salaxyId = emp?.salaxy_employment_id as string | null;
    if (salaxyId) {
      try {
        const creds = getCompanyCreds(actor.company_id);
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
          db.prepare("UPDATE holiday_proposals SET salaxy_holiday_id = ?, updated_at = ? WHERE id = ?").run(
            holiday.id,
            new Date().toISOString(),
            proposalId,
          );
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

  const updated = db.prepare("SELECT * FROM holiday_proposals WHERE id = ?").get(proposalId);
  return c.json({ proposal: updated });
});

// ── GET /api/supervisor/day_view.php ─────────────────────────────────────────

app.get("/api/supervisor/day_view.php", requireAdminOrSupervisor, (c) => {
  const actor = c.get("user") as Actor;
  const dateParam = c.req.query("date");
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return c.json({ error: "invalid_date" }, 400);
  }

  const db = getCompanyDb(actor.company_id);
  const teamIds = teamEmployeeIds(actor);
  if (teamIds.length === 0) return c.json({ offToday: [], inToday: [], weekStrip: [] });

  const placeholders = teamIds.map(() => "?").join(",");

  // Off today: holiday proposals
  const propRows = db.prepare(
    `SELECT hp.id as source_id, hp.start_date, hp.end_date, hp.work_days as total_days, hp.label, hp.status,
            e.id as employee_id, e.name as employee_name
     FROM holiday_proposals hp
     JOIN employees e ON e.id = hp.employee_id
     WHERE hp.employee_id IN (${placeholders})
       AND hp.status IN ('pending','approved')
       AND hp.start_date <= ? AND hp.end_date >= ?`,
  ).all(...teamIds, dateParam, dateParam) as Record<string, unknown>[];

  // Off today: absences
  const absRows = db.prepare(
    `SELECT ar.id as source_id, ar.start_date, ar.end_date, ar.days as total_days, ar.reason as label, ar.status,
            e.id as employee_id, e.name as employee_name
     FROM absence_records ar
     JOIN employees e ON e.id = ar.employee_id
     WHERE ar.employee_id IN (${placeholders})
       AND ar.status IN ('pending','approved')
       AND ar.start_date <= ? AND ar.end_date >= ?`,
  ).all(...teamIds, dateParam, dateParam) as Record<string, unknown>[];

  const dateMs = new Date(dateParam + "T12:00:00").getTime();

  function dayIndex(startDate: string): number {
    const startMs = new Date(startDate + "T12:00:00").getTime();
    return Math.round((dateMs - startMs) / 86400000) + 1;
  }

  const offIds = new Set<number>();
  const offToday = [
    ...propRows.map((r) => {
      offIds.add(r.employee_id as number);
      return {
        employee_id: r.employee_id as number,
        employee_name: r.employee_name as string,
        initials: initials(r.employee_name as string),
        type: "holiday" as const,
        label: r.label as string | null,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        total_days: r.total_days as number,
        day_index: dayIndex(r.start_date as string),
        status: r.status as string,
        source_id: r.source_id as number,
      };
    }),
    ...absRows.map((r) => {
      offIds.add(r.employee_id as number);
      return {
        employee_id: r.employee_id as number,
        employee_name: r.employee_name as string,
        initials: initials(r.employee_name as string),
        type: "absence" as const,
        label: r.label as string | null,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        total_days: r.total_days as number,
        day_index: dayIndex(r.start_date as string),
        status: r.status as string,
        source_id: r.source_id as number,
      };
    }),
  ];

  // In today: team members NOT off
  const allTeamRows = db.prepare(
    `SELECT id as employee_id, name as employee_name FROM employees WHERE id IN (${placeholders}) AND active = 1`,
  ).all(...teamIds) as { employee_id: number; employee_name: string }[];

  const inToday = allTeamRows
    .filter((r) => !offIds.has(r.employee_id))
    .map((r) => ({ employee_id: r.employee_id, employee_name: r.employee_name, initials: initials(r.employee_name) }));

  // Week strip: Mon-Sun week containing dateParam
  const d = new Date(dateParam + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
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
    if (!isWeekend && teamIds.length > 0) {
      const pc = db.prepare(
        `SELECT COUNT(DISTINCT employee_id) as cnt FROM holiday_proposals
         WHERE employee_id IN (${placeholders}) AND status IN ('pending','approved')
           AND start_date <= ? AND end_date >= ?`,
      ).get(...teamIds, iso, iso) as { cnt: number };
      const ac = db.prepare(
        `SELECT COUNT(DISTINCT employee_id) as cnt FROM absence_records
         WHERE employee_id IN (${placeholders}) AND status IN ('pending','approved')
           AND start_date <= ? AND end_date >= ?`,
      ).get(...teamIds, iso, iso) as { cnt: number };
      // Count unique employees (may overlap between tables but DISTINCT handles it per table)
      const offSet = new Set<number>();
      const pEmpRows = db.prepare(
        `SELECT DISTINCT employee_id FROM holiday_proposals
         WHERE employee_id IN (${placeholders}) AND status IN ('pending','approved')
           AND start_date <= ? AND end_date >= ?`,
      ).all(...teamIds, iso, iso) as { employee_id: number }[];
      const aEmpRows = db.prepare(
        `SELECT DISTINCT employee_id FROM absence_records
         WHERE employee_id IN (${placeholders}) AND status IN ('pending','approved')
           AND start_date <= ? AND end_date >= ?`,
      ).all(...teamIds, iso, iso) as { employee_id: number }[];
      for (const r of pEmpRows) offSet.add(r.employee_id);
      for (const r of aEmpRows) offSet.add(r.employee_id);
      offCount = offSet.size;
      void pc; void ac; // suppress unused warning
    }

    weekStrip.push({ date: iso, off_count: offCount, is_weekend: isWeekend });
  }

  return c.json({ offToday, inToday, weekStrip, team_total: teamIds.length });
});

export default app;
