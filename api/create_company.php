<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../bootstrap.php';

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    
    if (!$payload || !isset($payload['name'], $payload['slug'], $payload['email'], $payload['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing required fields']);
        exit;
    }
    
    $name = trim($payload['name']);
    $slug = trim($payload['slug']);
    $email = trim($payload['email']);
    $password = $payload['password'];
    
    // Validaatio
    if (!$name || !$slug || !$email || !$password) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Kaikki kentät ovat pakollisia']);
        exit;
    }
    
    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Salasanan on oltava vähintään 6 merkkiä']);
        exit;
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Virheellinen sähköpostiosoite']);
        exit;
    }
    
    // Tarkista slug:in uniqueness
    if (!preg_match('/^[a-z0-9-]+$/', $slug)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Slug saa sisältää vain pieniä kirjaimia, numeroita ja viivoja']);
        exit;
    }
    
    $db = getDb();
    
    // Tarkista slug
    $stmt = $db->prepare('SELECT id FROM companies WHERE slug = :slug');
    $stmt->execute([':slug' => $slug]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'Tämä slug on jo käytössä']);
        exit;
    }
    
    // Tarkista email
    $stmt = $db->prepare('SELECT id FROM company_admins WHERE email = :email');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'Tämä sähköpostiosoite on jo rekisteröity']);
        exit;
    }
    
    // Luo yritys
    $stmt = $db->prepare(
        'INSERT INTO companies (name, slug, salaxy_api_url, salaxy_username, salaxy_password)
         VALUES (:name, :slug, :api_url, :username, :password)'
    );
    $stmt->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':api_url' => SALAXY_API_URL,
        ':username' => SALAXY_USERNAME,
        ':password' => SALAXY_PASSWORD,
    ]);
    
    $companyId = (int) $db->lastInsertId();
    
    // Luo admin-käyttäjä yritykselle
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare(
        'INSERT INTO company_admins (company_id, email, password_hash, name, role, active)
         VALUES (:company_id, :email, :password_hash, :name, :role, 1)'
    );
    $stmt->execute([
        ':company_id' => $companyId,
        ':email' => $email,
        ':password_hash' => $passwordHash,
        ':name' => $email,
        ':role' => 'company_admin',
    ]);
    
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Yritys luotu onnistuneesti',
        'company' => [
            'id' => $companyId,
            'name' => $name,
            'slug' => $slug,
        ]
    ]);
} catch (Throwable $e) {
    error_log('Create company error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
