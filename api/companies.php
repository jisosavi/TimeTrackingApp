<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $db = getDb();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $db->query(
            'SELECT c.id, c.name, c.slug, c.active, COUNT(e.id) AS employee_count
             FROM companies c
             LEFT JOIN employees e ON e.company_id = c.id
             GROUP BY c.id
             ORDER BY c.name ASC'
        );
        echo json_encode(['success' => true, 'companies' => $stmt->fetchAll()]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true) ?? [];

        $id     = isset($payload['id'])     ? (int) $payload['id']     : null;
        $active = isset($payload['active']) ? (int) $payload['active'] : null;

        if (!$id || $active === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id and active are required']);
            exit;
        }

        $db->prepare('UPDATE companies SET active = :active WHERE id = :id')
           ->execute([':active' => $active, ':id' => $id]);

        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('Companies error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
