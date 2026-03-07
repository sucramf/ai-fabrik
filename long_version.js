import 'dotenv/config';
/**
 * LÅNGVERSION – Fullständig slutkontroll och produktion.
 * 1. Kontrollerar mappstruktur och nödvändiga filer
 * 2. Kontrollerar att moduler kan laddas
 * 3. Kontrollerar .env (OPENAI_API_KEY)
 * 4. Kör fabriken (Superchief) för full pipeline
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

function loadEnv() {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();

const REQUIRED = {
  "agents/superchief.js": true,
  "agents/boss.js": true,
  "agents/workers.js": true,
  "agents/inspectors/market_inspector.js": true,
  "agents/inspectors/money_inspector.js": true,
  "agents/inspectors/legal_inspector.js": true,
  "agents/inspectors/quality_inspector.js": true,
  "builders/app_builder.js": true,
  "builders/designer.js": true,
  "builders/evolution.js": true,
  "builders/update_apps_run.js": true,
  "builders/update_app_html.js": true,
  "ideas/ideas.js": true,
  "ideas/ideas.json": true,
  "ideas/ideaFilter.js": true,
  "marketing/trend_analyst.js": true,
  "marketing/marketing_agent.js": true,
  "marketing/user_feedback_agent.js": true,
  "marketing/pricing_monetization_agent.js": true,
  "marketing/growth_hacker.js": true,
  "testers/test_runner.js": true,
  "testers/quality_tester.js": true,
  "automation_monitor.js": true,
  "deploy.js": true,
  "copy_apps_to_deploy.js": true,
  "generate_index.js": true,
  "publisher.js": true,
  "deploy_index.js": true,
  "package.json": true,
  ".env": true
};

function checkFile(file) {
  const p = path.join(root, file);
  const ok = fs.existsSync(p);
  if (!ok) console.error("[MISSING]", file);
  return ok;
}

function hasEnvKey() {
  const p = path.join(root, ".env");
  if (!fs.existsSync(p)) return false;
  const content = fs.readFileSync(p, "utf-8");
  return /OPENAI_API_KEY\s*=\s*\S+/.test(content);
}

async function loadModules() {
  const { pathToFileURL } = await import("url");
  const toUrl = (p) => pathToFileURL(path.join(root, p)).href;
  const errors = [];
  try {
    await import(toUrl("ideas/ideas.js"));
  } catch (e) {
    errors.push("ideas/ideas.js: " + e.message);
  }
  try {
    await import(toUrl("marketing/trend_analyst.js"));
  } catch (e) {
    errors.push("marketing/trend_analyst.js: " + e.message);
  }
  try {
    await import(toUrl("builders/evolution.js"));
  } catch (e) {
    errors.push("builders/evolution.js: " + e.message);
  }
  try {
    await import(toUrl("agents/workers.js"));
  } catch (e) {
    errors.push("agents/workers.js: " + e.message);
  }
  if (errors.length) {
    errors.forEach((e) => console.error("[LOAD]", e));
    return false;
  }
  return true;
}

async function runChecks() {
  console.log("=== LÅNGVERSION – Slutkontroll ===\n");

  let ok = true;

  console.log("1. Filer och mappar");
  for (const file of Object.keys(REQUIRED)) {
    if (!checkFile(file)) ok = false;
  }
  if (ok) console.log("   OK – alla nödvändiga filer finns.\n");

  console.log("2. .env (OPENAI_API_KEY)");
  if (!hasEnvKey()) {
    console.error("   OPENAI_API_KEY saknas eller är tom i .env.");
    ok = false;
  } else {
    console.log("   OK – nyckel finns.\n");
  }

  console.log("3. Moduler (import)");
  if (!(await loadModules())) ok = false;
  else console.log("   OK – moduler laddar.\n");

  return ok;
}

async function main() {
  const dryRun = process.argv.includes("--check-only");
  if (dryRun) {
    const passed = await runChecks();
    process.exit(passed ? 0 : 1);
  }

  const passed = await runChecks();
  if (!passed) {
    console.error("\nSlutkontroll misslyckades. Åtgärda fel och kör igen.");
    process.exit(1);
  }

  console.log("4. Kör fabriken (Superchief) – full pipeline\n");
  const { pathToFileURL } = await import("url");
  const superchiefUrl = pathToFileURL(path.join(root, "agents/superchief.js")).href;
  await import(superchiefUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
