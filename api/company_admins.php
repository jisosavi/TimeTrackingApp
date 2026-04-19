<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $db = getDb();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $companyId = isset($_GET['company_id']) ? (int) $_GET['company_id'] : 0;
        if (!$companyId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'company_id required']);
            exit;
        }
        $stmt = $db->prepare(
            'SELECT id, email, name, role, active FROM company_admins
             WHERE company_id = :cid ORDER BY email ASC'
        );
        $stmt->execute([':cid' => $companyId]);
        echo json_encode(['success' => true, 'admins' => $stmt->fetchAll()]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $payload   = json_decode(file_get_contents('php://input'), true) ?? [];
        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : 0;
        $id        = isset($payload['id']) ? (int) $payload['id'] : null;
        $email     = trim((string) ($payload['email']    ?? ''));
        $name      = trim((string) ($payload['name']     ?? ''));
        $password  = trim((string) ($payload['password'] ?? ''));
        $active    = isset($payload['active']) ? (int) $payload['active'] : 1;

        if (!$companyId || !$email) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'company_id ja email vaaditaan']);
            exit;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Virheellinen sähköpostiosoite']);
            exit;
        }

        if ($id) {
            if ($password !== '') {
                if (strlen($password) < 6) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Salasanan on oltava vähintään 6 merkkiä']);
                    exit;
                }
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $db->prepare(
                    'UPDATE company_admins SET email = :email, name = :name, password_hash = :hash, active = :active
                     WHERE id = :id AND company_id = :cid'
                )->execute([':email' => $email, ':name' => $name, ':hash' => $hash, ':active' => $active, ':id' => $id, ':cid' => $companyId]);
            } else {
                $db->prepare(
                    'UPDATE company_admins SET email = :email, name = :name, active = :active
                     WHERE id = :id AND company_id = :cid'
                )->execute([':email' => $email, ':name' => $name, ':active' => $active, ':id' => $id, ':cid' => $companyId]);
            }
        } else {
            if ($password === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Salasana vaaditaan uudelle adminille']);
                exit;
            }
            if (strlen($password) < 6) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Salasanan on oltava vähintään 6 merkkiä']);
                exit;
            }
            $existing = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
            $existing->execute([':email' => $email]);
            if ($existing->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Sähköposti on jo käytössä']);
                exit;
            }
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $db->prepare(
                'INSERT INTO company_admins (company_id, email, name, password_hash, role, active)
                 VALUES (:cid, :email, :name, :hash, :role, :active)'
            )->execute([':cid' => $companyId, ':email' => $email, ':name' => $name, ':hash' => $hash, ':role' => 'company_admin', ':active' => $active]);
            $id = (int) $db->lastInsertId();
        }

        $stmt = $db->prepare('SELECT id, email, name, role, active FROM company_admins WHERE id = :id');
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'admin' => $stmt->fetch()]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = isset($payload['id']) ? (int) $payload['id'] : 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id required']);
            exit;
        }
        $db->prepare('DELETE FROM company_admins WHERE id = :id')->execute([':id' => $id]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('Company admins error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
