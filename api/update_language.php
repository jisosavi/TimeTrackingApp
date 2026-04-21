<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload    = getJsonPayload();
$lang       = trim((string) ($payload['lang'] ?? ''));
$targetType = trim((string) ($payload['target_type'] ?? ''));
$targetId   = isset($payload['target_id']) ? (int) $payload['target_id'] : null;

$allowed = ['en', 'fi', 'sv', 'et', 'uk', 'xh'];
$isClear = ($lang === '');
if (!$isClear && !in_array($lang, $allowed, true)) {
    sendJson(['success' => false, 'error' => 'Invalid language'], 400);
}
$langValue = $isClear ? null : $lang;

$db = getDb();

// Employee updating their own language
if ($targetType === 'employee') {
    $employee = requireEmployee();
    $db->prepare('UPDATE employees SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $langValue, ':id' => (int) $employee['id']]);
    sendJson(['success' => true]);
}

// Supervisor updating their own language
if ($targetType === 'supervisor_self') {
    $supervisor = requireSupervisor();
    $db->prepare('UPDATE supervisors SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $langValue, ':id' => (int) $supervisor['id']]);
    sendJson(['success' => true]);
}

// Admin updating their own language
if ($targetType === 'admin') {
    $admin = requireAdmin();
    $db->prepare('UPDATE company_admins SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $lang, ':id' => (int) $admin['id']]);
    sendJson(['success' => true]);
}

// Company admin updating company default language
if ($targetType === 'company') {
    $admin = requireAdmin();
    $db->prepare('UPDATE companies SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $lang, ':id' => (int) $admin['company_id']]);
    sendJson(['success' => true]);
}

sendJson(['success' => false, 'error' => 'Unknown target type'], 400);
