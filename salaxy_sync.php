<?php
declare(strict_types=1);
error_reporting(0);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

// APP_KEY tulee config.php:stä
const DRAFT_FILE = __DIR__ . '/data/salaxy_draft.json';
const TOKEN_FILE = __DIR__ . '/data/salaxy_token.json';

// Tarkista APP_KEY
if (($_SERVER['HTTP_X_APP_KEY'] ?? '') !== APP_KEY) {
    http_response_code(401);
    echo json_encode(['message' => 'Luvaton pyyntö']);
    exit;
}

/**
 * Hae Salaxy access token (cachetetaan tiedostoon)
 */
function getSalaxyAccessToken(): ?string {
    // Tarkista onko cachessa validi token
    if (file_exists(TOKEN_FILE)) {
        $cached = json_decode(file_get_contents(TOKEN_FILE), true);
        // Token on voimassa jos se on alle 23 tuntia vanha (token kestää 24h)
        if (isset($cached['access_token'], $cached['fetched_at'])) {
            $age = time() - $cached['fetched_at'];
            if ($age < 23 * 60 * 60) {
                return $cached['access_token'];
            }
        }
    }
    
    // Hae uusi token
    $ch = curl_init(SALAXY_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'grant_type' => 'password',
            'username' => SALAXY_USERNAME,
            'password' => SALAXY_PASSWORD
        ]),
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        error_log("Salaxy token fetch failed: HTTP $httpCode - $response");
        return null;
    }
    
    $data = json_decode($response, true);
    if (!isset($data['access_token'])) {
        error_log("Salaxy token fetch: no access_token in response");
        return null;
    }
    
    // Tallenna cacheen
    $cacheData = [
        'access_token' => $data['access_token'],
        'token_type' => $data['token_type'] ?? 'Bearer',
        'fetched_at' => time()
    ];
    
    $dataDir = dirname(TOKEN_FILE);
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0775, true);
    }
    file_put_contents(TOKEN_FILE, json_encode($cacheData, JSON_PRETTY_PRINT));
    
    return $data['access_token'];
}

/**
 * Tee API-kutsu Salaxyyn
 */
function salaxyRequest(string $method, string $endpoint, ?array $data = null): array {
    // Hae token dynaamisesti
    $token = getSalaxyAccessToken();
    if (!$token) {
        return ['success' => false, 'error' => 'Failed to get Salaxy access token', 'httpCode' => 0];
    }
    
    $url = SALAXY_API_URL . $endpoint;
    
    // Debug: log the full URL
    error_log("Salaxy API call: $method $url");
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    } elseif ($method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    } elseif ($method === 'PATCH') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    if ($error) {
        return ['success' => false, 'error' => $error, 'httpCode' => 0];
    }
    
    $decoded = json_decode($response, true);
    
    return [
        'success' => $httpCode >= 200 && $httpCode < 300,
        'httpCode' => $httpCode,
        'data' => $decoded,
        'raw' => $response
    ];
}

/**
 * Muunna päivämäärä DD-MM-YYYY -> YYYY-MM-DD (ISO-muoto APIa varten)
 */
function convertDateToISO(string $date): string {
    $parts = explode('-', $date);
    if (count($parts) === 3 && strlen($parts[0]) === 2) {
        return $parts[2] . '-' . $parts[1] . '-' . $parts[0];
    }
    return $date;
}

// Globaali muuttuja virheiden tallentamiseen
$lastApiError = null;

/**
 * Hae tai luo tämän päivän palkkalistan luonnos (jaettu kaikille työntekijöille)
 */
