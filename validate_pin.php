<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/api/cors.php';
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/api/jwt.php';

$raw     = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['pin'])) {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN puuttuu']);
    exit;
}

$pin  = trim((string) $payload['pin']);
$slug = trim((string) ($payload['slug'] ?? ''));

if ($pin === '') {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN on tyhjä']);
    exit;
}

try {
    $db = getDb();

    if ($slug !== '') {
        $stmt = $db->prepare(
            'SELECT e.id, e.name, e.ssn, e.salaxy_employment_id AS employmentId, e.company_id AS companyId
             FROM employees e
             JOIN companies c ON c.id = e.company_id
             WHERE e.pin = :pin AND e.active = 1 AND c.slug = :slug
             LIMIT 1'
        );
        $stmt->execute([':pin' => $pin, ':slug' => $slug]);
    } else {
        $stmt = $db->prepare(
            'SELECT id, name, ssn, salaxy_employment_id AS employmentId, company_id AS companyId
             FROM employees
             WHERE pin = :pin AND active = 1
             LIMIT 1'
        );
        $stmt->execute([':pin' => $pin]);
    }

    $employee = $stmt->fetch();

    if ($employee) {
        $empRow = $db->prepare('SELECT ui_language FROM employees WHERE id = :id LIMIT 1');
        $empRow->execute([':id' => (int) $employee['id']]);
        $empData = $empRow->fetch();
        $empLang = ($empData && $empData['ui_language']) ? $empData['ui_language'] : null;

        $compRow = $db->prepare('SELECT ui_language FROM companies WHERE id = :id LIMIT 1');
        $compRow->execute([':id' => (int) $employee['companyId']]);
        $compData      = $compRow->fetch();
        $compLang      = ($compData && $compData['ui_language']) ? $compData['ui_language'] : 'en';
        $effectiveLang = $empLang ?: $compLang;

        $token = generateToken((int) $employee['id'], 'employee', (int) $employee['companyId']);

        echo json_encode([
            'valid'        => true,
            'token'        => $token,
            'id'           => (int) $employee['id'],
            'name'         => $employee['name'],
            'companyId'    => (int) $employee['companyId'],
            'employmentId' => $employee['employmentId'] ?? null,
            'ui_language'  => $effectiveLang,
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['valid' => false, 'error' => 'Väärä PIN']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['valid' => false, 'error' => 'Palvelinvirhe']);
}
