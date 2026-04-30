<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

requireSuperAdmin();

$db = getMasterDb();

function countActiveEmployees(int $companyId): int
{
    try {
        return (int) getCompanyDb($companyId)->query('SELECT COUNT(*) FROM employees WHERE active = 1')->fetchColumn();
    } catch (Throwable) {
        return 0;
    }
}

function getLastActivity(?string $dbFile): ?string
{
    if (!$dbFile) return null;
    $path = DB_DIR . '/' . $dbFile;
    if (!file_exists($path)) return null;
    try {
        $db  = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $val = $db->query('SELECT MAX(submitted_at) FROM time_entries')->fetchColumn();
        return $val ?: null;
    } catch (Throwable) {
        return null;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt      = $db->query(
        'SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
                ui_language, salaxy_company_id AS business_id, salaxy_account_id, db_file,
                salaxy_api_url, salaxy_username
         FROM companies
         ORDER BY name ASC'
    );
    $companies = $stmt->fetchAll();
    foreach ($companies as &$c) {
        $c['employee_count']   = countActiveEmployees((int) $c['id']);
        $c['last_activity_at'] = getLastActivity($c['db_file'] ?? null);
    }
    sendJson(['success' => true, 'companies' => $companies]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = getJsonPayload();
    $id      = isset($payload['id']) ? (int) $payload['id'] : null;

    if ($id) {
        // Update existing company
        $name   = array_key_exists('name', $payload) ? trim((string) $payload['name']) : null;
        $slug   = array_key_exists('slug', $payload) ? trim((string) $payload['slug']) : null;
        $active = array_key_exists('active', $payload) ? (int) $payload['active'] : null;
        $ae     = array_key_exists('approvals_enabled', $payload) ? (int) $payload['approvals_enabled'] : null;
        $lang   = array_key_exists('ui_language', $payload) ? trim((string) $payload['ui_language']) : null;
        $businessId = null;
        if (array_key_exists('business_id', $payload)) {
            $businessId = trim((string) $payload['business_id']);
        } elseif (array_key_exists('salaxy_company_id', $payload)) {
            $businessId = trim((string) $payload['salaxy_company_id']);
        }

        if ($slug !== null) {
            if (!preg_match('/^[a-z0-9-]+$/', $slug) || strlen($slug) < 2) {
                sendJson(['success' => false, 'error' => 'Slug must be at least 2 lowercase letters, numbers or hyphens'], 400);
            }
            $chk = $db->prepare('SELECT id FROM companies WHERE slug = :slug AND id != :id');
            $chk->execute([':slug' => $slug, ':id' => $id]);
            if ($chk->fetch()) sendJson(['success' => false, 'error' => 'Slug already taken'], 409);
            $db->prepare('UPDATE companies SET slug = :slug WHERE id = :id')
               ->execute([':slug' => $slug, ':id' => $id]);
        }
        if ($name !== null && $name !== '') {
            $db->prepare('UPDATE companies SET name = :name WHERE id = :id')
               ->execute([':name' => $name, ':id' => $id]);
        }
        if ($active !== null) {
            $db->prepare('UPDATE companies SET active = :a WHERE id = :id')
               ->execute([':a' => $active, ':id' => $id]);
        }
        if ($ae !== null) {
            $db->prepare('UPDATE companies SET approvals_enabled = :ae WHERE id = :id')
               ->execute([':ae' => $ae, ':id' => $id]);
        }
        if (array_key_exists('time_app_enabled', $payload)) {
            $db->prepare('UPDATE companies SET time_app_enabled = :v WHERE id = :id')
               ->execute([':v' => (int) $payload['time_app_enabled'], ':id' => $id]);
        }
        if (array_key_exists('supervisor_ui_enabled', $payload)) {
            $db->prepare('UPDATE companies SET supervisor_ui_enabled = :v WHERE id = :id')
               ->execute([':v' => (int) $payload['supervisor_ui_enabled'], ':id' => $id]);
        }
        if ($lang !== null && in_array($lang, ['en', 'fi', 'sv', 'et', 'uk', 'xh'], true)) {
            $db->prepare('UPDATE companies SET ui_language = :lang WHERE id = :id')
               ->execute([':lang' => $lang, ':id' => $id]);
        }
        if ($businessId !== null) {
            $db->prepare('UPDATE companies SET salaxy_company_id = :sid WHERE id = :id')
               ->execute([':sid' => $businessId ?: null, ':id' => $id]);
        }
        $salaxyCredsChanged = false;
        if (array_key_exists('salaxy_api_url', $payload)) {
            $db->prepare('UPDATE companies SET salaxy_api_url = :v WHERE id = :id')
               ->execute([':v' => trim((string) $payload['salaxy_api_url']) ?: null, ':id' => $id]);
            $salaxyCredsChanged = true;
        }
        if (array_key_exists('salaxy_username', $payload)) {
            $db->prepare('UPDATE companies SET salaxy_username = :v WHERE id = :id')
               ->execute([':v' => trim((string) $payload['salaxy_username']) ?: null, ':id' => $id]);
            $salaxyCredsChanged = true;
        }
        if (array_key_exists('salaxy_password', $payload) && trim((string) $payload['salaxy_password']) !== '') {
            $db->prepare('UPDATE companies SET salaxy_password = :v WHERE id = :id')
               ->execute([':v' => trim((string) $payload['salaxy_password']), ':id' => $id]);
            $salaxyCredsChanged = true;
        }
        if ($salaxyCredsChanged) {
            @unlink(DB_DIR . '/salaxy_token_' . $id . '.json');
        }

        $stmt = $db->prepare(
            'SELECT id, name, slug, active, approvals_enabled, time_app_enabled, supervisor_ui_enabled,
                    ui_language, salaxy_company_id AS business_id, db_file,
                    salaxy_api_url, salaxy_username
             FROM companies WHERE id = :id'
        );
        $stmt->execute([':id' => $id]);
        $company                    = $stmt->fetch();
        $company['employee_count']   = countActiveEmployees($id);
        $company['last_activity_at'] = getLastActivity($company['db_file'] ?? null);
        sendJson(['success' => true, 'company' => $company]);
    }

    // Create new company
    $name     = trim((string) ($payload['name']     ?? ''));
    $slug     = trim((string) ($payload['slug']     ?? ''));
    $email    = trim((string) ($payload['email']    ?? ''));
    $password = (string) ($payload['password'] ?? '');

    if (!$name || !$slug || !$email || !$password) {
        sendJson(['success' => false, 'error' => 'name, slug, email and password are required'], 400);
    }
    if (!preg_match('/^[a-z0-9-]+$/', $slug) || strlen($slug) < 2) {
        sendJson(['success' => false, 'error' => 'Slug must be at least 2 lowercase letters, numbers or hyphens'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJson(['success' => false, 'error' => 'Invalid email address'], 400);
    }
    if (strlen($password) < 6) {
        sendJson(['success' => false, 'error' => 'Password must be at least 6 characters'], 400);
    }

    $chk = $db->prepare('SELECT id FROM companies WHERE slug = :slug');
    $chk->execute([':slug' => $slug]);
    if ($chk->fetch()) sendJson(['success' => false, 'error' => 'Slug already taken'], 409);

    $db->prepare(
        'INSERT INTO companies (name, slug, salaxy_api_url, salaxy_username, salaxy_password)
         VALUES (:name, :slug, :api_url, :username, :password)'
    )->execute([
        ':name'     => $name,
        ':slug'     => $slug,
        ':api_url'  => SALAXY_API_URL,
        ':username' => SALAXY_USERNAME,
        ':password' => SALAXY_PASSWORD,
    ]);
    $companyId = (int) $db->lastInsertId();

    $db->prepare('UPDATE companies SET db_file = :f WHERE id = :id')
       ->execute([':f' => 'companies/' . $companyId . '.sqlite', ':id' => $companyId]);

    // Init company DB and insert first admin
    $companyDb = getCompanyDb($companyId);
    $companyDb->prepare(
        'INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
         VALUES (:cid, :email, :hash, :name, :role, 1)'
    )->execute([
        ':cid'   => $companyId,
        ':email' => $email,
        ':hash'  => password_hash($password, PASSWORD_DEFAULT),
        ':name'  => $email,
        ':role'  => 'company_admin',
    ]);

    sendJson([
        'success' => true,
        'company' => ['id' => $companyId, 'name' => $name, 'slug' => $slug, 'employee_count' => 0],
    ], 201);
}

sendJson(['success' => false, 'error' => 'Method not allowed'], 405);
