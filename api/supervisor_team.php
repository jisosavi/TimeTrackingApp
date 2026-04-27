<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$admin = requireAdmin();
$db    = getCompanyDb((int) $admin['company_id']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $supervisorId = isset($_GET['supervisor_id']) ? (int) $_GET['supervisor_id'] : 0;

    if (!$supervisorId) sendJson(['success' => false, 'error' => 'supervisor_id vaaditaan'], 400);

    // Verify supervisor belongs to this company
    $chk = $db->prepare('SELECT id FROM supervisors WHERE id = :id AND company_id = :cid');
    $chk->execute([':id' => $supervisorId, ':cid' => $admin['company_id']]);
    if (!$chk->fetch()) sendJson(['success' => false, 'error' => 'Esihenkilöä ei löydy'], 404);

    // All employees with flag: in_team and other_supervisors list
    $stmt = $db->prepare(
        'SELECT e.id, e.name,
                CASE WHEN se.employee_id IS NOT NULL THEN 1 ELSE 0 END AS in_team,
                (SELECT GROUP_CONCAT(s2.first_name || " " || s2.last_name, ", ")
                 FROM supervisor_employees se2
                 JOIN supervisors s2 ON s2.id = se2.supervisor_id
                 WHERE se2.employee_id = e.id AND se2.supervisor_id != :sid) AS other_supervisors
         FROM employees e
         LEFT JOIN supervisor_employees se ON se.employee_id = e.id AND se.supervisor_id = :sid2
         WHERE e.company_id = :cid AND e.active = 1
         ORDER BY e.name ASC'
    );
    $stmt->execute([':sid' => $supervisorId, ':sid2' => $supervisorId, ':cid' => $admin['company_id']]);
    sendJson(['success' => true, 'employees' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload      = getJsonPayload();
    $supervisorId = isset($payload['supervisor_id']) ? (int) $payload['supervisor_id'] : 0;
    $employeeIds  = array_map('intval', (array) ($payload['employee_ids'] ?? []));

    if (!$supervisorId) sendJson(['success' => false, 'error' => 'supervisor_id vaaditaan'], 400);

    // Verify supervisor
    $chk = $db->prepare('SELECT id FROM supervisors WHERE id = :id AND company_id = :cid');
    $chk->execute([':id' => $supervisorId, ':cid' => $admin['company_id']]);
    if (!$chk->fetch()) sendJson(['success' => false, 'error' => 'Esihenkilöä ei löydy'], 404);

    // Replace team
    $db->prepare('DELETE FROM supervisor_employees WHERE supervisor_id = :sid')
       ->execute([':sid' => $supervisorId]);

    if (!empty($employeeIds)) {
        $ins = $db->prepare(
            'INSERT OR IGNORE INTO supervisor_employees (supervisor_id, employee_id) VALUES (:sid, :eid)'
        );
        foreach ($employeeIds as $eid) {
            $ins->execute([':sid' => $supervisorId, ':eid' => $eid]);
        }
    }

    sendJson(['success' => true, 'team_size' => count($employeeIds)]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
