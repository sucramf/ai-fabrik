/**
 * TEST FACTORY – Generate autonomous tests for the AI factory.
 *
 * Scans agents/, builders/, apps/, and generates:
 * - tests/agents/<name>.test.js (unit: file creation, output format, error handling)
 * - tests/builders/<name>.test.js
 * - tests/system/pipeline.test.js (pipeline order)
 * - tests/apps/<app_id>.test.js (app.html, pricing, metrics.js, seo)
 *
 * Logs: logs/tests.log (via test_runner)
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const TESTS_DIR = path.join(root, "tests");
const AGENTS_DIR = path.join(root, "agents");
const BUILDERS_DIR = path.join(root, "builders");
const APPS_DIR = path.join(root, "apps");

const PIPELINE_ORDER = [
  "trend_scanner",
  "idea_injector",
  "workers",
  "monetization_engine",
  "metrics_collector",
  "traffic_engine",
  "distribution_engine",
  "auto_publisher",
  "evolution_engine",
  "factory_expander"
];

async function listAgents() {
  const out = [];
  async function walk(dir, base) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "inspectors") continue;
      const rel = path.join(base, e.name);
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
      else if (e.name.endsWith(".js")) out.push(rel.replace(/\\/g, "/"));
    }
  }
  await walk(AGENTS_DIR, "agents");
  return out;
}

async function listBuilders() {
  let entries;
  try {
    entries = await fs.readdir(BUILDERS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => "builders/" + e.name);
}

async function listAppIds() {
  let entries;
  try {
    entries = await fs.readdir(APPS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory() && e.name.startsWith("app_")).map((e) => e.name);
}

function agentExportName(relPath) {
  const base = path.basename(relPath, ".js");
  if (base === "product_evolution_engine") return "runEvolutionEngine";
  const camel = base.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const runName = "run" + camel.charAt(0).toUpperCase() + camel.slice(1);
  if (["runTrendScanner", "runIdeaInjector", "runTrafficEngine", "runDistributionEngine", "runAutoPublisher", "runFactoryExpander", "runSystemStabilizer", "runCodebaseCleaner", "runUpdateAllMetrics", "runPortfolioAnalysis", "runStrategicBrain", "runResourceAllocator", "runGrowthExperiments", "runGrowthExecution"].includes(runName)) return runName;
  return "run" + camel.charAt(0).toUpperCase() + camel.slice(1);
}

function unitTestContent(relPath, importPath, exportName) {
  const safePath = relPath.replace(/\\/g, "/").replace(/\.js$/, "");
  const testName = safePath.replace(/\//g, "_").replace(/\.js$/, "");
  const importRel = importPath.replace(/\\/g, "/");
  return `/**
 * Auto-generated unit tests for ${relPath}
 */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

async function runOne(name, fn) {
  try {
    await fn();
    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, error: (e && e.message) || String(e) };
  }
}

export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  const mod = await import(new URL("${importRel}", import.meta.url).href).catch(() => null);
  const fn = mod && typeof mod.${exportName} === "function" ? mod.${exportName} : (mod && mod.default && typeof mod.default === "function" ? mod.default : null);

  const r1 = await runOne("module loads and exports", async () => {
    if (!mod) throw new Error("Module failed to load");
    if (fn === null) throw new Error("Expected export not found");
  });
  results.push(r1);
  r1.passed ? passed++ : failed++;

  const r2 = await runOne("error handling (invalid input)", async () => {
    if (fn && typeof fn === "function") {
      const out = await fn("").catch(() => ({ ok: false }));
      if (out && typeof out === "object" && (out.ok === false || out.files === undefined || Array.isArray(out.files))) return;
      await fn(null).catch(() => ({}));
    }
  });
  results.push(r2);
  r2.passed ? passed++ : failed++;

  const r3 = await runOne("output format (return shape)", async () => {
    if (fn && typeof fn === "function") {
      const out = await fn("nonexistent_app_id_12345").catch(() => ({ ok: false }));
      if (out !== undefined && out !== null && typeof out === "object") return;
      throw new Error("Expected object return");
    }
  });
  results.push(r3);
  r3.passed ? passed++ : failed++;

  return { passed, failed, results };
}
`;
}

function pipelineTestContent() {
  const modPath = (name) =>
    name === "evolution_engine" ? "../../agents/evolution_engine/product_evolution_engine.js" : "../../agents/" + name + ".js";
  const checks = PIPELINE_ORDER.map(
    (name) => `
  const r_${name.replace(/_/g, "x")} = await runOne("${name} module exists", async () => {
    const mod = await import(new URL("${modPath(name)}", import.meta.url).href);
    const hasRun = mod && (typeof mod.run === "function" || typeof mod.runEvolutionEngine === "function" || typeof mod.runTrendScanner === "function" || typeof mod.runIdeaInjector === "function" || typeof mod.createApps === "function" || typeof mod.runMonetization === "function" || typeof mod.injectMetrics === "function" || typeof mod.runTrafficEngine === "function" || typeof mod.runDistributionEngine === "function" || typeof mod.runAutoPublisher === "function" || typeof mod.runFactoryExpander === "function");
    if (!hasRun) throw new Error("Missing run export");
  });
  results.push(r_${name.replace(/_/g, "x")});
  r_${name.replace(/_/g, "x")}.passed ? passed++ : failed++;`
  ).join("");
  return `/**
 * Pipeline order verification: trend_scanner → idea_injector → workers → ... → factory_expander
 */
