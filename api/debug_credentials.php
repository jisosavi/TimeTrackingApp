<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../bootstrap.php';

try {
    $db = getDb();

    $admins = $db->query(
        'SELECT c.name AS company, c.slug, a.email
         FROM company_admins a
         JOIN companies c ON c.id = a.company_id
         WHERE a.active = 1
         ORDER BY c.slug, a.email'
    )->fetchAll();

    $employees = $db->query(
        'SELECT c.name AS company, c.slug, e.name
         FROM employees e
         JOIN companies c ON c.id = e.company_id
         WHERE e.active = 1
         ORDER BY c.slug, e.name'
    )->fetchAll();

    $supervisors = $db->query(
        'SELECT c.name AS company, c.slug, s.first_name, s.last_name
         FROM supervisors s
         JOIN companies c ON c.id = s.company_id
         WHERE s.active = 1
         ORDER BY c.slug, s.last_name'
    )->fetchAll();

    echo json_encode(['admins' => $admins, 'employees' => $employees, 'supervisors' => $supervisors]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
