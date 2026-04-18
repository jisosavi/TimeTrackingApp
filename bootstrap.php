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

    ensureDefaultCompany($db);
    ensureDefaultAdmin($db);
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

function verifyPassword(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}
