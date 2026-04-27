<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$payload     = getJsonPayload();
$code        = trim((string) ($payload['code'] ?? ''));
$redirectUri = trim((string) ($payload['redirect_uri'] ?? ''));

if (!$code || !$redirectUri) {
    sendJson(['success' => false, 'error' => 'code and redirect_uri required'], 400);
}

// ── Step 1: exchange authorization code for Salaxy access token ──────────────

$tokenUrl = 'https://test-secure.salaxy.com/oauth2/token';

$ch = curl_init($tokenUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_POSTFIELDS     => json_encode([
        'grant_type'   => 'authorization_code',
        'code'         => $code,
        'client_id'    => 'time',
        'redirect_uri' => $redirectUri,
    ]),
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$tokenRaw  = curl_exec($ch);
$tokenCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr   = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    sendJson(['success' => false, 'error' => 'Token exchange failed: ' . $curlErr], 502);
}

$tokenData = json_decode((string) $tokenRaw, true);

if ($tokenCode !== 200 || !isset($tokenData['access_token'])) {
    error_log('Salaxy OAuth2 token exchange failed: HTTP ' . $tokenCode . ' — ' . $tokenRaw);
    $errMsg = $tokenData['error_description'] ?? $tokenData['error'] ?? 'Token exchange failed';
    sendJson(['success' => false, 'error' => $errMsg], 502);
}

$salaxyToken = $tokenData['access_token'];

// ── Step 2: fetch session/current to identify the user ───────────────────────

$ch = curl_init('https://test-secure.salaxy.com/v03/api/session/current');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $salaxyToken,
        'Accept: application/json',
    ],
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$sessionRaw  = curl_exec($ch);
$sessionCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$session = json_decode((string) $sessionRaw, true);

// Log full response on every call — helps identify correct field structure
error_log('Salaxy session/current HTTP ' . $sessionCode . ': ' . $sessionRaw);

if ($sessionCode !== 200 || !is_array($session)) {
    sendJson(['success' => false, 'error' => 'Failed to fetch Salaxy session'], 502);
}

// Extract account ID — check common locations in response
$salaxyAccountId = $session['currentAccount']['id']
    ?? $session['account']['id']
    ?? $session['id']
    ?? null;

if (!$salaxyAccountId) {
    error_log('Salaxy session/current: could not find account id in: ' . $sessionRaw);
    sendJson(['success' => false, 'error' => 'Could not determine Salaxy account ID'], 502);
}

$salaxyAccountId = (string) $salaxyAccountId;

// ── Step 3: match against super_admins whitelist ──────────────────────────────

$masterDb = getMasterDb();

// Try by salaxy_account_id first
$stmt = $masterDb->prepare('SELECT * FROM super_admins WHERE salaxy_account_id = :sid AND active = 1');
$stmt->execute([':sid' => $salaxyAccountId]);
$admin = $stmt->fetch();

// Bootstrap: if exactly one super-admin exists with no salaxy_account_id, auto-link
if (!$admin) {
    $countStmt = $masterDb->query('SELECT COUNT(*) FROM super_admins WHERE active = 1');
    $total     = (int) $countStmt->fetchColumn();

    $unlinked = $masterDb->query('SELECT * FROM super_admins WHERE salaxy_account_id IS NULL AND active = 1 LIMIT 1')->fetch();

    if ($total === 1 && $unlinked) {
        $name  = trim(($session['currentAccount']['name'] ?? $session['name'] ?? ''));
        $email = trim(($session['currentAccount']['email'] ?? $session['email'] ?? ''));
        $masterDb->prepare(
            'UPDATE super_admins SET salaxy_account_id = :sid, name = COALESCE(:name, name), email = COALESCE(:email, email)
             WHERE id = :id'
        )->execute([
            ':sid'   => $salaxyAccountId,
            ':name'  => $name ?: null,
            ':email' => $email ?: null,
            ':id'    => $unlinked['id'],
        ]);
        $admin = $masterDb->prepare('SELECT * FROM super_admins WHERE id = :id')->execute([':id' => $unlinked['id']]) ? $masterDb->query('SELECT * FROM super_admins WHERE id = ' . (int) $unlinked['id'])->fetch() : null;
    }
}

if (!$admin) {
    error_log('Salaxy OAuth2: unauthorized account ID: ' . $salaxyAccountId);
    sendJson(['success' => false, 'error' => 'Not authorized'], 403);
}

// ── Step 4: issue app JWT ─────────────────────────────────────────────────────

$token = generateToken((int) $admin['id'], 'superadmin', 0);

sendJson([
    'success' => true,
    'token'   => $token,
    'user'    => [
        'id'         => (int) $admin['id'],
        'type'       => 'superadmin',
        'companyId'  => 0,
        'name'       => $admin['name'] ?? 'Super Admin',
        'email'      => $admin['email'],
        'uiLanguage' => $admin['ui_language'] ?? 'en',
    ],
]);
