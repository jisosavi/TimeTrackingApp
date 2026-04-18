<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../config.php';

$admin = requireAdmin();
$db    = getDb();

// GET — preview approved entries for date range
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
         ORDER BY e.name ASC, te.entry_date ASC"
    );
    $stmt->execute([':cid' => $admin['company_id'], ':df' => $dateFrom, ':dt' => $dateTo]);
    $rows = $stmt->fetchAll();

    // Group by employee
    $byEmployee = [];
    foreach ($rows as $row) {
        $eid = $row['employee_id'];
        if (!isset($byEmployee[$eid])) {
            $byEmployee[$eid] = [
                'employee_id'          => (int) $eid,
                'employee_name'        => $row['employee_name'],
                'salaxy_employment_id' => $row['salaxy_employment_id'],
                'total_hours'          => 0.0,
                'total_km'             => 0.0,
                'entries'              => [],
            ];
        }
        $byEmployee[$eid]['total_hours'] += (float) $row['hours'];
        $byEmployee[$eid]['total_km']    += (float) $row['km'];
        $byEmployee[$eid]['entries'][]    = $row;
    }

    sendJson(['success' => true, 'employees' => array_values($byEmployee)]);
}

// POST — export selected employees to Salaxy
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
         ORDER BY e.name ASC, te.entry_date ASC"
    );
    $stmt->execute([$admin['company_id'], $dateFrom, $dateTo, ...$employeeIds]);
    $rows = $stmt->fetchAll();

    if (empty($rows)) {
        sendJson(['success' => false, 'error' => 'Ei hyväksyttyjä kirjauksia valitulle ajanjaksolle'], 400);
    }

    // Build Salaxy-compatible entries array grouped by employmentId
    $byEmployment = [];
    $entryIds     = [];
    foreach ($rows as $row) {
        $empId = $row['salaxy_employment_id'] ?? SALAXY_EMPLOYMENT_ID;
        if (!isset($byEmployment[$empId])) {
            $byEmployment[$empId] = [];
        }
        // Convert date back to DD-MM-YYYY for salaxy_sync functions
        $parts   = explode('-', $row['entry_date']);
        $ddmmyyyy = count($parts) === 3 ? $parts[2] . '-' . $parts[1] . '-' . $parts[0] : $row['entry_date'];

        $byEmployment[$empId][] = [
            'date'    => $ddmmyyyy,
            'start'   => $row['start_time'],
            'end'     => $row['end_time'],
            'hours'   => (float) $row['hours'],
            'mileage' => (float) $row['km'],
            'project' => $row['project'],
            'notes'   => $row['comment'],
        ];
        $entryIds[] = (int) $row['id'];
    }

    // Call Salaxy via salaxy_sync.php logic (reuse token + request helpers)
    if (!defined('SALAXY_SYNC_AS_LIBRARY')) {
        define('SALAXY_SYNC_AS_LIBRARY', true);
    }
    require_once __DIR__ . '/../salaxy_sync.php';

    // salaxy_sync.php defines getSalaxyAccessToken, salaxyRequest etc.
    // We need a fresh payroll for this batch export
    $payrollName = 'Palkkakausi ' . $dateFrom . ' – ' . $dateTo;
    $firstEmpId  = array_key_first($byEmployment);
    $createResp  = salaxyRequest('POST', '/payroll', [
        'employmentId' => $firstEmpId,
        'status'       => 'Draft',
        'input'        => ['title' => $payrollName],
    ]);

    if (!$createResp['success'] || !isset($createResp['data']['id'])) {
        sendJson(['success' => false, 'error' => 'Palkkalistan luonti Salaxyssa epäonnistui', 'detail' => $createResp['data'] ?? null], 500);
    }

    $payrollId    = $createResp['data']['id'];
    $calculations = [];
    $totalSent    = 0;
    $errors       = [];

    foreach ($byEmployment as $employmentId => $entries) {
        $existingCalcId = $calculations[$employmentId] ?? null;
        foreach ($entries as $entry) {
            if ((float) $entry['hours'] > 0) {
                $r = addHourlyWageRow($payrollId, $entry, $existingCalcId, $employmentId);
                $funcOk    = $r['success'] ?? false;
                $saveOk    = $r['saveResponse']['success'] ?? false;
                $isNew     = $r['isNewCalculation'] ?? false;
                $addCalcOk = !$isNew || ($r['addCalcResponse']['success'] ?? false);

                if ($funcOk && $saveOk && $addCalcOk) {
                    $totalSent++;
                    $calcId = $r['finalCalculationId'] ?? $r['calculationId'] ?? null;
                    if ($calcId) $calculations[$employmentId] = $calcId;
                    $existingCalcId = $calculations[$employmentId] ?? null;
                } else {
                    $detail = [
                        'entry'            => $entry,
                        'funcOk'           => $funcOk,
                        'saveOk'           => $saveOk,
                        'addCalcOk'        => $addCalcOk,
                        'funcError'        => $r['error'] ?? null,
                        'saveHttpCode'     => $r['saveResponse']['httpCode'] ?? null,
                        'saveData'         => $r['saveResponse']['data'] ?? null,
                        'addCalcHttpCode'  => $r['addCalcResponse']['httpCode'] ?? null,
                        'addCalcData'      => $r['addCalcResponse']['data'] ?? null,
                    ];
                    error_log('export_payroll hours error: ' . json_encode($detail));
                    $errors[] = $detail;
                    // Still capture calcId so mileage row can reuse it
                    $calcId = $r['finalCalculationId'] ?? $r['calculationId'] ?? null;
                    if ($calcId) $calculations[$employmentId] = $calcId;
                    $existingCalcId = $calculations[$employmentId] ?? null;
                }
            }
            if ((float) $entry['mileage'] > 0) {
                $r = addMileageRow($payrollId, $entry, $existingCalcId, $employmentId);
                $saveOk    = $r['saveResponse']['success'] ?? false;
                $isNew     = $r['isNewCalculation'] ?? false;
                $addCalcOk = !$isNew || ($r['addCalcResponse']['success'] ?? false);
                if (($r['success'] ?? false) && $saveOk && $addCalcOk) {
                    $calcId = $r['finalCalculationId'] ?? $r['calculationId'] ?? null;
                    if ($calcId) $calculations[$employmentId] = $calcId;
                    $existingCalcId = $calculations[$employmentId] ?? null;
                } else {
                    error_log('export_payroll mileage error: ' . json_encode([
                        'entry' => $entry, 'saveOk' => $saveOk, 'addCalcOk' => $addCalcOk,
                        'saveHttpCode' => $r['saveResponse']['httpCode'] ?? null,
                        'addCalcHttpCode' => $r['addCalcResponse']['httpCode'] ?? null,
                    ]));
                }
            }
        }
    }

    // Mark entries as exported only when at least something was sent
    if ($totalSent > 0 && !empty($entryIds)) {
        $ph  = implode(',', array_fill(0, count($entryIds), '?'));
        $now = gmdate('c');
        $db->prepare("UPDATE time_entries SET exported_to_salaxy = 1, exported_at = ?, status = 'approved' WHERE id IN ($ph)")
           ->execute([$now, ...$entryIds]);
    }

    sendJson([
        'success'       => true,
        'payroll_id'    => $payrollId,
        'payroll_url'   => 'https://test.salaxy.fi/payroll/' . $payrollId,
        'total_sent'    => $totalSent,
        'errors'        => count($errors),
        'errors_detail' => $errors,
    ]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
