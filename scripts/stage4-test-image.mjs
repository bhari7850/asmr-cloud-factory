import fs from "fs";
import path from "path";

// ============================================================
// ASMR CLOUD FACTORY - STAGE 4A
// Cloudflare Workers AI Image Generation Test
// ============================================================

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

const MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

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

// ============================================================
// TEST PROMPT
// ============================================================

const prompt = `
Ultra-detailed macro ASMR scene of translucent
silicone layers being gently peeled apart,
beautiful tactile texture, soft studio lighting,
premium cinematic photography, clean dark
background, realistic material details,
satisfying symmetry, shallow depth of field,
vertical composition, no text, no logo,
no watermark, advertiser-friendly.
`
  .replace(/\s+/g, " ")
  .trim();

// ============================================================
// CLOUDFLARE API
// ============================================================

async function generateImage() {

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${accountId}/ai/run/${MODEL}`;

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "ASMR FACTORY - STAGE 4 IMAGE TEST"
  );
  console.log(
    "======================================"
  );

  console.log(
    `Model: ${MODEL}`
  );

  console.log(
    "Calling Cloudflare Workers AI..."
  );

  const response = await fetch(
    url,
    {
      method: "POST",

      headers: {
        "Authorization":
          `Bearer ${apiToken}`,
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        prompt,
        steps: 4
      })
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `Cloudflare HTTP ${response.status}: ` +
      responseText
    );

  }

  let data;

  try {

    data =
      JSON.parse(responseText);

  } catch {

    throw new Error(
      "Cloudflare returned invalid JSON"
    );

  }

  if (
    data.success === false
  ) {

    throw new Error(
      `Cloudflare API error: ` +
      JSON.stringify(data.errors)
    );

  }

  const base64Image =
    data?.result?.image ??
    data?.image;

  if (!base64Image) {

    throw new Error(
      "No image was returned by Cloudflare"
    );

  }

  const imageBuffer =
    Buffer.from(
      base64Image,
      "base64"
    );

  if (
    imageBuffer.length < 1000
  ) {

    throw new Error(
      "Generated image file is unexpectedly small"
    );

  }

  const outputFolder =
    path.join(
      process.cwd(),
      "output"
    );

  fs.mkdirSync(
    outputFolder,
    {
      recursive: true
    }
  );

  const outputFile =
    path.join(
      outputFolder,
      "stage4-test.jpg"
    );

  fs.writeFileSync(
    outputFile,
    imageBuffer
  );

  const sizeKB =
    Math.round(
      imageBuffer.length / 1024
    );

  console.log("");
  console.log(
    "Image received successfully."
  );

  console.log(
    `Image size: ${sizeKB} KB`
  );

  console.log(
    `Saved to: ${outputFile}`
  );

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "STAGE 4A SUCCESS"
  );
  console.log(
    "======================================"
  );

  console.log(
    "Cloudflare authentication: OK"
  );

  console.log(
    "Workers AI inference: OK"
  );

  console.log(
    "FLUX image generation: OK"
  );

  console.log(
    "Images generated: 1"
  );

  console.log(
    "Paid service requested: NO"
  );

}

generateImage().catch(
  error => {

    console.error("");
    console.error(
      "STAGE 4A FAILED"
    );

    console.error(
      error.message || error
    );

    process.exit(1);

  }
);
