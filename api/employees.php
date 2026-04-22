<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$admin = requireAdmin();
$db = getDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        "SELECT e.id, e.name, e.pin, e.ssn, e.salaxy_employment_id AS employmentId, e.active, e.ui_language,
                e.email, e.phone, e.birth_year,
           COALESCE((
             SELECT ROUND(SUM(te.hours), 1)
             FROM time_entries te
             WHERE te.employee_id = e.id
               AND te.status IN ('pending', 'clarified')
           ), 0) AS pending_hours,
           COALESCE((
             SELECT ROUND(SUM(te.km), 1)
             FROM time_entries te
             WHERE te.employee_id = e.id
               AND te.status IN ('pending', 'clarified')
           ), 0) AS pending_km,
           COALESCE((
             SELECT ROUND(SUM(te.hours), 1)
             FROM time_entries te
             WHERE te.employee_id = e.id
               AND te.status = 'approved'
               AND strftime('%Y-%m', te.entry_date) = strftime('%Y-%m', 'now')
           ), 0) AS hours_this_period,
           (
             SELECT te.entry_date
             FROM time_entries te
             WHERE te.employee_id = e.id
             ORDER BY te.entry_date DESC, te.submitted_at DESC
             LIMIT 1
           ) AS last_entry_at
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
    $email     = trim((string) ($payload['email'] ?? ''));
    $phone     = trim((string) ($payload['phone'] ?? ''));
    $birthYearRaw = $payload['birth_year'] ?? null;
    $birthYear = ($birthYearRaw !== null && $birthYearRaw !== '') ? (int) $birthYearRaw : null;
    $active          = isset($payload['active']) ? (int) $payload['active'] : 1;
    $langProvided    = array_key_exists('ui_language', $payload);
    $uiLanguage      = $langProvided ? trim((string) $payload['ui_language']) : null;
    if ($uiLanguage !== null && $uiLanguage !== '' && !in_array($uiLanguage, ['en', 'fi', 'sv', 'et', 'uk', 'xh'], true)) {
        $uiLanguage = null; $langProvided = false;
    }
    if ($uiLanguage === '') $uiLanguage = null; // empty = clear override

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
        $uiLangExpr = $langProvided ? ':ui_language' : 'COALESCE(:ui_language, ui_language)';
        $stmt = $db->prepare(
            "UPDATE employees
             SET name = :name, pin = :pin, ssn = :ssn, salaxy_employment_id = :employmentId,
                 active = :active, ui_language = {$uiLangExpr},
                 email = :email, phone = :phone, birth_year = :birth_year
             WHERE id = :id AND company_id = :company_id"
        );
        $stmt->execute([
            ':name' => $name,
            ':pin' => $pin,
            ':ssn' => $ssn,
            ':employmentId' => $employmentId,
            ':active' => $active,
            ':ui_language' => $uiLanguage,
            ':email' => $email ?: null,
            ':phone' => $phone ?: null,
            ':birth_year' => $birthYear,
            ':id' => $id,
            ':company_id' => $admin['company_id'],
        ]);
    } else {
        $stmt = $db->prepare(
            'INSERT INTO employees (company_id, pin, name, ssn, salaxy_employment_id, role, active, ui_language, email, phone, birth_year)
             VALUES (:company_id, :pin, :name, :ssn, :employmentId, :role, :active, :ui_language, :email, :phone, :birth_year)'
        );
        $stmt->execute([
            ':company_id' => $admin['company_id'],
            ':pin' => $pin,
            ':name' => $name,
            ':ssn' => $ssn,
            ':employmentId' => $employmentId,
            ':role' => 'employee',
            ':active' => $active,
            ':ui_language' => $uiLanguage,
            ':email' => $email ?: null,
            ':phone' => $phone ?: null,
            ':birth_year' => $birthYear,
        ]);
        $id = (int) $db->lastInsertId();
    }

    $stmt = $db->prepare(
        'SELECT id, name, pin, ssn, salaxy_employment_id AS employmentId, active, ui_language, email, phone, birth_year
         FROM employees
         WHERE id = :id AND company_id = :company_id'
    );
    $stmt->execute([':id' => $id, ':company_id' => $admin['company_id']]);
    $employee = $stmt->fetch();

    sendJson(['success' => true, 'employee' => $employee]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
