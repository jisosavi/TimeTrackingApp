<?php
declare(strict_types=1);

define('PIN_RATE_WINDOW',   60);   // seconds per attempt window
define('PIN_RATE_MAX',       3);   // failures before lockout
define('PIN_RATE_COOLDOWN', 300);  // 5-minute temp lock in seconds

/**
 * Check whether a device is currently rate-limited or permanently locked.
 * Returns ['ok' => true] or ['error' => 'cooldown', 'seconds_remaining' => N]
 * or ['error' => 'locked'].
 */
function checkPinRateLimit(PDO $db, string $deviceId, int $companyId): array
{
    $now  = time();
    $stmt = $db->prepare(
        'SELECT id, attempts, window_start, locked_until, locked, strike
         FROM pin_rate_limit
         WHERE company_id = :cid AND device_id = :did'
    );
    $stmt->execute([':cid' => $companyId, ':did' => $deviceId]);
    $row = $stmt->fetch();

    if (!$row) {
        return ['ok' => true];
    }

    if ((int) $row['locked'] === 1) {
        return ['error' => 'locked'];
    }

    if ($row['locked_until'] !== null && (int) $row['locked_until'] > $now) {
        return ['error' => 'cooldown', 'seconds_remaining' => (int) $row['locked_until'] - $now];
    }

    // Expired temp lock — clear it so attempts reset
    if ($row['locked_until'] !== null) {
        $db->prepare(
            'UPDATE pin_rate_limit SET locked_until = NULL, attempts = 0, window_start = NULL WHERE id = :id'
        )->execute([':id' => $row['id']]);
    }

    return ['ok' => true];
}

/**
 * Record a failed PIN attempt for this device+company.
 * Returns ['attempts_remaining' => N] or a lockout result array.
 */
function recordPinFailure(PDO $db, string $deviceId, int $companyId): array
{
    $now  = time();
    $stmt = $db->prepare(
        'SELECT id, attempts, window_start, strike, last_employee_id, last_employee_type
         FROM pin_rate_limit
         WHERE company_id = :cid AND device_id = :did'
    );
    $stmt->execute([':cid' => $companyId, ':did' => $deviceId]);
    $row = $stmt->fetch();

    if (!$row) {
        $db->prepare(
            'INSERT INTO pin_rate_limit (company_id, device_id, attempts, window_start, strike)
             VALUES (:cid, :did, 1, :now, 0)'
        )->execute([':cid' => $companyId, ':did' => $deviceId, ':now' => $now]);
        return ['attempts_remaining' => PIN_RATE_MAX - 1];
    }

    $id          = (int) $row['id'];
    $strike      = (int) $row['strike'];
    $windowStart = $row['window_start'] !== null ? (int) $row['window_start'] : null;
    $attempts    = (int) $row['attempts'];

    // Start a new window if the previous one expired
    if ($windowStart === null || ($now - $windowStart) >= PIN_RATE_WINDOW) {
        $windowStart = $now;
        $attempts    = 1;
    } else {
        $attempts++;
    }

    if ($attempts >= PIN_RATE_MAX) {
        if ($strike >= 1) {
            // Permanent lock — also lock the last known user account
            $db->prepare(
                'UPDATE pin_rate_limit
                 SET locked = 1, attempts = 0, window_start = NULL, locked_until = NULL
                 WHERE id = :id'
            )->execute([':id' => $id]);

            $lastId   = $row['last_employee_id'] !== null ? (int) $row['last_employee_id'] : null;
            $lastType = $row['last_employee_type'] ?? null;
            if ($lastId && in_array($lastType, ['employee', 'supervisor'], true)) {
                $table = $lastType === 'supervisor' ? 'supervisors' : 'employees';
                $db->prepare("UPDATE {$table} SET pin_locked = 1 WHERE id = :id")
                   ->execute([':id' => $lastId]);
            }

            return ['error' => 'locked'];
        }

        // First strike — temporary 5-minute lock
        $db->prepare(
            'UPDATE pin_rate_limit
             SET locked_until = :until, strike = 1, attempts = 0, window_start = NULL
             WHERE id = :id'
        )->execute([':until' => $now + PIN_RATE_COOLDOWN, ':id' => $id]);

        return ['error' => 'cooldown', 'seconds_remaining' => PIN_RATE_COOLDOWN];
    }

    $db->prepare(
        'UPDATE pin_rate_limit SET attempts = :attempts, window_start = :ws WHERE id = :id'
    )->execute([':attempts' => $attempts, ':ws' => $windowStart, ':id' => $id]);

    return ['attempts_remaining' => PIN_RATE_MAX - $attempts];
}

/**
 * Record a successful login — reset the device's rate limit and store the
 * last known employee so a future permanent lock can be attributed to them.
 */
function recordPinSuccess(PDO $db, string $deviceId, int $companyId, int $employeeId, string $employeeType): void
{
    $stmt = $db->prepare(
        'SELECT id FROM pin_rate_limit WHERE company_id = :cid AND device_id = :did'
    );
    $stmt->execute([':cid' => $companyId, ':did' => $deviceId]);
    $row = $stmt->fetch();

    if ($row) {
        $db->prepare(
            'UPDATE pin_rate_limit
             SET attempts = 0, window_start = NULL, locked_until = NULL,
                 locked = 0, strike = 0,
                 last_employee_id = :eid, last_employee_type = :etype
             WHERE id = :id'
        )->execute([':eid' => $employeeId, ':etype' => $employeeType, ':id' => $row['id']]);
    } else {
        $db->prepare(
            'INSERT INTO pin_rate_limit
                 (company_id, device_id, attempts, strike, last_employee_id, last_employee_type)
             VALUES (:cid, :did, 0, 0, :eid, :etype)'
        )->execute([':cid' => $companyId, ':did' => $deviceId, ':eid' => $employeeId, ':etype' => $employeeType]);
    }
}

/**
 * Clear all rate limit records linked to a specific user — called on admin unlock.
 */
function clearPinRateLimitForUser(PDO $db, int $companyId, int $employeeId, string $employeeType): void
{
    $db->prepare(
        'DELETE FROM pin_rate_limit
         WHERE company_id = :cid AND last_employee_id = :eid AND last_employee_type = :etype'
    )->execute([':cid' => $companyId, ':eid' => $employeeId, ':etype' => $employeeType]);
}
