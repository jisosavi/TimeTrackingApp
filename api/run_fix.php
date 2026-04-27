<?php
declare(strict_types=1);

// One-time fix endpoint — protected by secret token
// Call: POST /api/run_fix.php  with header  X-Fix-Token: <RUN_FIX_SECRET>
// Delete this file after use.

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/../bootstrap.php';

$secret = getenv('RUN_FIX_SECRET') ?: '';
if (!$secret || ($_SERVER['HTTP_X_FIX_TOKEN'] ?? '') !== $secret) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

require_once __DIR__ . '/../config.php';

$db = getMasterDb();

$admins = $db->query('SELECT id, email, name, salaxy_account_id, active FROM super_admins')->fetchAll();

$active = array_values(array_filter($admins, fn($a) => $a['active']));

$log = [];
foreach ($admins as $a) {
    $log[] = "id={$a['id']} email={$a['email']} salaxy_account_id=" . ($a['salaxy_account_id'] ?? 'NULL') . " active={$a['active']}";
}

if (count($active) === 1 && !$active[0]['salaxy_account_id']) {
    echo json_encode(['success' => true, 'message' => 'Already correct state — log in via Salaxy to auto-link.', 'admins' => $log]);
    exit;
}

$keep = $active[0];

$db->prepare('UPDATE super_admins SET salaxy_account_id = NULL, active = 1, email = :email WHERE id = :id')
   ->execute([':email' => 'janne@donkeyhotel.fi', ':id' => $keep['id']]);

foreach (array_slice($active, 1) as $extra) {
    $db->prepare('UPDATE super_admins SET active = 0 WHERE id = :id')->execute([':id' => $extra['id']]);
    $log[] = "Deactivated id={$extra['id']} ({$extra['email']})";
}

$log[] = "Fixed: id={$keep['id']} reset, salaxy_account_id cleared, email set to janne@donkeyhotel.fi";

echo json_encode(['success' => true, 'message' => 'Fixed. Log in via Salaxy as janne@donkeyhotel.fi.', 'log' => $log]);
