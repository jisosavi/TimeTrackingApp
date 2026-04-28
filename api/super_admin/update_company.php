<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/common.php';

requireSuperAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload = getJsonPayload();
$id      = isset($payload['id']) ? (int) $payload['id'] : 0;
if (!$id) {
    sendJson(['success' => false, 'error' => 'id required'], 400);
}

$db = getMasterDb();

$row = $db->prepare('SELECT id FROM companies WHERE id = :id');
$row->execute([':id' => $id]);
if (!$row->fetch()) {
    sendJson(['success' => false, 'error' => 'Company not found'], 404);
}

if (array_key_exists('name', $payload)) {
    $name = trim((string) $payload['name']);
    if ($name === '') sendJson(['success' => false, 'error' => 'Name is required'], 400);
    $db->prepare('UPDATE companies SET name = :name WHERE id = :id')
       ->execute([':name' => $name, ':id' => $id]);
}

if (array_key_exists('slug', $payload)) {
    $slug = trim((string) $payload['slug']);
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]{1,2}$/', $slug)) {
        sendJson(['success' => false, 'error' => 'Slug must be 2–40 lowercase letters, numbers or hyphens'], 400);
    }
    $chk = $db->prepare('SELECT id FROM companies WHERE slug = :slug AND id != :id');
    $chk->execute([':slug' => $slug, ':id' => $id]);
    if ($chk->fetch()) sendJson(['success' => false, 'error' => 'Slug already taken'], 409);
    $db->prepare('UPDATE companies SET slug = :slug WHERE id = :id')
       ->execute([':slug' => $slug, ':id' => $id]);
}

$stmt = $db->prepare(
    'SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
            ui_language, salaxy_company_id AS business_id, db_file, salaxy_api_url, salaxy_username
     FROM companies WHERE id = :id'
);
$stmt->execute([':id' => $id]);
$company = $stmt->fetch();

sendJson(['success' => true, 'company' => $company]);
