import { Database } from "@db/sqlite";

const PIN_RATE_WINDOW = 60;    // seconds per attempt window
const PIN_RATE_MAX = 3;        // failures before lockout
const PIN_RATE_COOLDOWN = 300; // 5-minute temp lock in seconds

type RLRow = {
  id: number;
  attempts: number;
  window_start: number | null;
  locked_until: number | null;
  locked: number;
  strike: number;
  last_employee_id: number | null;
  last_employee_type: string | null;
};

export type CheckResult =
  | { ok: true }
  | { error: "locked" }
  | { error: "cooldown"; seconds_remaining: number };

export type FailResult =
  | { attempts_remaining: number }
  | { error: "locked" }
  | { error: "cooldown"; seconds_remaining: number };

export function checkPinRateLimit(
  db: Database,
  deviceId: string,
  companyId: number,
): CheckResult {
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      "SELECT id, attempts, window_start, locked_until, locked, strike FROM pin_rate_limit WHERE company_id = ? AND device_id = ?",
    )
    .get(companyId, deviceId) as RLRow | undefined;

  if (!row) return { ok: true };
  if (row.locked === 1) return { error: "locked" };
  if (row.locked_until !== null && row.locked_until > now) {
    return { error: "cooldown", seconds_remaining: row.locked_until - now };
  }
  // Expired temp lock — clear it
  if (row.locked_until !== null) {
    db.prepare(
      "UPDATE pin_rate_limit SET locked_until = NULL, attempts = 0, window_start = NULL WHERE id = ?",
    ).run(row.id);
  }
  return { ok: true };
}

export function recordPinFailure(
  db: Database,
  deviceId: string,
  companyId: number,
): FailResult {
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      "SELECT id, attempts, window_start, strike, last_employee_id, last_employee_type FROM pin_rate_limit WHERE company_id = ? AND device_id = ?",
    )
    .get(companyId, deviceId) as RLRow | undefined;

  if (!row) {
    db.prepare(
      "INSERT INTO pin_rate_limit (company_id, device_id, attempts, window_start, strike) VALUES (?, ?, 1, ?, 0)",
    ).run(companyId, deviceId, now);
    return { attempts_remaining: PIN_RATE_MAX - 1 };
  }

  const id = row.id;
  const strike = row.strike ?? 0;
  let windowStart = row.window_start;
  let attempts = row.attempts;

  if (windowStart === null || now - windowStart >= PIN_RATE_WINDOW) {
    windowStart = now;
    attempts = 1;
  } else {
    attempts++;
  }

  if (attempts >= PIN_RATE_MAX) {
    if (strike >= 1) {
      // Permanent lock — also lock the last known user account
      db.prepare(
        "UPDATE pin_rate_limit SET locked = 1, attempts = 0, window_start = NULL, locked_until = NULL WHERE id = ?",
      ).run(id);
      if (
        row.last_employee_id &&
        (row.last_employee_type === "employee" || row.last_employee_type === "supervisor")
      ) {
        const table = row.last_employee_type === "supervisor" ? "supervisors" : "employees";
        db.prepare(`UPDATE ${table} SET pin_locked = 1 WHERE id = ?`).run(row.last_employee_id);
      }
      return { error: "locked" };
    }
    // First strike — temporary 5-minute lock
    db.prepare(
      "UPDATE pin_rate_limit SET locked_until = ?, strike = 1, attempts = 0, window_start = NULL WHERE id = ?",
    ).run(now + PIN_RATE_COOLDOWN, id);
    return { error: "cooldown", seconds_remaining: PIN_RATE_COOLDOWN };
  }

  db.prepare(
    "UPDATE pin_rate_limit SET attempts = ?, window_start = ? WHERE id = ?",
  ).run(attempts, windowStart, id);
  return { attempts_remaining: PIN_RATE_MAX - attempts };
}

export function recordPinSuccess(
  db: Database,
  deviceId: string,
  companyId: number,
  employeeId: number,
  employeeType: string,
): void {
  const row = db
    .prepare("SELECT id FROM pin_rate_limit WHERE company_id = ? AND device_id = ?")
    .get(companyId, deviceId) as { id: number } | undefined;

  if (row) {
    db.prepare(
      "UPDATE pin_rate_limit SET attempts = 0, window_start = NULL, locked_until = NULL, locked = 0, strike = 0, last_employee_id = ?, last_employee_type = ? WHERE id = ?",
    ).run(employeeId, employeeType, row.id);
  } else {
    db.prepare(
      "INSERT INTO pin_rate_limit (company_id, device_id, attempts, strike, last_employee_id, last_employee_type) VALUES (?, ?, 0, 0, ?, ?)",
    ).run(companyId, deviceId, employeeId, employeeType);
  }
}

export function clearPinRateLimitForUser(
  db: Database,
  companyId: number,
  employeeId: number,
  employeeType: string,
): void {
  db.prepare(
    "DELETE FROM pin_rate_limit WHERE company_id = ? AND last_employee_id = ? AND last_employee_type = ?",
  ).run(companyId, employeeId, employeeType);
}
