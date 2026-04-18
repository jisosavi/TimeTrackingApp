<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

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
    if (!isset($_SESSION['admin_id'])) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $admin = getAdminById((int) $_SESSION['admin_id']);
    if (!$admin) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $admin;
}

function requireSupervisor(): array
{
    if (!isset($_SESSION['supervisor_id'])) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM supervisors WHERE id = :id AND active = 1');
    $stmt->execute([':id' => (int) $_SESSION['supervisor_id']]);
    $sup  = $stmt->fetch();
    if (!$sup) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $sup;
}

function requireEmployee(): array
{
    if (!isset($_SESSION['employee_id'])) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    $db   = getDb();
    $stmt = $db->prepare('SELECT * FROM employees WHERE id = :id AND active = 1');
    $stmt->execute([':id' => (int) $_SESSION['employee_id']]);
    $emp  = $stmt->fetch();
    if (!$emp) {
        sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
    }
    return $emp;
}

function requireAdminOrSupervisor(): array
{
    if (isset($_SESSION['admin_id'])) {
        $admin = getAdminById((int) $_SESSION['admin_id']);
        if ($admin) {
            return ['type' => 'admin', 'id' => (int) $admin['id'], 'company_id' => (int) $admin['company_id']];
        }
    }
    if (isset($_SESSION['supervisor_id'])) {
        $db   = getDb();
        $stmt = $db->prepare('SELECT * FROM supervisors WHERE id = :id AND active = 1');
        $stmt->execute([':id' => (int) $_SESSION['supervisor_id']]);
        $sup  = $stmt->fetch();
        if ($sup) {
            return ['type' => 'supervisor', 'id' => (int) $sup['id'], 'company_id' => (int) $sup['company_id']];
        }
    }
    sendJson(['success' => false, 'error' => 'Unauthorized'], 401);
}
