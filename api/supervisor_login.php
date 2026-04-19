<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload = getJsonPayload();
$pin     = trim((string) ($payload['pin'] ?? ''));
$slug    = trim((string) ($payload['slug'] ?? ''));

if ($pin === '') {
    sendJson(['success' => false, 'error' => 'PIN puuttuu'], 400);
}

$db = getDb();

if ($slug !== '') {
    $stmt = $db->prepare(
        'SELECT s.* FROM supervisors s
         JOIN companies c ON c.id = s.company_id
         WHERE s.pin = :pin AND s.active = 1 AND c.slug = :slug
         LIMIT 1'
    );
    $stmt->execute([':pin' => $pin, ':slug' => $slug]);
} else {
    $stmt = $db->prepare('SELECT * FROM supervisors WHERE pin = :pin AND active = 1 LIMIT 1');
    $stmt->execute([':pin' => $pin]);
}

$supervisor = $stmt->fetch();

if (!$supervisor) {
    http_response_code(401);
    sendJson(['success' => false, 'error' => 'Väärä PIN']);
}

$_SESSION['supervisor_id']         = (int) $supervisor['id'];
$_SESSION['supervisor_company_id'] = (int) $supervisor['company_id'];

// Resolve effective language: supervisor personal → company default → 'en'
$compLangStmt = $db->prepare('SELECT ui_language FROM companies WHERE id = :id LIMIT 1');
$compLangStmt->execute([':id' => (int) $supervisor['company_id']]);
$compRow      = $compLangStmt->fetch();
$companyLang  = ($compRow && $compRow['ui_language']) ? $compRow['ui_language'] : 'en';
$supLang      = $supervisor['ui_language'] ?? null;
$effectiveLang = $supLang ?: $companyLang;

sendJson([
    'success' => true,
    'supervisor' => [
        'id'         => (int) $supervisor['id'],
        'first_name' => $supervisor['first_name'],
        'last_name'  => $supervisor['last_name'],
        'email'      => $supervisor['email'],
    ],
    'ui_language' => $effectiveLang,
]);
