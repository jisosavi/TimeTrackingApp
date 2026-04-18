<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function getJsonPayload(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function getAdminById(int $id): ?array
{
    $db = getDb();
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

function sendJson(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}
