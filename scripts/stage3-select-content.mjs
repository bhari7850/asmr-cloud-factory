import { google } from "googleapis";

// ============================================================
// ASMR CLOUD FACTORY - STAGE 3
// Content Selector + Production Planner
// ============================================================

const spreadsheetId = process.env.GOOGLE_SHEET_ID;

if (!spreadsheetId) {
  throw new Error("GOOGLE_SHEET_ID is missing");
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
}

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

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function normalized(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createContentId(index) {

  const now = new Date();

  const date =
    now.toISOString()
      .slice(0, 10)
      .replaceAll("-", "");

  const time =
    now.toISOString()
      .slice(11, 19)
      .replaceAll(":", "");

  return (
    `CONTENT-${date}-${time}-` +
    String(index + 1).padStart(2, "0")
  );
}

// ============================================================
// ERROR LOG
// ============================================================

async function logError(error) {

  try {

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "ERROR_DATABASE!A:F",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",

      requestBody: {
        values: [[
          new Date().toISOString(),
          "STAGE_3_CONTENT_SELECTOR",
          String(error.message || error),
          0,
          "Review IDEA_DATABASE and rerun",
          "FAILED"
        ]]
      }
    });

  } catch (loggingError) {

    console.error(
      "Error logging failed:",
      loggingError.message
    );

  }
}

// ============================================================
// READ IDEA DATABASE
// ============================================================

async function getIdeas() {

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "IDEA_DATABASE!A2:K"
    });

  const rows =
    response.data.values || [];

  return rows.map(
    (row, index) => ({
      sheetRow: index + 2,
      ideaId: clean(row[0]),
      idea: clean(row[1]),
      category: clean(row[2]),
      novelty: number(row[3]),
      viral: number(row[4]),
      search: number(row[5]),
      audio: number(row[6]),
      visual: number(row[7]),
      monetization: number(row[8]),
      score: number(row[9]),
      status: clean(row[10])
    })
  );
}

// ============================================================
// READ CONTENT DATABASE
// Prevent accidental duplicate production records
// ============================================================

async function getExistingContentIdeas() {

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "CONTENT_DATABASE!E2:E"
    });

  const rows =
    response.data.values || [];

  return new Set(
    rows
      .map(row => normalized(row[0]))
      .filter(Boolean)
  );
}

// ============================================================
// SELECT BEST 6
// ============================================================

