import fs from "fs";
import path from "path";
import { google } from "googleapis";

// ============================================================
// ASMR CLOUD FACTORY - STAGE 4B
// Production Visual Asset Generator
// ============================================================

const MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

const STEPS = 4;
const SCENES_PER_VIDEO = 3;

const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID;

const apiToken =
  process.env.CLOUDFLARE_API_TOKEN;

const spreadsheetId =
  process.env.GOOGLE_SHEET_ID;

if (!accountId) {
  throw new Error(
    "CLOUDFLARE_ACCOUNT_ID is missing"
  );
}

if (!apiToken) {
  throw new Error(
    "CLOUDFLARE_API_TOKEN is missing"
  );
}

if (!spreadsheetId) {
  throw new Error(
    "GOOGLE_SHEET_ID is missing"
  );
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_JSON is missing"
  );
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
// CONSTANTS
// ============================================================

const OUTPUT_ROOT =
  path.join(
    process.cwd(),
    "output",
    "stage4-assets"
  );

const CLOUDFLARE_MODEL_URL =
  "https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/";

const BFL_TERMS_URL =
  "https://bfl.ai/legal/terms-of-service";

// ============================================================
// GENERAL HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function safeFolderName(value) {

  return clean(value)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);

}

function makeSeed(text) {

  let hash = 2166136261;

  for (
    let index = 0;
    index < text.length;
    index++
  ) {

    hash ^= text.charCodeAt(index);

    hash = Math.imul(
      hash,
      16777619
    );

  }

  const unsigned =
    hash >>> 0;

  return (
    unsigned % 2147483646
  ) + 1;

}

function removeDataUriPrefix(value) {

  return String(value)
    .replace(
      /^data:image\/[a-zA-Z0-9.+-]+(?:;charset=[^;,]+)?;base64,/,
      ""
    )
    .trim();

}

// ============================================================
// ERROR DATABASE
// ============================================================

async function logError(error) {

  try {

    await sheets.spreadsheets.values.append({

      spreadsheetId,

      range:
        "ERROR_DATABASE!A:F",

      valueInputOption:
        "RAW",

      insertDataOption:
        "INSERT_ROWS",

      requestBody: {

        values: [[

          new Date().toISOString(),

          "STAGE_4_VISUAL_GENERATOR",

          String(
            error.message || error
          ),

          0,

          "Retry Cloudflare after verifying free quota",

          "FAILED"

        ]]

      }

    });

  } catch (loggingError) {

    console.error(
      "Could not log error:",
      loggingError.message
    );

  }

}

// ============================================================
// READ DAILY TARGET
// ============================================================

async function getDailyVideoTarget() {

  const response =
    await sheets.spreadsheets.values.get({

      spreadsheetId,

      range:
        "CONFIG!A2:B50"

    });

  const rows =
    response.data.values || [];

  const targetRow =
    rows.find(
      row =>
        clean(row[0]) ===
        "DAILY_VIDEO_TARGET"
    );

  const target =
    number(targetRow?.[1]);

  return target > 0
    ? target
    : 6;

}

// ============================================================
// READ PLANNED CONTENT
// ============================================================

async function getPlannedContent() {

  const response =
    await sheets.spreadsheets.values.get({

      spreadsheetId,

      range:
        "CONTENT_DATABASE!A2:V"

    });

  const rows =
    response.data.values || [];

  return rows
    .map(
      (row, index) => ({

        sheetRow:
          index + 2,

        contentId:
          clean(row[0]),

        date:
          clean(row[1]),

        platform:
          clean(row[2]),

        category:
          clean(row[3]),

        idea:
          clean(row[4]),

        title:
          clean(row[5]),

        description:
          clean(row[6]),

        productionPrompt:
          clean(row[7]),

        status:
          clean(row[10]),

        score:
          number(row[21])

      })
    )
    .filter(
      item =>
        item.contentId &&
        item.idea &&
        item.status === "PLANNED"
    );

}

// ============================================================
// SCENE PROMPT BUILDER
// ============================================================

