import { google } from "googleapis";

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

const TABLES = {
  CONTENT_DATABASE: [
    "Content_ID",
    "Date",
    "Platform",
    "Category",
    "Idea",
    "Title",
    "Description",
    "Prompt",
    "Video_URL",
    "Thumbnail_URL",
    "Status",
    "Publish_Date",
    "Views",
    "Likes",
    "Comments",
    "Shares",
    "Watch_Time",
    "Retention",
    "CTR",
    "Followers",
    "Subscribers",
    "Performance_Score"
  ],

  IDEA_DATABASE: [
    "Idea_ID",
    "Idea",
    "Category",
    "Novelty",
    "Viral_Potential",
    "Search_Potential",
    "Audio_Potential",
    "Visual_Potential",
    "Monetization_Potential",
    "Score",
    "Status"
  ],

  ERROR_DATABASE: [
    "Timestamp",
    "Workflow",
    "Error",
    "Retry_Count",
    "Fallback",
    "Status"
  ],

  COST_MONITOR: [
    "Date",
    "Service",
    "Metric",
    "Free_Limit",
    "Used",
    "Remaining",
    "Estimated_Cost_INR",
    "Hard_Stop",
    "Last_Checked"
  ],

  ASSET_LICENSE: [
    "Asset_ID",
    "Content_ID",
    "Asset_Type",
    "Source",
    "Source_URL",
    "License",
    "Commercial_Use_Allowed",
    "Attribution_Required",
    "Attribution_Text",
    "Proof_URL",
    "Status"
  ],

  SERVICE_QUOTA: [
    "Service",
    "Quota_Type",
    "Free_Limit",
    "Current_Usage",
    "Remaining",
    "Reset_Time",
    "Fallback_Service",
    "Status",
    "Last_Checked"
  ],

  CONFIG: [
    "Key",
    "Value",
    "Notes"
  ],

  RUN_LOCK: [
    "Workflow",
    "Run_ID",
    "Started_At",
    "Expires_At",
    "Status"
  ]
};

console.log("Connecting to Google Sheets...");

const spreadsheet = await sheets.spreadsheets.get({
  spreadsheetId
});

console.log(
  `Connected to: ${spreadsheet.data.properties.title}`
);

const existingSheets = new Set(
  spreadsheet.data.sheets.map(
    sheet => sheet.properties.title
  )
);

const createRequests = [];

for (const sheetName of Object.keys(TABLES)) {
  if (!existingSheets.has(sheetName)) {
    createRequests.push({
      addSheet: {
        properties: {
          title: sheetName
        }
      }
    });
  }
}

if (createRequests.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: createRequests
    }
  });

  console.log(
    `Created ${createRequests.length} database tabs`
  );
} else {
  console.log("All database tabs already exist");
}

for (const [sheetName, headers] of Object.entries(TABLES)) {

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`
  });

  const currentHeaders = result.data.values?.[0] ?? [];

  if (currentHeaders.length === 0) {

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers]
      }
    });

    console.log(`Headers created: ${sheetName}`);

  } else {

    console.log(`Headers already exist: ${sheetName}`);

  }
}

const configCheck = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: "CONFIG!A2:C20"
});

if (!configCheck.data.values?.length) {

  const config = [
    [
      "COST_MODE",
      "HARD_ZERO",
      "Never use paid services"
    ],
    [
      "ALLOW_PAID_API",
      "FALSE",
      "Paid fallback prohibited"
    ],
    [
      "MAX_DAILY_COST_INR",
      "0",
      "Maximum allowed daily cost"
    ],
    [
      "DAILY_VIDEO_TARGET",
      "6",
      "Initial production target"
    ],
    [
      "MAX_DAILY_VIDEO_TARGET",
      "12",
      "Future optimization ceiling"
    ],
    [
      "RETRY_LIMIT",
      "3",
      "Retry before fallback"
    ],
    [
      "SYSTEM_STATUS",
      "SETUP",
      "Factory not yet live"
    ]
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "CONFIG!A2",
    valueInputOption: "RAW",
    requestBody: {
      values: config
    }
  });

  console.log("Zero-cost configuration created");

} else {

  console.log("Configuration already exists");

}

console.log("");
console.log("================================");
console.log("ASMR FACTORY STAGE 1 SUCCESS");
console.log("================================");
console.log("Daily video target: 6");
console.log("Maximum daily cost: INR 0");
console.log("Paid API usage: DISABLED");
