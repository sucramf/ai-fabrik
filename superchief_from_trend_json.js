// SUPERCHIEF FROM TREND JSON
//
// Flöde:
// 1. Läser ideas/approved_trend_ideas.json (från Trend Analyst)
// 2. Kör Evolution (filterIdeas) på godkända idéer
// 3. Kör alla inspektörer (Market/Money/Legal/Quality)
// 4. Bygger projekt med Workers för idéer som passerar
// 5. Kör QA-stickprov (test_runner + quality_tester)
// 6. Deploy (deploy_index) för PASS-produkter
// 7. Kör marketing hooks (marketing_agent, pricing, growth)
// 8. Loggar allt till konsol och superchief_report.log

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { filterIdeas } from "./builders/evolution.js";
import { inspectMarket } from "./agents/inspectors/market_inspector.js";
import { inspectMoney } from "./agents/inspectors/money_inspector.js";
import { inspectLegal } from "./agents/inspectors/legal_inspector.js";
import { inspectQuality } from "./agents/inspectors/quality_inspector.js";
import { createApps } from "./agents/workers.js";
import { runTests } from "./testers/test_runner.js";
import { testQuality } from "./testers/quality_tester.js";
import { reportAction, getStatus } from "./automation_monitor.js";
import { buildDeployIndex } from "./deploy_index.js";
import { runMarketing } from "./marketing/marketing_agent.js";
import { suggestPricing } from "./marketing/pricing_monetization_agent.js";
import { runGrowth } from "./marketing/growth_hacker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");
const approvedIdeasJsonPath = path.join(root, "ideas", "approved_trend_ideas.json");

// Enkel .env-laddare (om long_version inte redan har kört).
async function loadEnv() {
  const envPath = path.join(root, ".env");
  try {
    const content = await fs.readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].replace(/^[\"']|[\"']$/g, "").trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    // inget .env, ignorera
  }
}

// Loggar till konsol + superchief_report.log
async function reportToSuperchief(section, lines) {
  if (!lines || !lines.length) return;

  const blockLines = [];
  blockLines.push(`\n--- REPORT TO SUPERCHIEF: ${section} ---`);
  for (const line of lines) {
    blockLines.push(line);
  }
  blockLines.push("--- End report ---\n");

  const block = blockLines.join("\n");
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // loggfel ignoreras
  }
}

