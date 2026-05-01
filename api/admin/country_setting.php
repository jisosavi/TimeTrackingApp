<?php
declare(strict_types=1);

require_once __DIR__ . '/../common.php';

$admin     = requireAdmin();
$companyId = (int) $admin['company_id'];
$masterDb  = getMasterDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $masterDb->prepare('SELECT country_code FROM companies WHERE id = :id');
    $stmt->execute([':id' => $companyId]);
    $row = $stmt->fetch();
    sendJson(['success' => true, 'country_code' => $row['country_code'] ?? 'FI']);
}

if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
    $payload = getJsonPayload();
    $cc = trim((string) ($payload['country_code'] ?? ''));
    if (!$cc) sendJson(['success' => false, 'error' => 'country_code required'], 400);
    $masterDb->prepare('UPDATE companies SET country_code = :cc WHERE id = :id')
        ->execute([':cc' => $cc, ':id' => $companyId]);
    sendJson(['success' => true, 'country_code' => $cc]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
