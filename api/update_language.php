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

// Company admin updating company default language
if ($targetType === 'company') {
    $admin = requireAdmin();
    $db->prepare('UPDATE companies SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $lang, ':id' => (int) $admin['company_id']]);
    sendJson(['success' => true]);
}

// Company admin or supervisor updating employee language
if ($targetType === 'employee') {
    if (isset($_SESSION['admin_id'])) {
        $admin = requireAdmin();
        $stmt  = $db->prepare('UPDATE employees SET ui_language = :lang WHERE id = :id AND company_id = :cid');
        $stmt->execute([':lang' => $langValue, ':id' => $targetId, ':cid' => (int) $admin['company_id']]);
    } elseif (isset($_SESSION['supervisor_id'])) {
        // Supervisor may only update employees in their team
        $supId = (int) $_SESSION['supervisor_id'];
        $check = $db->prepare('SELECT employee_id FROM supervisor_employees WHERE supervisor_id = :sid AND employee_id = :eid');
        $check->execute([':sid' => $supId, ':eid' => $targetId]);
        if (!$check->fetch()) {
            sendJson(['success' => false, 'error' => 'Not authorized'], 403);
        }
        $db->prepare('UPDATE employees SET ui_language = :lang WHERE id = :id')
           ->execute([':lang' => $langValue, ':id' => $targetId]);
    } elseif (isset($_SESSION['employee_id'])) {
        if ($isClear || $targetId !== (int) $_SESSION['employee_id']) {
            sendJson(['success' => false, 'error' => 'Not authorized'], 403);
        }
        $db->prepare('UPDATE employees SET ui_language = :lang WHERE id = :id')
           ->execute([':lang' => $langValue, ':id' => $targetId]);
    } else {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    sendJson(['success' => true]);
}

// Company admin updating supervisor language
if ($targetType === 'supervisor') {
    $admin = requireAdmin();
    $stmt  = $db->prepare('UPDATE supervisors SET ui_language = :lang WHERE id = :id AND company_id = :cid');
    $stmt->execute([':lang' => $langValue, ':id' => $targetId, ':cid' => (int) $admin['company_id']]);
    sendJson(['success' => true]);
}

// Admin updating their own language
if ($targetType === 'admin') {
    $admin = requireAdmin();
    if ($targetId && $targetId !== (int) $admin['id']) {
        sendJson(['success' => false, 'error' => 'Not authorized'], 403);
    }
    $db->prepare('UPDATE company_admins SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $lang, ':id' => (int) $admin['id']]);
    sendJson(['success' => true]);
}

// Supervisor updating their own language
if ($targetType === 'supervisor_self') {
    if (!isset($_SESSION['supervisor_id'])) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $supId = (int) $_SESSION['supervisor_id'];
    $db->prepare('UPDATE supervisors SET ui_language = :lang WHERE id = :id')
       ->execute([':lang' => $lang, ':id' => $supId]);
    sendJson(['success' => true]);
}

sendJson(['success' => false, 'error' => 'Unknown target type'], 400);
