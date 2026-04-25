<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/pin_rate_limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload  = getJsonPayload();
$pin      = trim((string) ($payload['pin'] ?? ''));
$slug     = trim((string) ($payload['slug'] ?? ''));
$deviceId = trim((string) ($payload['device_id'] ?? ''));

if ($pin === '') {
    sendJson(['success' => false, 'error' => 'PIN puuttuu'], 400);
}

$db = getDb();

// Resolve company_id for rate limiting
$companyId = null;
if ($slug !== '') {
    $compStmt = $db->prepare('SELECT id FROM companies WHERE slug = :slug AND active = 1 LIMIT 1');
    $compStmt->execute([':slug' => $slug]);
    $company = $compStmt->fetch();
    if ($company) {
        $companyId = (int) $company['id'];
    }
}

// Check device rate limit
if ($deviceId !== '' && $companyId !== null) {
    $rl = checkPinRateLimit($db, $deviceId, $companyId);
    if (isset($rl['error'])) {
        sendJson(['success' => false, 'lockout' => $rl['error']] + $rl, 429);
    }
}

$pinHash = hashPin($pin);

if ($slug !== '') {
    $stmt = $db->prepare(
        'SELECT s.* FROM supervisors s
         JOIN companies c ON c.id = s.company_id
         WHERE s.pin = :pin AND s.active = 1 AND c.slug = :slug
         LIMIT 1'
    );
    $stmt->execute([':pin' => $pinHash, ':slug' => $slug]);
} else {
    $stmt = $db->prepare('SELECT * FROM supervisors WHERE pin = :pin AND active = 1 LIMIT 1');
    $stmt->execute([':pin' => $pinHash]);
}

$supervisor = $stmt->fetch();

if (!$supervisor) {
    $result = ['success' => false, 'error' => 'Väärä PIN'];
    if ($deviceId !== '' && $companyId !== null) {
        $rl = recordPinFailure($db, $deviceId, $companyId);
        if (isset($rl['error'])) {
            sendJson(['success' => false, 'lockout' => $rl['error']] + $rl, 429);
        }
        $result['attempts_remaining'] = $rl['attempts_remaining'];
    }
    sendJson($result, 401);
}

// Correct PIN — check if account is locked
if ((int) $supervisor['pin_locked'] === 1) {
    sendJson(['success' => false, 'lockout' => 'locked'], 403);
}

$compLangStmt = $db->prepare('SELECT name, ui_language, approvals_enabled FROM companies WHERE id = :id LIMIT 1');
$compLangStmt->execute([':id' => (int) $supervisor['company_id']]);
$compRow = $compLangStmt->fetch();

if (!$compRow || !(int) $compRow['approvals_enabled']) {
    sendJson(['success' => false, 'error' => 'Supervisor approvals are not enabled for this company.'], 403);
}

// Success — reset rate limit
if ($deviceId !== '' && $companyId !== null) {
    recordPinSuccess($db, $deviceId, $companyId, (int) $supervisor['id'], 'supervisor');
}

$companyLang   = ($compRow && $compRow['ui_language']) ? $compRow['ui_language'] : 'en';
$supLang       = $supervisor['ui_language'] ?? null;
$effectiveLang = $supLang ?: $companyLang;

$token = generateToken((int) $supervisor['id'], 'supervisor', (int) $supervisor['company_id']);

sendJson([
    'success'      => true,
    'token'        => $token,
    'supervisor'   => [
        'id'         => (int) $supervisor['id'],
        'first_name' => $supervisor['first_name'],
        'last_name'  => $supervisor['last_name'],
        'email'      => $supervisor['email'],
    ],
    'company_name' => $compRow['name'] ?? '',
    'ui_language'  => $effectiveLang,
]);
