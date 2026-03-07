/**
 * AI_FABRIK – Daglig trendscout (diktatorn)
 *
 * Kör trendspaning, idégenerering och ranking **varje dag**:
 * - Hämtar live trenddata (YouTube, GitHub, OpenAI, TikTok, Etsy, Product Hunt, Kickstarter)
 * - Analyserar och filtrerar (trend_score, market_saturation ≤ 70 %, korsplattform)
 * - Genererar realiserbara idéer, sparar i trend_ideas.json, visar topp 5 i konsolen
 *
 * Automatisering: Första körningen sker direkt, därefter var 24:e timme.
 * Avsluta med Ctrl+C. För cron/Task Scheduler: kör istället `node trend_scout.js` dagligen.
 *
 * Kör: node daily_trend_scout.js
 */

import { main } from "./trend_scout.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 timmar

async function runOnce() {
  const when = new Date().toISOString();
  console.log("\n[AI_FABRIK] ========== DAGLIG KÖRNING " + when + " ==========\n");
  try {
    await main();
    console.log("\n[AI_FABRIK] Nästa körning om 24 timmar. (Ctrl+C för att avsluta.)\n");
  } catch (err) {
    console.error("[AI_FABRIK] Fel vid daglig körning:", err);
  }
}

async function loop() {
  await runOnce();
  setInterval(runOnce, INTERVAL_MS);
}

loop().catch((err) => {
  console.error("[AI_FABRIK] Fel:", err);
  process.exit(1);
});
