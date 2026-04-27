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

// Resolve company from master DB
$masterDb  = getMasterDb();
$companyId = null;
$company   = null;
if ($slug !== '') {
    $compStmt = $masterDb->prepare(
        'SELECT id, name, ui_language, approvals_enabled FROM companies WHERE slug = :slug AND active = 1 LIMIT 1'
    );
    $compStmt->execute([':slug' => $slug]);
    $company = $compStmt->fetch();
    if ($company) {
        $companyId = (int) $company['id'];
    }
}

if (!$companyId || !$company) {
    sendJson(['success' => false, 'error' => 'Company not found'], 404);
}

if (!(int) $company['approvals_enabled']) {
    sendJson(['success' => false, 'error' => 'Supervisor approvals are not enabled for this company.'], 403);
}

$companyDb = getCompanyDb($companyId);

// Check device rate limit
if ($deviceId !== '' ) {
    $rl = checkPinRateLimit($companyDb, $deviceId, $companyId);
    if (isset($rl['error'])) {
        sendJson(['success' => false, 'lockout' => $rl['error']] + $rl, 429);
    }
}

$pinHash = hashPin($pin);

$stmt = $companyDb->prepare(
    'SELECT * FROM supervisors WHERE pin = :pin AND active = 1 LIMIT 1'
);
$stmt->execute([':pin' => $pinHash]);
$supervisor = $stmt->fetch();

if (!$supervisor) {
    $result = ['success' => false, 'error' => 'Väärä PIN'];
    if ($deviceId !== '') {
        $rl = recordPinFailure($companyDb, $deviceId, $companyId);
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

// Success — reset rate limit
if ($deviceId !== '') {
    recordPinSuccess($companyDb, $deviceId, $companyId, (int) $supervisor['id'], 'supervisor');
}

$companyLang   = $company['ui_language'] ?? 'en';
$supLang       = $supervisor['ui_language'] ?? null;
$effectiveLang = $supLang ?: $companyLang;

$token = generateToken((int) $supervisor['id'], 'supervisor', $companyId);

sendJson([
    'success'      => true,
    'token'        => $token,
    'supervisor'   => [
        'id'         => (int) $supervisor['id'],
        'first_name' => $supervisor['first_name'],
        'last_name'  => $supervisor['last_name'],
        'email'      => $supervisor['email'],
    ],
    'company_name' => $company['name'] ?? '',
    'ui_language'  => $effectiveLang,
]);
