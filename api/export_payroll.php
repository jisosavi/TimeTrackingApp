<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../config.php';

$admin = requireAdmin();
$db    = getDb();

// ----------------------------------------------------------------
// Load payroll period settings for a company.
// ----------------------------------------------------------------
function getCompanyPayrollSettings(PDO $db, int $companyId): array
{
    $stmt = $db->prepare('SELECT payroll_period, payday_1, payday_2 FROM companies WHERE id = :id');
    $stmt->execute([':id' => $companyId]);
    return $stmt->fetch() ?: ['payroll_period' => 'monthly', 'payday_1' => 15, 'payday_2' => 0];
}

// ----------------------------------------------------------------
// Resolve which period a YYYY-MM-DD date belongs to, based on
// the company's payroll_period setting.
//   monthly  → one period per calendar month
//   biweekly → period 1: 1st–15th, period 2: 16th–last
// ----------------------------------------------------------------
function getPeriodForDate(string $dateYmd, array $settings): array
{
    $ts     = strtotime($dateYmd);
    $day    = (int) date('j', $ts);
    $ym     = date('Y-m', $ts);
    $year   = (int) date('Y', $ts);
    $mon    = (int) date('n', $ts);
    $last   = (int) date('t', $ts);
    $period = $settings['payroll_period'] ?? 'monthly';

    if ($period === 'biweekly') {
        if ($day <= 15) {
            $num      = 1;
            $start    = "$ym-01";
            $end      = "$ym-15";
            $pdSetting = (int) ($settings['payday_1'] ?? 15);
            $label    = sprintf('Palkkakausi %d/%02d jakso 1 (1.–15.%d.)', $year, $mon, $mon);
        } else {
            $num      = 2;
            $start    = "$ym-16";
            $end      = "$ym-$last";
            $pdSetting = (int) ($settings['payday_2'] ?? 0);
            $label    = sprintf('Palkkakausi %d/%02d jakso 2 (16.–%d.%d.)', $year, $mon, $last, $mon);
        }
    } else {
        $num      = 1;
        $start    = "$ym-01";
        $end      = "$ym-$last";
        $pdSetting = (int) ($settings['payday_1'] ?? 15);
        $label    = sprintf('Palkkakausi %d/%02d (1.–%d.%d.)', $year, $mon, $last, $mon);
    }

    $pdDay      = $pdSetting === 0 ? $last : min($pdSetting, $last);
    $paydayDate = sprintf('%s-%02d', $ym, $pdDay);

    return ['start' => $start, 'end' => $end, 'label' => $label, 'num' => $num, 'paydayDate' => $paydayDate];
}

// ----------------------------------------------------------------
// GET — preview approved entries grouped by period then employee
// ----------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo   = $_GET['date_to']   ?? '';

    if (!$dateFrom || !$dateTo) {
        sendJson(['success' => false, 'error' => 'date_from ja date_to vaaditaan'], 400);
    }

    $settings = getCompanyPayrollSettings($db, (int) $admin['company_id']);

    $stmt = $db->prepare(
        "SELECT te.*, e.name AS employee_name, e.salaxy_employment_id
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE te.company_id = :cid
           AND te.status = 'approved'
           AND te.entry_date >= :df
           AND te.entry_date <= :dt
         ORDER BY te.entry_date ASC, e.name ASC"
    );
    $stmt->execute([':cid' => $admin['company_id'], ':df' => $dateFrom, ':dt' => $dateTo]);
    $rows = $stmt->fetchAll();

    // Group by period → employee
    $byPeriod = [];
    foreach ($rows as $row) {
        $p  = getPeriodForDate($row['entry_date'], $settings);
        $pk = $p['start'];
        if (!isset($byPeriod[$pk])) {
            // Check if a payroll already exists for this period
            $existing = $db->prepare(
                'SELECT salaxy_payroll_id FROM payroll_exports
                 WHERE company_id = ? AND period_start = ? AND period_end = ?'
            );
            $existing->execute([$admin['company_id'], $p['start'], $p['end']]);
            $ex = $existing->fetch();

            $byPeriod[$pk] = [
                'period_start'       => $p['start'],
                'period_end'         => $p['end'],
                'period_label'       => $p['label'],
                'existing_payroll_id'=> $ex ? $ex['salaxy_payroll_id'] : null,
                'employees'          => [],
            ];
        }
        $eid = $row['employee_id'];
        if (!isset($byPeriod[$pk]['employees'][$eid])) {
            $byPeriod[$pk]['employees'][$eid] = [
                'employee_id'          => (int) $eid,
                'employee_name'        => $row['employee_name'],
                'salaxy_employment_id' => $row['salaxy_employment_id'],
                'total_hours'          => 0.0,
                'total_km'             => 0.0,
                'pending_hours'        => 0.0,
                'pending_km'           => 0.0,
                'entries'              => [],
            ];
        }
        $byPeriod[$pk]['employees'][$eid]['total_hours']  += (float) $row['hours'];
        $byPeriod[$pk]['employees'][$eid]['total_km']     += (float) $row['km'];
        if (!(int) $row['exported_to_salaxy']) {
            $byPeriod[$pk]['employees'][$eid]['pending_hours'] += (float) $row['hours'];
            $byPeriod[$pk]['employees'][$eid]['pending_km']    += (float) $row['km'];
        }
        $byPeriod[$pk]['employees'][$eid]['entries'][] = $row;
    }

    // Re-index employees arrays
    foreach ($byPeriod as &$pd) {
        $pd['employees'] = array_values($pd['employees']);
    }
    unset($pd);

    sendJson(['success' => true, 'periods' => array_values($byPeriod)]);
}

