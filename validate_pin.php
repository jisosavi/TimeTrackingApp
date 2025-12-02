<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['pin'])) {
    http_response_code(400);
    echo json_encode(['valid' => false, 'error' => 'PIN puuttuu']);
    exit;
}

$pin = $payload['pin'];

// Tarkista löytyykö PIN työntekijälistalta
if (isset($EMPLOYEES[$pin])) {
    $employee = $EMPLOYEES[$pin];
    echo json_encode([
        'valid' => true,
        'name' => $employee['name'],
        'employmentId' => $employee['employmentId']
    ]);
} else {
    http_response_code(401);
    echo json_encode(['valid' => false, 'error' => 'Väärä PIN']);
}

