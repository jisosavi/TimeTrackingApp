<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

requireSuperAdmin();

$payload     = getJsonPayload();
$companyId   = isset($payload['company_id']) ? (int) $payload['company_id'] : null;
$confirmSlug = trim((string) ($payload['confirm_slug'] ?? ''));

if (!$companyId || !$confirmSlug) {
    sendJson(['success' => false, 'error' => 'company_id and confirm_slug required'], 400);
}

$db   = getMasterDb();
$stmt = $db->prepare('SELECT id, slug, db_file FROM companies WHERE id = :id');
$stmt->execute([':id' => $companyId]);
$company = $stmt->fetch();

if (!$company) {
    sendJson(['success' => false, 'error' => 'Company not found'], 404);
}

if ($company['slug'] !== $confirmSlug) {
    sendJson(['success' => false, 'error' => 'Slug does not match'], 422);
}

// Delete company SQLite file
if ($company['db_file']) {
    @unlink(DB_DIR . '/' . $company['db_file']);
}

// Delete cached Salaxy token
@unlink(DB_DIR . '/salaxy_token_' . $companyId . '.json');

// Delete from master DB
$db->prepare('DELETE FROM companies WHERE id = :id')->execute([':id' => $companyId]);

sendJson(['success' => true]);
