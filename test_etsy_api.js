/**
 * test_etsy_api.js
 *
 * Simple Etsy API v3 connectivity test.
 *
 * Usage:
 *   node test_etsy_api.js
 *
 * Requirements:
 * - ETSY_API_KEY must be set in .env
 * - Uses Node.js native fetch (Node 18+)
 */

import dotenv from "dotenv";

dotenv.config();

const ETSY_PING_URL = "https://openapi.etsy.com/v3/application/openapi-ping";

function getApiKey() {
  const key = process.env.ETSY_API_KEY;
  if (!key || !String(key).trim()) {
    console.error("[ETSY TEST] Missing ETSY_API_KEY in environment (.env).");
    console.error(
      "Please add a line like `ETSY_API_KEY=your_real_key_here` to your .env and rerun."
    );
    process.exit(1);
  }
  return String(key).trim();
}

async function main() {
  const apiKey = getApiKey();

  console.log("[ETSY TEST] Using ETSY_API_KEY with length:", apiKey.length);
  console.log("[ETSY TEST] Sending request to:", ETSY_PING_URL);

  try {
    const res = await fetch(ETSY_PING_URL, {
      method: "GET",
      headers: {
        "x-api-key": apiKey
      }
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      console.error("[ETSY TEST] Request failed.");
      console.error("Status:", res.status, res.statusText);
      console.error("Response body:", JSON.stringify(json, null, 2));
      process.exit(1);
    }

    console.log("[ETSY TEST] Request succeeded. Response JSON:");
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("[ETSY TEST] Network or fetch error:", err?.message || err);
    process.exit(1);
  }
}

main();

