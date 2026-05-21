import { sql } from "./db.ts";

const PIN_RATE_WINDOW = 60;    // seconds per attempt window
const PIN_RATE_MAX = 3;        // failures before lockout
const PIN_RATE_COOLDOWN = 300; // 5-minute temp lock in seconds

type RLRow = {
  id: unknown;
  attempts: number;
  window_start: string | null;
  locked_until: string | null;
  locked: boolean;
  strike: number;
  last_employee_id: unknown;
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

export async function checkPinRateLimit(
  deviceId: string,
  companyId: number,
): Promise<CheckResult> {
  const now = Math.floor(Date.now() / 1000);
  const [row] = await sql`
    SELECT id, attempts, window_start, locked_until, locked, strike
    FROM pin_rate_limit
    WHERE company_id = ${companyId} AND device_id = ${deviceId}
  ` as RLRow[];

  if (!row) return { ok: true };
  if (row.locked) return { error: "locked" };

  const lockedUntil = row.locked_until !== null ? Number(row.locked_until) : null;
  if (lockedUntil !== null && lockedUntil > now) {
    return { error: "cooldown", seconds_remaining: lockedUntil - now };
  }
  // Expired temp lock — clear it
  if (lockedUntil !== null) {
    await sql`
      UPDATE pin_rate_limit
      SET locked_until = NULL, attempts = 0, window_start = NULL
      WHERE id = ${row.id}
    `;
  }
  return { ok: true };
}

export async function recordPinFailure(
  deviceId: string,
  companyId: number,
): Promise<FailResult> {
  const now = Math.floor(Date.now() / 1000);
  const [row] = await sql`
    SELECT id, attempts, window_start, strike, last_employee_id, last_employee_type
    FROM pin_rate_limit
    WHERE company_id = ${companyId} AND device_id = ${deviceId}
  ` as RLRow[];

  if (!row) {
    await sql`
      INSERT INTO pin_rate_limit (company_id, device_id, attempts, window_start, strike)
      VALUES (${companyId}, ${deviceId}, 1, ${now}, 0)
    `;
    return { attempts_remaining: PIN_RATE_MAX - 1 };
  }

  const id = row.id;
  const strike = row.strike ?? 0;
  let windowStart = row.window_start !== null ? Number(row.window_start) : null;
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
      await sql`
        UPDATE pin_rate_limit
        SET locked = TRUE, attempts = 0, window_start = NULL, locked_until = NULL
        WHERE id = ${id}
      `;
      const lastEmpId = row.last_employee_id;
      const lastEmpType = row.last_employee_type;
      if (lastEmpId && (lastEmpType === "employee" || lastEmpType === "supervisor")) {
        if (lastEmpType === "supervisor") {
          await sql`UPDATE supervisors SET pin_locked = TRUE WHERE id = ${lastEmpId} AND company_id = ${companyId}`;
        } else {
          await sql`UPDATE employees SET pin_locked = TRUE WHERE id = ${lastEmpId} AND company_id = ${companyId}`;
        }
      }
      return { error: "locked" };
    }
    // First strike — temporary 5-minute lock
    await sql`
      UPDATE pin_rate_limit
      SET locked_until = ${now + PIN_RATE_COOLDOWN}, strike = 1, attempts = 0, window_start = NULL
      WHERE id = ${id}
    `;
    return { error: "cooldown", seconds_remaining: PIN_RATE_COOLDOWN };
  }

  await sql`
    UPDATE pin_rate_limit SET attempts = ${attempts}, window_start = ${windowStart} WHERE id = ${id}
  `;
  return { attempts_remaining: PIN_RATE_MAX - attempts };
}

export async function recordPinSuccess(
  deviceId: string,
  companyId: number,
  employeeId: number,
  employeeType: string,
): Promise<void> {
  const [row] = await sql`
    SELECT id FROM pin_rate_limit WHERE company_id = ${companyId} AND device_id = ${deviceId}
  `;

  if (row) {
    await sql`
      UPDATE pin_rate_limit
      SET attempts = 0, window_start = NULL, locked_until = NULL, locked = FALSE, strike = 0,
          last_employee_id = ${employeeId}, last_employee_type = ${employeeType}
      WHERE id = ${row.id}
    `;
  } else {
    await sql`
      INSERT INTO pin_rate_limit (company_id, device_id, attempts, strike, last_employee_id, last_employee_type)
      VALUES (${companyId}, ${deviceId}, 0, 0, ${employeeId}, ${employeeType})
    `;
  }
}

export async function clearPinRateLimitForUser(
  companyId: number,
  employeeId: number,
  employeeType: string,
): Promise<void> {
  await sql`
    DELETE FROM pin_rate_limit
    WHERE company_id = ${companyId} AND last_employee_id = ${employeeId} AND last_employee_type = ${employeeType}
  `;
}
