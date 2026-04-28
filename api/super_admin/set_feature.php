<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/common.php';

requireSuperAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload   = getJsonPayload();
$companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : 0;
$feature   = trim((string) ($payload['feature'] ?? ''));
$enabled   = isset($payload['enabled']) ? (int) $payload['enabled'] : 0;

if (!$companyId) sendJson(['success' => false, 'error' => 'company_id required'], 400);

$allowed = ['time_app_enabled', 'supervisor_ui_enabled'];
if (!in_array($feature, $allowed, true)) {
    sendJson(['success' => false, 'error' => 'Invalid feature'], 400);
}

$db  = getMasterDb();
$row = $db->prepare('SELECT id FROM companies WHERE id = :id');
$row->execute([':id' => $companyId]);
if (!$row->fetch()) sendJson(['success' => false, 'error' => 'Company not found'], 404);

$db->prepare("UPDATE companies SET {$feature} = :v WHERE id = :id")
   ->execute([':v' => $enabled ? 1 : 0, ':id' => $companyId]);

$stmt = $db->prepare(
    'SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
            ui_language, salaxy_company_id AS business_id, db_file, salaxy_api_url, salaxy_username
     FROM companies WHERE id = :id'
);
$stmt->execute([':id' => $companyId]);

sendJson(['success' => true, 'company' => $stmt->fetch()]);
