<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// ---------------------------------------------------------------------------
// Database accessors
// ---------------------------------------------------------------------------

function getMasterDb(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    if (!is_dir(DB_DIR))              mkdir(DB_DIR,              0775, true);
    if (!is_dir(DB_DIR . '/companies')) mkdir(DB_DIR . '/companies', 0775, true);

    $pdo = new PDO('sqlite:' . DB_DIR . '/master.sqlite', null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    initializeMasterDb($pdo);

    return $pdo;
}

function getCompanyDb(int $companyId): PDO
{
    static $pdos = [];
    if (isset($pdos[$companyId])) return $pdos[$companyId];

    $pdo = new PDO('sqlite:' . DB_DIR . '/companies/' . $companyId . '.sqlite', null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    initializeCompanyDb($pdo);
    $pdos[$companyId] = $pdo;

    return $pdo;
}

function getCompanyDbBySlug(string $slug): PDO
{
    $stmt = getMasterDb()->prepare('SELECT id FROM companies WHERE slug = :slug');
    $stmt->execute([':slug' => $slug]);
    $company = $stmt->fetch();
    if (!$company) {
        throw new RuntimeException('Company not found: ' . $slug);
    }
    return getCompanyDb((int) $company['id']);
}

// ---------------------------------------------------------------------------
// Master DB schema (companies registry + super-admin accounts)
// ---------------------------------------------------------------------------

function initializeMasterDb(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS super_admin_orgs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL,
            active     INTEGER NOT NULL DEFAULT 1,
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS super_admins (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            org_id        INTEGER NOT NULL,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            name          TEXT,
            active        INTEGER NOT NULL DEFAULT 1,
            ui_language   TEXT,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(org_id) REFERENCES super_admin_orgs(id)
        );
        CREATE TABLE IF NOT EXISTS companies (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            name                        TEXT    NOT NULL,
            slug                        TEXT    UNIQUE,
            active                      INTEGER NOT NULL DEFAULT 1,
            approvals_enabled           INTEGER NOT NULL DEFAULT 0,
            salaxy_api_url              TEXT,
            salaxy_username             TEXT,
            salaxy_password             TEXT,
            payroll_period              TEXT    NOT NULL DEFAULT 'monthly',
            payday_1                    INTEGER NOT NULL DEFAULT 15,
            payday_2                    INTEGER NOT NULL DEFAULT 0,
            payroll_settings_updated_at TEXT,
            ui_language                 TEXT    NOT NULL DEFAULT 'en',
            salaxy_company_id           TEXT,
            db_file                     TEXT,
            super_admin_org_id          INTEGER,
            created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(super_admin_org_id) REFERENCES super_admin_orgs(id)
        );"
    );

    // Migrations for master DBs created before full column set
    $cols = array_column($db->query('PRAGMA table_info(companies)')->fetchAll(), 'name');
    if (!in_array('active', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    if (!in_array('approvals_enabled', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN approvals_enabled INTEGER NOT NULL DEFAULT 0');
    if (!in_array('payroll_period', $cols))
        $db->exec("ALTER TABLE companies ADD COLUMN payroll_period TEXT NOT NULL DEFAULT 'monthly'");
    if (!in_array('payday_1', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN payday_1 INTEGER NOT NULL DEFAULT 15');
    if (!in_array('payday_2', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN payday_2 INTEGER NOT NULL DEFAULT 0');
    if (!in_array('payroll_settings_updated_at', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN payroll_settings_updated_at TEXT');
    if (!in_array('ui_language', $cols))
        $db->exec("ALTER TABLE companies ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'");
    if (!in_array('salaxy_company_id', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN salaxy_company_id TEXT');
    if (!in_array('salaxy_account_id', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN salaxy_account_id TEXT');
    if (!in_array('db_file', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN db_file TEXT');
    if (!in_array('super_admin_org_id', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN super_admin_org_id INTEGER');
    if (!in_array('time_app_enabled', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN time_app_enabled INTEGER NOT NULL DEFAULT 1');
    if (!in_array('supervisor_ui_enabled', $cols))
        $db->exec('ALTER TABLE companies ADD COLUMN supervisor_ui_enabled INTEGER NOT NULL DEFAULT 1');

    $saCols = array_column($db->query('PRAGMA table_info(super_admins)')->fetchAll(), 'name');
    if (!in_array('salaxy_account_id', $saCols))
        $db->exec('ALTER TABLE super_admins ADD COLUMN salaxy_account_id TEXT');

    ensureDefaultSuperAdminOrg($db);
    ensureDefaultSuperAdmin($db);
    ensureDefaultCompany($db);
}

// ---------------------------------------------------------------------------
// Company DB schema (per-company operational data)
// ---------------------------------------------------------------------------

function initializeCompanyDb(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS company_admins (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id    INTEGER,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            name          TEXT,
            role          TEXT    NOT NULL DEFAULT 'company_admin',
            active        INTEGER NOT NULL DEFAULT 1,
            ui_language   TEXT,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS employees (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id           INTEGER NOT NULL,
            pin                  TEXT    NOT NULL,
            name                 TEXT    NOT NULL,
            ssn                  TEXT,
            salaxy_employment_id TEXT,
            role                 TEXT    NOT NULL DEFAULT 'employee',
            active               INTEGER NOT NULL DEFAULT 1,
            created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS supervisors (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            first_name TEXT    NOT NULL,
            last_name  TEXT    NOT NULL,
            email      TEXT    NOT NULL,
            phone      TEXT    NOT NULL,
            pin        TEXT    NOT NULL,
            ssn        TEXT,
            salaxy_id  TEXT,
            active     INTEGER NOT NULL DEFAULT 1,
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS supervisor_employees (
            supervisor_id INTEGER NOT NULL,
            employee_id   INTEGER NOT NULL,
            PRIMARY KEY (supervisor_id, employee_id),
            FOREIGN KEY(supervisor_id) REFERENCES supervisors(id),
            FOREIGN KEY(employee_id)   REFERENCES employees(id)
        );
        CREATE TABLE IF NOT EXISTS time_entries (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id             INTEGER NOT NULL,
            employee_id            INTEGER NOT NULL,
            entry_date             TEXT    NOT NULL,
            start_time             TEXT,
            end_time               TEXT,
            hours                  REAL    NOT NULL DEFAULT 0,
            km                     REAL    NOT NULL DEFAULT 0,
            project                TEXT,
            comment                TEXT,
            status                 TEXT    NOT NULL DEFAULT 'pending',
            km_status              TEXT    NOT NULL DEFAULT 'pending',
            submitted_at           TEXT    NOT NULL DEFAULT (datetime('now')),
            reviewed_by_type       TEXT,
            reviewed_by_id         INTEGER,
            reviewed_at            TEXT,
            rejection_note         TEXT,
            km_rejection_note      TEXT,
            employee_clarification     TEXT,
            km_employee_clarification  TEXT,
            clarification_at       TEXT,
            exported_to_salaxy     INTEGER NOT NULL DEFAULT 0,
            exported_at            TEXT,
            FOREIGN KEY(employee_id) REFERENCES employees(id)
        );
        CREATE TABLE IF NOT EXISTS payroll_exports (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id        INTEGER NOT NULL,
            period_start      TEXT    NOT NULL,
            period_end        TEXT    NOT NULL,
            salaxy_payroll_id TEXT    NOT NULL,
            created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
            UNIQUE(company_id, period_start, period_end)
        );
        CREATE TABLE IF NOT EXISTS payroll_export_calculations (
            payroll_export_id     INTEGER NOT NULL,
            salaxy_employment_id  TEXT    NOT NULL,
            salaxy_calculation_id TEXT    NOT NULL,
            PRIMARY KEY (payroll_export_id, salaxy_employment_id),
            FOREIGN KEY(payroll_export_id) REFERENCES payroll_exports(id)
        );
        CREATE TABLE IF NOT EXISTS pin_rate_limit (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id         INTEGER NOT NULL,
            device_id          TEXT    NOT NULL,
            attempts           INTEGER NOT NULL DEFAULT 0,
            window_start       INTEGER,
            locked_until       INTEGER,
            locked             INTEGER NOT NULL DEFAULT 0,
            strike             INTEGER NOT NULL DEFAULT 0,
            last_employee_id   INTEGER,
            last_employee_type TEXT,
            UNIQUE(company_id, device_id)
        );"
    );

    // Migrations for company DBs created before full column set
    $admCols = array_column($db->query('PRAGMA table_info(company_admins)')->fetchAll(), 'name');
    if (!in_array('ui_language', $admCols))
        $db->exec('ALTER TABLE company_admins ADD COLUMN ui_language TEXT');

    $empCols = array_column($db->query('PRAGMA table_info(employees)')->fetchAll(), 'name');
    if (!in_array('ui_language', $empCols))
        $db->exec('ALTER TABLE employees ADD COLUMN ui_language TEXT');
    if (!in_array('email', $empCols))
        $db->exec('ALTER TABLE employees ADD COLUMN email TEXT');
    if (!in_array('phone', $empCols))
        $db->exec('ALTER TABLE employees ADD COLUMN phone TEXT');
    if (!in_array('birth_year', $empCols))
        $db->exec('ALTER TABLE employees ADD COLUMN birth_year INTEGER');
    if (!in_array('pin_locked', $empCols))
        $db->exec('ALTER TABLE employees ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0');

    $supCols = array_column($db->query('PRAGMA table_info(supervisors)')->fetchAll(), 'name');
    if (!in_array('ui_language', $supCols))
        $db->exec('ALTER TABLE supervisors ADD COLUMN ui_language TEXT');
    if (!in_array('pin_locked', $supCols))
        $db->exec('ALTER TABLE supervisors ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0');

    $teCols = array_column($db->query('PRAGMA table_info(time_entries)')->fetchAll(), 'name');
    if (!in_array('km_status', $teCols)) {
        $db->exec("ALTER TABLE time_entries ADD COLUMN km_status TEXT NOT NULL DEFAULT 'pending'");
        $db->exec("UPDATE time_entries SET km_status = status WHERE status != 'pending'");
    }
    if (!in_array('km_rejection_note', $teCols))
        $db->exec('ALTER TABLE time_entries ADD COLUMN km_rejection_note TEXT');
    if (!in_array('km_employee_clarification', $teCols))
        $db->exec('ALTER TABLE time_entries ADD COLUMN km_employee_clarification TEXT');

    // Migrate plain-text PINs to HMAC-SHA256
    foreach ($db->query('SELECT id, pin FROM employees')->fetchAll() as $row) {
        if (preg_match('/^\d{3,6}$/', $row['pin'])) {
            $db->prepare('UPDATE employees SET pin = :h WHERE id = :id')
               ->execute([':h' => hashPin($row['pin']), ':id' => $row['id']]);
        }
    }
    foreach ($db->query('SELECT id, pin FROM supervisors')->fetchAll() as $row) {
        if (preg_match('/^\d{3,6}$/', $row['pin'])) {
            $db->prepare('UPDATE supervisors SET pin = :h WHERE id = :id')
               ->execute([':h' => hashPin($row['pin']), ':id' => $row['id']]);
        }
    }
}

// ---------------------------------------------------------------------------
// Seed data (fresh installs only)
// ---------------------------------------------------------------------------

function ensureDefaultSuperAdminOrg(PDO $masterDb): int
{
    $org = $masterDb->query('SELECT id FROM super_admin_orgs LIMIT 1')->fetch();
    if ($org) return (int) $org['id'];

    $masterDb->exec("INSERT INTO super_admin_orgs (name) VALUES ('Default Org')");
    return (int) $masterDb->lastInsertId();
}

function ensureDefaultSuperAdmin(PDO $masterDb): void
{
    $email = 'superadmin@timeapp.local';
    $stmt  = $masterDb->prepare('SELECT id FROM super_admins WHERE email = :email');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) return;

    $orgId = ensureDefaultSuperAdminOrg($masterDb);
    $masterDb->prepare(
        'INSERT INTO super_admins (org_id, email, password_hash, name, active)
         VALUES (:org_id, :email, :hash, :name, 1)'
    )->execute([
        ':org_id' => $orgId,
        ':email'  => $email,
        ':hash'   => password_hash('SuperAdmin123!', PASSWORD_DEFAULT),
        ':name'   => 'Super Admin',
    ]);
}

function ensureDefaultCompany(PDO $masterDb): int
{
    $stmt = $masterDb->prepare('SELECT id, db_file FROM companies WHERE slug = :slug');
    $stmt->execute([':slug' => 'test-company']);
    $company = $stmt->fetch();

    if ($company) {
        $id = (int) $company['id'];
        if (!$company['db_file']) {
            $masterDb->prepare('UPDATE companies SET db_file = :f WHERE id = :id')
                     ->execute([':f' => 'companies/' . $id . '.sqlite', ':id' => $id]);
        }
        getCompanyDb($id); // ensure file exists
        return $id;
    }

    $masterDb->prepare(
        'INSERT INTO companies (name, slug, salaxy_api_url, salaxy_username, salaxy_password)
         VALUES (:name, :slug, :api_url, :username, :password)'
    )->execute([
        ':name'     => 'Test Company',
        ':slug'     => 'test-company',
        ':api_url'  => SALAXY_API_URL,
        ':username' => SALAXY_USERNAME,
        ':password' => SALAXY_PASSWORD,
    ]);
    $id = (int) $masterDb->lastInsertId();
    $masterDb->prepare('UPDATE companies SET db_file = :f WHERE id = :id')
             ->execute([':f' => 'companies/' . $id . '.sqlite', ':id' => $id]);

    ensureDefaultAdmin(getCompanyDb($id), $id);
    return $id;
}

function ensureDefaultAdmin(PDO $companyDb, int $companyId): void
{
    $email = 'admin@timeapp.local';
    $stmt  = $companyDb->prepare('SELECT id FROM company_admins WHERE email = :email');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) return;

    $companyDb->prepare(
        'INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
         VALUES (:company_id, :email, :hash, :name, :role, 1)'
    )->execute([
        ':company_id' => $companyId,
        ':email'      => $email,
        ':hash'       => password_hash('Admin123!', PASSWORD_DEFAULT),
        ':name'       => 'Prototype Admin',
        ':role'       => 'company_admin',
    ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifyPassword(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}

function hashPin(string $pin): string
{
    return hash_hmac('sha256', $pin, JWT_SECRET);
}