function getOrCreateTodaysDraft(string $employmentId): ?array {
    global $lastApiError;
    $today = date('Y-m-d');
    
    // Lue tallennettu luonnos
    if (file_exists(DRAFT_FILE)) {
        $draftData = json_decode(file_get_contents(DRAFT_FILE), true);
        
        // Jos luonnos on tältä päivältä, käytä sitä (jaettu kaikille työntekijöille)
        if (isset($draftData['createdDate']) && $draftData['createdDate'] === $today 
            && isset($draftData['payrollId'])) {
            // Tarkista että luonnos on edelleen olemassa Salaxyssä
            $checkResponse = salaxyRequest('GET', '/payroll/' . $draftData['payrollId']);
            if ($checkResponse['success']) {
                // Varmista että calculations-objekti on olemassa
                if (!isset($draftData['calculations'])) {
                    $draftData['calculations'] = [];
                }
                return $draftData;
            }
        }
    }
    
    // Luo uusi palkkalistan luonnos (käytetään ensimmäisen työntekijän employmentId:tä)
    $payrollName = 'TimeTrackingApp_Test: ' . date('d.m.Y') . ' : ' . date('H:i');
    $payrollData = [
        'employmentId' => $employmentId,
        'status' => 'Draft',
        'input' => [
            'title' => $payrollName,
        ],
    ];
    
    $response = salaxyRequest('POST', '/payroll', $payrollData);
    
    if ($response['success'] && isset($response['data']['id'])) {
        $payrollId = $response['data']['id'];
        
        $newDraft = [
            'payrollId' => $payrollId,
            'payrollName' => $payrollName,
            'createdDate' => $today,
            'createdAt' => date('c'),
            'calculations' => [] // Työntekijäkohtaiset laskelmat: employmentId => calculationId
        ];
        
        // Tallenna luonnoksen tiedot
        $dataDir = dirname(DRAFT_FILE);
        if (!is_dir($dataDir)) {
            mkdir($dataDir, 0775, true);
        }
        file_put_contents(DRAFT_FILE, json_encode($newDraft, JSON_PRETTY_PRINT));
        
        return $newDraft;
    }
    
    // Tallenna virhe debuggausta varten
    $lastApiError = [
        'fullUrl' => SALAXY_API_URL . '/payroll',
        'endpoint' => '/payroll',
        'method' => 'POST',
        'sentData' => $payrollData,
        'httpCode' => $response['httpCode'],
        'response' => $response['data'] ?? $response['raw']
    ];
    
    return null;
}

/**
 * Rakenna kuvaus tuntipalkkariville
 */
function buildDescription(array $entry): string {
    $parts = [];
    
    if (!empty($entry['date'])) {
        $parts[] = $entry['date'];
    }
    
    $start = $entry['start'] ?? '';
    $end = $entry['end'] ?? '';
    if ($start && $end) {
        $parts[] = $start . '-' . $end;
    } elseif ($start) {
        $parts[] = 'alkaen ' . $start;
    }
    
    if (!empty($entry['project'])) {
        $parts[] = $entry['project'];
    }
    
    if (!empty($entry['notes'])) {
        $parts[] = $entry['notes'];
    }
    
    return implode(' | ', $parts);
}

/**
 * Hae olemassaoleva laskelma palkkalistalta tai luo uusi
 */
function getOrCreateCalculation(string $payrollId, ?string $existingCalcId, string $employmentId): array {
    // Jos meillä on jo laskelma-ID, käytä sitä
    if ($existingCalcId) {
        $getResponse = salaxyRequest('GET', '/calculations/' . $existingCalcId);
        if ($getResponse['success'] && isset($getResponse['data'])) {
            return [
                'success' => true,
                'calculationId' => $existingCalcId,
                'calcObject' => $getResponse['data'],
                'isNew' => false
            ];
        }
    }
    
    // Luo uusi calculation oletusriveillä
    $createData = [
        'workflow' => ['status' => 'PayrollDraft'],
        'employer' => ['isSelf' => true],
        'worker' => ['employmentId' => $employmentId],
        'info' => ['payrollId' => $payrollId]
    ];
    
    $createResponse = salaxyRequest('POST', '/calculations/update-from-employment?save=true&updateRows=true', $createData);
    
    if (!$createResponse['success'] || !isset($createResponse['data']['id'])) {
        return ['success' => false, 'error' => 'Create calculation failed', 'response' => $createResponse];
    }
    
    $calculationId = $createResponse['data']['id'];
    
    // Hae luotu calculation
    $getResponse = salaxyRequest('GET', '/calculations/' . $calculationId);
    
    if (!$getResponse['success'] || !isset($getResponse['data'])) {
        return ['success' => false, 'error' => 'GET new calculation failed'];
    }
    
    return [
        'success' => true,
        'calculationId' => $calculationId,
        'calcObject' => $getResponse['data'],
        'isNew' => true
    ];
}

