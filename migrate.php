<?php
declare(strict_types=1);

/**
 * One-time migration: split data/app.sqlite into data/master.sqlite
 * and per-company data/companies/{id}.sqlite files.
 *
 * Safe to re-run (idempotent — skips already-migrated rows).
 *
 * Usage: php migrate.php
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/bootstrap.php';

$srcFile = DB_FILE; // data/app.sqlite
if (!file_exists($srcFile)) {
    echo "Nothing to migrate: $srcFile not found.\n";
    exit(0);
}

$src = new PDO('sqlite:' . $srcFile, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$master = getMasterDb(); // creates master.sqlite + seeds defaults

// ---------------------------------------------------------------------------
// 1. Companies → master DB
// ---------------------------------------------------------------------------

$oldCompanies = $src->query(
    'SELECT id, name, slug, active, approvals_enabled, salaxy_api_url, salaxy_username,
            salaxy_password, payroll_period, payday_1, payday_2, payroll_settings_updated_at,
            ui_language, salaxy_company_id, created_at
     FROM companies'
)->fetchAll();

$companyIdMap = []; // old_id => new_id (usually identical)

foreach ($oldCompanies as $c) {
    $existing = $master->prepare('SELECT id FROM companies WHERE slug = :slug');
    $existing->execute([':slug' => $c['slug']]);
    $row = $existing->fetch();

    if ($row) {
        // Update existing record (may have been seeded with minimal data)
        $master->prepare(
            'UPDATE companies SET
                name = :name, active = :active, approvals_enabled = :approvals_enabled,
                salaxy_api_url = :api_url, salaxy_username = :username, salaxy_password = :password,
                payroll_period = :period, payday_1 = :p1, payday_2 = :p2,
                payroll_settings_updated_at = :psu, ui_language = :lang,
                salaxy_company_id = :scid
             WHERE slug = :slug'
        )->execute([
            ':name'             => $c['name'],
            ':active'           => $c['active'],
            ':approvals_enabled'=> $c['approvals_enabled'],
            ':api_url'          => $c['salaxy_api_url'],
            ':username'         => $c['salaxy_username'],
            ':password'         => $c['salaxy_password'],
            ':period'           => $c['payroll_period'],
            ':p1'               => $c['payday_1'],
            ':p2'               => $c['payday_2'],
            ':psu'              => $c['payroll_settings_updated_at'],
            ':lang'             => $c['ui_language'],
            ':scid'             => $c['salaxy_company_id'],
            ':slug'             => $c['slug'],
        ]);
        $newId = (int) $row['id'];
    } else {
        // Insert preserving the original id so per-company FK references stay valid
        $master->prepare(
            'INSERT INTO companies
                (id, name, slug, active, approvals_enabled, salaxy_api_url, salaxy_username,
                 salaxy_password, payroll_period, payday_1, payday_2, payroll_settings_updated_at,
                 ui_language, salaxy_company_id, created_at)
             VALUES
                (:id, :name, :slug, :active, :approvals_enabled, :api_url, :username,
                 :password, :period, :p1, :p2, :psu, :lang, :scid, :created_at)'
        )->execute([
            ':id'               => $c['id'],
            ':name'             => $c['name'],
            ':slug'             => $c['slug'],
            ':active'           => $c['active'],
            ':approvals_enabled'=> $c['approvals_enabled'],
            ':api_url'          => $c['salaxy_api_url'],
            ':username'         => $c['salaxy_username'],
            ':password'         => $c['salaxy_password'],
            ':period'           => $c['payroll_period'],
            ':p1'               => $c['payday_1'],
            ':p2'               => $c['payday_2'],
            ':psu'              => $c['payroll_settings_updated_at'],
            ':lang'             => $c['ui_language'],
            ':scid'             => $c['salaxy_company_id'],
            ':created_at'       => $c['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        $newId = (int) $master->lastInsertId();
    }

    $companyIdMap[$c['id']] = $newId;

    // Ensure db_file is set
    $master->prepare('UPDATE companies SET db_file = :f WHERE id = :id')
           ->execute([':f' => 'companies/' . $newId . '.sqlite', ':id' => $newId]);

    echo "Company: {$c['name']} (old id={$c['id']} → new id=$newId)\n";
}

// ---------------------------------------------------------------------------
// 2. Super-admins → master DB
// ---------------------------------------------------------------------------

$superAdmins = $src->prepare("SELECT * FROM company_admins WHERE role = 'superadmin'");
$superAdmins->execute();

$orgId = $master->query('SELECT id FROM super_admin_orgs LIMIT 1')->fetchColumn();

foreach ($superAdmins->fetchAll() as $sa) {
    $chk = $master->prepare('SELECT id FROM super_admins WHERE email = :email');
    $chk->execute([':email' => $sa['email']]);
    if ($chk->fetch()) {
        echo "Super-admin: {$sa['email']} already exists, skipping\n";
        continue;
    }
    $master->prepare(
        'INSERT INTO super_admins (org_id, email, password_hash, name, active, ui_language, created_at)
         VALUES (:org, :email, :hash, :name, :active, :lang, :cat)'
    )->execute([
        ':org'    => $orgId,
        ':email'  => $sa['email'],
        ':hash'   => $sa['password_hash'],
        ':name'   => $sa['name'],
        ':active' => $sa['active'],
        ':lang'   => $sa['ui_language'] ?? null,
        ':cat'    => $sa['created_at'] ?? date('Y-m-d H:i:s'),
    ]);
    echo "Super-admin: migrated {$sa['email']}\n";
}

// ---------------------------------------------------------------------------
// 3. Per-company data
// ---------------------------------------------------------------------------

foreach ($companyIdMap as $oldId => $newId) {
    $db = getCompanyDb($newId); // creates + initialises the company DB

    echo "--- Migrating company id=$oldId → $newId ---\n";

    // -- company_admins (role='company_admin') --------------------------------
    $admins = $src->prepare("SELECT * FROM company_admins WHERE role = 'company_admin' AND company_id = :cid");
    $admins->execute([':cid' => $oldId]);
    $aCount = 0;
    foreach ($admins->fetchAll() as $a) {
        $chk = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
        $chk->execute([':email' => $a['email']]);
        if ($chk->fetch()) continue;
        $db->prepare(
            'INSERT INTO company_admins (company_id, email, password_hash, name, role, active, ui_language, created_at)
             VALUES (:cid, :email, :hash, :name, :role, :active, :lang, :cat)'
        )->execute([
            ':cid'    => $newId,
            ':email'  => $a['email'],
            ':hash'   => $a['password_hash'],
            ':name'   => $a['name'],
            ':role'   => $a['role'],
            ':active' => $a['active'],
            ':lang'   => $a['ui_language'] ?? null,
            ':cat'    => $a['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        $aCount++;
    }
    echo "  company_admins: $aCount inserted\n";

    // -- employees ------------------------------------------------------------
    $employees = $src->prepare('SELECT * FROM employees WHERE company_id = :cid');
    $employees->execute([':cid' => $oldId]);
    $eCount = 0;
    foreach ($employees->fetchAll() as $e) {
        $db->prepare(
            'INSERT OR IGNORE INTO employees
                (id, company_id, pin, name, ssn, salaxy_employment_id, role, active,
                 ui_language, email, phone, birth_year, pin_locked, created_at)
             VALUES
                (:id, :cid, :pin, :name, :ssn, :sid, :role, :active,
                 :lang, :email, :phone, :by, :pl, :cat)'
        )->execute([
            ':id'     => $e['id'],
            ':cid'    => $newId,
            ':pin'    => $e['pin'],
            ':name'   => $e['name'],
            ':ssn'    => $e['ssn'] ?? null,
            ':sid'    => $e['salaxy_employment_id'] ?? null,
            ':role'   => $e['role'],
            ':active' => $e['active'],
            ':lang'   => $e['ui_language'] ?? null,
            ':email'  => $e['email'] ?? null,
            ':phone'  => $e['phone'] ?? null,
            ':by'     => $e['birth_year'] ?? null,
            ':pl'     => $e['pin_locked'] ?? 0,
            ':cat'    => $e['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        if ($db->lastInsertId()) $eCount++;
    }
    echo "  employees: $eCount inserted\n";

    // -- supervisors ----------------------------------------------------------
    $supervisors = $src->prepare('SELECT * FROM supervisors WHERE company_id = :cid');
    $supervisors->execute([':cid' => $oldId]);
    $sCount = 0;
    foreach ($supervisors->fetchAll() as $s) {
        $db->prepare(
            'INSERT OR IGNORE INTO supervisors
                (id, company_id, first_name, last_name, email, phone, pin, ssn, salaxy_id,
                 active, ui_language, pin_locked, created_at)
             VALUES
                (:id, :cid, :fn, :ln, :email, :phone, :pin, :ssn, :sid,
                 :active, :lang, :pl, :cat)'
        )->execute([
            ':id'     => $s['id'],
            ':cid'    => $newId,
            ':fn'     => $s['first_name'],
            ':ln'     => $s['last_name'],
            ':email'  => $s['email'],
            ':phone'  => $s['phone'],
            ':pin'    => $s['pin'],
            ':ssn'    => $s['ssn'] ?? null,
            ':sid'    => $s['salaxy_id'] ?? null,
            ':active' => $s['active'],
            ':lang'   => $s['ui_language'] ?? null,
            ':pl'     => $s['pin_locked'] ?? 0,
            ':cat'    => $s['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        if ($db->lastInsertId()) $sCount++;
    }
    echo "  supervisors: $sCount inserted\n";

    // -- supervisor_employees -------------------------------------------------
    // Resolve which supervisors belong to this company
    $supIds = array_column(
        $src->prepare('SELECT id FROM supervisors WHERE company_id = :cid')->execute([':cid' => $oldId]) ? [] : [],
        'id'
    );
    // Simpler: just copy rows where supervisor_id belongs to this company's supervisors
    $seRows = $src->query(
        'SELECT se.* FROM supervisor_employees se
         JOIN supervisors s ON s.id = se.supervisor_id
         WHERE s.company_id = ' . $oldId
    )->fetchAll();
    $seCount = 0;
    foreach ($seRows as $se) {
        $db->prepare(
            'INSERT OR IGNORE INTO supervisor_employees (supervisor_id, employee_id) VALUES (:sid, :eid)'
        )->execute([':sid' => $se['supervisor_id'], ':eid' => $se['employee_id']]);
        if ($db->lastInsertId()) $seCount++;
    }
    echo "  supervisor_employees: $seCount inserted\n";

    // -- time_entries ---------------------------------------------------------
    $entries = $src->prepare('SELECT * FROM time_entries WHERE company_id = :cid');
    $entries->execute([':cid' => $oldId]);
    $teCount = 0;
    foreach ($entries->fetchAll() as $te) {
        $db->prepare(
            'INSERT OR IGNORE INTO time_entries
                (id, company_id, employee_id, entry_date, start_time, end_time, hours, km,
                 project, comment, status, km_status, submitted_at, reviewed_by_type,
                 reviewed_by_id, reviewed_at, rejection_note, km_rejection_note,
                 employee_clarification, km_employee_clarification, clarification_at,
                 exported_to_salaxy, exported_at)
             VALUES
                (:id, :cid, :eid, :date, :st, :et, :hours, :km,
                 :proj, :comment, :status, :kms, :sub, :rbt,
                 :rbi, :rat, :rn, :krn,
                 :ec, :kec, :ca,
                 :exp, :expa)'
        )->execute([
            ':id'      => $te['id'],
            ':cid'     => $newId,
            ':eid'     => $te['employee_id'],
            ':date'    => $te['entry_date'],
            ':st'      => $te['start_time'] ?? null,
            ':et'      => $te['end_time'] ?? null,
            ':hours'   => $te['hours'],
            ':km'      => $te['km'],
            ':proj'    => $te['project'] ?? null,
            ':comment' => $te['comment'] ?? null,
            ':status'  => $te['status'],
            ':kms'     => $te['km_status'] ?? 'pending',
            ':sub'     => $te['submitted_at'],
            ':rbt'     => $te['reviewed_by_type'] ?? null,
            ':rbi'     => $te['reviewed_by_id'] ?? null,
            ':rat'     => $te['reviewed_at'] ?? null,
            ':rn'      => $te['rejection_note'] ?? null,
            ':krn'     => $te['km_rejection_note'] ?? null,
            ':ec'      => $te['employee_clarification'] ?? null,
            ':kec'     => $te['km_employee_clarification'] ?? null,
            ':ca'      => $te['clarification_at'] ?? null,
            ':exp'     => $te['exported_to_salaxy'] ?? 0,
            ':expa'    => $te['exported_at'] ?? null,
        ]);
        if ($db->lastInsertId()) $teCount++;
    }
    echo "  time_entries: $teCount inserted\n";

    // -- payroll_exports ------------------------------------------------------
    $exports = $src->prepare('SELECT * FROM payroll_exports WHERE company_id = :cid');
    $exports->execute([':cid' => $oldId]);
    $peCount = 0;
    foreach ($exports->fetchAll() as $pe) {
        $db->prepare(
            'INSERT OR IGNORE INTO payroll_exports
                (id, company_id, period_start, period_end, salaxy_payroll_id, created_at)
             VALUES (:id, :cid, :ps, :pe, :spid, :cat)'
        )->execute([
            ':id'   => $pe['id'],
            ':cid'  => $newId,
            ':ps'   => $pe['period_start'],
            ':pe'   => $pe['period_end'],
            ':spid' => $pe['salaxy_payroll_id'],
            ':cat'  => $pe['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        if ($db->lastInsertId()) $peCount++;
    }
    echo "  payroll_exports: $peCount inserted\n";

    // -- payroll_export_calculations ------------------------------------------
    $calcRows = $src->query(
        'SELECT pec.* FROM payroll_export_calculations pec
         JOIN payroll_exports pe ON pe.id = pec.payroll_export_id
         WHERE pe.company_id = ' . $oldId
    )->fetchAll();
    $calcCount = 0;
    foreach ($calcRows as $calc) {
        $db->prepare(
            'INSERT OR IGNORE INTO payroll_export_calculations
                (payroll_export_id, salaxy_employment_id, salaxy_calculation_id)
             VALUES (:peid, :seid, :scid)'
        )->execute([
            ':peid' => $calc['payroll_export_id'],
            ':seid' => $calc['salaxy_employment_id'],
            ':scid' => $calc['salaxy_calculation_id'],
        ]);
        if ($db->lastInsertId()) $calcCount++;
    }
    echo "  payroll_export_calculations: $calcCount inserted\n";

    // -- pin_rate_limit -------------------------------------------------------
    $rateRows = $src->prepare('SELECT * FROM pin_rate_limit WHERE company_id = :cid');
    $rateRows->execute([':cid' => $oldId]);
    $rlCount = 0;
    foreach ($rateRows->fetchAll() as $rl) {
        $db->prepare(
            'INSERT OR IGNORE INTO pin_rate_limit
                (id, company_id, device_id, attempts, window_start, locked_until, locked, strike,
                 last_employee_id, last_employee_type)
             VALUES (:id, :cid, :did, :att, :ws, :lu, :lk, :str, :lei, :let)'
        )->execute([
            ':id'   => $rl['id'],
            ':cid'  => $newId,
            ':did'  => $rl['device_id'],
            ':att'  => $rl['attempts'],
            ':ws'   => $rl['window_start'] ?? null,
            ':lu'   => $rl['locked_until'] ?? null,
            ':lk'   => $rl['locked'],
            ':str'  => $rl['strike'],
            ':lei'  => $rl['last_employee_id'] ?? null,
            ':let'  => $rl['last_employee_type'] ?? null,
        ]);
        if ($db->lastInsertId()) $rlCount++;
    }
    echo "  pin_rate_limit: $rlCount inserted\n";
}

echo "\nDone.\n";
