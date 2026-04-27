<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/api/cors.php';
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/api/jwt.php';
require_once __DIR__ . '/api/pin_rate_limit.php';

$raw     = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['pin'])) {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN puuttuu']);
    exit;
}

$pin      = trim((string) $payload['pin']);
$slug     = trim((string) ($payload['slug'] ?? ''));
$deviceId = trim((string) ($payload['device_id'] ?? ''));

if ($pin === '') {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN on tyhjä']);
    exit;
}

try {
    // Resolve company from master DB
    $masterDb  = getMasterDb();
    $companyId = null;
    if ($slug !== '') {
        $compStmt = $masterDb->prepare('SELECT id FROM companies WHERE slug = :slug AND active = 1 LIMIT 1');
        $compStmt->execute([':slug' => $slug]);
        $company = $compStmt->fetch();
        if ($company) {
            $companyId = (int) $company['id'];
        }
    }

    $companyDb = $companyId !== null ? getCompanyDb($companyId) : null;

    // Check device rate limit before doing anything else
    if ($deviceId !== '' && $companyId !== null && $companyDb) {
        $rl = checkPinRateLimit($companyDb, $deviceId, $companyId);
        if (isset($rl['error'])) {
            http_response_code(429);
            echo json_encode(['valid' => false, 'lockout' => $rl['error']] + $rl);
            exit;
        }
    }

    $pinHash = hashPin($pin);

    // Look up employee in company DB
    if ($companyDb) {
        $stmt = $companyDb->prepare(
            'SELECT id, name, ssn, pin_locked,
                    salaxy_employment_id AS employmentId, company_id AS companyId
             FROM employees
             WHERE pin = :pin AND active = 1
             LIMIT 1'
        );
        $stmt->execute([':pin' => $pinHash]);
    } else {
        http_response_code(400);
        echo json_encode(['valid' => false, 'error' => 'Company not found']);
        exit;
    }

    $employee = $stmt->fetch();

    if ($employee) {
        // Correct PIN — check if account is locked
        if ((int) $employee['pin_locked'] === 1) {
            http_response_code(403);
            echo json_encode(['valid' => false, 'lockout' => 'locked']);
            exit;
        }

        // Success — reset rate limit
        if ($deviceId !== '' && $companyId !== null) {
            recordPinSuccess($companyDb, $deviceId, $companyId, (int) $employee['id'], 'employee');
        }

        $empRow = $companyDb->prepare('SELECT ui_language FROM employees WHERE id = :id LIMIT 1');
        $empRow->execute([':id' => (int) $employee['id']]);
        $empData = $empRow->fetch();
        $empLang = ($empData && $empData['ui_language']) ? $empData['ui_language'] : null;

        $compRow = $masterDb->prepare('SELECT ui_language FROM companies WHERE id = :id LIMIT 1');
        $compRow->execute([':id' => $companyId]);
        $compData      = $compRow->fetch();
        $compLang      = ($compData && $compData['ui_language']) ? $compData['ui_language'] : 'en';
        $effectiveLang = $empLang ?: $compLang;

        $token = generateToken((int) $employee['id'], 'employee', $companyId);

        echo json_encode([
            'valid'        => true,
            'token'        => $token,
            'id'           => (int) $employee['id'],
            'name'         => $employee['name'],
            'companyId'    => $companyId,
            'employmentId' => $employee['employmentId'] ?? null,
            'ui_language'  => $effectiveLang,
        ]);
    } else {
        // Wrong PIN — record failure
        $result = ['valid' => false, 'error' => 'Väärä PIN'];
        if ($deviceId !== '' && $companyId !== null && $companyDb) {
            $rl = recordPinFailure($companyDb, $deviceId, $companyId);
            if (isset($rl['error'])) {
                http_response_code(429);
                echo json_encode(['valid' => false, 'lockout' => $rl['error']] + $rl);
                exit;
            }
            $result['attempts_remaining'] = $rl['attempts_remaining'];
        }
        http_response_code(401);
        echo json_encode($result);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['valid' => false, 'error' => 'Palvelinvirhe']);
}