async function main() {
  await loadEnv();

  console.log("=== SUPERCHIEF FROM TREND JSON – START ===\n");

  const monitorCheck = reportAction("superchief", "from_trend_json_run");
  if (monitorCheck.loopDetected) {
    console.error(monitorCheck.message);
    return;
  }

  // 1. Läs approved_trend_ideas.json
  let approvedIdeasFromTrend = [];
  try {
    const raw = await fs.readFile(approvedIdeasJsonPath, "utf-8");
    const json = JSON.parse(raw);
    approvedIdeasFromTrend = json.approvedIdeas || json.approved || [];
  } catch (err) {
    console.error("Could not read ideas/approved_trend_ideas.json:", err.message);
    return;
  }

  if (!Array.isArray(approvedIdeasFromTrend) || approvedIdeasFromTrend.length === 0) {
    console.log("No approved ideas from Trend Analyst. Stopping.");
    return;
  }

  console.log("Approved ideas from Trend Analyst:");
  approvedIdeasFromTrend.forEach((idea, i) => console.log(`${i + 1}. ${idea}`));

  // 2. Evolution (filterIdeas)
  const evolvedIdeas = await filterIdeas(approvedIdeasFromTrend);
  if (!Array.isArray(evolvedIdeas) || evolvedIdeas.length === 0) {
    console.log("\nEvolution returned no ideas. Stopping.");
    return;
  }

  console.log("\nIdeas after Evolution (BEST IDEAS):");
  evolvedIdeas.forEach((idea, i) => console.log(`${i + 1}. ${idea}`));

  // 3. Inspektörer
  const inspectorReports = [];
  const passedInspectors = [];

  for (const idea of evolvedIdeas) {
    console.log(`\nInspecting idea: ${idea}`);

    const m = reportAction("market_inspector", "inspect");
    if (m.loopDetected) {
      await reportToSuperchief("Automation", [m.message]);
      break;
    }

    const market = await inspectMarket(idea);
    if (market.uncertain || !market.pass) {
      inspectorReports.push(
        `Market (${market.uncertain ? "uncertain" : "fail"}): ${idea} – ${market.reason}`
      );
      continue;
    }

    const money = await inspectMoney(idea);
    if (money.uncertain || !money.pass) {
      inspectorReports.push(
        `Money (${money.uncertain ? "uncertain" : "fail"}): ${idea} – ${money.reason}`
      );
      continue;
    }

    const legal = await inspectLegal(idea);
    if (legal.uncertain || !legal.pass) {
      inspectorReports.push(
        `Legal (${legal.uncertain ? "uncertain" : "fail"}): ${idea} – ${legal.reason}`
      );
      continue;
    }

    console.log(`Idea PASSED all inspectors: ${idea}`);
    passedInspectors.push(idea);
  }

  await reportToSuperchief("Inspectors (uncertain/rejected)", inspectorReports);

  if (passedInspectors.length === 0) {
    console.log("\nNo ideas passed all inspectors. Stopping.");
    return;
  }

  console.log("\nIdeas passed all inspectors:");
  passedInspectors.forEach((idea, i) => console.log(`${i + 1}. ${idea}`));

  // 4. Build med Workers
  console.log("\nBuilding apps for approved ideas...");
  const createdIds = await createApps(passedInspectors);

  // 5. QA-stickprov + deploy
  const passedIds = [];
  const failedReports = [];

  for (const appId of createdIds) {
    console.log(`\nQA for appId: ${appId}`);
    const deployPath = path.join(root, "deploy", appId);
    const appHtmlPath = path.join(deployPath, "app.html");

    let html = "";
    try {
      html = await fs.readFile(appHtmlPath, "utf-8");
    } catch {
      failedReports.push({ appId, reason: "Missing app.html in deploy" });
      continue;
    }

    // Quality Inspector på artifact
    const qMonitor = reportAction("quality_inspector", "inspect");
    if (qMonitor.loopDetected) {
      await reportToSuperchief("Automation", [qMonitor.message]);
      break;
    }

    const qualityInsp = await inspectQuality(html, "website");
    if (!qualityInsp.pass) {
      failedReports.push({
        appId,
        reason: `Quality Inspector: ${qualityInsp.reason}`
      });
      continue;
    }

    // test_runner
    const run = await runTests(deployPath);
    if (!run.passed) {
      failedReports.push({ appId, reason: `test_runner: ${run.message}` });
      continue;
    }

    // quality_tester
    const qual = await testQuality(deployPath);
    if (!qual.passed) {
      failedReports.push({ appId, reason: `quality_tester: ${qual.message}` });
      continue;
    }

    console.log(`STICKPROV PASS: ${appId}`);
    passedIds.push(appId);
  }

  await reportToSuperchief(
    "FAIL (not deployed)",
    failedReports.map((r) => `${r.appId}: ${r.reason}`)
  );

  // Bygg deploy-index endast för PASS
  buildDeployIndex(passedIds);
  console.log("\nDEPLOY INDEX UPDATED – only PASS products listed:", passedIds.length);

  // 6. Marketing & intäkter för PASS
  for (const appId of passedIds) {
    await runMarketing(appId, "");
    await suggestPricing("");
    await runGrowth(appId);
  }
  console.log("\nMarketing / pricing / growth hooks run for PASS products.");

  // 7. Automation Monitor status
  const status = getStatus();
  if (!status.ok) {
    await reportToSuperchief("Automation Monitor", [status.message, status.bottlenecks || []]);
  }

  console.log("\n=== SUPERCHIEF FROM TREND JSON – COMPLETE ===");
}

main().catch((err) => {
  console.error("SUPERCHIEF FROM TREND JSON failed:", err);
  process.exit(1);
});

