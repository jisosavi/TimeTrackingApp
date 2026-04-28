<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

requireSuperAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

$companyId = isset($_GET['company_id']) ? (int) $_GET['company_id'] : 0;
if (!$companyId) {
    sendJson(['success' => false, 'error' => 'company_id required'], 400);
}

$db   = getMasterDb();
$stmt = $db->prepare('SELECT salaxy_api_url, salaxy_username, salaxy_password FROM companies WHERE id = :id');
$stmt->execute([':id' => $companyId]);
$company = $stmt->fetch();

if (!$company) {
    sendJson(['success' => false, 'error' => 'Company not found'], 404);
}

$apiUrl   = $company['salaxy_api_url']  ?: SALAXY_API_URL;
$username = $company['salaxy_username'] ?: SALAXY_USERNAME;
$password = $company['salaxy_password'] ?: SALAXY_PASSWORD;

if (!$username || !$password) {
    sendJson(['success' => false, 'error' => 'Salaxy credentials not configured for this company'], 422);
}

function fetchAccessToken(int $companyId, string $username, string $password): ?string
{
    $tokenFile = __DIR__ . '/../data/salaxy_token_' . $companyId . '.json';
    if (file_exists($tokenFile)) {
        $cached = json_decode(file_get_contents($tokenFile), true);
        if (isset($cached['access_token'], $cached['fetched_at']) && time() - $cached['fetched_at'] < 23 * 3600) {
            return $cached['access_token'];
        }
    }

    $ch = curl_init(SALAXY_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['grant_type' => 'password', 'username' => $username, 'password' => $password, 'skin' => 'salaxy.min']),
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200) return null;

    $data = json_decode($raw, true);
    if (!isset($data['access_token'])) return null;

    $dir = dirname($tokenFile);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    file_put_contents($tokenFile, json_encode(['access_token' => $data['access_token'], 'fetched_at' => time()]));

    return $data['access_token'];
}

function salaxyGet(string $token, string $apiUrl, string $endpoint): array
{
    $ch = curl_init($apiUrl . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $raw      = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) return ['success' => false, 'error' => $curlErr];

    return [
        'success'  => $httpCode >= 200 && $httpCode < 300,
        'httpCode' => $httpCode,
        'data'     => json_decode($raw, true),
    ];
}

// Extract Y-tunnus from an owner/officialId string like "FI90POYJ0048642803"
function parseYtunnus(string $raw): ?string
{
    preg_match_all('/\d/', $raw, $m);
    $digits = implode('', $m[0]);
    if (strlen($digits) < 8) return null;
    $last8 = substr($digits, -8);
    return substr($last8, 0, 7) . '-' . $last8[7];
}

$token = fetchAccessToken($companyId, $username, $password);
if (!$token) {
    sendJson(['success' => false, 'error' => 'Failed to get Salaxy access token'], 502);
}

// Try /employments — look for selfPartyInfo.officialId
$res = salaxyGet($token, $apiUrl, '/employments');
if ($res['success'] && isset($res['data']['items']) && is_array($res['data']['items'])) {
    $items = $res['data']['items'];

    // Check selfPartyInfo.officialId on any item
    foreach ($items as $item) {
        $officialId = $item['selfPartyInfo']['officialId'] ?? null;
        if ($officialId) {
            $ytunnus = parseYtunnus((string) $officialId);
            if ($ytunnus) sendJson(['success' => true, 'business_id' => $ytunnus]);
        }
    }

    // Check selfId on any item
    foreach ($items as $item) {
        $selfId = $item['selfId'] ?? null;
        if ($selfId) {
            $ytunnus = parseYtunnus((string) $selfId);
            if ($ytunnus) sendJson(['success' => true, 'business_id' => $ytunnus]);
        }
    }

    // Check owner field on any item
    foreach ($items as $item) {
        $owner = $item['owner'] ?? null;
        if ($owner) {
            $ytunnus = parseYtunnus((string) $owner);
            if ($ytunnus) sendJson(['success' => true, 'business_id' => $ytunnus]);
        }
    }
}

sendJson(['success' => false, 'error' => 'Could not determine Business ID from Salaxy API'], 404);
