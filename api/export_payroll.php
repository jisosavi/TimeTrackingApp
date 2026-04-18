<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../config.php';

$admin = requireAdmin();
$db    = getDb();

// ----------------------------------------------------------------
// Helper: resolve which bi-weekly period a YYYY-MM-DD date belongs to.
// Period 1: 1st–15th   →  start=YYYY-MM-01  end=YYYY-MM-15
// Period 2: 16th–last  →  start=YYYY-MM-16  end=YYYY-MM-{last}
// ----------------------------------------------------------------
function getBiweeklyPeriod(string $dateYmd): array
{
    $ts   = strtotime($dateYmd);
    $day  = (int) date('j', $ts);
    $ym   = date('Y-m', $ts);
    $year = (int) date('Y', $ts);
    $mon  = (int) date('n', $ts);
    $last = (int) date('t', $ts);

    if ($day <= 15) {
        $num   = 1;
        $start = "$ym-01";
        $end   = "$ym-15";
        $label = sprintf('Palkkakausi %d/%02d jakso 1 (1.–15.)', $year, $mon);
    } else {
        $num   = 2;
        $start = "$ym-16";
        $end   = "$ym-$last";
        $label = sprintf('Palkkakausi %d/%02d jakso 2 (16.–%d.)', $year, $mon, $last);
    }

    return ['start' => $start, 'end' => $end, 'label' => $label, 'num' => $num];
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

    $stmt = $db->prepare(
        "SELECT te.*, e.name AS employee_name, e.salaxy_employment_id
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE te.company_id = :cid
           AND te.status = 'approved'
           AND te.exported_to_salaxy = 0
           AND te.entry_date >= :df
           AND te.entry_date <= :dt
         ORDER BY te.entry_date ASC, e.name ASC"
    );
    $stmt->execute([':cid' => $admin['company_id'], ':df' => $dateFrom, ':dt' => $dateTo]);
    $rows = $stmt->fetchAll();

    // Group by period → employee
    $byPeriod = [];
    foreach ($rows as $row) {
        $p  = getBiweeklyPeriod($row['entry_date']);
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
                'entries'              => [],
            ];
        }
        $byPeriod[$pk]['employees'][$eid]['total_hours'] += (float) $row['hours'];
        $byPeriod[$pk]['employees'][$eid]['total_km']    += (float) $row['km'];
        $byPeriod[$pk]['employees'][$eid]['entries'][]    = $row;
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

    if (!$dateFrom || !$dateTo || empty($employeeIds)) {
        sendJson(['success' => false, 'error' => 'date_from, date_to ja employee_ids vaaditaan'], 400);
    }

    $placeholders = implode(',', array_fill(0, count($employeeIds), '?'));
    $stmt = $db->prepare(
        "SELECT te.*, e.name AS employee_name, e.salaxy_employment_id
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE te.company_id = ?
           AND te.status = 'approved'
           AND te.exported_to_salaxy = 0
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
        $p   = getBiweeklyPeriod($row['entry_date']);
        $pk  = $p['start'];
        $eid = $row['salaxy_employment_id'] ?: SALAXY_EMPLOYMENT_ID;

        if (!isset($byPeriod[$pk])) {
            $byPeriod[$pk] = [
                'start'     => $p['start'],
                'end'       => $p['end'],
                'label'     => $p['label'],
                'employees' => [],
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
    $errors       = [];
    $exportedIds  = [];
    $payrollLinks = []; // period_start → salaxy_payroll_id

    foreach ($byPeriod as $pk => $pd) {
        $periodStart = $pd['start'];
        $periodEnd   = $pd['end'];
        $periodLabel = $pd['label'];

        // ---- Get or create the Salaxy payroll for this period ----
        $exportRow = $db->prepare(
            'SELECT id, salaxy_payroll_id FROM payroll_exports
             WHERE company_id = ? AND period_start = ? AND period_end = ?'
        );
        $exportRow->execute([$admin['company_id'], $periodStart, $periodEnd]);
        $exportRow = $exportRow->fetch();

        if ($exportRow) {
            $payrollId = $exportRow['salaxy_payroll_id'];
            $exportId  = (int) $exportRow['id'];
        } else {
            $firstEmpId = array_key_first($pd['employees']);
            $createResp = salaxyRequest('POST', '/payroll', [
                'employmentId' => $firstEmpId,
                'status'       => 'Draft',
                'input'        => ['title' => $periodLabel],
            ]);

            if (!$createResp['success'] || !isset($createResp['data']['id'])) {
                // Skip entire period; mark all entries in this period as errored
                foreach ($pd['employees'] as $entries) {
                    foreach ($entries as $e) {
                        $errors[] = [
                            'entry'   => $e,
                            'error'   => 'Palkkalistan luonti epäonnistui',
                            'detail'  => $createResp['data'] ?? null,
                        ];
                    }
                }
                continue;
            }

            $payrollId = $createResp['data']['id'];
            $db->prepare(
                'INSERT INTO payroll_exports (company_id, period_start, period_end, salaxy_payroll_id)
                 VALUES (?, ?, ?, ?)'
            )->execute([$admin['company_id'], $periodStart, $periodEnd, $payrollId]);
            $exportId = (int) $db->lastInsertId();
        }

        $payrollLinks[$periodStart] = $payrollId;

        // ---- Process each employee in this period ----
        foreach ($pd['employees'] as $empSalaxyId => $entries) {

            // Look up existing calculation for this employee in this period
            $calcRow = $db->prepare(
                'SELECT salaxy_calculation_id FROM payroll_export_calculations
                 WHERE payroll_export_id = ? AND salaxy_employment_id = ?'
            );
            $calcRow->execute([$exportId, $empSalaxyId]);
            $calcRow = $calcRow->fetch();
            $existingCalcId = $calcRow['salaxy_calculation_id'] ?? null;

            foreach ($entries as $entry) {
                $entryOk = true;

                if ((float) $entry['hours'] > 0) {
                    $r       = addHourlyWageRow($payrollId, $entry, $existingCalcId, $empSalaxyId);
                    $funcOk  = $r['success'] ?? false;
                    $saveOk  = $r['saveResponse']['success'] ?? false;
                    $isNew   = $r['isNewCalculation'] ?? false;
                    $addCalcOk = !$isNew || ($r['addCalcResponse']['success'] ?? false);

                    if ($funcOk && $saveOk && $addCalcOk) {
                        $newCalcId = $r['finalCalculationId'] ?? $r['calculationId'] ?? null;
                        if ($newCalcId && $newCalcId !== $existingCalcId) {
                            $db->prepare(
                                'INSERT OR REPLACE INTO payroll_export_calculations
                                 (payroll_export_id, salaxy_employment_id, salaxy_calculation_id)
                                 VALUES (?, ?, ?)'
                            )->execute([$exportId, $empSalaxyId, $newCalcId]);
                            $existingCalcId = $newCalcId;
                        }
                        $totalSent++;
                    } else {
                        $entryOk = false;
                        $errors[] = [
                            'entry'          => $entry,
                            'funcOk'         => $funcOk,
                            'saveOk'         => $saveOk,
                            'addCalcOk'      => $addCalcOk,
                            'funcError'      => $r['error'] ?? null,
                            'createHttpCode' => $r['createHttpCode'] ?? null,
                            'createData'     => $r['createData'] ?? null,
                            'saveHttpCode'   => $r['saveResponse']['httpCode'] ?? null,
                            'addCalcHttpCode'=> $r['addCalcResponse']['httpCode'] ?? null,
                        ];
                        error_log('export_payroll error: ' . json_encode(end($errors)));
                    }
                }

                if ((float) $entry['mileage'] > 0) {
                    $r = addMileageRow($payrollId, $entry, $existingCalcId, $empSalaxyId);
                    if (($r['success'] ?? false) && ($r['saveResponse']['success'] ?? false)) {
                        $newCalcId = $r['finalCalculationId'] ?? $r['calculationId'] ?? null;
                        if ($newCalcId && $newCalcId !== $existingCalcId) {
                            $db->prepare(
                                'INSERT OR REPLACE INTO payroll_export_calculations
                                 (payroll_export_id, salaxy_employment_id, salaxy_calculation_id)
                                 VALUES (?, ?, ?)'
                            )->execute([$exportId, $empSalaxyId, $newCalcId]);
                            $existingCalcId = $newCalcId;
                        }
                    }
                }

                if ($entryOk) {
                    $exportedIds[] = (int) $entry['id'];
                }
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
        'success'      => true,
        'total_sent'   => $totalSent,
        'errors'       => count($errors),
        'errors_detail'=> $errors,
        'payrolls'     => array_map(fn($start, $id) => [
            'period_start'     => $start,
            'salaxy_payroll_id'=> $id,
            'url'              => 'https://test.salaxy.fi/payroll/' . $id,
        ], array_keys($payrollLinks), array_values($payrollLinks)),
    ]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
