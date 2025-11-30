<?php
declare(strict_types=1);
error_reporting(0);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

const APP_KEY = 'tT9#kL2$mN7@pQ4!23';
const DRAFT_FILE = __DIR__ . '/data/salaxy_draft.json';

// Tarkista APP_KEY
if (($_SERVER['HTTP_X_APP_KEY'] ?? '') !== APP_KEY) {
    http_response_code(401);
    echo json_encode(['message' => 'Luvaton pyyntö']);
    exit;
}

/**
 * Tee API-kutsu Salaxyyn
 */
function salaxyRequest(string $method, string $endpoint, ?array $data = null): array {
    $url = SALAXY_API_URL . $endpoint;
    
    // Debug: log the full URL
    error_log("Salaxy API call: $method $url");
    
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . SALAXY_JWT_TOKEN,
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
 * Hae tai luo tämän päivän palkkalistan luonnos
 */
function getOrCreateTodaysDraft(): ?array {
    global $lastApiError;
    $today = date('Y-m-d');
    
    // Lue tallennettu luonnos
    if (file_exists(DRAFT_FILE)) {
        $draftData = json_decode(file_get_contents(DRAFT_FILE), true);
        
        // Jos luonnos on tältä päivältä, käytä sitä
        if (isset($draftData['createdDate']) && $draftData['createdDate'] === $today && isset($draftData['payrollId'])) {
            // Tarkista että luonnos on edelleen olemassa Salaxyssä
            $checkResponse = salaxyRequest('GET', '/payroll/' . $draftData['payrollId']);
            if ($checkResponse['success']) {
                return $draftData;
            }
        }
    }
    
    // Luo uusi palkkalistan luonnos
    $payrollData = [
        'employmentId' => SALAXY_EMPLOYMENT_ID,
        'status' => 'Draft',
        'description' => 'TimeTrackingApp - ' . date('d.m.Y'),
    ];
    
    $response = salaxyRequest('POST', '/payroll', $payrollData);
    
    if ($response['success'] && isset($response['data']['id'])) {
        $newDraft = [
            'payrollId' => $response['data']['id'],
            'createdDate' => $today,
            'createdAt' => date('c')
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
 * Lisää tuntipalkkarivi palkkalistalle (luo Calculation)
 * 
 * HUOM: Tuntien päivitys ei vielä toimi täydellisesti API:n kautta.
 * Calculation luodaan oikealla työntekijällä ja oletusriveillä.
 */
function addHourlyWageRow(string $payrollId, array $entry): array {
    // Rakenna kuvaus: päivämäärä, kellonajat, projekti, kommentti
    $parts = [];
    
    // Päivämäärä
    if (!empty($entry['date'])) {
        $parts[] = $entry['date'];
    }
    
    // Kellonajat
    $start = $entry['start'] ?? '';
    $end = $entry['end'] ?? '';
    if ($start && $end) {
        $parts[] = $start . '-' . $end;
    } elseif ($start) {
        $parts[] = 'alkaen ' . $start;
    }
    
    // Projekti
    if (!empty($entry['project'])) {
        $parts[] = $entry['project'];
    }
    
    // Kommentti
    if (!empty($entry['notes'])) {
        $parts[] = $entry['notes'];
    }
    
    $description = implode(' | ', $parts);
    
    $debugLog = [
        'hours_value' => $entry['hours'] ?? 'missing',
        'description' => $description
    ];
    
    // VAIHE 1: Luo calculation oletusriveillä
    $createData = [
        'workflow' => ['status' => 'PayrollDraft'],
        'employer' => ['isSelf' => true],
        'worker' => ['employmentId' => SALAXY_EMPLOYMENT_ID],
        'info' => ['payrollId' => $payrollId]
    ];
    
    $createResponse = salaxyRequest('POST', '/calculations/update-from-employment?save=true&updateRows=true', $createData);
    $response = $createResponse;
    $response['debug'] = $debugLog;
    
    if (!$createResponse['success'] || !isset($createResponse['data']['id'])) {
        return $response;
    }
    
    $calculationId = $createResponse['data']['id'];
    
    // VAIHE 2: Hae calculation oletusriveineen
    $getResponse = salaxyRequest('GET', '/calculations/' . $calculationId);
    
    if (!$getResponse['success'] || !isset($getResponse['data'])) {
        $response['error'] = 'GET calculation failed';
        return $response;
    }
    
    $calcObject = $getResponse['data'];
    $existingRows = $calcObject['rows'] ?? [];
    $response['debug_existing_rows'] = $existingRows;
    
    // VAIHE 3: Muokkaa tuntirivi (tai lisää jos ei ole)
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
        $response['debug_added_hourly_row'] = true;
    }
    $response['debug_hourly_row_found'] = $hourlyRowFound;
    
    // VAIHE 4: Tallenna muokattu laskelma (updateRows=false säilyttää rivit)
    $saveResponse = salaxyRequest('POST', '/calculations/update-from-employment?save=true&updateRows=false', $calcObject);
    $response['saveResponse'] = $saveResponse;
    
    // Käytä tallennettua ID:tä (voi olla sama tai uusi)
    $finalCalcId = $saveResponse['data']['id'] ?? $calculationId;
    
    // VAIHE 5: Liitä palkkalistaan
    $addCalcResponse = salaxyRequest('POST', '/payroll/' . $payrollId . '/add-calc?ids=' . $finalCalcId, null);
    $response['addCalcResponse'] = $addCalcResponse;
    $response['finalCalculationId'] = $finalCalcId;
    
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

if (empty($entries)) {
    http_response_code(400);
    echo json_encode(['message' => 'Ei lähetettäviä tunteja']);
    exit;
}

// Hae tai luo tämän päivän luonnos
$draft = getOrCreateTodaysDraft();

if (!$draft) {
    http_response_code(500);
    echo json_encode([
        'message' => 'Palkkalistan luonnoksen luonti epäonnistui',
        'debug' => $lastApiError
    ]);
    exit;
}

$payrollId = $draft['payrollId'];
$results = [];
$errors = [];

// Lisää jokainen tuntikirjaus palkkalistalle
foreach ($entries as $entry) {
    $response = addHourlyWageRow($payrollId, $entry);
    
    // Tarkista onko calculation luotu onnistuneesti (on id)
    // Huom: update-from-employment palauttaa täyden calculation-objektin, jossa on id
    $calcId = $response['data']['id'] ?? 
              $response['updateFromEmployment']['data']['id'] ?? 
              null;
    $calculationCreated = $calcId !== null;
    
    // Debug: näytä mitä saimme
    $debugInfo = [
        'response_success' => $response['success'],
        'response_httpCode' => $response['httpCode'] ?? 'N/A',
        'data_has_id' => isset($response['data']['id']),
        'update_has_id' => isset($response['updateFromEmployment']['data']['id']),
        'calcId' => $calcId
    ];
    
    if ($response['success'] || $calculationCreated) {
        $results[] = [
            'date' => $entry['date'],
            'hours' => $entry['hours'],
            'project' => $entry['project'] ?? '',
            'status' => 'ok',
            'calculationId' => $calcId,
            'addCalcStatus' => $response['saveCalcsResponse']['success'] ?? 'unknown',
            'debugInfo' => $debugInfo,
            'getResponse' => $response['getResponse'] ?? 'not set',
            'saveResponse' => $response['saveResponse'] ?? 'not set',
            'debug_existing_rows' => $response['debug_existing_rows'] ?? 'not set',
            'debug_hours_to_set' => $response['debug_hours_to_set'] ?? 'not set',
            'debug_hourly_row_found' => $response['debug_hourly_row_found'] ?? false,
            'debug_modified_row' => $response['debug_modified_row'] ?? 'not set',
            'debug_rows_to_save' => $response['debug_rows_to_save'] ?? 'not set',
            'debug_get_failed' => $response['debug_get_failed'] ?? false
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
    'draftDate' => $draft['createdDate'],
    'success' => $results,
    'errors' => $errors,
    'totalSent' => count($results),
    'totalFailed' => count($errors)
]);
