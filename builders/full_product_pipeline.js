/**
 * FULL PRODUCT PIPELINE – Bygger produkter på hög nivå + marknadsföring + betalning.
 *
 * 1. Läser godkända idéer från ideas/approved_trend_ideas.json
 * 2. Bygger webbsida/app (kvalitet Duolingo/Hemnet/Monkey Island – fullständig produkt, inga halvfärdiga MVPs) via Workers
 * 3. Skapar marknadsföringsmaterial och growth hooks per produkt (Google Ads, TikTok, YouTube, LinkedIn, Pinterest, Product Hunt)
 * 4. Förbereder betalning: Stripe/PayPal/Apple/Google – en rad API/credential per produkt senare
 * 5. QA-stickprov → endast PASS deployas
 * 6. Loggar allt till konsol och superchief_report.log
 *
 * Kör: node builders/full_product_pipeline.js
 * Eller anropas från superchief_daemon.js / superchief_from_trend_json.js
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { createApps } from "../agents/workers.js";
import { inspectQuality } from "../agents/inspectors/quality_inspector.js";
import { runTests } from "../testers/test_runner.js";
import { testQuality } from "../testers/quality_tester.js";
import { buildDeployIndex } from "../deploy_index.js";
import { runMarketing } from "../marketing/marketing_agent.js";
import { suggestPricing } from "../marketing/pricing_monetization_agent.js";
import { runGrowth } from "../marketing/growth_hacker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");
const approvedJsonPath = path.join(root, "ideas", "approved_trend_ideas.json");

async function loadEnv() {
  const envPath = path.join(root, ".env");
  try {
    const content = await fs.readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].replace(/^["']|["']$/g, "").trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}

async function report(section, lines) {
  if (!lines || !lines.length) return;
  const block = [
    `\n--- FULL PRODUCT PIPELINE: ${section} ---`,
    ...lines,
    "--- End ---\n"
  ].join("\n");
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // ignore
  }
}

function createMarketingCopy(idea, channel) {
  const title = idea || "Product";
  const templates = {
    google_ads: [
      `Headline 1: ${title} – Try free`,
      `Headline 2: Simple tool for teams`,
      `Headline 3: No credit card required`,
      `Description: Get started with "${title}" in minutes. Built for small teams.`,
      `Final URL: [SET_YOUR_LANDING_URL]`
    ].join("\n"),
    tiktok: [
      `Hook: "${title}" – the tool you didn't know you needed.`,
      `CTA: Link in bio to try free.`,
      `Hashtags: #saas #productivity #tool #mvp`
    ].join("\n"),
    youtube: [
      `Title: ${title} – Demo & walkthrough`,
      `Description: Quick demo of "${title}". Try it at [SET_URL].`,
      `CTA: Link in description for free trial.`
    ].join("\n"),
    linkedin: [
      `Post: We built "${title}" to solve one thing really well.`,
      `CTA: Try it free – link in comments.`,
      `Audience: SMB, freelancers, startups.`
    ].join("\n"),
    pinterest: [
      `Pin title: ${title}`,
      `Description: "${title}" – simple, focused tool. Link to try.`,
      `Board: SaaS & productivity tools`
    ].join("\n"),
    product_hunt: [
      `Tagline: ${title}`,
      `Description: "${title}" – [one sentence value prop].`,
      `First comment: Thanks for checking us out! Link to try: [SET_URL].`
    ].join("\n")
  };
  return templates[channel] || `${title} – ${channel}`;
}

async function writeMarketingMaterials(appId, idea) {
  const channels = ["google_ads", "tiktok", "youtube", "linkedin", "pinterest", "product_hunt"];
  const appMarketingDir = path.join(root, "apps", appId, "marketing");
  const deployMarketingDir = path.join(root, "deploy", appId, "marketing");
  await fs.mkdir(appMarketingDir, { recursive: true });
  await fs.mkdir(deployMarketingDir, { recursive: true });

  const created = [];
  for (const ch of channels) {
    const content = createMarketingCopy(idea, ch);
    const filename = ch + ".txt";
    await fs.writeFile(path.join(appMarketingDir, filename), content, "utf-8");
    await fs.writeFile(path.join(deployMarketingDir, filename), content, "utf-8");
    created.push(`apps/${appId}/marketing/${filename}`);
  }
  return created;
}

async function writePaymentConfig(appId) {
  const config = {
    _comment: "Set ONE credential per provider to enable payments for this product. No live transactions until keys are set.",
    stripe: {
      secret_key: "SET_STRIPE_SECRET_KEY",
      publishable_key: "SET_STRIPE_PUBLISHABLE_KEY"
    },
    paypal: {
      client_id: "SET_PAYPAL_CLIENT_ID",
      client_secret: "SET_PAYPAL_CLIENT_SECRET"
    },
    apple_pay: {
      merchant_id: "SET_APPLE_MERCHANT_ID"
    },
    google_pay: {
      merchant_id: "SET_GOOGLE_MERCHANT_ID"
    }
  };
  const appDir = path.join(root, "apps", appId);
  const configPath = path.join(appDir, "payment_config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

  const readme = [
    "PAYMENT – Varje produkt kan aktiveras individuellt.",
    "",
    "Sätt API/credentials i payment_config.json:",
    "  - Stripe: secret_key + publishable_key",
    "  - PayPal: client_id + client_secret",
    "  - Apple Pay: merchant_id",
    "  - Google Pay: merchant_id",
    "",
    "En rad per provider räcker; ingen live-transaktion förrän nycklar är satta."
  ].join("\n");
  await fs.writeFile(path.join(appDir, "PAYMENT_README.txt"), readme, "utf-8");

  return [`apps/${appId}/payment_config.json`, `apps/${appId}/PAYMENT_README.txt`];
}

export async function runFullProductPipeline() {
  await loadEnv();

  console.log("\n=== FULL PRODUCT PIPELINE – START ===\n");
  await report("Start", ["Pipeline started at " + new Date().toISOString()]);

  let approvedIdeas = [];
  try {
    const raw = await fs.readFile(approvedJsonPath, "utf-8");
    const json = JSON.parse(raw);
    approvedIdeas = json.approvedIdeas || json.approved || [];
  } catch (err) {
    await report("Error", ["Could not read ideas/approved_trend_ideas.json: " + err.message]);
    console.error("Could not read", approvedJsonPath, err.message);
    return { ok: false, createdIds: [], passedIds: [], filesCreated: [] };
  }

  if (!Array.isArray(approvedIdeas) || approvedIdeas.length === 0) {
    await report("Skip", ["No approved ideas in approved_trend_ideas.json."]);
    console.log("No approved ideas. Stopping.");
    return { ok: true, createdIds: [], passedIds: [], filesCreated: [] };
  }

  console.log("Approved ideas:", approvedIdeas.length);
  approvedIdeas.forEach((i, n) => console.log(" ", n + 1 + ".", i));

  const createdIds = await createApps(approvedIdeas);
  const allFilesCreated = [];
  const ideaByAppId = {};
  approvedIdeas.forEach((idea, idx) => {
    if (createdIds[idx]) ideaByAppId[createdIds[idx]] = idea;
  });

  for (const appId of createdIds) {
    const idea = ideaByAppId[appId] || "";
    const marketingFiles = await writeMarketingMaterials(appId, idea);
    const paymentFiles = await writePaymentConfig(appId);
    allFilesCreated.push(...marketingFiles, ...paymentFiles);
    console.log("Marketing + payment scaffolding:", appId);
  }

  await report("Build", [
    "Created apps: " + createdIds.join(", "),
    "Marketing + payment files written per product."
  ]);

  const passedIds = [];
  const failedReports = [];

  for (const appId of createdIds) {
    const deployPath = path.join(root, "deploy", appId);
    let html = "";
    try {
      html = await fs.readFile(path.join(deployPath, "app.html"), "utf-8");
    } catch {
      failedReports.push({ appId, reason: "Missing app.html" });
      continue;
    }

    const qualityInsp = await inspectQuality(html, "website");
    if (!qualityInsp.pass) {
      failedReports.push({ appId, reason: "Quality Inspector: " + qualityInsp.reason });
      continue;
    }

    const run = await runTests(deployPath);
    if (!run.passed) {
      failedReports.push({ appId, reason: "test_runner: " + run.message });
      continue;
    }

    const qual = await testQuality(deployPath);
    if (!qual.passed) {
      failedReports.push({ appId, reason: "quality_tester: " + qual.message });
      continue;
    }

    passedIds.push(appId);
    console.log("QA PASS:", appId);
  }

  await report("QA FAIL (not deployed)", failedReports.map((r) => r.appId + ": " + r.reason));

  buildDeployIndex(passedIds);
  console.log("\nDeploy index updated – PASS products:", passedIds.length);

  for (const appId of passedIds) {
    await runMarketing(appId, ideaByAppId[appId] || "");
    await suggestPricing(ideaByAppId[appId] || "");
    await runGrowth(appId);
  }
  console.log("Marketing / pricing / growth hooks run for PASS products.");

  const marketingChannels = ["google_ads", "tiktok", "youtube", "linkedin", "pinterest", "product_hunt"];
  const allFilePaths = [];
  for (const appId of createdIds) {
    allFilePaths.push(`apps/${appId}/idea.txt`, `apps/${appId}/app.html`, `apps/${appId}/marketing.txt`);
    for (const ch of marketingChannels) {
      allFilePaths.push(`apps/${appId}/marketing/${ch}.txt`);
    }
    allFilePaths.push(`apps/${appId}/payment_config.json`, `apps/${appId}/PAYMENT_README.txt`);
    allFilePaths.push(`deploy/${appId}/index.html`, `deploy/${appId}/app.html`);
    for (const ch of marketingChannels) {
      allFilePaths.push(`deploy/${appId}/marketing/${ch}.txt`);
    }
  }
  allFilePaths.push("deploy/index.html");

  const confirmation = [
    "",
    "EXEMPLAR PRODUKTER KLARA",
    "",
    "========== FULL PRODUCT PIPELINE – KLAR ==========",
    "Deploy-logg: Produkt byggd, betalvägar (scaffold) aktiverade, marknadsföring klar.",
    "Tid: " + new Date().toISOString(),
    "Byggda appar: " + createdIds.length,
    "PASS (deployade): " + passedIds.length,
    "FAIL/rapporterade: " + failedReports.length,
    "",
    "Var API-nycklar sätts (senare, per produkt):",
    "  - apps/<appId>/payment_config.json: Stripe (secret_key, publishable_key), PayPal (client_id, client_secret), Apple Pay (merchant_id), Google Pay (merchant_id).",
    "  - En rad per provider; aktivera betalning per produkt individuellt.",
    "",
    "--- Alla filer och vägar ---"
  ].join("\n");

  const fileListBlock = allFilePaths.map((p) => "  " + p).join("\n");
  const confirmationEnd = [
    "",
    "--- Slut filista ---",
    "Modulen är redo för superchief_daemon.js och live produktion.",
    "========== SLUT ==========",
    ""
  ].join("\n");

  const fullConfirmation = confirmation + "\n" + fileListBlock + "\n" + confirmationEnd;
  console.log(fullConfirmation);
  await report("Confirmation", ["EXEMPLAR PRODUKTER KLARA", ...allFilePaths, "Var API-nycklar: apps/<appId>/payment_config.json"]);

  return {
    ok: true,
    createdIds,
    passedIds,
    failedReports,
    filesCreated: allFilesCreated,
    allFilePaths
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("full_product_pipeline.js");
if (isMain) {
  runFullProductPipeline().catch((err) => {
    console.error("Full product pipeline failed:", err);
    process.exit(1);
  });
}
