<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$admin = requireAdmin();
$db = getDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        "SELECT e.id, e.name, e.pin, e.ssn, e.salaxy_employment_id AS employmentId, e.active,
           COALESCE((
             SELECT ROUND(SUM(te.hours), 1)
             FROM time_entries te
             WHERE te.employee_id = e.id
               AND te.status IN ('pending', 'clarified')
           ), 0) AS pending_hours
         FROM employees e
         WHERE e.company_id = :company_id
         ORDER BY e.name ASC"
    );
    $stmt->execute([':company_id' => $admin['company_id']]);
    $employees = $stmt->fetchAll();

    sendJson(['success' => true, 'employees' => $employees]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = getJsonPayload();
    $id = isset($payload['id']) ? (int) $payload['id'] : null;
    $name = trim((string) ($payload['name'] ?? ''));
    $pin = trim((string) ($payload['pin'] ?? ''));
    $ssn = trim((string) ($payload['ssn'] ?? ''));
    $employmentId = trim((string) ($payload['employmentId'] ?? ''));
    $active = isset($payload['active']) ? (int) $payload['active'] : 1;

    // If updating an existing employee with only PIN, fetch current data
    if ($id && $name === '' && $pin !== '') {
        $stmt = $db->prepare(
            'SELECT name, ssn, salaxy_employment_id, active
             FROM employees
             WHERE id = :id AND company_id = :company_id'
        );
        $stmt->execute([':id' => $id, ':company_id' => $admin['company_id']]);
        $existing = $stmt->fetch();
        if ($existing) {
            $name = $existing['name'];
            $ssn = $existing['ssn'] ?? '';
            $employmentId = $existing['salaxy_employment_id'] ?? '';
            $active = (int) $existing['active'];
        }
    }

    if ($name === '' || $pin === '') {
        sendJson(['success' => false, 'error' => 'Nimi ja PIN ovat pakollisia.'], 400);
    }

    if (!preg_match('/^\d{3,6}$/', $pin)) {
        sendJson(['success' => false, 'error' => 'PIN-koodin on oltava 3–6 numeroa.'], 400);
    }

    $uniqueQuery = 'SELECT id FROM employees WHERE pin = :pin AND company_id = :company_id';
    if ($id) {
        $uniqueQuery .= ' AND id != :id';
    }

    $stmt = $db->prepare($uniqueQuery);
    $params = [':pin' => $pin, ':company_id' => $admin['company_id']];
    if ($id) {
        $params[':id'] = $id;
    }
    $stmt->execute($params);
    $existing = $stmt->fetch();
    if ($existing) {
        sendJson(['success' => false, 'error' => 'Tämä PIN on jo käytössä.'], 409);
    }

    if ($id) {
        $stmt = $db->prepare(
            'UPDATE employees
             SET name = :name, pin = :pin, ssn = :ssn, salaxy_employment_id = :employmentId, active = :active
             WHERE id = :id AND company_id = :company_id'
        );
        $stmt->execute([
            ':name' => $name,
            ':pin' => $pin,
            ':ssn' => $ssn,
            ':employmentId' => $employmentId,
            ':active' => $active,
            ':id' => $id,
            ':company_id' => $admin['company_id'],
        ]);
    } else {
        $stmt = $db->prepare(
            'INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active)
             VALUES (:company_id, :pin, :name, :ssn, :employmentId, :role, :active)'
        );
        $stmt->execute([
            ':company_id' => $admin['company_id'],
            ':pin' => $pin,
            ':name' => $name,
            ':ssn' => $ssn,
            ':employmentId' => $employmentId,
            ':role' => 'employee',
            ':active' => $active,
        ]);
        $id = (int) $db->lastInsertId();
    }

    $stmt = $db->prepare(
        'SELECT id, name, pin, ssn, salaxy_employment_id AS employmentId, active
         FROM employees
         WHERE id = :id AND company_id = :company_id'
    );
    $stmt->execute([':id' => $id, ':company_id' => $admin['company_id']]);
    $employee = $stmt->fetch();

    sendJson(['success' => true, 'employee' => $employee]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