/**
 * Lisää tuntipalkkarivi palkkalistalle
 * - Käyttää olemassaolevaa laskelmaa jos sellainen on
 * - Lisää UUDEN tuntirivin (ei korvaa vanhoja)
 */
function addHourlyWageRow(string $payrollId, array $entry, ?string $existingCalcId, string $employmentId): array {
    $description = buildDescription($entry);
    
    $response = [
        'debug' => [
            'hours_value' => $entry['hours'] ?? 'missing',
            'description' => $description,
            'existingCalcId' => $existingCalcId,
            'employmentId' => $employmentId
        ]
    ];
    
    // Hae tai luo laskelma
    $calcResult = getOrCreateCalculation($payrollId, $existingCalcId, $employmentId);
    
    if (!$calcResult['success']) {
        $response['error'] = $calcResult['error'] ?? 'Failed to get/create calculation';
        $response['success'] = false;
        return $response;
    }
    
    $calculationId = $calcResult['calculationId'];
    $calcObject = $calcResult['calcObject'];
    $isNewCalc = $calcResult['isNew'];
    
    $response['calculationId'] = $calculationId;
    $response['isNewCalculation'] = $isNewCalc;
    
    $existingRows = $calcObject['rows'] ?? [];
    $response['debug_existing_rows'] = $existingRows;
    
    if ($isNewCalc) {
        // Uusi laskelma: muokkaa olemassaolevaa oletustuntiriviä
        $hourlyRowFound = false;
        foreach ($existingRows as $index => $row) {
            if (isset($row['rowType']) && $row['rowType'] === 'hourlySalary') {
                $calcObject['rows'][$index]['count'] = floatval($entry['hours'] ?? 0);
                $calcObject['rows'][$index]['message'] = $description;
                $hourlyRowFound = true;
                $response['debug_modified_row'] = $calcObject['rows'][$index];
                break;
            }
        }
        
        // Jos tuntiriviä ei ollut, lisää se
        if (!$hourlyRowFound) {
            $calcObject['rows'][] = [
                'rowIndex' => count($existingRows),
                'rowType' => 'hourlySalary',
                'count' => floatval($entry['hours'] ?? 0),
                'price' => 20,
                'unit' => 'hours',
                'message' => $description,
                'source' => 'undefined',
                'sourceId' => null,
                'accounting' => ['vatPercent' => null, 'vatEntries' => null, 'dimensions' => [], 'entry' => null],
                'period' => null,
                'data' => new \stdClass()
            ];
        }
    } else {
        // Olemassaoleva laskelma: LISÄÄ uusi tuntirivi
        $maxRowIndex = -1;
        foreach ($existingRows as $row) {
            if (isset($row['rowIndex']) && $row['rowIndex'] > $maxRowIndex) {
                $maxRowIndex = $row['rowIndex'];
            }
        }
        
        $calcObject['rows'][] = [
            'rowIndex' => $maxRowIndex + 1,
            'rowType' => 'hourlySalary',
            'count' => floatval($entry['hours'] ?? 0),
            'price' => 20,
            'unit' => 'hours',
            'message' => $description,
            'source' => 'undefined',
            'sourceId' => null,
            'accounting' => ['vatPercent' => null, 'vatEntries' => null, 'dimensions' => [], 'entry' => null],
            'period' => null,
            'data' => new \stdClass()
        ];
        $response['debug_added_new_hourly_row'] = true;
    }
    
    // VAIHE 4: Tallenna muokattu laskelma (updateRows=false säilyttää rivit)
    $saveResponse = salaxyRequest('POST', '/calculations/update-from-employment?save=true&updateRows=false', $calcObject);
    $response['saveResponse'] = $saveResponse;
    
    // Käytä tallennettua ID:tä (voi olla sama tai uusi)
    $finalCalcId = $saveResponse['data']['id'] ?? $calculationId;
    
    // VAIHE 5: Liitä palkkalistaan VAIN jos uusi laskelma
    if ($isNewCalc) {
        $addCalcResponse = salaxyRequest('POST', '/payroll/' . $payrollId . '/add-calc?ids=' . $finalCalcId, null);
        $response['addCalcResponse'] = $addCalcResponse;
    }
    
    $response['finalCalculationId'] = $finalCalcId;
    $response['success'] = true;
    
    return $response;
}

