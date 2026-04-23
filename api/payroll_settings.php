<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$admin = requireAdmin();
$db    = getDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        'SELECT payroll_period, payday_1, payday_2, payroll_settings_updated_at, salaxy_company_id FROM companies WHERE id = :id'
    );
    $stmt->execute([':id' => $admin['company_id']]);
    $row = $stmt->fetch() ?: ['payroll_period' => 'monthly', 'payday_1' => 15, 'payday_2' => 0, 'payroll_settings_updated_at' => null, 'salaxy_company_id' => null];
    sendJson(['success' => true, 'settings' => $row]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = getJsonPayload();
    $period  = in_array($payload['payroll_period'] ?? '', ['monthly', 'biweekly'])
        ? $payload['payroll_period']
        : 'monthly';
    $payday1 = max(0, min(31, (int) ($payload['payday_1'] ?? 15)));
    $payday2 = max(0, min(31, (int) ($payload['payday_2'] ?? 0)));
    $now     = gmdate('c');

    $db->prepare(
        'UPDATE companies SET payroll_period = :period, payday_1 = :p1, payday_2 = :p2,
         payroll_settings_updated_at = :ts WHERE id = :id'
    )->execute([':period' => $period, ':p1' => $payday1, ':p2' => $payday2, ':ts' => $now, ':id' => $admin['company_id']]);

    sendJson(['success' => true, 'updated_at' => $now]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
