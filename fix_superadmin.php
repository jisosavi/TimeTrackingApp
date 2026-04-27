<?php
declare(strict_types=1);

/**
 * One-time fix: reset super_admins so Salaxy OAuth auto-link works on next login.
 * Run from Railway console: php fix_superadmin.php
 * Delete this file after use.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/bootstrap.php';

$db = getMasterDb();

$admins = $db->query('SELECT id, email, name, salaxy_account_id, active FROM super_admins')->fetchAll();

echo "Current super_admins:\n";
foreach ($admins as $a) {
    echo "  id={$a['id']} email={$a['email']} salaxy_account_id=" . ($a['salaxy_account_id'] ?? 'NULL') . " active={$a['active']}\n";
}

$active = array_filter($admins, fn($a) => $a['active']);

if (count($active) === 1 && !reset($active)['salaxy_account_id']) {
    echo "\nAlready in correct state — one active super admin with no salaxy_account_id.\n";
    echo "Just log in via Salaxy and it will auto-link.\n";
    exit(0);
}

// Keep only the first active record, clear its salaxy_account_id, deactivate rest
$keep = array_values($active)[0];

$db->prepare('UPDATE super_admins SET salaxy_account_id = NULL, active = 1, email = :email WHERE id = :id')
   ->execute([':email' => 'janne@donkeyhotel.fi', ':id' => $keep['id']]);

foreach (array_slice(array_values($active), 1) as $extra) {
    $db->prepare('UPDATE super_admins SET active = 0 WHERE id = :id')
       ->execute([':id' => $extra['id']]);
    echo "Deactivated extra super admin id={$extra['id']} ({$extra['email']})\n";
}

echo "\nFixed: super admin id={$keep['id']} reset, salaxy_account_id cleared.\n";
echo "Log in via Salaxy as janne@donkeyhotel.fi — it will auto-link on first login.\n";
