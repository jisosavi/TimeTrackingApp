import { sql } from "./db.ts";

export type ActorType = "employee" | "supervisor" | "admin" | "superadmin" | "system";

export type AuditEventName =
  // auth
  | "auth.pin.success" | "auth.pin.failure"
  | "auth.login.success" | "auth.login.failure"
  // time entries
  | "time_entry.created" | "time_entry.approved" | "time_entry.rejected"
  | "time_entry.deleted" | "time_entry.clarified" | "time_entry.km_clarified"
  // personnel
  | "employee.created" | "employee.updated" | "employee.pin_unlocked"
  | "supervisor.created" | "supervisor.updated" | "supervisor.deleted" | "supervisor.pin_unlocked"
  // payroll
  | "payroll.exported"
  // holiday proposals
  | "holiday_proposal.created" | "holiday_proposal.approved" | "holiday_proposal.rejected"
  | "holiday_proposal.clarified" | "holiday_proposal.withdrawn"
  // absences
  | "absence.created" | "absence.approved" | "absence.rejected" | "absence.deleted"
  // salaxy sync
  | "salaxy.holiday.synced" | "salaxy.absence.synced"
  // system
  | "system.audit_failure";

export interface AuditEvent {
  event: AuditEventName;
  actorType: ActorType;
  actorId?: number | null;
  actorIp?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  outcome?: "ok" | "error";
  meta?: Record<string, unknown> | null;
}

async function _insert(companyId: number | null, e: AuditEvent): Promise<void> {
  await sql`
    INSERT INTO audit_log (company_id, ts, event, actor_type, actor_id, actor_ip, resource, resource_id, before_json, after_json, outcome, meta_json)
    VALUES (
      ${companyId},
      ${new Date().toISOString()},
      ${e.event},
      ${e.actorType},
      ${e.actorId ?? null},
      ${e.actorIp ?? null},
      ${e.resource ?? null},
      ${e.resourceId != null ? String(e.resourceId) : null},
      ${e.before !== undefined ? JSON.stringify(e.before) : null},
      ${e.after !== undefined ? JSON.stringify(e.after) : null},
      ${e.outcome ?? "ok"},
      ${e.meta ? JSON.stringify(e.meta) : null}
    )
  `;
}

// companyId=0 → master level (stored as NULL in DB)
export function writeAudit(companyId: number, e: AuditEvent): void {
  const dbCompanyId = companyId === 0 ? null : companyId;
  _insert(dbCompanyId, e).catch(async (err) => {
    console.error("[audit] write failed", { companyId, event: e.event, err });
    await _insert(null, {
      event: "system.audit_failure",
      actorType: "system",
      outcome: "error",
      meta: { companyId, originalEvent: e.event, error: String(err) },
    }).catch(() => {});
  });
}

// Extract client IP from x-forwarded-for header (set by Railway's proxy).
export function reqIp(forwardedFor: string | undefined): string | null {
  return forwardedFor?.split(",")[0].trim() || null;
}