// ----------------------------------------------------------------
// POST — export selected employees to Salaxy, grouped by period
// ----------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload     = getJsonPayload();
    $dateFrom    = trim((string) ($payload['date_from'] ?? ''));
    $dateTo      = trim((string) ($payload['date_to']   ?? ''));
    $employeeIds = array_map('intval', (array) ($payload['employee_ids'] ?? []));
    $force       = (bool) ($payload['force'] ?? false);

    if (!$dateFrom || !$dateTo || empty($employeeIds)) {
        sendJson(['success' => false, 'error' => 'date_from, date_to ja employee_ids vaaditaan'], 400);
    }

    $settings = getCompanyPayrollSettings($db, (int) $admin['company_id']);

    $placeholders = implode(',', array_fill(0, count($employeeIds), '?'));
    $exportedFilter = $force ? '' : "AND te.exported_to_salaxy = 0";
    $stmt = $db->prepare(
        "SELECT te.*, e.name AS employee_name, e.salaxy_employment_id
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE te.company_id = ?
           AND te.status = 'approved'
           $exportedFilter
           AND te.entry_date >= ?
           AND te.entry_date <= ?
           AND te.employee_id IN ($placeholders)
         ORDER BY te.entry_date ASC, e.name ASC"
    );
    $stmt->execute([$admin['company_id'], $dateFrom, $dateTo, ...$employeeIds]);
    $rows = $stmt->fetchAll();

    if (empty($rows)) {
        sendJson(['success' => false, 'error' => 'Ei hyväksyttyjä kirjauksia valitulle ajanjaksolle'], 400);
    }

    // Group by period → salaxy_employment_id
    $byPeriod = [];
    foreach ($rows as $row) {
        $p   = getPeriodForDate($row['entry_date'], $settings);
        $pk  = $p['start'];
        $eid = $row['salaxy_employment_id'] ?: SALAXY_EMPLOYMENT_ID;

        if (!isset($byPeriod[$pk])) {
            $byPeriod[$pk] = [
                'start'      => $p['start'],
                'end'        => $p['end'],
                'label'      => $p['label'],
                'paydayDate' => $p['paydayDate'],
                'employees'  => [],
            ];
        }
        if (!isset($byPeriod[$pk]['employees'][$eid])) {
            $byPeriod[$pk]['employees'][$eid] = [];
        }

        // Convert YYYY-MM-DD → DD-MM-YYYY for salaxy_sync helpers
        $parts    = explode('-', $row['entry_date']);
        $ddmmyyyy = count($parts) === 3
            ? "{$parts[2]}-{$parts[1]}-{$parts[0]}"
            : $row['entry_date'];

        $byPeriod[$pk]['employees'][$eid][] = [
            'id'      => (int) $row['id'],
            'date'    => $ddmmyyyy,
            'start'   => $row['start_time'],
            'end'     => $row['end_time'],
            'hours'   => (float) $row['hours'],
            'mileage' => (float) $row['km'],
            'project' => $row['project'],
            'notes'   => $row['comment'],
        ];
    }

    // Load Salaxy API helpers
    if (!defined('SALAXY_SYNC_AS_LIBRARY')) {
        define('SALAXY_SYNC_AS_LIBRARY', true);
    }
    require_once __DIR__ . '/../salaxy_sync.php';

    $totalSent    = 0;
    $totalAdded   = 0;
    $totalAlready = 0;
    $errors       = [];
    $exportedIds  = [];
    $payrollLinks = []; // period_start → salaxy_payroll_id

    foreach ($byPeriod as $pk => $pd) {
        $periodStart  = $pd['start'];
        $periodEnd    = $pd['end'];
        $periodLabel  = $pd['label'];
        $paydayDate   = $pd['paydayDate'];

        // ---- Get or create the Salaxy payroll for this period ----
        $exportRow = $db->prepare(
            'SELECT id, salaxy_payroll_id FROM payroll_exports
             WHERE company_id = ? AND period_start = ? AND period_end = ?'
        );
        $exportRow->execute([$admin['company_id'], $periodStart, $periodEnd]);
        $exportRow = $exportRow->fetch();

        $needCreate = true;
        if ($exportRow) {
            // Verify the stored payroll still exists in Salaxy
            $checkResp = salaxyRequest('GET', '/payroll/' . $exportRow['salaxy_payroll_id']);
            if ($checkResp['success'] && isset($checkResp['data']['id'])) {
                $payrollId  = $exportRow['salaxy_payroll_id'];
                $exportId   = (int) $exportRow['id'];
                $needCreate = false;
            }
            // Salaxy no longer has it — fall through to create a new one
        }

        if ($needCreate) {
            $firstEmpId = array_key_first($pd['employees']);
            $createResp = salaxyRequest('POST', '/payroll', [
                'employmentId' => $firstEmpId,
                'status'       => 'Draft',
                'input'        => ['title' => $periodLabel, 'payDay' => $paydayDate],
            ]);

            if (!$createResp['success'] || !isset($createResp['data']['id'])) {
                foreach ($pd['employees'] as $entries) {
                    foreach ($entries as $e) {
                        $errors[] = ['entry' => $e, 'error' => 'Palkkalistan luonti epäonnistui', 'detail' => $createResp['data'] ?? null];
                    }
                }
                continue;
            }

            $payrollId = $createResp['data']['id'];

            if ($exportRow) {
                // Update existing DB record in place — preserves the row id
                $exportId = (int) $exportRow['id'];
                $db->prepare('UPDATE payroll_exports SET salaxy_payroll_id = ? WHERE id = ?')
                   ->execute([$payrollId, $exportId]);
                // Stale calculation IDs are invalid for the new payroll — clear them
                $db->prepare('DELETE FROM payroll_export_calculations WHERE payroll_export_id = ?')
                   ->execute([$exportId]);
            } else {
                $db->prepare(
                    'INSERT INTO payroll_exports (company_id, period_start, period_end, salaxy_payroll_id)
                     VALUES (?, ?, ?, ?)'
                )->execute([$admin['company_id'], $periodStart, $periodEnd, $payrollId]);
                $exportId = (int) $db->lastInsertId();
            }
        }

        $payrollLinks[$periodStart] = $payrollId;

        // ---- Process each employee in this period (one API call per employee) ----
        foreach ($pd['employees'] as $empSalaxyId => $entries) {

            $calcRow = $db->prepare(
                'SELECT salaxy_calculation_id FROM payroll_export_calculations
                 WHERE payroll_export_id = ? AND salaxy_employment_id = ?'
            );
            $calcRow->execute([$exportId, $empSalaxyId]);
            $existingCalcId = ($calcRow->fetch()['salaxy_calculation_id']) ?? null;

            // All entries for this employee are exported in a single calculation
            $r      = exportEmployeeEntries($payrollId, $entries, $existingCalcId, $empSalaxyId);
            $funcOk = $r['success'] ?? false;
            $saveOk = $r['saveResponse']['success'] ?? false;
            // add-calc is best-effort; info.payrollId in the save already links the calc

            if ($funcOk && $saveOk) {
                $newCalcId = $r['finalCalculationId'] ?? null;
                if ($newCalcId && $newCalcId !== $existingCalcId) {
                    $db->prepare(
                        'INSERT OR REPLACE INTO payroll_export_calculations
                         (payroll_export_id, salaxy_employment_id, salaxy_calculation_id)
                         VALUES (?, ?, ?)'
                    )->execute([$exportId, $empSalaxyId, $newCalcId]);
                }
                foreach ($entries as $entry) {
                    $exportedIds[] = (int) $entry['id'];
                }
                $totalSent    += count($entries);
                $totalAdded   += $r['newEntryCount']  ?? count($entries);
                $totalAlready += $r['skipEntryCount'] ?? 0;
            } else {
                $errors[] = [
                    'employee'       => $empSalaxyId,
                    'entryCount'     => count($entries),
                    'funcError'      => $r['error'] ?? null,
                    'createHttpCode' => $r['createHttpCode'] ?? null,
                    'createData'     => $r['createData'] ?? null,
                    'saveHttpCode'   => $r['saveResponse']['httpCode'] ?? null,
                ];
                error_log('export_payroll error: ' . json_encode(end($errors)));
            }
        }
    }

    // Mark successfully sent entries as exported
    if (!empty($exportedIds)) {
        $ph  = implode(',', array_fill(0, count($exportedIds), '?'));
        $now = gmdate('c');
        $db->prepare(
            "UPDATE time_entries SET exported_to_salaxy = 1, exported_at = ? WHERE id IN ($ph)"
        )->execute([$now, ...$exportedIds]);
    }

    sendJson([
        'success'       => true,
        'total_sent'    => $totalSent,
        'total_added'   => $totalAdded,
        'total_already' => $totalAlready,
        'errors'        => count($errors),
        'errors_detail' => $errors,
        'payrolls'      => array_map(fn($start, $id) => [
            'period_start'     => $start,
            'salaxy_payroll_id'=> $id,
            'url'              => 'https://test.salaxy.fi/payroll/' . $id,
        ], array_keys($payrollLinks), array_values($payrollLinks)),
    ]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