function buildScenePrompt(
  item,
  sceneNumber
) {

  const sceneDirections = {

    1: `
Opening hook frame.
Show the most visually satisfying subject
immediately.
Pristine arrangement before the main action.
Strong central focal point.
Instantly understandable at mobile size.
`,

    2: `
Main satisfaction frame.
Show the concept at its most tactile,
detailed and visually rewarding moment.
Emphasize texture, deformation, layers,
surface detail, reflections or material
interaction appropriate to the concept.
`,

    3: `
Loop ending frame.
Create a calm resolved composition that
visually echoes the opening frame.
Maintain the same materials, lighting,
background and visual identity so the
finished video can transition back toward
the beginning smoothly.
`

  };

  const prompt = `
Create an ultra-realistic premium ASMR
macro-photography image.

CONTENT IDEA:
${item.idea}

CATEGORY:
${item.category}

SCENE:
${sceneDirections[sceneNumber]}

VISUAL REQUIREMENTS:

Ultra-detailed tactile material realism.
Premium cinematic studio lighting.
Macro photography.
Sharp subject detail.
Soft shallow depth of field.
Clean controlled background.
Beautiful highlights and reflections.
Satisfying visual symmetry where appropriate.
Rich micro-textures.
Photorealistic materials.
Advertiser-friendly.

COMPOSITION:

Portrait-friendly composition.
Keep the important subject near the center.
Leave useful visual breathing room above
and below the subject.
Composition must survive a central crop
into a 9:16 vertical video.
Avoid placing important details at extreme
left or right edges.

CONSISTENCY:

This is scene ${sceneNumber} of 3 for the
same ASMR concept.
Use a coherent premium visual style suitable
for a YouTube Short and Instagram Reel.

HANDS:

Only include a hand if required by the idea.
If visible, it must be anatomically natural,
clean and realistic with correct fingers
and no deformities.

DO NOT INCLUDE:

Text.
Letters.
Numbers.
Captions.
Logos.
Brand names.
Watermarks.
Copyrighted characters.
Graphic injury.
Gore.
Dangerous imitation.
Sexual content.
Disturbing imagery.
Unnecessary clutter.

The image should look like a high-end
commercial macro photograph created
specifically for satisfying ASMR content.
`
    .replace(/\s+/g, " ")
    .trim();

  // Cloudflare currently allows max 2048 chars.
  return prompt.slice(
    0,
    2048
  );

}

// ============================================================
// CLOUDFLARE IMAGE GENERATION
// ============================================================

async function callCloudflare(
  prompt,
  seed
) {

  const url =
    "https://api.cloudflare.com/client/v4/accounts/" +
    `${accountId}/ai/run/${MODEL}`;

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
      `Cloudflare attempt ${attempt + 1}`
    );

    const response =
      await fetch(
        url,
        {

          method: "POST",

          headers: {

            "Authorization":
              `Bearer ${apiToken}`,

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              prompt,

              steps:
                STEPS,

              seed

            })

        }
      );

    const responseText =
      await response.text();

    if (response.ok) {

      let data;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch {

        throw new Error(
          "Cloudflare returned invalid JSON"
        );

      }

      if (
        data.success === false
      ) {

        throw new Error(
          "Cloudflare API error: " +
          JSON.stringify(
            data.errors
          )
        );

      }

      const rawBase64 =
        data?.result?.image ??
        data?.image;

      if (!rawBase64) {

        throw new Error(
          "Cloudflare returned no image"
        );

      }

      const cleanedBase64 =
        removeDataUriPrefix(
          rawBase64
        );

      const buffer =
        Buffer.from(
          cleanedBase64,
          "base64"
        );

      if (
        buffer.length < 1000
      ) {

        throw new Error(
          "Generated image is unexpectedly small"
        );

      }

      return buffer;

    }

    console.error(
      `Cloudflare HTTP ${response.status}`
    );

    console.error(
      responseText
    );

    const retryable =
      response.status === 429 ||
      response.status >= 500;

    if (
      retryable &&
      attempt < retryDelays.length
    ) {

      const wait =
        retryDelays[attempt];

      console.log(
        `Waiting ${wait / 1000}s before retry...`
      );

      await sleep(wait);

      continue;

    }

    throw new Error(
      `Cloudflare HTTP ${response.status}: ` +
      responseText
    );

  }

  throw new Error(
    "Cloudflare retry limit reached"
  );

}

// ============================================================
// GENERATE ONE CONTENT SET
// ============================================================

