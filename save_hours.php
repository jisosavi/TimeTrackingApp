<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
// APP_KEY talletettu erikseen muualle

if (($_SERVER['HTTP_X_APP_KEY'] ?? '') !== APP_KEY) {
    http_response_code(401);
    echo json_encode(['message' => 'Luvaton pyyntö']);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['entries']) || !is_array($payload['entries'])) {
    http_response_code(400);
    echo json_encode(['message' => 'Virheellinen data']);
    exit;
}

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

$file = $dataDir . '/time_entries.json';
if (!file_exists($file)) {
    file_put_contents($file, json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$current = json_decode(file_get_contents($file), true);
if (!is_array($current)) {
    $current = [];
}

foreach ($payload['entries'] as $entry) {
    $entry['saved_at'] = gmdate('c');
    $current[] = $entry;
}

file_put_contents(
    $file,
    json_encode($current, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
);

echo json_encode(['message' => 'Tallennettu', 'count' => count($payload['entries'])]);