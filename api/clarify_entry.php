<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$emp     = requireEmployee();
$payload = getJsonPayload();
$id      = isset($payload['id']) ? (int) $payload['id'] : null;
$action  = trim((string) ($payload['action'] ?? ''));

if (!$id || !in_array($action, ['clarify', 'delete'], true)) {
    sendJson(['success' => false, 'error' => 'id ja action (clarify|delete) vaaditaan'], 400);
}

$db = getDb();

// Verify entry belongs to this employee and is in rejected status
$stmt = $db->prepare(
    "SELECT id, status FROM time_entries
     WHERE id = :id AND employee_id = :eid AND status = 'rejected'"
);
$stmt->execute([':id' => $id, ':eid' => $emp['id']]);
$entry = $stmt->fetch();

if (!$entry) {
    sendJson(['success' => false, 'error' => 'Kirjausta ei löydy tai se ei ole hylätty'], 404);
}

if ($action === 'delete') {
    $db->prepare("UPDATE time_entries SET status = 'deleted' WHERE id = :id")
       ->execute([':id' => $id]);
    sendJson(['success' => true, 'action' => 'deleted']);
}

// Clarify
$clarification = trim((string) ($payload['clarification'] ?? ''));
if ($clarification === '') {
    sendJson(['success' => false, 'error' => 'Selvitysteksti ei voi olla tyhjä'], 400);
}

$db->prepare(
    "UPDATE time_entries SET
        status = 'clarified',
        employee_clarification = :clarification,
        clarification_at = :now
     WHERE id = :id"
)->execute([
    ':clarification' => $clarification,
    ':now'           => gmdate('c'),
    ':id'            => $id,
]);

sendJson(['success' => true, 'action' => 'clarified']);
