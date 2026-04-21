<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: max-age=60');

$slug = trim((string) ($_GET['slug'] ?? ''));

if ($slug === '') {
    echo json_encode(['ui_language' => 'en']);
    exit;
}

try {
    $db   = getDb();
    $stmt = $db->prepare('SELECT ui_language FROM companies WHERE slug = :slug AND active = 1 LIMIT 1');
    $stmt->execute([':slug' => $slug]);
    $row  = $stmt->fetch();
    $lang = ($row && $row['ui_language']) ? $row['ui_language'] : 'en';
    echo json_encode(['ui_language' => $lang]);
} catch (Throwable $e) {
    echo json_encode(['ui_language' => 'en']);
}
