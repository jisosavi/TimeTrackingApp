<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$sup = requireSupervisor();
$db  = getCompanyDb((int) $sup['company_id']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        'SELECT e.id, e.name, e.email, e.phone, e.birth_year
         FROM employees e
         JOIN supervisor_employees se ON se.employee_id = e.id
         WHERE se.supervisor_id = :sid AND e.company_id = :cid AND e.active = 1
         ORDER BY e.name ASC'
    );
    $stmt->execute([':sid' => $sup['id'], ':cid' => $sup['company_id']]);
    sendJson(['success' => true, 'members' => $stmt->fetchAll()]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
