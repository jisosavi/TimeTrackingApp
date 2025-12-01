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
$systemPrompt = "Olet TimeAppin tuntikirjausassistentti. Tänään on {$today}. Keskustele suomeksi.

TULKINTAOHJEET:
- Tulkitse 'tänään' = {$today}, 'eilen', 'toissapäivänä', 'huomenna' automaattisesti
- Tulkitse 'viime maanantaina', 'viime tiistaina' jne. oikein
- Käytä päivämäärissä muotoa DD-MM-YYYY
- Jos on alkamisaika ja tuntimäärä ilman loppuaikaa, LASKE loppuaika automaattisesti
- Jos on loppuaika ja tuntimäärä ilman alkuaikaa, LASKE alkuaika automaattisesti
- Jos projektia tai kommenttia ei anneta, jätä tyhjäksi
- TÄRKEÄÄ: Laske tunnit AINA kellonaikojen perusteella (loppu - alku)

MILLOIN KIRJAUS ON VALMIS:
Kirjaus on valmis kun voit määrittää päivämäärän JA kellonajat (alku+loppu). Kellonajat voi päätellä:
- Suoraan annettu: '9-12' tai 'klo 9-12'
- Alkuaika + tunnit: '9 alkaen 3h' -> 09:00-12:00
- Loppuaika + tunnit: '12 asti 3h' -> 09:00-12:00
- Pelkkä tuntimäärä EI RIITÄ, kysy alkuaikaa

VASTAUSMUOTO:

Yhteenveto:
* Päivämäärä: [DD-MM-YYYY]
* Aloitusaika: [HH:MM]
* Lopetusaika: [HH:MM]
* Tunnit: [X.X]
* Projekti: [nimi tai tyhjä]
* Kommentti: [teksti tai tyhjä]

Jos tulkitsin väärin, kerro mitä pitää korjata.
Jos kaikki ok, voit jatkaa seuraavaan tai lopettaa.

JSON-SÄÄNNÖT:
- Lisää JSON-lohko AINA kun kirjaus on VALMIS (päivämäärä + kellonajat tiedossa)
- ÄLÄ lisää JSON-lohkoa VAIN jos et voi päätellä kellonaikoja ja kysyt niitä
- ÄLÄ KOSKAAN kysy varmistuksia kuten 'Onko tämä oikein?', 'Onko muita muutoksia?', 'Haluatko muuttaa jotain?'
- Kun käyttäjä antaa korjauksen, lisää HETI päivitetty JSON - käyttäjä voi aina korjata lisää jos haluaa

TÄRKEÄÄ - action-kenttä:
- action: 'new' = ensimmäinen kirjaus tai uusi kirjaus (käyttäjä sanoo 'seuraava', 'toinen kirjaus', tai selvästi eri päivä/konteksti)
- action: 'update' = käyttäjä KORJAA tai TÄYDENTÄÄ juuri käsiteltyä kirjausta

JSON-muoto (käytä TARKALLEEN kolme backtick-merkkiä):
" . '```json
{"action":"new tai update","entries":[{"date":"DD-MM-YYYY","start":"HH:MM","end":"HH:MM","hours":X.X,"project":"nimi","notes":"kommentti"}]}
```' . "
";

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
    
    // Käyttäjäystävälliset virheilmoitukset
    if ($httpCode === 429 || strpos($errorMsg, 'Resource exhausted') !== false) {
        $errorMsg = 'Tekoälypalvelun käyttöraja on täynnä. Odota hetki ja yritä uudelleen, tai luo uusi API-avain.';
    } elseif ($httpCode === 401 || $httpCode === 403 || strpos($errorMsg, 'API key') !== false) {
        $errorMsg = 'API-avain on virheellinen tai vanhentunut. Tarkista config.php.';
    } elseif ($httpCode === 404) {
        $errorMsg = 'Tekoälymallia ei löydy. Tarkista mallin nimi llm_proxy.php:ssä.';
    }
    
    echo json_encode(['error' => $errorMsg]);
    exit;
}

$reply = $data['candidates'][0]['content']['parts'][0]['text'] ?? 'Ei vastausta.';
echo json_encode(['reply' => $reply]);
