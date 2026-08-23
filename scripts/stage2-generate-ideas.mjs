import { google } from "googleapis";

// ============================================================
// ASMR CLOUD FACTORY - STAGE 2
// Gemini Idea Agent
// ============================================================

const MODEL = "gemini-2.5-flash-lite";

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!spreadsheetId) {
  throw new Error("GOOGLE_SHEET_ID is missing");
}

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is missing");
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
}

// ============================================================
// GOOGLE SHEETS CONNECTION
// ============================================================

const credentials = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON
);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets"
  ]
});

const sheets = google.sheets({
  version: "v4",
  auth
});

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 50;
  }

  return Math.max(
    1,
    Math.min(100, Math.round(number))
  );
}

function calculateScore(idea) {

  const novelty = clampScore(idea.novelty);
  const viral = clampScore(idea.viral_potential);
  const search = clampScore(idea.search_potential);
  const audio = clampScore(idea.audio_potential);
  const visual = clampScore(idea.visual_potential);
  const monetization =
    clampScore(idea.monetization_potential);

  // Weighted performance score
  return Math.round(
    novelty * 0.15 +
    viral * 0.25 +
    search * 0.15 +
    audio * 0.20 +
    visual * 0.20 +
    monetization * 0.05
  );
}

async function logError(error, retryCount = 0) {

  try {

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "ERROR_DATABASE!A:F",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",

      requestBody: {
        values: [[
          new Date().toISOString(),
          "STAGE_2_IDEA_AGENT",
          String(error.message || error),
          retryCount,
          "Retry Gemini / wait for free quota reset",
          "FAILED"
        ]]
      }
    });

  } catch (logFailure) {

    console.error(
      "Could not write error to ERROR_DATABASE:",
      logFailure.message
    );

  }
}

// ============================================================
// READ PREVIOUS IDEAS
// ============================================================

async function getExistingIdeas() {

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "IDEA_DATABASE!B2:B"
  });

  const rows = result.data.values || [];

  return rows
    .map(row => row[0])
    .filter(Boolean)
    .slice(-150);
}

// ============================================================
// GEMINI API
// ============================================================

async function callGemini(prompt) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${MODEL}:generateContent`;

  const body = {

    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],

    generationConfig: {

      temperature: 1.15,

      maxOutputTokens: 7000,

      responseMimeType: "application/json",

      responseJsonSchema: {

        type: "array",

        minItems: 20,
        maxItems: 20,

        items: {

          type: "object",

          properties: {

            idea: {
              type: "string",
              description:
                "One concise original ASMR video concept"
            },

            category: {
              type: "string"
            },

            novelty: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },

            viral_potential: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },

            search_potential: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },

            audio_potential: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },

            visual_potential: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },

            monetization_potential: {
              type: "integer",
              minimum: 1,
              maximum: 100
            }
          },

          required: [
            "idea",
            "category",
            "novelty",
            "viral_potential",
            "search_potential",
            "audio_potential",
            "visual_potential",
            "monetization_potential"
          ]
        }
      }
    }
  };

  const retryDelays = [
    5000,
    15000,
    30000
  ];

  for (
    let attempt = 0;
    attempt <= retryDelays.length;
    attempt++
  ) {

    console.log(
      `Gemini request attempt ${attempt + 1}`
    );

    const response = await fetch(url, {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey
      },

      body: JSON.stringify(body)

    });

    if (response.ok) {

      const data = await response.json();

      const text =
        data?.candidates?.[0]
          ?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error(
          "Gemini returned no usable content"
        );
      }

      return JSON.parse(text);
    }

    const errorText = await response.text();

    console.error(
      `Gemini HTTP ${response.status}:`,
      errorText
    );

    const retryable =
      response.status === 429 ||
      response.status >= 500;

    if (
      retryable &&
      attempt < retryDelays.length
    ) {

      console.log(
        `Waiting ${
          retryDelays[attempt] / 1000
        } seconds before retry...`
      );

      await sleep(
        retryDelays[attempt]
      );

      continue;
    }

    throw new Error(
      `Gemini API failed with HTTP ` +
      `${response.status}: ${errorText}`
    );
  }

  throw new Error(
    "Gemini retry limit reached"
  );
}

// ============================================================
// GENERATE IDEAS
// ============================================================

async function generateIdeas(existingIdeas) {

  const previousText =
    existingIdeas.length > 0
      ? existingIdeas
          .map((idea, index) =>
            `${index + 1}. ${idea}`
          )
          .join("\n")
      : "No previous ideas exist yet.";

  const prompt = `
You are the Idea Agent for an autonomous,
commercial ASMR YouTube Shorts and Instagram
Reels content factory.

Generate EXACTLY 20 highly original ASMR video ideas.

PRIMARY GOAL:
Create concepts with strong visual satisfaction,
strong sound potential, repeat viewing potential,
loop potential and advertiser-friendly monetization.

PRODUCTION METHOD:
The videos will initially be produced using:
- AI-generated still images
- cloud animation
- zoom/pan/parallax
- particles and visual effects
- procedural/original ASMR audio
- cloud FFmpeg rendering

Therefore favour concepts that can look impressive
without requiring expensive text-to-video generation.

CATEGORIES YOU MAY USE:
- Satisfying textures
- Cutting
- Crushing
- Scratching
- Pouring
- Cleaning
- Water
- Sand
- Glass
- Metal
- Wood
- Mechanical
- Keyboard
- Packaging
- Nature
- Rain
- Sleep
- Surreal AI ASMR
- Impossible physics
- Luxury objects

RULES:

