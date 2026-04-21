<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php'; // cors + bootstrap (→ config.php) + jwt

$admin     = requireAdmin();
$companyId = (int) $admin['company_id'];
$db        = getDb();

function getSalaxyAccessToken(): ?string {
    $tokenFile = __DIR__ . '/../data/salaxy_token.json';

    if (file_exists($tokenFile)) {
        $cached = json_decode(file_get_contents($tokenFile), true);
        if (isset($cached['access_token'], $cached['fetched_at'])) {
            if (time() - $cached['fetched_at'] < 23 * 3600) {
                return $cached['access_token'];
            }
        }
    }

    $ch = curl_init(SALAXY_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode([
            'grant_type' => 'password',
            'username'   => SALAXY_USERNAME,
            'password'   => SALAXY_PASSWORD,
        ]),
        CURLOPT_TIMEOUT        => 30,
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

    $dataDir = dirname($tokenFile);
    if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
    file_put_contents($tokenFile, json_encode([
        'access_token' => $data['access_token'],
        'fetched_at'   => time(),
    ]));

    return $data['access_token'];
}

function salaxyRequest(string $method, string $endpoint): array {
    $token = getSalaxyAccessToken();
    if (!$token) {
        return ['success' => false, 'error' => 'Failed to get Salaxy access token'];
    }

    $ch = curl_init(SALAXY_API_URL . $endpoint);
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

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) return ['success' => false, 'error' => $error];

    return [
        'success'  => $httpCode >= 200 && $httpCode < 300,
        'httpCode' => $httpCode,
        'data'     => json_decode($response, true),
    ];
}

function getEmployeesFromSalaxy(): array {
    $response = salaxyRequest('GET', '/employments');
    if (!$response['success']) return [];

    $data = $response['data'];
    if (!is_array($data)) return [];

    if (!isset($data['items']) || !is_array($data['items'])) return [];

    $employees = [];
    foreach ($data['items'] as $item) {
        if (!isset($item['otherPartyInfo'])) continue;
        $op = $item['otherPartyInfo'];
        $av = $op['avatar'] ?? [];
        $employees[] = [
            'id'           => $item['id'] ?? null,
            'firstName'    => $av['firstName'] ?? '',
            'lastName'     => $av['lastName'] ?? '',
            'employmentId' => $item['id'] ?? null,
            'ssn'          => $item['otherId'] ?? $op['officialId'] ?? null,
        ];
    }
    return $employees;
}

try {
    $salaxyEmployees = getEmployeesFromSalaxy();

    if (empty($salaxyEmployees)) {
        sendJson(['success' => true, 'message' => 'No employees found in Salaxy', 'added' => 0, 'updated' => 0, 'total' => 0]);
    }

    $added   = 0;
    $updated = 0;

    foreach ($salaxyEmployees as $emp) {
        if (!isset($emp['id'])) continue;

        $empId    = $emp['id'];
        $fullName = trim(($emp['firstName'] ?? '') . ' ' . ($emp['lastName'] ?? ''));
        $ssn      = $emp['ssn'] ?? '';
        if (!$fullName) continue;

        $stmt = $db->prepare(
            'SELECT id, name FROM employees WHERE company_id = :cid AND salaxy_employment_id = :sid'
        );
        $stmt->execute([':cid' => $companyId, ':sid' => $empId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $db->prepare(
                'UPDATE employees SET name = :name, ssn = COALESCE(:ssn, ssn), salaxy_employment_id = :sid WHERE id = :id'
            )->execute([':name' => $fullName, ':ssn' => $ssn ?: null, ':sid' => $empId, ':id' => $existing['id']]);
            $updated++;
        } else {
            $byName = $db->prepare(
                'SELECT id FROM employees WHERE company_id = :cid AND name = :name LIMIT 1'
            );
            $byName->execute([':cid' => $companyId, ':name' => $fullName]);
            $nameMatch = $byName->fetch();
            if ($nameMatch) {
                $db->prepare(
                    'UPDATE employees SET salaxy_employment_id = :sid, ssn = COALESCE(:ssn, ssn) WHERE id = :id'
                )->execute([':sid' => $empId, ':ssn' => $ssn ?: null, ':id' => $nameMatch['id']]);
                $updated++;
                continue;
            }

            do {
                $pin     = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $pinChk  = $db->prepare('SELECT id FROM employees WHERE company_id = :cid AND pin = :pin');
                $pinChk->execute([':cid' => $companyId, ':pin' => $pin]);
            } while ($pinChk->fetch());

            $db->prepare(
                'INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active)
                 VALUES (:cid, :pin, :name, :ssn, :sid, :role, 1)'
            )->execute([
                ':cid'  => $companyId,
                ':pin'  => $pin,
                ':name' => $fullName,
                ':ssn'  => $ssn ?: null,
                ':sid'  => $empId,
                ':role' => 'employee',
            ]);
            $added++;
        }
    }

    sendJson([
        'success' => true,
        'added'   => $added,
        'updated' => $updated,
        'total'   => count($salaxyEmployees),
    ]);
} catch (Throwable $e) {
    error_log('Sync employees error: ' . $e->getMessage());
    sendJson(['success' => false, 'error' => $e->getMessage()], 500);
}
