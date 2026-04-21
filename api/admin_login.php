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

try {
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM company_admins WHERE email = :email AND active = 1');
    $stmt->execute([':email' => $email]);
    $admin = $stmt->fetch();

    if (!$admin || !verifyPassword($password, $admin['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
        exit;
    }

    $compStmt = $db->prepare('SELECT active, approvals_enabled, ui_language FROM companies WHERE id = :id');
    $compStmt->execute([':id' => $admin['company_id']]);
    $company = $compStmt->fetch() ?: [];

    $companyLang   = $company['ui_language'] ?? 'en';
    $adminLang     = $admin['ui_language'] ?? null;
    $effectiveLang = $adminLang ?: $companyLang ?: 'en';

    $isSuperAdmin = ($admin['role'] === 'superadmin');
    $userType     = $isSuperAdmin ? 'superadmin' : 'admin';
    $companyId    = $isSuperAdmin ? 0 : (int) $admin['company_id'];
    $token        = generateToken((int) $admin['id'], $userType, $companyId);

    echo json_encode([
        'success' => true,
        'token'   => $token,
        'admin'   => [
            'id'          => (int) $admin['id'],
            'email'       => $admin['email'],
            'name'        => $admin['name'],
            'role'        => $admin['role'],
            'company_id'  => (int) $admin['company_id'],
            'ui_language' => $effectiveLang,
        ],
        'company' => [
            'active'            => (int) ($company['active'] ?? 1),
            'approvals_enabled' => (int) ($company['approvals_enabled'] ?? 0),
            'ui_language'       => $companyLang,
        ],
        'ui_language' => $effectiveLang,
    ]);
} catch (Throwable $e) {
    error_log('Admin login error: ' . $e->getMessage());
    error_log($e->getTraceAsString());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