1. Return exactly 20 ideas.
2. Every idea must be meaningfully different.
3. Do not copy existing creators.
4. Do not use copyrighted characters.
5. Do not use brand names.
6. No copyrighted music.
7. No dangerous activities.
8. No gore.
9. No sexual content.
10. No hate content.
11. No medical claims.
12. No misleading content.
13. Keep concepts advertiser-friendly.
14. Prefer visually understandable concepts.
15. Prefer concepts suitable for 15-60 second videos.
16. Prefer videos that can loop seamlessly.
17. Include a mix of realistic and surreal ASMR.
18. Avoid generic repetitions of the same object.
19. Score realistically from 1 to 100.
20. Do not give every idea extremely high scores.

SCORING:

Novelty:
How different/fresh is the concept?

Viral Potential:
Likelihood of shares, rewatches and curiosity.

Search Potential:
Likelihood people may intentionally search for
this type of ASMR.

Audio Potential:
How satisfying the sound design could be.

Visual Potential:
How satisfying and scroll-stopping it could look.

Monetization Potential:
How commercially safe and reusable the concept is.

PREVIOUSLY GENERATED IDEAS:

${previousText}

Do NOT reproduce or closely paraphrase any previous
idea above.

Return only the requested structured JSON.
`;

  return await callGemini(prompt);
}

// ============================================================
// VALIDATION
// ============================================================

function validateIdeas(ideas, existingIdeas) {

  if (!Array.isArray(ideas)) {
    throw new Error(
      "Gemini output is not an array"
    );
  }

  if (ideas.length !== 20) {
    throw new Error(
      `Expected 20 ideas but received ${ideas.length}`
    );
  }

  const existingNormalized =
    new Set(
      existingIdeas.map(normalize)
    );

  const generatedNormalized =
    new Set();

  for (const idea of ideas) {

    if (!idea.idea || !idea.category) {
      throw new Error(
        "Generated idea is missing required fields"
      );
    }

    const key = normalize(
      idea.idea
    );

    if (!key) {
      throw new Error(
        "Generated idea text is empty"
      );
    }

    if (
      existingNormalized.has(key)
    ) {
      throw new Error(
        `Duplicate previous idea detected: ${idea.idea}`
      );
    }

    if (
      generatedNormalized.has(key)
    ) {
      throw new Error(
        `Duplicate new idea detected: ${idea.idea}`
      );
    }

    generatedNormalized.add(key);
  }

  return true;
}

// ============================================================
// WRITE TO GOOGLE SHEETS
// ============================================================

async function saveIdeas(ideas) {

  const timestamp =
    new Date().toISOString();

  const datePart =
    timestamp
      .slice(0, 10)
      .replaceAll("-", "");

  const timePart =
    timestamp
      .slice(11, 19)
      .replaceAll(":", "");

  const rows = ideas.map(
    (idea, index) => {

      const id =
        `IDEA-${datePart}-${timePart}-` +
        `${String(index + 1).padStart(2, "0")}`;

      const score =
        calculateScore(idea);

      return [
        id,
        idea.idea,
        idea.category,
        clampScore(idea.novelty),
        clampScore(idea.viral_potential),
        clampScore(idea.search_potential),
        clampScore(idea.audio_potential),
        clampScore(idea.visual_potential),
        clampScore(
          idea.monetization_potential
        ),
        score,
        "NEW"
      ];
    }
  );

  await sheets.spreadsheets.values.append({

    spreadsheetId,

    range: "IDEA_DATABASE!A:K",

    valueInputOption: "RAW",

    insertDataOption: "INSERT_ROWS",

    requestBody: {
      values: rows
    }
  });

  return rows;
}

// ============================================================
// UPDATE SYSTEM STATUS
// ============================================================

async function updateSystemStatus() {

  const config =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "CONFIG!A2:B50"
    });

  const rows =
    config.data.values || [];

  const index =
    rows.findIndex(
      row =>
        row[0] === "SYSTEM_STATUS"
    );

  if (index >= 0) {

    const sheetRow =
      index + 2;

    await sheets.spreadsheets.values.update({

      spreadsheetId,

      range:
        `CONFIG!B${sheetRow}`,

      valueInputOption: "RAW",

      requestBody: {
        values: [
          ["AI_CONNECTED"]
        ]
      }
    });

  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "ASMR FACTORY - STAGE 2 IDEA AGENT"
  );
  console.log(
    "======================================"
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    "Reading existing idea database..."
  );

  const existingIdeas =
    await getExistingIdeas();

  console.log(
    `Existing ideas found: ${existingIdeas.length}`
  );

  console.log(
    "Generating 20 new ASMR concepts..."
  );

  const ideas =
    await generateIdeas(existingIdeas);

  console.log(
    `Gemini returned ${ideas.length} ideas`
  );

  validateIdeas(
    ideas,
    existingIdeas
  );

  console.log(
    "Validation passed"
  );

  const rows =
    await saveIdeas(ideas);

  await updateSystemStatus();

  const sorted =
    [...rows].sort(
      (a, b) => b[9] - a[9]
    );

  console.log("");
  console.log(
    "TOP 5 GENERATED IDEAS"
  );
  console.log(
    "--------------------------------------"
  );

  sorted
    .slice(0, 5)
    .forEach(
      (row, index) => {

        console.log(
          `${index + 1}. ` +
          `[Score ${row[9]}] ` +
          `${row[1]}`
        );

      }
    );

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "STAGE 2 SUCCESS"
  );
  console.log(
    "======================================"
  );
  console.log(
    "Ideas generated: 20"
  );
  console.log(
    "Ideas saved: 20"
  );
  console.log(
    "Paid API requested: NO"
  );
  console.log(
    "System status: AI_CONNECTED"
  );
}

main().catch(
  async error => {

    console.error("");
    console.error(
      "STAGE 2 FAILED"
    );

    console.error(
      error
    );

    await logError(
      error,
      3
    );

    process.exit(1);
  }
);
