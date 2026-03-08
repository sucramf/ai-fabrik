/**
 * SYSTEM STABILIZER – Integrity checker and repair for the factory.
 *
 * 1. Ensures critical directories exist (create if missing).
 * 2. Ensures critical JSON files exist with valid defaults (create or repair).
 * 3. On JSON parse failure: backup to logs/corrupted_<filename>_<timestamp>.json, recreate default.
 * 4. Verifies pipeline agent files exist; logs warning if missing.
 * 5. Checks each apps/<app_id> for spec.json, app.html, app.js; writes data/corrupted_apps.json for corrupted apps.
 *
 * Logs: logs/system_stabilizer.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const LOGS_DIR = path.join(root, "logs");
const STABILIZER_LOG = path.join(root, "logs", "system_stabilizer.log");
const APPS_DIR = path.join(root, "apps");
const DATA_DIR = path.join(root, "data");
const CORRUPTED_APPS_FILE = path.join(root, "data", "corrupted_apps.json");

const REQUIRED_DIRS = [
  "apps",
  "deploy",
  "ideas",
  "data",
  "logs",
  "metrics",
  "tests",
  "resources",
  "portfolio",
  "growth",
  "distribution",
  "marketing",
  "strategy"
];

const CRITICAL_FILES = [
  { rel: "ideas/ideas.json", default: () => [] },
  { rel: "data/publish_queue.json", default: () => ({ queue: [] }) },
  { rel: "data/revenue_metrics.json", default: () => ({ products: [], updated: new Date().toISOString() }) },
  { rel: "portfolio/portfolio_status.json", default: () => ({ products: [] }) },
  { rel: "strategy/factory_strategy.json", default: () => ({ products: [], updated: new Date().toISOString() }) },
  { rel: "resources/resource_allocation.json", default: () => ({ products: [], updated: new Date().toISOString() }) },
  { rel: "growth/growth_experiments.json", default: () => [] }
];

const REQUIRED_AGENTS = [
  "trend_scanner.js",
  "idea_injector.js",
  "workers.js",
  "monetization_engine.js",
  "metrics_collector.js",
  "traffic_engine.js",
  "distribution_engine.js",
  "auto_publisher.js",
  "resource_allocator.js",
  "portfolio_brain.js",
  "factory_expander.js"
];

const EVOLUTION_ENGINE_PATH = "evolution_engine/product_evolution_engine.js";

async function logStabilizer(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(STABILIZER_LOG, line, "utf-8").catch(() => {});
}

function defaultForFile(entry) {
  const value = typeof entry.default === "function" ? entry.default() : entry.default;
  return typeof value === "object" && value !== null
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value);
}

/**
 * Read JSON file; return { ok: true, data } or { ok: false, raw }.
 */
async function readJsonSafe(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, missing: true };
    throw e;
  }
  try {
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch {
    return { ok: false, raw };
  }
}

/**
 * Backup corrupted content to logs/corrupted_<basename>_<timestamp>.json and write clean default.
 */
async function repairCorruptedJson(filePath, defaultContent, entry) {
  const basename = path.basename(filePath, path.extname(filePath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(LOGS_DIR, `corrupted_${basename}_${timestamp}.json`);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    raw = "(file missing or unreadable)";
  }
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.writeFile(backupPath, raw, "utf-8");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, defaultContent, "utf-8");
  await logStabilizer("Repaired corrupted JSON: " + entry.rel + " → backup " + path.basename(backupPath));
}

/**
 * 1. Ensure all required directories exist.
 */
async function ensureDirectories() {
  let created = 0;
  for (const dir of REQUIRED_DIRS) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      await fs.mkdir(full, { recursive: true });
      created++;
    }
  }
  return created;
}

/**
 * 2. Ensure critical files exist and are valid JSON; create or repair.
 */
async function ensureCriticalFiles() {
  let created = 0;
  let repaired = 0;
  for (const entry of CRITICAL_FILES) {
    const filePath = path.join(root, entry.rel);
    const defaultContent = defaultForFile(entry);
    const result = await readJsonSafe(filePath);
    if (result.missing) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, defaultContent, "utf-8");
      created++;
      continue;
    }
    if (!result.ok) {
      await repairCorruptedJson(filePath, defaultContent, entry);
      repaired++;
    }
  }
  return { created, repaired };
}

/**
 * 3. Verify pipeline agent files exist. Log warning for missing.
 * Returns list of missing agent filenames so daemon can retry next cycle (restart failed agents).
 */
async function verifyAgents() {
  const missing = [];
  const agentsDir = path.join(root, "agents");
  for (const file of REQUIRED_AGENTS) {
    const full = path.join(agentsDir, file);
    try {
      await fs.access(full);
    } catch {
      missing.push(file);
    }
  }
  const evolutionFull = path.join(agentsDir, EVOLUTION_ENGINE_PATH);
  try {
    await fs.access(evolutionFull);
  } catch {
    missing.push(EVOLUTION_ENGINE_PATH);
  }
  for (const m of missing) {
    await logStabilizer("WARNING: Missing pipeline agent: agents/" + m + " (will retry next cycle)");
  }
  return missing;
}

/**
 * 4. Check each app dir for spec.json, app.html, app.js; build corrupted_apps.json.
 */
async function checkAppDirectories() {
  let dirs = [];
  try {
    dirs = await fs.readdir(APPS_DIR);
  } catch {
    return [];
  }
  const appIds = dirs.filter((d) => d.startsWith("app_"));
  const corrupted = [];
  for (const appId of appIds) {
    const appDir = path.join(APPS_DIR, appId);
    const stat = await fs.stat(appDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const required = ["spec.json", "app.html", "app.js"];
    const missing = [];
    for (const file of required) {
      const full = path.join(appDir, file);
      try {
        await fs.access(full);
      } catch {
        missing.push(file);
      }
    }
    if (missing.length > 0) {
      corrupted.push({ app_id: appId, status: "corrupted", missing });
    }
  }
  if (corrupted.length > 0) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      CORRUPTED_APPS_FILE,
      JSON.stringify({ apps: corrupted, updated: new Date().toISOString() }, null, 2),
      "utf-8"
    );
    await logStabilizer("Corrupted apps recorded: " + corrupted.length + " → data/corrupted_apps.json");
  }
  return corrupted;
}

/**
 * Main entry: run all checks and repairs. Call first in every daemon cycle.
 * @returns {Promise<{ ok: boolean, dirsCreated?: number, filesCreated?: number, filesRepaired?: number, agentsMissing?: number, corruptedApps?: number }>}
 */
export async function runSystemStabilizer() {
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const dirsCreated = await ensureDirectories();
  const { created: filesCreated, repaired: filesRepaired } = await ensureCriticalFiles();
  const missingAgents = await verifyAgents();
  const agentsMissing = missingAgents.length;
  const corruptedList = await checkAppDirectories();
  const corruptedApps = corruptedList.length;

  const summary = [
    "System check complete.",
    "Missing dirs created: " + dirsCreated,
    "Missing files created: " + filesCreated,
    "Corrupted files repaired: " + filesRepaired,
    "Missing agents: " + agentsMissing,
    "Corrupted apps: " + corruptedApps
  ].join(" ");
  await logStabilizer(summary);

  return {
    ok: true,
    dirsCreated,
    filesCreated,
    filesRepaired,
    agentsMissing,
    missingAgents,
    corruptedApps
  };
}