async function generateContentAssets(
  item
) {

  const folderName =
    safeFolderName(
      item.contentId
    );

  const folder =
    path.join(
      OUTPUT_ROOT,
      folderName
    );

  fs.mkdirSync(
    folder,
    {
      recursive: true
    }
  );

  const assets = [];

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    `CONTENT: ${item.contentId}`
  );

  console.log(
    `IDEA: ${item.idea}`
  );

  console.log(
    "========================================"
  );

  for (
    let sceneNumber = 1;
    sceneNumber <= SCENES_PER_VIDEO;
    sceneNumber++
  ) {

    const prompt =
      buildScenePrompt(
        item,
        sceneNumber
      );

    const seed =
      makeSeed(
        `${item.contentId}-${sceneNumber}`
      );

    console.log("");
    console.log(
      `Generating scene ${sceneNumber}/3`
    );

    console.log(
      `Seed: ${seed}`
    );

    const imageBuffer =
      await callCloudflare(
        prompt,
        seed
      );

    const fileName =
      `scene-${String(
        sceneNumber
      ).padStart(2, "0")}.jpg`;

    const filePath =
      path.join(
        folder,
        fileName
      );

    fs.writeFileSync(
      filePath,
      imageBuffer
    );

    const relativePath =
      path.relative(
        process.cwd(),
        filePath
      );

    const assetId =
      `IMG-${item.contentId}-${String(
        sceneNumber
      ).padStart(2, "0")}`;

    const sizeKB =
      Math.round(
        imageBuffer.length / 1024
      );

    console.log(
      `Saved: ${relativePath}`
    );

    console.log(
      `Size: ${sizeKB} KB`
    );

    assets.push({

      assetId,

      contentId:
        item.contentId,

      category:
        item.category,

      idea:
        item.idea,

      scene:
        sceneNumber,

      seed,

      prompt,

      file:
        relativePath,

      bytes:
        imageBuffer.length

    });

    // Small gap between free API calls.
    await sleep(800);

  }

  return assets;

}

// ============================================================
// READ EXISTING ASSET IDS
// ============================================================

async function getExistingAssetIds() {

  const response =
    await sheets.spreadsheets.values.get({

      spreadsheetId,

      range:
        "ASSET_LICENSE!A2:A"

    });

  const rows =
    response.data.values || [];

  return new Set(
    rows
      .map(
        row => clean(row[0])
      )
      .filter(Boolean)
  );

}

// ============================================================
// WRITE ASSET LICENSE RECORDS
// ============================================================

async function saveAssetLicenseRecords(
  assets
) {

  const existing =
    await getExistingAssetIds();

  const newAssets =
    assets.filter(
      asset =>
        !existing.has(
          asset.assetId
        )
    );

  if (
    newAssets.length === 0
  ) {

    console.log(
      "Asset license records already exist."
    );

    return;

  }

  const rows =
    newAssets.map(
      asset => [

        asset.assetId,

        asset.contentId,

        "AI_GENERATED_IMAGE",

        "Cloudflare Workers AI - FLUX.1 Schnell",

        CLOUDFLARE_MODEL_URL,

        "BFL FLUX Terms of Service",

        "YES - SUBJECT TO PROVIDER TERMS",

        "NO",

        "",

        BFL_TERMS_URL,

        "APPROVED"

      ]
    );

  await sheets.spreadsheets.values.append({

    spreadsheetId,

    range:
      "ASSET_LICENSE!A:K",

    valueInputOption:
      "RAW",

    insertDataOption:
      "INSERT_ROWS",

    requestBody: {
      values: rows
    }

  });

  console.log(
    `Asset license rows added: ${rows.length}`
  );

}

// ============================================================
// MARK CONTENT AS ASSETS_READY
// ============================================================

async function markContentAssetsReady(
  contentItems
) {

  const data =
    contentItems.map(
      item => ({

        range:
          `CONTENT_DATABASE!K${item.sheetRow}`,

        values: [
          ["ASSETS_READY"]
        ]

      })
    );

  await sheets.spreadsheets.values.batchUpdate({

    spreadsheetId,

    requestBody: {

      valueInputOption:
        "RAW",

      data

    }

  });

  console.log(
    `Content rows updated: ${contentItems.length}`
  );

}

// ============================================================
// UPDATE CONFIG STATUS
// ============================================================

async function updateSystemStatus() {

  const response =
    await sheets.spreadsheets.values.get({

      spreadsheetId,

      range:
        "CONFIG!A2:B50"

    });

  const rows =
    response.data.values || [];

  const index =
    rows.findIndex(
      row =>
        clean(row[0]) ===
        "SYSTEM_STATUS"
    );

  if (
    index < 0
  ) {

    console.log(
      "SYSTEM_STATUS row not found."
    );

    return;

  }

  const sheetRow =
    index + 2;

  await sheets.spreadsheets.values.update({

    spreadsheetId,

    range:
      `CONFIG!B${sheetRow}`,

    valueInputOption:
      "RAW",

    requestBody: {

      values: [
        ["VISUAL_ASSETS_READY"]
      ]

    }

  });

}

