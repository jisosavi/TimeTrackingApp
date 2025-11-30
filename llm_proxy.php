<?php
declare(strict_types=1);
error_reporting(0);  // Move this AFTER declare
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

$today = date('d-m-Y');
$systemPrompt = "Olet TimeAppin tuntikirjausassistentti. \
Tänään on {$today}. \
Keskustele suomeksi, pyydä puuttuvat tiedot ja tee lopussa yhteenveto. \
Tulkitse suhteelliset päivämäärät automaattisesti ilman varmistusta: 'tänään' = {$today}, 'eilen', 'toissapäivänä', 'huomenna', 'ylihuomenna' lasketaan suhteessa tähän päivään. \
Tulkitse myös viime viikon viikonpäivät: 'viime maanantaina', 'viime tiistaina', 'viime keskiviikkona', 'viime torstaina', 'viime perjantaina', 'viime lauantaina', 'viime sunnuntaina' sekä 'viime viikon maanantaina' jne. \
Lisää aina vastauksen loppuun JSON-muotoinen kooste seuraavassa muodossa: \
```json\n{\"entries\":[{\"date\":\"DD-MM-YYYY\",\"start\":\"HH:MM\",\"end\":\"HH:MM\",\"hours\":X.X,\"project\":\"Nimi\",\"notes\":\"kuvaus\"}]}\n``` \
Käytä päivämäärissä suomalaista muotoa DD-MM-YYYY. \
Jos syötteessä on vain tuntimäärä ilman aikoja, arvioi varovasti ja kysy tarvittaessa. \
Jos syötteessä on alkamisaika ja tuntimäärä mutta ei loppumisaikaa, laske loppumisaika (esim. alkaen 8:00, 4 tuntia → end=12:00). \
Jos projektia tai kommenttia ei anneta, jätä ne tyhjiksi JSONissa (project=\"\", notes=\"\"). Älä kysy niitä erikseen. \
Jos projektia tai kommenttia ei anneta, jätä ne tyhjiksi JSONissa (project=\"\", notes=\"\"). Älä kysy niitä erikseen. \
Lopeta vastaus aina näin: 'Jos tulkitsin väärin, kerro mitä pitää korjata.\nJos kaikki ok, voit jatkaa seuraavaan tai lopettaa.'";

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

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . $apiKey;

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
//curl_close($ch);

$data = json_decode($response, true);

if ($httpCode >= 400) {
    http_response_code($httpCode);
    $errorMsg = $data['error']['message'] ?? 'Tuntematon virhe';
    echo json_encode(['error' => $errorMsg]);
    exit;
}

$reply = $data['candidates'][0]['content']['parts'][0]['text'] ?? 'Ei vastausta.';
echo json_encode(['reply' => $reply]);