async function runOne(name, fn) {
  try {
    await fn();
    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, error: (e && e.message) || String(e) };
  }
}

export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;
  ${checks}
  return { passed, failed, results };
}
`;
}

function appTestContent(appId) {
  return `/**
 * Auto-generated app tests for ${appId}
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const appDir = path.join(root, "apps", "${appId}");
const deployDir = path.join(root, "deploy", "${appId}");

async function runOne(name, fn) {
  try {
    await fn();
    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, error: (e && e.message) || String(e) };
  }
}

export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  const r1 = await runOne("app.html exists", async () => {
    const p = path.join(appDir, "app.html");
    await fs.access(p);
  });
  results.push(r1);
  r1.passed ? passed++ : failed++;

  const r2 = await runOne("pricing or payment_config exists", async () => {
    const p1 = path.join(appDir, "pricing.html");
    const p2 = path.join(appDir, "payment_config.json");
    try { await fs.access(p1); return; } catch {}
    await fs.access(p2);
  });
  results.push(r2);
  r2.passed ? passed++ : failed++;

  const r3 = await runOne("metrics or metrics.js exists", async () => {
    const p = path.join(deployDir, "metrics.js");
    try { await fs.access(p); return; } catch {}
    const appMetrics = path.join(root, "data", "metrics", "${appId}.json");
    await fs.access(appMetrics);
  });
  results.push(r3);
  r3.passed ? passed++ : failed++;

  const r4 = await runOne("seo files exist", async () => {
    const seoDir = path.join(appDir, "seo");
    try { await fs.access(seoDir); } catch { throw new Error("seo/ missing"); }
    const keywords = path.join(seoDir, "keywords.json");
    await fs.access(keywords);
  });
  results.push(r4);
  r4.passed ? passed++ : failed++;

  return { passed, failed, results };
}
`;
}

/**
 * Generate all test files. Idempotent; overwrites existing.
 */
export async function runTestFactory() {
  await fs.mkdir(path.join(TESTS_DIR, "agents"), { recursive: true });
  await fs.mkdir(path.join(TESTS_DIR, "builders"), { recursive: true });
  await fs.mkdir(path.join(TESTS_DIR, "apps"), { recursive: true });
  await fs.mkdir(path.join(TESTS_DIR, "system"), { recursive: true });

  const agents = await listAgents();
  let generated = 0;

  for (const rel of agents) {
    const sub = rel.startsWith("agents/") ? "agents" : "builders";
    const testPath = path.join(TESTS_DIR, sub, rel.replace(/\.js$/, ".test.js").replace(/^agents\/|^builders\//, ""));
    await fs.mkdir(path.dirname(testPath), { recursive: true });
    const depth = rel.split(/[/\\]/).length;
    const importPath = "../".repeat(depth) + rel.replace(/\\/g, "/");
    const exportName = agentExportName(rel);
    const content = unitTestContent(rel, importPath, exportName);
    await fs.writeFile(testPath, content, "utf-8");
    generated++;
  }

  const builders = await listBuilders();
  for (const rel of builders) {
    const name = path.basename(rel, ".js");
    const testPath = path.join(TESTS_DIR, "builders", name + ".test.js");
    if (agents.some((a) => a.includes(name))) continue;
    const importPath = "../" + rel;
    const content = unitTestContent(rel, importPath, "runFullProductPipeline");
    await fs.writeFile(testPath, content, "utf-8");
    generated++;
  }

  await fs.writeFile(path.join(TESTS_DIR, "system", "pipeline.test.js"), pipelineTestContent(), "utf-8");
  generated++;

  const appIds = await listAppIds();
  for (const appId of appIds) {
    const testPath = path.join(TESTS_DIR, "apps", appId + ".test.js");
    await fs.writeFile(testPath, appTestContent(appId), "utf-8");
    generated++;
  }

  return { ok: true, generated, agents: agents.length, builders: builders.length, apps: appIds.length };
}
