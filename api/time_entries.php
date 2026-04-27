<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

// POST — employee submits entries
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $emp = requireEmployee();
    $db  = getCompanyDb((int) $emp['company_id']);
    $payload = getJsonPayload();
    $entries = $payload['entries'] ?? [];

    if (!is_array($entries) || empty($entries)) {
        sendJson(['success' => false, 'error' => 'entries puuttuu'], 400);
    }

    $stmt = $db->prepare(
        'INSERT INTO time_entries
            (company_id, employee_id, entry_date, start_time, end_time, hours, km, project, comment)
         VALUES
            (:company_id, :employee_id, :entry_date, :start_time, :end_time, :hours, :km, :project, :comment)'
    );

    $saved = 0;
    $ids   = [];
    foreach ($entries as $e) {
        // Normalise date from DD-MM-YYYY to YYYY-MM-DD
        $rawDate = trim((string) ($e['date'] ?? date('d-m-Y')));
        $parts   = explode('-', $rawDate);
        $isoDate = (count($parts) === 3 && strlen($parts[0]) === 2)
            ? $parts[2] . '-' . $parts[1] . '-' . $parts[0]
            : $rawDate;

        $stmt->execute([
            ':company_id'  => $emp['company_id'],
            ':employee_id' => $emp['id'],
            ':entry_date'  => $isoDate,
            ':start_time'  => trim((string) ($e['start'] ?? '')),
            ':end_time'    => trim((string) ($e['end'] ?? '')),
            ':hours'       => (float) ($e['hours'] ?? 0),
            ':km'          => (float) ($e['mileage'] ?? 0),
            ':project'     => trim((string) ($e['project'] ?? '')),
            ':comment'     => trim((string) ($e['notes'] ?? '')),
        ]);
        $ids[] = (int) $db->lastInsertId();
        $saved++;
    }

    sendJson(['success' => true, 'saved' => $saved, 'ids' => $ids]);
}

// GET — fetch entries (admin/supervisor for any employee, employee for own)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $view = $_GET['view'] ?? '';

    if ($view === 'mine') {
        $emp = requireEmployee();
        $db  = getCompanyDb((int) $emp['company_id']);
        $stmt = $db->prepare(
            'SELECT * FROM time_entries
             WHERE employee_id = :eid AND status != \'deleted\'
             ORDER BY entry_date DESC, start_time DESC'
        );
        $stmt->execute([':eid' => $emp['id']]);
        sendJson(['success' => true, 'entries' => $stmt->fetchAll()]);
    }

    // Admin or supervisor reading a specific employee's entries
    $reviewer = requireAdminOrSupervisor();
    $db       = getCompanyDb((int) $reviewer['company_id']);
    $employeeId = isset($_GET['employee_id']) ? (int) $_GET['employee_id'] : null;
    $statusFilter = $_GET['status'] ?? '';
    $dateFrom     = $_GET['date_from'] ?? '';
    $dateTo       = $_GET['date_to'] ?? '';

    // Build query
    $where  = ['te.company_id = :company_id', "te.status != 'deleted'"];
    $params = [':company_id' => $reviewer['company_id']];

    if ($employeeId) {
        // Supervisor: verify employee is in their team
        if ($reviewer['type'] === 'supervisor') {
            $chk = $db->prepare(
                'SELECT 1 FROM supervisor_employees WHERE supervisor_id = :sid AND employee_id = :eid'
            );
            $chk->execute([':sid' => $reviewer['id'], ':eid' => $employeeId]);
            if (!$chk->fetch()) {
                sendJson(['success' => false, 'error' => 'Ei pääsyä tähän työntekijään'], 403);
            }
        }
        $where[]            = 'te.employee_id = :employee_id';
        $params[':employee_id'] = $employeeId;
    } elseif ($reviewer['type'] === 'supervisor') {
        // Supervisor with no specific employee: show whole team
        $where[]  = 'te.employee_id IN (SELECT employee_id FROM supervisor_employees WHERE supervisor_id = :sid)';
        $params[':sid'] = $reviewer['id'];
    }

    if ($statusFilter !== '') {
        $where[]            = 'te.status = :status';
        $params[':status']  = $statusFilter;
    }
    if ($dateFrom !== '') {
        $where[]               = 'te.entry_date >= :date_from';
        $params[':date_from']  = $dateFrom;
    }
    if ($dateTo !== '') {
        $where[]             = 'te.entry_date <= :date_to';
        $params[':date_to']  = $dateTo;
    }

    $sql  = "SELECT te.*, e.name AS employee_name,
             CASE
               WHEN te.reviewed_by_type = 'supervisor' THEN s.first_name || ' ' || s.last_name
               WHEN te.reviewed_by_type = 'admin' THEN a.name
               ELSE NULL
             END AS reviewed_by_name
             FROM time_entries te
             JOIN employees e ON e.id = te.employee_id
             LEFT JOIN supervisors s ON s.id = te.reviewed_by_id AND te.reviewed_by_type = 'supervisor'
             LEFT JOIN company_admins a ON a.id = te.reviewed_by_id AND te.reviewed_by_type = 'admin'
             WHERE " . implode(' AND ', $where) . '
             ORDER BY te.entry_date DESC, te.start_time DESC';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    sendJson(['success' => true, 'entries' => $stmt->fetchAll()]);
}

// DELETE — employee soft-deletes their own pending entry (used by chat update flow)
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $emp = requireEmployee();
    $db  = getCompanyDb((int) $emp['company_id']);
    $payload = getJsonPayload();
    $id      = isset($payload['id']) ? (int) $payload['id'] : null;

    if (!$id) {
        sendJson(['success' => false, 'error' => 'id vaaditaan'], 400);
    }

    $stmt = $db->prepare(
        "SELECT id FROM time_entries
         WHERE id = :id AND employee_id = :eid AND status IN ('pending', 'clarified')"
    );
    $stmt->execute([':id' => $id, ':eid' => $emp['id']]);

    if (!$stmt->fetch()) {
        sendJson(['success' => false, 'error' => 'Kirjausta ei löydy'], 404);
    }

    $db->prepare("UPDATE time_entries SET status = 'deleted' WHERE id = :id")
       ->execute([':id' => $id]);

    sendJson(['success' => true]);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