function selectBestIdeas(
  ideas,
  existingContentIdeas,
  target = 6
) {

  const candidates =
    ideas
      .filter(
        item =>
          item.status === "NEW" &&
          item.idea &&
          item.category &&
          !existingContentIdeas.has(
            normalized(item.idea)
          )
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (candidates.length < target) {

    throw new Error(
      `Need at least ${target} NEW ideas. ` +
      `Only ${candidates.length} are available.`
    );

  }

  const selected = [];
  const usedCategories = new Set();

  // ------------------------------------------
  // Pass 1:
  // Prefer top-scoring ideas from unique categories
  // ------------------------------------------

  for (const idea of candidates) {

    const categoryKey =
      normalized(idea.category);

    if (
      selected.length < target &&
      !usedCategories.has(categoryKey)
    ) {

      selected.push(idea);
      usedCategories.add(categoryKey);

    }

  }

  // ------------------------------------------
  // Pass 2:
  // If fewer than 6 unique categories existed,
  // fill remaining slots with highest scores.
  // ------------------------------------------

  if (selected.length < target) {

    const selectedIds =
      new Set(
        selected.map(
          item => item.ideaId
        )
      );

    for (const idea of candidates) {

      if (
        selected.length >= target
      ) {
        break;
      }

      if (
        !selectedIds.has(
          idea.ideaId
        )
      ) {

        selected.push(idea);
        selectedIds.add(
          idea.ideaId
        );

      }

    }

  }

  return selected;
}

// ============================================================
// PRODUCTION PROMPT BUILDER
// ============================================================

function buildProductionPrompt(item) {

  return `
ASMR SHORT-FORM PRODUCTION PLAN

SOURCE IDEA:
${item.idea}

CATEGORY:
${item.category}

TARGET FORMAT:
9:16 vertical video

PRIMARY PLATFORMS:
YouTube Shorts and Instagram Reels

TARGET DURATION:
20-40 seconds

VISUAL STYLE:
Ultra-detailed macro photography.
Premium cinematic lighting.
Sharp subject focus.
Clean uncluttered background.
High material realism.
Strong tactile texture.
Satisfying visual symmetry.
No brands.
No logos.
No copyrighted characters.
No watermark.
No text embedded in generated imagery.

VIDEO STRUCTURE:

0-2 seconds:
Immediately reveal the most visually satisfying
part of the concept.

2-8 seconds:
Slow macro movement or controlled camera push.

8-20 seconds:
Main satisfying action or texture sequence.

20-30 seconds:
Escalate visual or audio satisfaction.

Final seconds:
Return naturally toward the opening composition
so the video can loop smoothly.

CLOUD VISUAL PRODUCTION:

Generate several high-quality source images.

Use subtle:
- zoom
- pan
- parallax
- depth movement
- light movement
- particle movement where relevant
- reflections
- shadows
- controlled transitions

Avoid excessive movement that reveals the video
was created from still images.

AUDIO DIRECTION:

Create original procedural ASMR audio appropriate
to "${item.category}".

Prioritize:
- close-mic sensation
- stereo detail
- soft transient sounds
- texture realism
- satisfying repetition
- subtle environmental ambience
- clean low noise floor

No copyrighted music.

No copyrighted sound recordings.

LOUDNESS:

Avoid clipping.
Avoid harsh peaks.
Maintain comfortable headphone listening level.

LOOP:

Audio ending should blend naturally into the
opening audio.

VISUAL ending should resemble the opening frame
as closely as practical.

QUALITY TARGET:

1080 x 1920
30 FPS
H.264 MP4
AAC audio

SAFETY:

Advertiser friendly.
No dangerous imitation.
No graphic imagery.
No medical claims.
No sexual content.
No hate content.
No deceptive claims.

IDEA QUALITY DATA:

Overall Score: ${item.score}/100
Novelty: ${item.novelty}/100
Viral Potential: ${item.viral}/100
Search Potential: ${item.search}/100
Audio Potential: ${item.audio}/100
Visual Potential: ${item.visual}/100
Monetization Potential: ${item.monetization}/100
`.trim();

}

// ============================================================
// MARK SELECTED IDEAS
// ============================================================

async function markIdeasSelected(selected) {

  const requests =
    selected.map(
      idea => ({

        range:
          `IDEA_DATABASE!K${idea.sheetRow}`,

        values: [
          ["SELECTED"]
        ]

      })
    );

  await sheets.spreadsheets.values.batchUpdate({

    spreadsheetId,

    requestBody: {

      valueInputOption: "RAW",

      data: requests

    }

  });

}

// ============================================================
// CREATE CONTENT RECORDS
// ============================================================

async function createContentRecords(selected) {

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const rows =
    selected.map(
      (item, index) => {

        const contentId =
          createContentId(index);

        const prompt =
          buildProductionPrompt(item);

        return [
          contentId,                       // Content_ID
          today,                           // Date
          "YT Shorts + IG Reels",          // Platform
          item.category,                   // Category
          item.idea,                       // Idea
          "",                              // Title
          "",                              // Description
          prompt,                          // Prompt
          "",                              // Video_URL
          "",                              // Thumbnail_URL
          "PLANNED",                       // Status
          "",                              // Publish_Date
          0,                               // Views
          0,                               // Likes
          0,                               // Comments
          0,                               // Shares
          0,                               // Watch_Time
          0,                               // Retention
          0,                               // CTR
          0,                               // Followers
          0,                               // Subscribers
          item.score                       // Performance_Score
        ];

      }
    );

  await sheets.spreadsheets.values.append({

    spreadsheetId,

    range:
      "CONTENT_DATABASE!A:V",

    valueInputOption:
      "RAW",

    insertDataOption:
      "INSERT_ROWS",

    requestBody: {
      values: rows
    }

  });

  return rows;
}

// ============================================================
// UPDATE CONFIG STATUS
// ============================================================

async function updateSystemStatus() {

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "CONFIG!A2:B50"
    });

  const rows =
    response.data.values || [];

  const index =
    rows.findIndex(
      row =>
        row[0] === "SYSTEM_STATUS"
    );

  if (index >= 0) {

    const rowNumber =
      index + 2;

    await sheets.spreadsheets.values.update({

      spreadsheetId,

      range:
        `CONFIG!B${rowNumber}`,

      valueInputOption:
        "RAW",

      requestBody: {
        values: [
          ["CONTENT_SELECTED"]
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
    "========================================="
  );
  console.log(
    "ASMR FACTORY - STAGE 3 CONTENT SELECTOR"
  );
  console.log(
    "========================================="
  );

  console.log(
    "Reading IDEA_DATABASE..."
  );

  const ideas =
    await getIdeas();

  console.log(
    `Total ideas found: ${ideas.length}`
  );

  const existingContent =
    await getExistingContentIdeas();

  console.log(
    `Existing production ideas: ` +
    `${existingContent.size}`
  );

  const selected =
    selectBestIdeas(
      ideas,
      existingContent,
      6
    );

  console.log("");
  console.log(
    "SELECTED CONTENT"
  );
  console.log(
    "-----------------------------------------"
  );

  selected.forEach(
    (item, index) => {

      console.log(
        `${index + 1}. ` +
        `[${item.score}] ` +
        `${item.category} - ` +
        `${item.idea}`
      );

    }
  );

  await createContentRecords(
    selected
  );

  await markIdeasSelected(
    selected
  );

  await updateSystemStatus();

  console.log("");
  console.log(
    "========================================="
  );
  console.log(
    "STAGE 3 SUCCESS"
  );
  console.log(
    "========================================="
  );
  console.log(
    "Ideas selected: 6"
  );
  console.log(
    "Production records created: 6"
  );
  console.log(
    "Gemini calls used: 0"
  );
  console.log(
    "Paid API requested: NO"
  );
  console.log(
    "System status: CONTENT_SELECTED"
  );

}

// ============================================================
// RUN
// ============================================================

main().catch(
  async error => {

    console.error("");
    console.error(
      "STAGE 3 FAILED"
    );

    console.error(
      error
    );

    await logError(error);

    process.exit(1);

  }
);
