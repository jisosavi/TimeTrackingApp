<?php
declare(strict_types=1);

require_once __DIR__ . '/../common.php';

$admin     = requireAdmin();
$companyId = (int) $admin['company_id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload  = getJsonPayload();
$holidays = $payload['holidays'] ?? [];

if (!is_array($holidays) || count($holidays) === 0) {
    sendJson(['success' => false, 'error' => 'holidays array required'], 400);
}

$db      = getCompanyDb($companyId);
$updated = 0;

foreach ($holidays as $h) {
    $date = trim((string) ($h['date'] ?? ''));
    $name = trim((string) ($h['name'] ?? ''));
    if (!$date || !$name) continue;

    $stmt = $db->prepare(
        "UPDATE time_entries
         SET comment = CASE
           WHEN comment IS NULL OR comment = '' THEN :name
           ELSE comment || ' | ' || :name2
         END
         WHERE entry_date = :date
           AND status IN ('pending', 'approved')"
    );
    $stmt->execute([':name' => $name, ':name2' => $name, ':date' => $date]);
    $updated += $stmt->rowCount();
}

sendJson(['success' => true, 'updated' => $updated]);
