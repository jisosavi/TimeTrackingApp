<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$reviewer = requireAdminOrSupervisor();
$payload  = getJsonPayload();

$ids            = array_map('intval', (array) ($payload['ids'] ?? []));
$action         = trim((string) ($payload['action'] ?? ''));
$rejectionNote  = trim((string) ($payload['rejection_note'] ?? ''));
$field          = trim((string) ($payload['field'] ?? '')) === 'km_status' ? 'km_status' : 'status';

if (empty($ids) || !in_array($action, ['approve', 'reject', 'delete'], true)) {
    sendJson(['success' => false, 'error' => 'ids ja action (approve|reject|delete) vaaditaan'], 400);
}

$db = getCompanyDb((int) $reviewer['company_id']);

// Build placeholders
$placeholders = implode(',', array_fill(0, count($ids), '?'));

// Verify all entries belong to this company (and to supervisor's team if supervisor)
if ($reviewer['type'] === 'supervisor') {
    $sql  = "SELECT id FROM time_entries
             WHERE id IN ($placeholders)
               AND company_id = ?
               AND employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = ?)";
    $stmt = $db->prepare($sql);
    $stmt->execute([...$ids, $reviewer['company_id'], $reviewer['id']]);
} else {
    $sql  = "SELECT id FROM time_entries WHERE id IN ($placeholders) AND company_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([...$ids, $reviewer['company_id']]);
}

$allowed = array_column($stmt->fetchAll(), 'id');
if (count($allowed) !== count($ids)) {
    sendJson(['success' => false, 'error' => 'Osa kirjauksista ei kuulu sinulle tai yrityksellesi'], 403);
}

if ($action === 'delete') {
    $db->prepare("UPDATE time_entries SET status = 'deleted' WHERE id IN ($placeholders)")
       ->execute([...$ids]);
    sendJson(['success' => true, 'updated' => count($ids), 'status' => 'deleted']);
}

$newStatus = $action === 'approve' ? 'approved' : 'rejected';
$now       = gmdate('c');

if ($field === 'km_status') {
    $kmNote = $action === 'reject' ? $rejectionNote : null;
    $db->prepare("UPDATE time_entries SET km_status = ?, km_rejection_note = ? WHERE id IN ($placeholders)")
       ->execute([$newStatus, $kmNote, ...$ids]);
} else {
    $updateSql = "UPDATE time_entries SET
        status = ?,
        reviewed_by_type = ?,
        reviewed_by_id = ?,
        reviewed_at = ?,
        rejection_note = ?
      WHERE id IN ($placeholders)";
    $db->prepare($updateSql)->execute([
        $newStatus,
        $reviewer['type'],
        $reviewer['id'],
        $now,
        $action === 'reject' ? $rejectionNote : null,
        ...$ids,
    ]);
}

sendJson(['success' => true, 'updated' => count($ids), 'status' => $newStatus]);
