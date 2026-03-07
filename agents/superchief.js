/**
 * SUPERCHIEF – Överordnad beslutspunkt. Alla beslut går via Superchief.
 * Ingen idé/produkt skickas vidare utan godkännande. Endast PASS-produkter deployas.
 */
import { generateIdeas } from "../ideas/ideas.js";
import { filterByTrends } from "../marketing/trend_analyst.js";
import { filterIdeas } from "../builders/evolution.js";
import { inspectMarket } from "./inspectors/market_inspector.js";
import { inspectMoney } from "./inspectors/money_inspector.js";
import { inspectLegal } from "./inspectors/legal_inspector.js";
import { inspectQuality } from "./inspectors/quality_inspector.js";
import { createApps } from "./workers.js";
import { runTests } from "../testers/test_runner.js";
import { testQuality } from "../testers/quality_tester.js";
import { reportAction, getStatus } from "../automation_monitor.js";
import { buildDeployIndex } from "../deploy_index.js";
import { runMarketing } from "../marketing/marketing_agent.js";
import { suggestPricing } from "../marketing/pricing_monetization_agent.js";
import { runGrowth } from "../marketing/growth_hacker.js";
import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");

async function reportToSuperchief(section, items) {
  if (!items.length) return;
  const lines = [];
  lines.push(`\n--- REPORT TO SUPERCHIEF: ${section} ---`);
  items.forEach((x) => lines.push(typeof x === "string" ? x : JSON.stringify(x)));
  lines.push("--- End report ---\n");
  const block = lines.join("\n");
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // ignore logging errors
  }
}

async function runFactory() {
  console.log("SUPERCHIEF ANALYZING FACTORY");

  const monitorCheck = reportAction("superchief", "runFactory");
  if (monitorCheck.loopDetected) {
    console.error(monitorCheck.message);
    return;
  }

  const ideas = await generateIdeas(10);
  console.log("\nRAW IDEAS:\n");
  ideas.forEach((i, n) => console.log(n + 1 + ".", i));

  const { approved: trendApproved, reportedToSuperchief: trendUncertain } = await filterByTrends(ideas);
  await reportToSuperchief(
    "Trend Analyst (uncertain)",
    trendUncertain.map(({ idea, reason, trend_score, market_saturation }) =>
      `${idea} → score=${trend_score}, saturation=${market_saturation}, reason=${reason}`
    )
  );

  if (trendApproved.length === 0) {
    console.log("\nNo ideas passed Trend Analyst. Stopping.");
    return;
  }

  console.log("\nIDEAS PASSED TREND ANALYST:\n");
  trendApproved.forEach((i, n) => console.log(n + 1 + ".", i));

  const filtered = await filterIdeas(trendApproved);
  console.log("\nBEST IDEAS (after Evolution):\n");
  filtered.forEach((i, n) => console.log(n + 1 + ".", i));

  const inspectorReports = [];
  const passedInspectors = [];
  for (const idea of filtered) {
    const m = reportAction("market_inspector", "inspect");
    if (m.loopDetected) { await reportToSuperchief("Automation", [m.message]); break; }
    const market = await inspectMarket(idea);
    if (market.uncertain || !market.pass) {
      inspectorReports.push(`Market (${market.uncertain ? "uncertain" : "fail"}): ${idea} – ${market.reason}`);
      continue;
    }

    const mon = await inspectMoney(idea);
    if (mon.uncertain || !mon.pass) {
      inspectorReports.push(`Money (${mon.uncertain ? "uncertain" : "fail"}): ${idea} – ${mon.reason}`);
      continue;
    }

    const leg = await inspectLegal(idea);
    if (leg.uncertain || !leg.pass) {
      inspectorReports.push(`Legal (${leg.uncertain ? "uncertain" : "fail"}): ${idea} – ${leg.reason}`);
      continue;
    }

    passedInspectors.push(idea);
  }
  await reportToSuperchief("Inspectors (uncertain/rejected)", inspectorReports);

  if (passedInspectors.length === 0) {
    console.log("\nNo ideas passed all inspectors. Stopping.");
    return;
  }

  console.log("\nIDEAS PASSED ALL INSPECTORS (market, money, legal):\n");
  passedInspectors.forEach((i, n) => console.log(n + 1 + ".", i));
  console.log("\nSUPERCHIEF APPROVES", passedInspectors.length, "idea(s) for build.\n");

  const createdIds = await createApps(passedInspectors);
  const passedIds = [];
  const failedReports = [];

  for (const appId of createdIds) {
    const deployPath = path.join(root, "deploy", appId);
    const appHtmlPath = path.join(deployPath, "app.html");
    let html = "";
    try {
      html = await fs.readFile(appHtmlPath, "utf-8");
    } catch {
      failedReports.push({ appId, reason: "Missing app.html" });
      continue;
    }

    const q = reportAction("quality_inspector", "inspect");
    if (q.loopDetected) { await reportToSuperchief("Automation", [q.message]); break; }
    const qualityInsp = await inspectQuality(html, "website");
    if (!qualityInsp.pass) {
      failedReports.push({ appId, reason: `Quality Inspector: ${qualityInsp.reason}` });
      continue;
    }

    const run = await runTests(deployPath);
    if (!run.passed) {
      failedReports.push({ appId, reason: `test_runner: ${run.message}` });
      continue;
    }

    const qual = await testQuality(deployPath);
    if (!qual.passed) {
      failedReports.push({ appId, reason: `quality_tester: ${qual.message}` });
      continue;
    }

    passedIds.push(appId);
    console.log("STICKPROV PASS:", appId);
  }

  await reportToSuperchief("FAIL (not deployed)", failedReports.map((r) => `${r.appId}: ${r.reason}`));

  buildDeployIndex(passedIds);
  console.log("\nDEPLOY INDEX UPDATED – only PASS products listed:", passedIds.length);

  for (const appId of passedIds) {
    await runMarketing(appId, "");
    await suggestPricing("");
    await runGrowth(appId);
  }
  console.log("Marketing / pricing / growth hooks run for PASS products.");

  const status = getStatus();
  if (!status.ok) await reportToSuperchief("Automation Monitor", [status.message, status.bottlenecks]);

  console.log("\nFACTORY RUN COMPLETE.");
}

runFactory();
