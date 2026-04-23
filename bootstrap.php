<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (!is_dir(dirname(DB_FILE))) {
    mkdir(dirname(DB_FILE), 0775, true);
}

$pdo = null;

function getDb(): PDO
{
    global $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'sqlite:' . DB_FILE;
    $pdo = new PDO($dsn, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    initializeDatabase($pdo);

    return $pdo;
}

function initializeDatabase(PDO $db): void
{
    $db->exec(
        'CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            approvals_enabled INTEGER NOT NULL DEFAULT 0,
            salaxy_api_url TEXT,
            salaxy_username TEXT,
            salaxy_password TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))
        );
        CREATE TABLE IF NOT EXISTS company_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT,
            role TEXT NOT NULL DEFAULT \'company_admin\',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            pin TEXT NOT NULL,
            name TEXT NOT NULL,
            ssn TEXT,
            salaxy_employment_id TEXT,
            role TEXT NOT NULL DEFAULT \'employee\',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS supervisors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            pin TEXT NOT NULL,
            ssn TEXT,
            salaxy_id TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS supervisor_employees (
            supervisor_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            PRIMARY KEY (supervisor_id, employee_id),
            FOREIGN KEY(supervisor_id) REFERENCES supervisors(id),
            FOREIGN KEY(employee_id) REFERENCES employees(id)
        );
        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            entry_date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            hours REAL NOT NULL DEFAULT 0,
            km REAL NOT NULL DEFAULT 0,
            project TEXT,
            comment TEXT,
            status TEXT NOT NULL DEFAULT \'pending\',
            submitted_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            reviewed_by_type TEXT,
            reviewed_by_id INTEGER,
            reviewed_at TEXT,
            rejection_note TEXT,
            employee_clarification TEXT,
            clarification_at TEXT,
            exported_to_salaxy INTEGER NOT NULL DEFAULT 0,
            exported_at TEXT,
            FOREIGN KEY(company_id) REFERENCES companies(id),
            FOREIGN KEY(employee_id) REFERENCES employees(id)
        );
        CREATE TABLE IF NOT EXISTS payroll_exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            salaxy_payroll_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\')),
            UNIQUE(company_id, period_start, period_end),
            FOREIGN KEY(company_id) REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS payroll_export_calculations (
            payroll_export_id INTEGER NOT NULL,
            salaxy_employment_id TEXT NOT NULL,
            salaxy_calculation_id TEXT NOT NULL,
            PRIMARY KEY (payroll_export_id, salaxy_employment_id),
            FOREIGN KEY(payroll_export_id) REFERENCES payroll_exports(id)
        );
        CREATE TABLE IF NOT EXISTS pin_rate_limit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            window_start INTEGER,
            locked_until INTEGER,
            locked INTEGER NOT NULL DEFAULT 0,
            strike INTEGER NOT NULL DEFAULT 0,
            last_employee_id INTEGER,
            last_employee_type TEXT,
            UNIQUE(company_id, device_id)
        );'
    );

    // Migrations for existing databases
    $cols = array_column($db->query('PRAGMA table_info(companies)')->fetchAll(), 'name');
    if (!in_array('active', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    }
    if (!in_array('approvals_enabled', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN approvals_enabled INTEGER NOT NULL DEFAULT 0');
    }
    if (!in_array('payroll_period', $cols)) {
        $db->exec("ALTER TABLE companies ADD COLUMN payroll_period TEXT NOT NULL DEFAULT 'monthly'");
    }
    if (!in_array('payday_1', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN payday_1 INTEGER NOT NULL DEFAULT 15');
    }
    if (!in_array('payday_2', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN payday_2 INTEGER NOT NULL DEFAULT 0');
    }
    if (!in_array('payroll_settings_updated_at', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN payroll_settings_updated_at TEXT');
    }
    if (!in_array('ui_language', $cols)) {
        $db->exec("ALTER TABLE companies ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'");
    }
    if (!in_array('salaxy_company_id', $cols)) {
        $db->exec('ALTER TABLE companies ADD COLUMN salaxy_company_id TEXT');
    }

    $empCols = array_column($db->query('PRAGMA table_info(employees)')->fetchAll(), 'name');
    if (!in_array('ui_language', $empCols)) {
        $db->exec('ALTER TABLE employees ADD COLUMN ui_language TEXT');
    }
    if (!in_array('email', $empCols)) {
        $db->exec('ALTER TABLE employees ADD COLUMN email TEXT');
    }
    if (!in_array('phone', $empCols)) {
        $db->exec('ALTER TABLE employees ADD COLUMN phone TEXT');
    }
    if (!in_array('birth_year', $empCols)) {
        $db->exec('ALTER TABLE employees ADD COLUMN birth_year INTEGER');
    }
    if (!in_array('pin_locked', $empCols)) {
        $db->exec('ALTER TABLE employees ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0');
    }

    $supCols = array_column($db->query('PRAGMA table_info(supervisors)')->fetchAll(), 'name');
    if (!in_array('ui_language', $supCols)) {
        $db->exec('ALTER TABLE supervisors ADD COLUMN ui_language TEXT');
    }
    if (!in_array('pin_locked', $supCols)) {
        $db->exec('ALTER TABLE supervisors ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0');
    }

    $admCols = array_column($db->query('PRAGMA table_info(company_admins)')->fetchAll(), 'name');
    if (!in_array('ui_language', $admCols)) {
        $db->exec('ALTER TABLE company_admins ADD COLUMN ui_language TEXT');
    }

    $teCols = array_column($db->query('PRAGMA table_info(time_entries)')->fetchAll(), 'name');
    if (!in_array('km_status', $teCols)) {
        $db->exec("ALTER TABLE time_entries ADD COLUMN km_status TEXT NOT NULL DEFAULT 'pending'");
        $db->exec("UPDATE time_entries SET km_status = status WHERE status != 'pending'");
    }
    if (!in_array('km_rejection_note', $teCols)) {
        $db->exec('ALTER TABLE time_entries ADD COLUMN km_rejection_note TEXT');
    }
    if (!in_array('km_employee_clarification', $teCols)) {
        $db->exec('ALTER TABLE time_entries ADD COLUMN km_employee_clarification TEXT');
    }

    ensureDefaultCompany($db);
    ensureDefaultAdmin($db);
    ensureDefaultSuperAdmin($db);
}

function ensureDefaultCompany(PDO $db): int
{
    $companyName = 'Test Company';
    $companySlug = 'test-company';
    $stmt = $db->prepare('SELECT id FROM companies WHERE name = :name');
    $stmt->execute([':name' => $companyName]);
    $company = $stmt->fetch();

    if ($company) {
        // Backfill slug if it was created without one
        $db->prepare('UPDATE companies SET slug = :slug WHERE id = :id AND slug IS NULL')
           ->execute([':slug' => $companySlug, ':id' => $company['id']]);
        return (int) $company['id'];
    }

    $insert = $db->prepare(
        'INSERT INTO companies (name, slug, salaxy_api_url, salaxy_username, salaxy_password)
         VALUES (:name, :slug, :api_url, :username, :password)'
    );
    $insert->execute([
        ':name' => $companyName,
        ':slug' => $companySlug,
        ':api_url' => SALAXY_API_URL,
        ':username' => SALAXY_USERNAME,
        ':password' => SALAXY_PASSWORD,
    ]);

    return (int) $db->lastInsertId();
}

function ensureDefaultAdmin(PDO $db): void
{
    $defaultEmail = 'admin@timeapp.local';
    $stmt = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
    $stmt->execute([':email' => $defaultEmail]);

    if ($stmt->fetch()) {
        return;
    }

    $companyId = ensureDefaultCompany($db);
    $passwordHash = password_hash('Admin123!', PASSWORD_DEFAULT);
    $insert = $db->prepare(
        'INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
         VALUES (:company_id, :email, :password_hash, :name, :role, 1)'
    );
    $insert->execute([
        ':company_id' => $companyId,
        ':email' => $defaultEmail,
        ':password_hash' => $passwordHash,
        ':name' => 'Prototype Admin',
        ':role' => 'company_admin',
    ]);
}

function ensureDefaultSuperAdmin(PDO $db): void
{
    $defaultEmail = 'superadmin@timeapp.local';
    $stmt = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
    $stmt->execute([':email' => $defaultEmail]);
    if ($stmt->fetch()) return;

    $passwordHash = password_hash('SuperAdmin123!', PASSWORD_DEFAULT);
    $db->prepare(
        'INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
         VALUES (NULL, :email, :hash, :name, :role, 1)'
    )->execute([
        ':email' => $defaultEmail,
        ':hash'  => $passwordHash,
        ':name'  => 'Super Admin',
        ':role'  => 'superadmin',
    ]);
}

function verifyPassword(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}
