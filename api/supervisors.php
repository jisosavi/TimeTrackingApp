<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$admin = requireAdmin();
$db    = getDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        'SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.pin, s.ssn, s.salaxy_id, s.active, s.ui_language,
                COUNT(se.employee_id) AS team_size
         FROM supervisors s
         LEFT JOIN supervisor_employees se ON se.supervisor_id = s.id
         WHERE s.company_id = :company_id
         GROUP BY s.id
         ORDER BY s.last_name ASC, s.first_name ASC'
    );
    $stmt->execute([':company_id' => $admin['company_id']]);
    sendJson(['success' => true, 'supervisors' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload   = getJsonPayload();
    $id        = isset($payload['id']) ? (int) $payload['id'] : null;
    $firstName = trim((string) ($payload['first_name'] ?? ''));
    $lastName  = trim((string) ($payload['last_name'] ?? ''));
    $email     = trim((string) ($payload['email'] ?? ''));
    $phone     = trim((string) ($payload['phone'] ?? ''));
    $pin       = trim((string) ($payload['pin'] ?? ''));
    $ssn       = trim((string) ($payload['ssn'] ?? ''));
    $salaxyId  = trim((string) ($payload['salaxy_id'] ?? ''));
    $active     = isset($payload['active']) ? (int) $payload['active'] : 1;
    $langProvided = array_key_exists('ui_language', $payload);
    $uiLanguage   = $langProvided ? trim((string) $payload['ui_language']) : null;
    if ($uiLanguage !== null && $uiLanguage !== '' && !in_array($uiLanguage, ['en', 'fi', 'sv', 'et', 'uk'], true)) {
        $uiLanguage = null; $langProvided = false;
    }
    if ($uiLanguage === '') $uiLanguage = null; // empty = clear override

    if (!$firstName || !$lastName || !$email || !$phone) {
        sendJson(['success' => false, 'error' => 'Etunimi, sukunimi, email ja puhelin ovat pakollisia.'], 400);
    }

    // PIN required for new supervisors
    if (!$id && $pin === '') {
        sendJson(['success' => false, 'error' => 'PIN on pakollinen uudelle esihenkilölle.'], 400);
    }

    if ($pin !== '' && !preg_match('/^\d{3,6}$/', $pin)) {
        sendJson(['success' => false, 'error' => 'PIN-koodin on oltava 3–6 numeroa.'], 400);
    }

    if ($pin !== '') {
        // Check uniqueness across supervisors in the same company
        $supQuery = 'SELECT id FROM supervisors WHERE pin = :pin AND company_id = :cid';
        if ($id) $supQuery .= ' AND id != :id';
        $supStmt = $db->prepare($supQuery);
        $supParams = [':pin' => $pin, ':cid' => $admin['company_id']];
        if ($id) $supParams[':id'] = $id;
        $supStmt->execute($supParams);
        if ($supStmt->fetch()) {
            sendJson(['success' => false, 'error' => 'Tämä PIN on jo käytössä toisella esihenkilöllä.'], 409);
        }

        // Check uniqueness across employees in the same company
        $empStmt = $db->prepare('SELECT id FROM employees WHERE pin = :pin AND company_id = :cid');
        $empStmt->execute([':pin' => $pin, ':cid' => $admin['company_id']]);
        if ($empStmt->fetch()) {
            sendJson(['success' => false, 'error' => 'Tämä PIN on jo käytössä työntekijällä.'], 409);
        }
    }

    if ($id) {
        // Fetch current PIN if not changing
        if ($pin === '') {
            $cur  = $db->prepare('SELECT pin FROM supervisors WHERE id = :id AND company_id = :cid');
            $cur->execute([':id' => $id, ':cid' => $admin['company_id']]);
            $row = $cur->fetch();
            $pin = $row ? $row['pin'] : '';
        }

        $uiLangExpr = $langProvided ? ':ui_language' : 'COALESCE(:ui_language, ui_language)';
        $db->prepare(
            "UPDATE supervisors SET first_name=:fn, last_name=:ln, email=:email, phone=:phone,
             pin=:pin, ssn=:ssn, salaxy_id=:salaxy_id, active=:active,
             ui_language={$uiLangExpr}
             WHERE id=:id AND company_id=:cid"
        )->execute([
            ':fn' => $firstName, ':ln' => $lastName, ':email' => $email,
            ':phone' => $phone, ':pin' => $pin, ':ssn' => $ssn,
            ':salaxy_id' => $salaxyId, ':active' => $active,
            ':ui_language' => $uiLanguage,
            ':id' => $id, ':cid' => $admin['company_id'],
        ]);
    } else {
        $db->prepare(
            'INSERT INTO supervisors (company_id, first_name, last_name, email, phone, pin, ssn, salaxy_id, active, ui_language)
             VALUES (:cid, :fn, :ln, :email, :phone, :pin, :ssn, :salaxy_id, :active, :ui_language)'
        )->execute([
            ':cid' => $admin['company_id'], ':fn' => $firstName, ':ln' => $lastName,
            ':email' => $email, ':phone' => $phone, ':pin' => $pin,
            ':ssn' => $ssn, ':salaxy_id' => $salaxyId, ':active' => $active,
            ':ui_language' => $uiLanguage,
        ]);
        $id = (int) $db->lastInsertId();
    }

    $stmt = $db->prepare('SELECT * FROM supervisors WHERE id = :id');
    $stmt->execute([':id' => $id]);
    sendJson(['success' => true, 'supervisor' => $stmt->fetch()]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $payload = getJsonPayload();
    $id      = isset($payload['id']) ? (int) $payload['id'] : null;
    if (!$id) sendJson(['success' => false, 'error' => 'id vaaditaan'], 400);

    $db->prepare('DELETE FROM supervisor_employees WHERE supervisor_id = :id')->execute([':id' => $id]);
    $db->prepare('DELETE FROM supervisors WHERE id = :id AND company_id = :cid')
       ->execute([':id' => $id, ':cid' => $admin['company_id']]);

    sendJson(['success' => true]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
