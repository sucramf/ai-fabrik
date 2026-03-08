/**
 * TRAFFIC ORCHESTRATOR – Autonomous traffic acquisition for top portfolio apps.
 *
 * 1. Reads factory_monitor/factory_health.json and portfolio/portfolio_status.json
 * 2. Identifies apps that need traffic: promising, winner, or profitable
 * 3. Skips paused apps (allocation minimal or status weak)
 * 4. Writes traffic_system/traffic_targets.json
 * 5. Runs traffic_engine and distribution_engine (max 3 actions per app per cycle)
 *
 * Does not spam: limit 3 traffic actions per app per cycle. Missing data handled gracefully.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { runTrafficEngine } from "../agents/traffic_engine.js";
import { runDistributionEngine } from "../agents/distribution_engine.js";
import { runDistribution } from "../agents/distribution_agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const TRAFFIC_DIR = path.join(root, "traffic_system");
const TARGETS_FILE = path.join(TRAFFIC_DIR, "traffic_targets.json");
const HEALTH_FILE = path.join(root, "factory_monitor", "factory_health.json");
const PORTFOLIO_FILE = path.join(root, "portfolio", "portfolio_status.json");
const ALLOCATION_FILE = path.join(root, "resources", "resource_allocation.json");
const REVENUE_FILE = path.join(root, "data", "revenue_metrics.json");
const APPS_DIR = path.join(root, "apps");

const MAX_ACTIONS_PER_APP_PER_CYCLE = 3;
const ELIGIBLE_STATUSES = ["promising", "winner"];
const PAUSED_STATUS = "weak";
const PAUSED_ALLOCATION = "minimal";

async function readJson(filePath, defaultValue = null) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

async function readPortfolio() {
  const data = await readJson(PORTFOLIO_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function readAllocation() {
  const data = await readJson(ALLOCATION_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function readRevenueMetrics() {
  const data = await readJson(REVENUE_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function getProductNameForApp(appId) {
  try {
    const specPath = path.join(APPS_DIR, appId, "spec.json");
    const raw = await fs.readFile(specPath, "utf-8");
    const spec = JSON.parse(raw);
    return (spec.product_name || "").trim() || appId;
  } catch {
    return appId;
  }
}

/**
 * Build list of app_ids that are promising, winner, or profitable. Exclude paused.
 */
async function selectTargetApps() {
  const [portfolioProducts, allocationProducts, revenueProducts] = await Promise.all([
    readPortfolio(),
    readAllocation(),
    readRevenueMetrics()
  ]);

  const allocationByApp = new Map();
  for (const a of allocationProducts) {
    if (a.appId) allocationByApp.set(a.appId, (a.allocation || "").toLowerCase());
  }

  const profitableProductNames = new Set(
    revenueProducts
      .filter((p) => Number(p.revenue) > 0)
      .map((p) => (p.product_name || "").trim())
      .filter(Boolean)
  );

  const targets = [];
  for (const p of portfolioProducts) {
    const appId = p.appId;
    if (!appId || !appId.startsWith("app_")) continue;

    const status = (p.status || "").toLowerCase();
    const allocation = allocationByApp.get(appId) || "";

    if (allocation === PAUSED_ALLOCATION || status === PAUSED_STATUS) continue;

    const isEligibleByStatus = ELIGIBLE_STATUSES.includes(status);
    const productName = await getProductNameForApp(appId);
    const isProfitable = profitableProductNames.has(productName);

    if (!isEligibleByStatus && !isProfitable) continue;

    let priority = "medium";
    if (status === "winner") priority = "high";
    else if (status === "promising" || isProfitable) priority = "medium";

    const strategy = status === "winner" ? "seo + social" : "seo + social";

    targets.push({
      app_id: appId,
      traffic_strategy: strategy,
      priority
    });
  }

  targets.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  return targets;
}

/**
 * Run up to MAX_ACTIONS_PER_APP_PER_CYCLE actions per app: traffic_engine, distribution_engine, distribution_agent.
 */
async function runActionsForApp(appId) {
  const results = { seo: null, distribution_engine: null, distribution_agent: null };
  let actionCount = 0;

  if (actionCount < MAX_ACTIONS_PER_APP_PER_CYCLE) {
    results.seo = await runTrafficEngine(appId).catch((e) => ({ ok: false, error: e.message }));
    actionCount += 1;
  }
  if (actionCount < MAX_ACTIONS_PER_APP_PER_CYCLE) {
    results.distribution_engine = await runDistributionEngine(appId).catch((e) => ({ ok: false, error: e.message }));
    actionCount += 1;
  }
  if (actionCount < MAX_ACTIONS_PER_APP_PER_CYCLE) {
    await runDistribution(appId).catch(() => {});
    results.distribution_agent = { ok: true };
    actionCount += 1;
  }

  return { actionCount, results };
}

/**
 * Run traffic orchestrator: select targets, write traffic_targets.json, trigger traffic and distribution engines.
 * @returns {Promise<{ ok: boolean, targets: number, actionsRun: number }>}
 */
export async function runTrafficOrchestrator() {
  await readJson(HEALTH_FILE).catch(() => ({}));

  const targets = await selectTargetApps();
  if (targets.length === 0) {
    await fs.mkdir(TRAFFIC_DIR, { recursive: true });
    await fs.writeFile(
      TARGETS_FILE,
      JSON.stringify({ targets: [], updated: new Date().toISOString() }, null, 2),
      "utf-8"
    );
    return { ok: true, targets: 0, actionsRun: 0 };
  }

  const payload = {
    targets,
    updated: new Date().toISOString()
  };
  await fs.mkdir(TRAFFIC_DIR, { recursive: true });
  await fs.writeFile(TARGETS_FILE, JSON.stringify(payload, null, 2), "utf-8");

  let actionsRun = 0;
  for (const t of targets) {
    const appId = t.app_id;
    const { actionCount } = await runActionsForApp(appId);
    actionsRun += actionCount;
  }

  return { ok: true, targets: targets.length, actionsRun };
}
