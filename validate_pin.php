<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['pin'])) {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN puuttuu']);
    exit;
}

$pin = trim((string) $payload['pin']);
if ($pin === '') {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN on tyhjä']);
    exit;
}

try {
    $db = getDb();
    $stmt = $db->prepare(
        'SELECT id, name, ssn, salaxy_employment_id AS employmentId
         FROM employees
         WHERE pin = :pin AND active = 1
         LIMIT 1'
    );
    $stmt->execute([':pin' => $pin]);
    $employee = $stmt->fetch();

    if ($employee) {
        echo json_encode([
            'valid' => true,
            'name' => $employee['name'],
            'employmentId' => $employee['employmentId'] ?? null,
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['valid' => false, 'error' => 'Väärä PIN']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['valid' => false, 'error' => 'Palvelinvirhe']);
}

