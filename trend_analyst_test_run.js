/**
 * TREND ANALYST TEST RUN
 * 1. Laddar .env och verifierar att nycklar finns.
 * 2. Kör trend analyst (OpenAI) och/eller live_sources; rapporterar trend_score, pass, uncertain.
 * 3. Rapporterar alla källor och om nyckel (och endpoint) är kopplad.
 *
 * Kör: node trend_analyst_test_run.js
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { collectLiveSignals } from "./marketing/live_sources.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "TWITTER_API_KEY",
  "YOUTUBE_API_KEY",
  "PRODUCTHUNT_API_KEY",
  "KICKSTARTER_API_KEY",
  "AMAZON_API_KEY",
  "ETSY_API_KEY",
  "PINTEREST_API_KEY",
  "LINKEDIN_API_KEY",
  "TIKTOK_API_KEY",
  "GITHUB_API_KEY",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_USERNAME",
  "REDDIT_PASSWORD"
];

const SOURCES_WITH_ENV = [
  { id: "openai", key: "OPENAI_API_KEY", endpoint: null },
  { id: "google_trends", key: "GOOGLE_API_KEY", endpoint: "GOOGLE_TRENDS_ENDPOINT" },
  { id: "twitter_x", key: "TWITTER_API_KEY", endpoint: "TWITTER_ENDPOINT" },
  { id: "youtube_trends", key: "YOUTUBE_API_KEY", endpoint: "YOUTUBE_TRENDS_ENDPOINT" },
  { id: "product_hunt", key: "PRODUCTHUNT_API_KEY", endpoint: "PRODUCTHUNT_ENDPOINT" },
  { id: "kickstarter", key: "KICKSTARTER_API_KEY", endpoint: "KICKSTARTER_ENDPOINT" },
  { id: "amazon_bestsellers", key: "AMAZON_API_KEY", endpoint: "AMAZON_ENDPOINT" },
  { id: "etsy_trending", key: "ETSY_API_KEY", endpoint: "ETSY_ENDPOINT" },
  { id: "pinterest", key: "PINTEREST_API_KEY", endpoint: "PINTEREST_ENDPOINT" },
  { id: "linkedin", key: "LINKEDIN_API_KEY", endpoint: "LINKEDIN_ENDPOINT" },
  { id: "tiktok_discover", key: "TIKTOK_API_KEY", endpoint: "TIKTOK_ENDPOINT" },
  { id: "github_trending", key: "GITHUB_API_KEY", endpoint: "GITHUB_TRENDING_ENDPOINT" },
  { id: "reddit", key: "REDDIT_CLIENT_ID", endpoint: null }
];

async function loadEnv() {
  const envPath = path.join(root, ".env");
  try {
    const content = await fs.readFile(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].replace(/^["']|["']$/g, "").trim();
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.error("Kunde inte läsa .env:", e.message, "(sökväg:", envPath, ")");
  }
}

function isKeySet(val) {
  const s = val != null ? String(val).trim() : "";
  if (!s) return false;
  if (/^din_|^placeholder$/i.test(s)) return false;
  if (/^finns$/i.test(s)) return false;
  return true;
}

async function main() {
  await loadEnv();

  console.log("\n=== TREND ANALYST TEST RUN ===\n");

  const keyStatus = {};
  for (const k of ENV_KEYS) {
    const val = process.env[k];
    keyStatus[k] = { set: !!val, valueLength: val ? String(val).length : 0, connected: isKeySet(val) };
  }
  console.log("1. .env – nycklar sparade och status:");
  for (const k of ENV_KEYS) {
    const s = keyStatus[k];
    const status = s.set ? (s.connected ? "OK (kopplad)" : "Satt (placeholder)") : "Saknas";
    console.log(`   ${k}: ${status}`);
  }

  console.log("\n2. Källor (live_sources) – nyckel + endpoint:");
  for (const src of SOURCES_WITH_ENV) {
    const keyVal = process.env[src.key];
    const endpointVal = src.endpoint ? process.env[src.endpoint] : null;
    const keyOk = isKeySet(keyVal);
    const endpointOk = src.endpoint ? isKeySet(endpointVal) : true;
    const connected = keyOk && (endpointOk || !src.endpoint);
    console.log(`   ${src.id}: nyckel=${keyOk ? "OK" : "placeholder/saknas"}${src.endpoint ? `, endpoint=${endpointOk ? "OK" : "saknas"}` : ""} → ${connected ? "kopplad" : "ej redo"}`);
  }

  const testIdea = "SaaS tool for small teams";
  console.log("\n3. Trend Analyst – analyzeTrends(\"" + testIdea + "\"):");

  let trendResult = null;
  try {
    const { analyzeTrends } = await import("./marketing/trend_analyst.js");
    trendResult = await analyzeTrends(testIdea);
    console.log("   trend_score:", trendResult.trend_score);
    console.log("   pass:", trendResult.pass);
    console.log("   uncertain:", trendResult.uncertain);
    console.log("   reason:", (trendResult.reason || "").slice(0, 120) + (trendResult.reason && trendResult.reason.length > 120 ? "…" : ""));
  } catch (err) {
    console.log("   Fel (t.ex. ogiltig OPENAI_API_KEY):", err.message);
    console.log("   Försöker live_sources som reserv...");
    try {
      const live = await collectLiveSignals(testIdea);
      trendResult = live;
      console.log("   trend_score (live_sources):", live.trend_score);
      console.log("   pass:", live.pass);
      console.log("   uncertain:", live.uncertain);
      console.log("   reason:", (live.reason || "").slice(0, 120));
    } catch (e2) {
      console.log("   live_sources fel:", e2.message);
    }
  }

  console.log("\n4. Sammanfattning källor och koppling:");
  const summary = SOURCES_WITH_ENV.map((src) => {
    const keyOk = isKeySet(process.env[src.key]);
    const endpointOk = !src.endpoint || isKeySet(process.env[src.endpoint]);
    return { källa: src.id, nyckel_kopplad: keyOk, endpoint_kopplad: endpointOk, redo: keyOk && endpointOk };
  });
  console.table(summary);

  console.log("\n=== SLUT TEST RUN ===\n");
  if (trendResult && typeof trendResult.trend_score === "number") {
    process.exit(0);
  }
  process.exit(trendResult ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