// ============================================================
// PÄÄLOGIIKKA
// ============================================================

// Lue lähetettävät tunnit
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['entries']) || !is_array($payload['entries'])) {
    http_response_code(400);
    echo json_encode(['message' => 'Virheellinen data - entries puuttuu']);
    exit;
}

$entries = $payload['entries'];
$employmentId = $payload['employmentId'] ?? SALAXY_EMPLOYMENT_ID;

if (empty($entries)) {
    http_response_code(400);
    echo json_encode(['message' => 'Ei lähetettäviä tunteja']);
    exit;
}

// Hae tai luo tämän päivän luonnos
$draft = getOrCreateTodaysDraft($employmentId);

if (!$draft) {
    http_response_code(500);
    echo json_encode([
        'message' => 'Palkkalistan luonnoksen luonti epäonnistui',
        'debug' => $lastApiError
    ]);
    exit;
}

$payrollId = $draft['payrollId'];
// Hae tämän työntekijän olemassaoleva laskelma-ID (jos on)
$existingCalcId = $draft['calculations'][$employmentId] ?? null;
$results = [];
$errors = [];

// Lisää jokainen tuntikirjaus palkkalistalle
foreach ($entries as $entry) {
    $response = addHourlyWageRow($payrollId, $entry, $existingCalcId, $employmentId);
    
    // Päivitä calculationId jatkokäyttöä varten
    $calcId = $response['finalCalculationId'] ?? $response['calculationId'] ?? null;
    
    // Jos tämä oli uusi laskelma, tallenna ID draft-tiedostoon työntekijäkohtaisesti
    if ($calcId && !$existingCalcId) {
        $existingCalcId = $calcId;
        $draft['calculations'][$employmentId] = $calcId;
        file_put_contents(DRAFT_FILE, json_encode($draft, JSON_PRETTY_PRINT));
    }
    
    $calculationCreated = $calcId !== null;
    
    // Debug: näytä mitä saimme
    $debugInfo = [
        'response_success' => $response['success'] ?? false,
        'isNewCalculation' => $response['isNewCalculation'] ?? 'unknown',
        'calcId' => $calcId
    ];
    
    if (($response['success'] ?? false) || $calculationCreated) {
        $results[] = [
            'date' => $entry['date'],
            'hours' => $entry['hours'],
            'project' => $entry['project'] ?? '',
            'status' => 'ok',
            'calculationId' => $calcId,
            'isNewCalculation' => $response['isNewCalculation'] ?? false,
            'debugInfo' => $debugInfo,
            'debug_existing_rows' => $response['debug_existing_rows'] ?? 'not set'
        ];
    } else {
        // Hae oikea virheilmoitus
        $errorMsg = 'Tuntematon virhe';
        if (isset($response['data']['message'])) {
            $errorMsg = $response['data']['message'];
        } elseif (isset($response['data']['errors'][0]['msg'])) {
            $errorMsg = $response['data']['errors'][0]['msg'];
        } elseif (isset($response['error'])) {
            $errorMsg = $response['error'];
        }
        
        $errors[] = [
            'date' => $entry['date'],
            'hours' => $entry['hours'],
            'status' => 'error',
            'httpCode' => $response['httpCode'] ?? 0,
            'error' => $errorMsg,
            'debugInfo' => $debugInfo
        ];
    }
}

// Vastaus
$allSuccess = empty($errors);
http_response_code($allSuccess ? 200 : 207);

echo json_encode([
    'message' => $allSuccess 
        ? 'Kaikki tunnit lisätty palkkalistalle' 
        : 'Osa tunneista epäonnistui',
    'payrollId' => $payrollId,
    'payrollName' => $draft['payrollName'] ?? 'TimeTrackingApp',
    'payrollUrl' => 'https://test.salaxy.fi/payroll/' . $payrollId,
    'draftDate' => $draft['createdDate'],
    'success' => $results,
    'errors' => $errors,
    'totalSent' => count($results),
    'totalFailed' => count($errors),
    'debug_patchResult' => $draft['patchResult'] ?? 'not available'
]);
