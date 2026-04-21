<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/jwt.php';

function getJsonPayload(): array
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function sendJson(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function getAdminById(int $id): ?array
{
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM company_admins WHERE id = :id AND active = 1');
    $stmt->execute([':id' => $id]);
    $admin = $stmt->fetch();
    return $admin ?: null;
}

function requireAdmin(): array
{
    $token  = getBearerToken();
    $claims = $token ? verifyToken($token) : null;
    if (!$claims || $claims['user_type'] !== 'admin') {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $admin = getAdminById((int) $claims['user_id']);
    if (!$admin) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $admin;
}

function requireSupervisor(): array
{
    $token  = getBearerToken();
    $claims = $token ? verifyToken($token) : null;
    if (!$claims || $claims['user_type'] !== 'supervisor') {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM supervisors WHERE id = :id AND active = 1');
    $stmt->execute([':id' => (int) $claims['user_id']]);
    $sup  = $stmt->fetch();
    if (!$sup) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $sup;
}

function requireEmployee(): array
{
    $token  = getBearerToken();
    $claims = $token ? verifyToken($token) : null;
    if (!$claims || $claims['user_type'] !== 'employee') {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM employees WHERE id = :id AND active = 1');
    $stmt->execute([':id' => (int) $claims['user_id']]);
    $emp  = $stmt->fetch();
    if (!$emp) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $emp;
}

function requireSuperAdmin(): array
{
    $token  = getBearerToken();
    $claims = $token ? verifyToken($token) : null;
    if (!$claims || $claims['user_type'] !== 'superadmin') {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $db   = getDb();
    $stmt = $db->prepare("SELECT * FROM company_admins WHERE id = :id AND role = 'superadmin' AND active = 1");
    $stmt->execute([':id' => (int) $claims['user_id']]);
    $admin = $stmt->fetch();
    if (!$admin) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $admin;
}

function requireAdminOrSupervisor(): array
{
    $token  = getBearerToken();
    $claims = $token ? verifyToken($token) : null;
    if (!$claims) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    if ($claims['user_type'] === 'admin') {
        $admin = getAdminById((int) $claims['user_id']);
        if ($admin) {
            return ['type' => 'admin', 'id' => (int) $admin['id'], 'company_id' => (int) $admin['company_id']];
        }
    }
    if ($claims['user_type'] === 'supervisor') {
        $db   = getDb();
        $stmt = $db->prepare('SELECT * FROM supervisors WHERE id = :id AND active = 1');
        $stmt->execute([':id' => (int) $claims['user_id']]);
        $sup  = $stmt->fetch();
        if ($sup) {
            return ['type' => 'supervisor', 'id' => (int) $sup['id'], 'company_id' => (int) $sup['company_id']];
        }
    }
    sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
}
