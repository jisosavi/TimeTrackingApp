<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
$apiKey = GEMINI_API_KEY;

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['history'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Puuttuva historia']);
    exit;
}

$messages = $payload['history'];

$systemPrompt = "Olet TimeAppin tuntikirjausassistentti. \
Keskustele suomeksi, pyydä puuttuvat tiedot ja tee lopussa yhteenveto. \
Lisää aina vastauksen loppuun JSON-muotoinen kooste seuraavassa muodossa: \
```json\n{\"entries\":[{\"date\":\"YYYY-MM-DD\",\"start\":\"HH:MM\",\"end\":\"HH:MM\",\"hours\":X.X,\"project\":\"Nimi\",\"notes\":\"kuvaus\"}]}\n``` \
Arvioi kellonaikojen puuttuessa niitä varovasti ja pyydä vahvistus.";

// Muunna OpenAI-muotoiset viestit Gemini-muotoon
$geminiContents = [];
foreach ($messages as $msg) {
    if ($msg['role'] === 'system') {
        // Gemini käsittelee system promptin erikseen
        continue;
    }
    $role = $msg['role'] === 'assistant' ? 'model' : 'user';
    $geminiContents[] = [
        'role' => $role,
        'parts' => [['text' => $msg['content']]]
    ];
}

$body = [
    'system_instruction' => [
        'parts' => [['text' => $systemPrompt]]
    ],
    'contents' => $geminiContents,
    'generationConfig' => [
        'temperature' => 0.2,
    ],
];

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' . $apiKey;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
    ],
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($body),
    CURLOPT_TIMEOUT => 30,
]);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'LLM-pyyntö epäonnistui: ' . curl_error($ch)]);
    curl_close($ch);
    exit;
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);

if ($httpCode >= 400) {
    http_response_code($httpCode);
    $errorMsg = $data['error']['message'] ?? 'Tuntematon virhe';
    echo json_encode(['error' => $errorMsg]);
    exit;
}

$reply = $data['candidates'][0]['content']['parts'][0]['text'] ?? 'Ei vastausta.';
echo json_encode(['reply' => $reply]);
