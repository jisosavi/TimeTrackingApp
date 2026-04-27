<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/jwt.php';

$raw     = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['email'], $payload['password'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email and password are required']);
    exit;
}

$email    = trim($payload['email']);
$password = $payload['password'];
$slug     = trim((string) ($payload['slug'] ?? ''));

try {
    if ($slug === '') {
        // Super-admin login — credentials live in master DB
        $db   = getMasterDb();
        $stmt = $db->prepare('SELECT * FROM super_admins WHERE email = :email AND active = 1');
        $stmt->execute([':email' => $email]);
        $admin = $stmt->fetch();

        if (!$admin || !verifyPassword($password, $admin['password_hash'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
            exit;
        }

        $token = generateToken((int) $admin['id'], 'superadmin', 0);
        echo json_encode([
            'success'     => true,
            'token'       => $token,
            'admin'       => [
                'id'          => (int) $admin['id'],
                'email'       => $admin['email'],
                'name'        => $admin['name'],
                'role'        => 'superadmin',
                'company_id'  => 0,
                'ui_language' => $admin['ui_language'] ?? 'en',
            ],
            'company'     => ['name' => '', 'slug' => '', 'active' => 1, 'approvals_enabled' => 0, 'ui_language' => 'en'],
            'ui_language' => $admin['ui_language'] ?? 'en',
        ]);
    } else {
        // Company admin login — resolve company from master, then open company DB
        $masterDb = getMasterDb();
        $compStmt = $masterDb->prepare(
            'SELECT id, name, slug, active, approvals_enabled, ui_language FROM companies WHERE slug = :slug AND active = 1'
        );
        $compStmt->execute([':slug' => $slug]);
        $company = $compStmt->fetch();

        if (!$company) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
            exit;
        }

        $companyId = (int) $company['id'];
        $db        = getCompanyDb($companyId);
        $stmt      = $db->prepare('SELECT * FROM company_admins WHERE email = :email AND active = 1');
        $stmt->execute([':email' => $email]);
        $admin = $stmt->fetch();

        if (!$admin || !verifyPassword($password, $admin['password_hash'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
            exit;
        }

        $companyLang   = $company['ui_language'] ?? 'en';
        $adminLang     = $admin['ui_language'] ?? null;
        $effectiveLang = $adminLang ?: $companyLang ?: 'en';
        $token         = generateToken((int) $admin['id'], 'admin', $companyId);

        echo json_encode([
            'success'     => true,
            'token'       => $token,
            'admin'       => [
                'id'          => (int) $admin['id'],
                'email'       => $admin['email'],
                'name'        => $admin['name'],
                'role'        => $admin['role'],
                'company_id'  => $companyId,
                'ui_language' => $effectiveLang,
            ],
            'company'     => [
                'name'              => $company['name'],
                'slug'              => $company['slug'],
                'active'            => (int) $company['active'],
                'approvals_enabled' => (int) $company['approvals_enabled'],
                'ui_language'       => $companyLang,
            ],
            'ui_language' => $effectiveLang,
        ]);
    }
} catch (Throwable $e) {
    error_log('Admin login error: ' . $e->getMessage());
    error_log($e->getTraceAsString());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