// ============================================================
// SAVE MANIFEST
// ============================================================

function saveManifest(
  selectedContent,
  assets
) {

  fs.mkdirSync(
    OUTPUT_ROOT,
    {
      recursive: true
    }
  );

  const manifest = {

    createdAt:
      new Date().toISOString(),

    model:
      MODEL,

    steps:
      STEPS,

    videos:
      selectedContent.length,

    scenesPerVideo:
      SCENES_PER_VIDEO,

    imagesGenerated:
      assets.length,

    content:
      selectedContent.map(
        item => ({

          contentId:
            item.contentId,

          category:
            item.category,

          idea:
            item.idea,

          score:
            item.score

        })
      ),

    assets

  };

  const manifestFile =
    path.join(
      OUTPUT_ROOT,
      "manifest.json"
    );

  fs.writeFileSync(
    manifestFile,
    JSON.stringify(
      manifest,
      null,
      2
    )
  );

  const summary = [
    "ASMR CLOUD FACTORY - STAGE 4",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Model: ${MODEL}`,
    `Videos: ${selectedContent.length}`,
    `Images per video: ${SCENES_PER_VIDEO}`,
    `Total images: ${assets.length}`,
    `Steps: ${STEPS}`,
    "",
    "Status: VISUAL_ASSETS_READY"
  ].join("\n");

  fs.writeFileSync(
    path.join(
      OUTPUT_ROOT,
      "stage4-summary.txt"
    ),
    summary
  );

}

// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log("");
  console.log(
    "=========================================="
  );

  console.log(
    "ASMR FACTORY - STAGE 4 VISUAL GENERATOR"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    `Diffusion steps: ${STEPS}`
  );

  const dailyTarget =
    await getDailyVideoTarget();

  console.log(
    `Daily video target: ${dailyTarget}`
  );

  const planned =
    await getPlannedContent();

  console.log(
    `PLANNED content found: ${planned.length}`
  );

  if (
    planned.length < dailyTarget
  ) {

    throw new Error(
      `Expected at least ${dailyTarget} PLANNED ` +
      `videos but found ${planned.length}.`
    );

  }

  // Prefer strongest planned concepts if there
  // are ever more than the daily target.
  const selected =
    [...planned]
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        dailyTarget
      );

  console.log("");
  console.log(
    "CONTENT SELECTED FOR VISUAL GENERATION"
  );

  selected.forEach(
    (item, index) => {

      console.log(
        `${index + 1}. ` +
        `[${item.score}] ` +
        `${item.category} - ${item.idea}`
      );

    }
  );

  // ----------------------------------------------------------
  // Generate every image first.
  // Google Sheets statuses are NOT changed until all
  // required images have successfully completed.
  // ----------------------------------------------------------

  const allAssets = [];

  for (
    let index = 0;
    index < selected.length;
    index++
  ) {

    console.log("");
    console.log(
      `VIDEO ${index + 1}/${selected.length}`
    );

    const assets =
      await generateContentAssets(
        selected[index]
      );

    allAssets.push(
      ...assets
    );

  }

  const expectedImages =
    selected.length *
    SCENES_PER_VIDEO;

  if (
    allAssets.length !== expectedImages
  ) {

    throw new Error(
      `Expected ${expectedImages} images ` +
      `but generated ${allAssets.length}.`
    );

  }

  saveManifest(
    selected,
    allAssets
  );

  // Persist Sheets data only after all images succeed.
  await saveAssetLicenseRecords(
    allAssets
  );

  await markContentAssetsReady(
    selected
  );

  await updateSystemStatus();

  console.log("");
  console.log(
    "=========================================="
  );

  console.log(
    "STAGE 4 SUCCESS"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Videos processed: ${selected.length}`
  );

  console.log(
    `Images generated: ${allAssets.length}`
  );

  console.log(
    `Images/video: ${SCENES_PER_VIDEO}`
  );

  console.log(
    "Google Sheet status: ASSETS_READY"
  );

  console.log(
    "System status: VISUAL_ASSETS_READY"
  );

  console.log(
    "Paid service requested: NO"
  );

}

// ============================================================
// RUN
// ============================================================

main().catch(
  async error => {

    console.error("");
    console.error(
      "STAGE 4 FAILED"
    );

    console.error(
      error.message || error
    );

    await logError(
      error
    );

    process.exit(1);

  }
);
