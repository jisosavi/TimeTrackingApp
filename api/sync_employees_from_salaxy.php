<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../config.php';

try {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

/**
 * Hae Salaxy access token
 */
function getSalaxyAccessToken(): ?string {
    $tokenFile = __DIR__ . '/../data/salaxy_token.json';
    
    if (file_exists($tokenFile)) {
        $cached = json_decode(file_get_contents($tokenFile), true);
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
        error_log("Salaxy token fetch failed: HTTP $httpCode");
        return null;
    }
    
    $data = json_decode($response, true);
    if (!isset($data['access_token'])) {
        error_log("Salaxy token fetch: no access_token in response");
        return null;
    }
    
    $cacheData = [
        'access_token' => $data['access_token'],
        'token_type' => $data['token_type'] ?? 'Bearer',
        'fetched_at' => time()
    ];
    
    $dataDir = dirname($tokenFile);
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0775, true);
    }
    file_put_contents($tokenFile, json_encode($cacheData, JSON_PRETTY_PRINT));
    
    return $data['access_token'];
}

/**
 * Tee API-kutsu Salaxyyn
 */
function salaxyRequest(string $method, string $endpoint): array {
    $token = getSalaxyAccessToken();
    if (!$token) {
        return ['success' => false, 'error' => 'Failed to get Salaxy access token'];
    }
    
    $url = SALAXY_API_URL . $endpoint;
    
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
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['success' => false, 'error' => $error];
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
 * Hae kaikki työntekijät Salaxyn rajapinnasta
 */
function getEmployeesFromSalaxy(): array {
    $response = salaxyRequest('GET', '/employments');
    
    if (!$response['success']) {
        error_log("Failed to fetch employees from Salaxy: " . json_encode($response));
        return [];
    }
    
    $data = $response['data'];
    
    if (!is_array($data)) {
        return [];
    }
    
    // Salaxy palauttaa items-taulukon employment-objekteista
    if (isset($data['items']) && is_array($data['items'])) {
        $employees = [];
        foreach ($data['items'] as $item) {
            if (isset($item['otherPartyInfo'])) {
                $otherParty = $item['otherPartyInfo'];
                $avatar = $otherParty['avatar'] ?? [];
                $employees[] = [
                    'id' => $item['id'] ?? $item['otherId'] ?? null,
                    'firstName' => $avatar['firstName'] ?? '',
                    'lastName' => $avatar['lastName'] ?? '',
                    'employmentId' => $item['id'] ?? $item['otherId'] ?? null,
                    'ssn' => $item['otherId'] ?? $otherParty['officialId'] ?? null,
                ];
            }
        }
        return $employees;
    }
    
    return [];
}

// Päälogiikka
// Tarkista että käyttäjä on kirjautunut admin TAI käyttää API-avainta
if (!isset($_SESSION['admin_id'])) {
    // Tarkista API-avain
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (!$apiKey || $apiKey !== APP_KEY) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        exit;
    }
    // API-avain kelpaa, mutta tarvitaan company_id. Käytä Salaxy-konfiguraation config.php:stä
    $adminId = null;
} else {
    $adminId = (int) $_SESSION['admin_id'];
}

$db = getDb();

if ($adminId) {
    // Session-based auth
    $stmt = $db->prepare('SELECT company_id FROM company_admins WHERE id = :id');
    $stmt->execute([':id' => $adminId]);
    $admin = $stmt->fetch();
    
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Admin not found']);
        exit;
    }
    
    $companyId = (int) $admin['company_id'];
} else {
    // API-key auth - use default company (usually ID 1)
    $companyId = 1;
}

// Hae työntekijät Salaxyn rajapinnasta
$salaxyEmployees = getEmployeesFromSalaxy();

if (empty($salaxyEmployees)) {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'No employees found in Salaxy', 'synced' => 0, 'total' => 0]);
    exit;
}

// Synkronoi ne local-tietokantaan
$added = 0;
$updated = 0;

foreach ($salaxyEmployees as $emp) {
    if (!isset($emp['id'])) {
        continue;
    }

    $empId = $emp['id'];
    $firstName = $emp['firstName'] ?? '';
    $lastName = $emp['lastName'] ?? '';
    $fullName = trim($firstName . ' ' . $lastName);
    $ssn = $emp['ssn'] ?? '';

    if (!$fullName) {
        continue;
    }

    // Tarkista onko jo olemassa
    $stmt = $db->prepare(
        'SELECT id, name FROM employees WHERE company_id = :company_id AND salaxy_employment_id = :salaxy_id'
    );
    $stmt->execute([':company_id' => $companyId, ':salaxy_id' => $empId]);
    $existing = $stmt->fetch();

    if ($existing) {
        // Found by employment ID — sync name if changed
        if ($existing['name'] !== $fullName) {
            $db->prepare('UPDATE employees SET name = :name WHERE id = :id')
               ->execute([':name' => $fullName, ':id' => $existing['id']]);
            $updated++;
        }
    } else {
        // Skip if an employee with the same name already exists — prevents duplicates
        // when Salaxy has multiple employment records for the same person.
        // Never overwrite an existing employee's salaxy_employment_id via sync.
        $byName = $db->prepare(
            'SELECT id FROM employees WHERE company_id = :company_id AND name = :name LIMIT 1'
        );
        $byName->execute([':company_id' => $companyId, ':name' => $fullName]);
        if ($byName->fetch()) {
            continue;
        }

        // Generate a unique random 6-digit PIN for this company
        do {
            $pin = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $pinCheck = $db->prepare('SELECT id FROM employees WHERE company_id = :company_id AND pin = :pin');
            $pinCheck->execute([':company_id' => $companyId, ':pin' => $pin]);
        } while ($pinCheck->fetch());

        $db->prepare(
            'INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active)
             VALUES (:company_id, :pin, :name, :ssn, :salaxy_id, :role, 1)'
        )->execute([
            ':company_id' => $companyId,
            ':pin'        => $pin,
            ':name'       => $fullName,
            ':ssn'        => $ssn ?: null,
            ':salaxy_id'  => $empId,
            ':role'       => 'employee',
        ]);
        $added++;
    }
}

http_response_code(200);
echo json_encode([
    'success' => true,
    'added'   => $added,
    'updated' => $updated,
    'total'   => count($salaxyEmployees),
]);
} catch (Throwable $e) {
    error_log('Sync employees error: ' . $e->getMessage() . ' - ' . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
