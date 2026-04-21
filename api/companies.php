<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

requireSuperAdmin();

$db = getDb();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query(
        'SELECT c.id, c.name, c.slug, c.active, c.approvals_enabled, c.ui_language,
                COUNT(e.id) AS employee_count
         FROM companies c
         LEFT JOIN employees e ON e.company_id = c.id AND e.active = 1
         GROUP BY c.id
         ORDER BY c.name ASC'
    );
    sendJson(['success' => true, 'companies' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = getJsonPayload();
    $id      = isset($payload['id']) ? (int) $payload['id'] : null;

    if ($id) {
        // Update existing company
        $name  = array_key_exists('name', $payload) ? trim((string) $payload['name']) : null;
        $slug  = array_key_exists('slug', $payload) ? trim((string) $payload['slug']) : null;
        $active = array_key_exists('active', $payload) ? (int) $payload['active'] : null;
        $ae    = array_key_exists('approvals_enabled', $payload) ? (int) $payload['approvals_enabled'] : null;
        $lang  = array_key_exists('ui_language', $payload) ? trim((string) $payload['ui_language']) : null;

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
        if ($lang !== null && in_array($lang, ['en', 'fi', 'sv', 'et', 'uk', 'xh'], true)) {
            $db->prepare('UPDATE companies SET ui_language = :lang WHERE id = :id')
               ->execute([':lang' => $lang, ':id' => $id]);
        }

        $stmt = $db->prepare(
            'SELECT c.id, c.name, c.slug, c.active, c.approvals_enabled, c.ui_language,
                    COUNT(e.id) AS employee_count
             FROM companies c
             LEFT JOIN employees e ON e.company_id = c.id AND e.active = 1
             WHERE c.id = :id GROUP BY c.id'
        );
        $stmt->execute([':id' => $id]);
        sendJson(['success' => true, 'company' => $stmt->fetch()]);
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

    $chk = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
    $chk->execute([':email' => $email]);
    if ($chk->fetch()) sendJson(['success' => false, 'error' => 'Email already registered'], 409);

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

    $db->prepare(
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
