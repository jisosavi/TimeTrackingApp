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

// ── Step 3: check Time app super-admin authorisation ─────────────────────────
//
// checkTimeAppSuperAdminAccess() abstracts the authorisation check.
//
// FUTURE: Salaxy will include an authorisation claim in the session response,
// e.g. $session['currentAccount']['timeAppAccess']['superAdmin'] === true.
// When that ships, update the function body to read the real claim and remove
// the whitelist fallback below.
//
function checkTimeAppSuperAdminAccess(array $session, string $salaxyAccountId, PDO $masterDb): array
{
    // ── Future Salaxy claim (not yet provided by Salaxy) ──────────────────────
    // When Salaxy ships the claim, this will be the primary check:
    //   $claim = $session['currentAccount']['timeAppAccess']['superAdmin'] ?? null;
    //   if ($claim !== null) {
    //       return ['granted' => (bool) $claim, 'via' => 'salaxy_claim'];
    //   }

    // ── Mock / fallback: local super_admins whitelist ─────────────────────────
    // Simulates the future Salaxy-side authorisation until the real claim arrives.

    // Try by linked salaxy_account_id
    $stmt = $masterDb->prepare('SELECT * FROM super_admins WHERE salaxy_account_id = :sid AND active = 1');
    $stmt->execute([':sid' => $salaxyAccountId]);
    $admin = $stmt->fetch();
    if ($admin) {
        return ['granted' => true, 'via' => 'whitelist', 'admin' => $admin];
    }

    // Bootstrap: if exactly one super-admin exists with no salaxy_account_id, auto-link
    $total    = (int) $masterDb->query('SELECT COUNT(*) FROM super_admins WHERE active = 1')->fetchColumn();
    $unlinked = $masterDb->query('SELECT * FROM super_admins WHERE salaxy_account_id IS NULL AND active = 1 LIMIT 1')->fetch();

    if ($total === 1 && $unlinked) {
        return ['granted' => true, 'via' => 'autolink', 'admin' => $unlinked];
    }

    return ['granted' => false, 'via' => 'whitelist'];
}

$masterDb = getMasterDb();
$authResult = checkTimeAppSuperAdminAccess($session, $salaxyAccountId, $masterDb);

if (!$authResult['granted']) {
    error_log('Salaxy OAuth2: unauthorized account ID: ' . $salaxyAccountId);
    sendJson(['success' => false, 'error' => 'Not authorized'], 403);
}

// ── Step 4: refresh identity from Salaxy session and persist ─────────────────
$admin = $authResult['admin'];

$cur     = $session['currentAccount'] ?? $session['account'] ?? $session ?? [];
$avRaw   = $cur['avatar'] ?? [];
$av      = is_array($avRaw) ? $avRaw : [];
$cred    = $session['currentCredential'] ?? [];
$sesAvat = $session['avatar'] ?? [];
$contact = $cur['contact'] ?? [];

$salaxyName = trim(
    trim(($sesAvat['firstName'] ?? '') . ' ' . ($sesAvat['lastName'] ?? ''))
    ?: trim(($av['firstName'] ?? '') . ' ' . ($av['lastName'] ?? ''))
    ?: ($cur['name'] ?? '')
    ?: ($session['name'] ?? '')
);
$salaxyEmail = trim(
    $cred['login']              // currentCredential.login  — most likely the email
    ?? $cred['username']
    ?? $cred['email']
    ?? $contact['email']        // currentAccount.contact.email
    ?? $contact['login']
    ?? $sesAvat['email']        // session-level avatar
    ?? $sesAvat['login']
    ?? $cur['email']
    ?? $cur['login']
    ?? ''
);
$salaxyAvatarUrl = trim(
    $sesAvat['url']          // session-level avatar image URL
    ?? $sesAvat['imageUrl']
    ?? $sesAvat['pictureUrl']
    ?? $sesAvat['thumbnailUrl']
    ?? $sesAvat['smallUrl']
    ?? $sesAvat['href']
    ?? $av['url']
    ?? $av['imageUrl']
    ?? $av['pictureUrl']
    ?? $av['thumbnailUrl']
    ?? ''
);
error_log('Salaxy identity extraction: salaxyEmail=' . ($salaxyEmail ?: 'EMPTY')
    . ' salaxyAvatarUrl=' . ($salaxyAvatarUrl ?: 'EMPTY')
    . ' cred_keys=' . implode(',', array_keys($cred))
    . ' contact_keys=' . implode(',', array_keys($contact))
    . ' sesAvat_keys=' . implode(',', array_keys($sesAvat))
    . ' av_keys=' . (is_array($av) ? implode(',', array_keys($av)) : gettype($av)));

// Always link salaxy_account_id and sync name (no UNIQUE constraint on these)
$masterDb->prepare(
    'UPDATE super_admins
     SET salaxy_account_id = :sid,
         name = CASE WHEN :name != "" THEN :name2 ELSE name END
     WHERE id = :id'
)->execute([
    ':sid'   => $salaxyAccountId,
    ':name'  => $salaxyName, ':name2' => $salaxyName,
    ':id'    => $admin['id'],
]);
// Only fill email if the row currently has none (avoids UNIQUE conflict with other rows)
if ($salaxyEmail) {
    try {
        $masterDb->prepare(
            'UPDATE super_admins SET email = :email WHERE id = :id AND (email IS NULL OR email = "")'
        )->execute([':email' => $salaxyEmail, ':id' => $admin['id']]);
    } catch (PDOException $e) {
        error_log('super_admin email update skipped: ' . $e->getMessage());
    }
}
$admin = $masterDb->query('SELECT * FROM super_admins WHERE id = ' . (int) $admin['id'])->fetch();

// ── Step 5: issue app JWT ─────────────────────────────────────────────────────

$token = generateToken((int) $admin['id'], 'superadmin', 0);

sendJson([
    'success' => true,
    'token'   => $token,
    'user'    => [
        'id'         => (int) $admin['id'],
        'type'       => 'superadmin',
        'companyId'  => 0,
        'name'       => $admin['name']  ?: ($salaxyName  ?: 'Super Admin'),
        'email'      => $salaxyEmail ?: $admin['email'],
        'avatarUrl'  => $salaxyAvatarUrl ?: null,
        'uiLanguage' => $admin['ui_language'] ?? 'en',
    ],
]);
