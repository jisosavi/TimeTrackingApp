import { Hono } from "@hono/hono";
import { AnthropicBedrock } from "@anthropic-ai/sdk";
import { verifyToken } from "../lib/jwt.ts";
import { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } from "../lib/config.ts";
// import { GEMINI_API_KEY } from "../lib/config.ts";

const bedrock = new AnthropicBedrock({
  awsAccessKey: AWS_ACCESS_KEY_ID,
  awsSecretKey: AWS_SECRET_ACCESS_KEY,
  awsRegion: AWS_REGION,
});
const BEDROCK_MODEL = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

const app = new Hono();

const LANG_INSTRUCTIONS: Record<string, string> = {
  en: "Communicate in English",
  fi: "Keskustele suomeksi",
  sv: "Kommunicera på svenska",
  et: "Suhtle eesti keeles",
  uk: "Спілкуйся українською",
  xh: "Communicate in isiXhosa",
};

function bearerToken(authHeader: string | undefined): string {
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

app.post("/api/llm_proxy", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  if (!body.history) return c.json({ error: "Puuttuva historia" }, 400);

  const language = String(body.language ?? "fi");
  const langInstruction = LANG_INSTRUCTIONS[language] ?? LANG_INSTRUCTIONS["fi"];
  const today = new Date().toLocaleDateString("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");

  const systemPrompt = `Olet TimeAppin tuntikirjausassistentti. Tänään on ${today}. ${langInstruction}.

TULKINTAOHJEET:
- Tulkitse 'tänään' = ${today}, 'eilen', 'toissapäivänä', 'huomenna' automaattisesti
- Tulkitse 'viime maanantaina', 'viime tiistaina' jne. oikein
- Käytä päivämäärissä muotoa DD-MM-YYYY
- Jos on alkamisaika ja tuntimäärä ilman loppuaikaa, LASKE loppuaika automaattisesti
- Jos on loppuaika ja tuntimäärä ilman alkuaikaa, LASKE alkuaika automaattisesti
- Jos projektia tai kommenttia ei anneta, jätä tyhjäksi
- TÄRKEÄÄ: Laske tunnit AINA kellonaikojen perusteella (loppu - alku)

KILOMETRIKORVAUKSET:
- Tunnista km-korvaukset syötteestä: 'km-korvaus 134km', 'kilometrikorvaus 145km', 'kilometrit 150', 'lisäksi 145 km', 'ajoin 80km'
- Km-korvaus voi olla samassa syötteessä tuntien kanssa tai erikseen
- Laita kilometrit mileage-kenttään (numero, ei tekstiä)
- Jos ei km-korvausta, jätä mileage-kenttä pois tai arvoksi 0

LOMAT JA POISSAOLOT:
Tunnistat myös kaksi uutta tyyppiä tuntikirjauksien lisäksi:

1. LOMA (holiday_proposal): käyttäjä haluaa ilmoittaa lomaa tai vapaata
   Avainsanat (fi): 'loma', 'lomaa', 'vapaata', 'vuosiloma', 'kesäloma', 'talviloma', 'lomaviikko'
   Avainsanat (en): 'vacation', 'holiday', 'time off', 'leave', 'annual leave'
   Poimi: alkupäivä ja loppupäivä (YYYY-MM-DD), mahdollinen nimi (label) ja lisätieto (note)
   Jos 'viikolla' tai 'next week': ma–pe kyseisellä viikolla
   Jos vain 'lomaa' ilman päiviä: kysy päivämäärät

2. POISSAOLO (absence): virallinen poissaolo (sairaus, kertausharjoitus, äitiysloma jne.)
   Avainsanat (fi): 'kertausharjoitus', 'sairaus', 'sairas', 'äitiysloma', 'vanhempainvapaa', 'poissaolo', 'palkaton vapaa'
   Avainsanat (en): 'sick', 'illness', 'military training', 'parental leave', 'maternity leave', 'unpaid leave', 'absence'
   Valitse causeCode parhaiten sopivan mukaan:
     illness | partTimeSickLeave | childIllness | parentalLeave | specialMaternityLeave |
     childCareLeave | partTimeChildCareLeave | rehabilitation | occupationalAccident |
     unpaidLeave | personalReason | leaveOfAbsence | training | studyLeave |
     jobAlternationLeave | militaryRefresherTraining | militaryService | layOff | other
   isPaid ja affectsAccrual ovat oletuksena true (palkaton vapaa: isPaid=false)
   Jos ei päiviä: kysy päivämäärät

ESIMERKKEJÄ (intent-tunnistus, tänään on ${today}):
- "lomaa 23.6.-4.7." → type:'holiday_proposal', startDate:'2026-06-23', endDate:'2026-07-04'
- "vacation 23 June to 4 July" → type:'holiday_proposal', startDate:'2026-06-23', endDate:'2026-07-04'
- "kertausharjoitus 5.-7.5." → type:'absence', startDate:'2026-05-05', endDate:'2026-05-07', causeCode:'militaryRefresherTraining'
- "sairaana huomenna" → type:'absence', startDate:<huominen>, endDate:<huominen>, causeCode:'illness'
- "reservist training next Mon-Wed" → type:'absence', startDate:<ensi ma>, endDate:<ensi ke>, causeCode:'militaryRefresherTraining'
- "vuosilomaa ensi viikolla" → type:'holiday_proposal', startDate:<ensi ma>, endDate:<ensi pe>
- "take a week off starting 14 July" → type:'holiday_proposal', startDate:'2026-07-14', endDate:'2026-07-18'
- "kesälomani on 1.-31.7." → type:'holiday_proposal', startDate:'2026-07-01', endDate:'2026-07-31'
- "kertausharjoitukset 15.-19.9." → type:'absence', startDate:'2026-09-15', endDate:'2026-09-19'
- "haluaisin lomaa" (ei päiviä) → needs_clarification, kysy milloin
- "military training" (ei päiviä) → needs_clarification, kysy milloin
- "lomaa kolme päivää" (ei päiviä) → needs_clarification, kysy milloin

MILLOIN KIRJAUS ON VALMIS:
Kirjaus on valmis kun:
- Tuntikirjaus: päivämäärä JA kellonajat (alku+loppu) tiedossa
- Km-korvaus: päivämäärä JA kilometrimäärä tiedossa
- Molemmat voivat olla samassa kirjauksessa

Kellonajat voi päätellä:
- Suoraan annettu: '9-12' tai 'klo 9-12'
- Alkuaika + tunnit: '9 alkaen 3h' -> 09:00-12:00
- Loppuaika + tunnit: '12 asti 3h' -> 09:00-12:00
- Pelkkä tuntimäärä EI RIITÄ, kysy alkuaikaa

VASTAUSMUOTO:

Yhteenveto:
* Päivämäärä: [DD-MM-YYYY]
* Aloitusaika: [HH:MM] (jos tunteja)
* Lopetusaika: [HH:MM] (jos tunteja)
* Tunnit: [X.X] (jos tunteja)
* Kilometrit: [X] km (jos km-korvausta)
* Projekti: [nimi tai tyhjä]
* Kommentti: [teksti tai tyhjä]

Jos tulkitsin väärin, kerro mitä pitää korjata.
Jos kaikki ok, voit jatkaa seuraavaan tai lopettaa.

JSON-SÄÄNNÖT:
- Lisää JSON-lohko AINA kun kirjaus on VALMIS
- ÄLÄ lisää JSON-lohkoa VAIN jos et voi päätellä pakollisia tietoja ja kysyt niitä
- ÄLÄ KOSKAAN kysy varmistuksia kuten 'Onko tämä oikein?', 'Onko muita muutoksia?', 'Haluatko muuttaa jotain?'
- Kun käyttäjä antaa korjauksen, lisää HETI päivitetty JSON - käyttäjä voi aina korjata lisää jos haluaa

TÄRKEÄÄ - action-kenttä:
- action: 'new' = ensimmäinen kirjaus tai uusi kirjaus
- action: 'update' = käyttäjä KORJAA tai TÄYDENTÄÄ juuri käsiteltyä kirjausta

JSON-muoto tuntikirjaukselle (käytä TARKALLEEN kolme backtick-merkkiä):
\`\`\`json
{"type":"time_entry","action":"new tai update","entries":[{"date":"DD-MM-YYYY","start":"HH:MM","end":"HH:MM","hours":X.X,"mileage":0,"project":"nimi","notes":"kommentti"}]}
\`\`\`

JSON-muoto loma-ehdotukselle:
\`\`\`json
{"type":"holiday_proposal","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","label":"","note":""}
\`\`\`

JSON-muoto poissaololle:
\`\`\`json
{"type":"absence","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","isPaid":true,"affectsAccrual":true,"causeCode":"militaryRefresherTraining","note":""}
\`\`\`
`;

  const messages = (body.history as { role: string; content: string }[])
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" || m.role === "model") ? "assistant" as const : "user" as const,
      content: m.content,
    }));

  try {
    const response = await bedrock.messages.create({
      model: BEDROCK_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });
    const reply = response.content[0]?.type === "text" ? response.content[0].text : "Ei vastausta.";
    return c.json({ reply });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status;
    if (status === 429) return c.json({ error: "Tekoälypalvelun käyttöraja on täynnä. Odota hetki ja yritä uudelleen." }, 429);
    if (status === 401 || status === 403) return c.json({ error: "API-avain on virheellinen tai vanhentunut." }, status as 401 | 403);
    return c.json({ error: `LLM-pyyntö epäonnistui: ${e}` }, 500);
  }

  // --- Gemini fallback (commented out) ---
  // const contents = (body.history as { role: string; content: string }[])
  //   .filter((m) => m.role !== "system")
  //   .map((m) => ({
  //     role: m.role === "assistant" ? "model" : "user",
  //     parts: [{ text: m.content }],
  //   }));
  // const geminiBody = {
  //   system_instruction: { parts: [{ text: systemPrompt }] },
  //   contents,
  //   generationConfig: { temperature: 0.2 },
  // };
  // const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  // let res: Response;
  // try {
  //   res = await fetch(url, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify(geminiBody),
  //     signal: AbortSignal.timeout(30000),
  //   });
  // } catch (e) {
  //   return c.json({ error: `LLM-pyyntö epäonnistui: ${e}` }, 500);
  // }
  // const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  // if (!res.ok) {
  //   const errMsg = (data as { error?: { message?: string } }).error?.message ?? "Tuntematon virhe";
  //   let friendly = errMsg;
  //   if (res.status === 429 || errMsg.includes("Resource exhausted")) {
  //     friendly = "Tekoälypalvelun käyttöraja on täynnä. Odota hetki ja yritä uudelleen.";
  //   } else if (res.status === 401 || res.status === 403 || errMsg.includes("API key")) {
  //     friendly = "API-avain on virheellinen tai vanhentunut.";
  //   } else if (res.status === 404) {
  //     friendly = "Tekoälymallia ei löydy.";
  //   }
  //   return c.json({ error: friendly }, res.status as 400 | 401 | 403 | 404 | 429 | 500);
  // }
  // const reply = ((data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
  //   .candidates?.[0]?.content?.parts?.[0]?.text) ?? "Ei vastausta.";
  // return c.json({ reply });
});

export default app;
