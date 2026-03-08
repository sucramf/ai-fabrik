/**
 * FACTORY MONITOR – Continuous factory performance and health monitoring.
 *
 * Reads: portfolio/portfolio_status.json, data/revenue_metrics.json,
 * metrics/<app_id>.json, logs/system_repairs.json, tests/chaos_test_results.json,
 * factory_monitor/pipeline_history.json (written by this module when pipeline result is passed).
 *
 * Writes: factory_monitor/factory_health.json
 *
 * Never throws; missing data is handled gracefully. Does not stop the pipeline.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const MONITOR_DIR = path.join(root, "factory_monitor");
const HEALTH_FILE = path.join(MONITOR_DIR, "factory_health.json");
const PIPELINE_HISTORY_FILE = path.join(MONITOR_DIR, "pipeline_history.json");
const PREV_REVENUE_FILE = path.join(MONITOR_DIR, ".prev_revenue.json");
const PORTFOLIO_FILE = path.join(root, "portfolio", "portfolio_status.json");
const REVENUE_FILE = path.join(root, "data", "revenue_metrics.json");
const REPAIRS_LOG = path.join(root, "logs", "system_repairs.json");
const CHAOS_RESULTS = path.join(root, "tests", "chaos_test_results.json");
const APPS_DIR = path.join(root, "apps");
const RESOURCE_ALLOCATION_FILE = path.join(root, "resources", "resource_allocation.json");

const MS_24H = 24 * 60 * 60 * 1000;
const MAX_PIPELINE_RUNS = 50;

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

async function readRevenueMetrics() {
  const data = await readJson(REVENUE_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function readRepairsLog() {
  const data = await readJson(REPAIRS_LOG, { repairs: [] });
  return Array.isArray(data.repairs) ? data.repairs : [];
}

async function readChaosResults() {
  const data = await readJson(CHAOS_RESULTS, { results: [] });
  return Array.isArray(data.results) ? data.results : [];
}

async function readPipelineHistory() {
  const data = await readJson(PIPELINE_HISTORY_FILE, { runs: [] });
  return Array.isArray(data.runs) ? data.runs : [];
}

async function readResourceAllocation() {
  const data = await readJson(RESOURCE_ALLOCATION_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function countAppDirs() {
  try {
    const names = await fs.readdir(APPS_DIR);
    return names.filter((n) => n.startsWith("app_")).length;
  } catch {
    return 0;
  }
}

/**
 * Append current pipeline result to history (for success rate over time).
 */
async function appendPipelineRun(passed, failed) {
  const run = {
    timestamp: new Date().toISOString(),
    passed: Number(passed) || 0,
    failed: Number(failed) || 0
  };
  let data = await readJson(PIPELINE_HISTORY_FILE, { runs: [] });
  const runs = Array.isArray(data.runs) ? data.runs : [];
  runs.push(run);
  if (runs.length > MAX_PIPELINE_RUNS) runs.splice(0, runs.length - MAX_PIPELINE_RUNS);
  await fs.mkdir(MONITOR_DIR, { recursive: true });
  await fs.writeFile(
    PIPELINE_HISTORY_FILE,
    JSON.stringify({ runs, last_updated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

/**
 * Compute pipeline_success_rate and build_failures from recent runs (last 24h or last N runs).
 */
function pipelineStats(runs) {
  const now = Date.now();
  const recent = runs.filter((r) => {
    const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    return now - t < MS_24H;
  });
  const use = recent.length > 0 ? recent : runs.slice(-MAX_PIPELINE_RUNS);
  let totalPassed = 0;
  let totalFailed = 0;
  for (const r of use) {
    totalPassed += Number(r.passed) || 0;
    totalFailed += Number(r.failed) || 0;
  }
  const total = totalPassed + totalFailed;
  const pipeline_success_rate = total > 0 ? totalPassed / total : 1;
  return { pipeline_success_rate, build_failures: totalFailed };
}

/**
 * Repairs in last 24h.
 */
function repairsLast24h(repairs) {
  const now = Date.now();
  return repairs.filter((r) => {
    const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    return now - t < MS_24H;
  }).length;
}

/**
 * Chaos test failures in last 24h (recovered === false).
 */
function chaosFailuresLast24h(results) {
  const now = Date.now();
  return results.filter((r) => {
    const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    return now - t < MS_24H && r.recovered === false;
  }).length;
}

/**
 * Run factory monitor and write factory_health.json.
 *
 * @param {Object} [options]
 * @param {Object} [options.pipelineResult] - { passedIds: string[], failedReports: Object[] } from last runFullProductPipeline()
 * @returns {Promise<{ ok: boolean, timestamp: string }>}
 */
export async function runFactoryMonitor(options = {}) {
  const pipelineResult = options.pipelineResult || null;
  const timestamp = new Date().toISOString();

  const [portfolioProducts, revenueProducts, repairs, chaosResults, pipelineRuns, allocationProducts, totalAppDirs] = await Promise.all([
    readPortfolio(),
    readRevenueMetrics(),
    readRepairsLog(),
    readChaosResults(),
    readPipelineHistory(),
    readResourceAllocation(),
    countAppDirs()
  ]);

  if (pipelineResult && Array.isArray(pipelineResult.passedIds) && Array.isArray(pipelineResult.failedReports)) {
    await appendPipelineRun(pipelineResult.passedIds.length, pipelineResult.failedReports.length);
  }
  const pipelineRunsForStats = await readPipelineHistory();

  const total_apps = portfolioProducts.length > 0 ? portfolioProducts.length : totalAppDirs;

  const statusCounts = { winner: 0, promising: 0, experiment: 0, weak: 0 };
  for (const p of portfolioProducts) {
    const s = (p.status || "").toLowerCase();
    if (s in statusCounts) statusCounts[s]++;
  }

  const apps_growing = statusCounts.winner + statusCounts.promising;
  const apps_stagnant = statusCounts.experiment;
  const apps_paused = statusCounts.weak;

  const allocationByApp = new Map();
  for (const a of allocationProducts) {
    if (a.appId) allocationByApp.set(a.appId, a.allocation);
  }
  const pausedByAllocation = allocationProducts.filter((a) => (a.allocation || "").toLowerCase() === "minimal").length;
  const apps_paused_final = Math.max(pausedByAllocation, apps_paused);

  const apps_profitable = revenueProducts.filter((p) => Number(p.revenue) > 0).length;

  const factory_revenue_total = revenueProducts.reduce((sum, p) => sum + (Number(p.revenue) || 0), 0);

  let factory_revenue_growth = 0;
  try {
    const prevData = await readJson(PREV_REVENUE_FILE, {});
    const prevTotal = Number(prevData.total);
    if (prevTotal > 0 && Number.isFinite(prevTotal)) {
      factory_revenue_growth = (factory_revenue_total - prevTotal) / prevTotal;
    }
  } catch {
    // ignore
  }
  try {
    await fs.mkdir(MONITOR_DIR, { recursive: true });
    await fs.writeFile(PREV_REVENUE_FILE, JSON.stringify({ total: factory_revenue_total, timestamp }, null, 2), "utf-8");
  } catch {
    // ignore
  }

  const { pipeline_success_rate, build_failures } = pipelineStats(pipelineRunsForStats);
  const repairs_last_24h = repairsLast24h(repairs);
  const chaos_failures_last_24h = chaosFailuresLast24h(chaosResults);

  const report = {
    timestamp,
    apps: {
      total: total_apps,
      profitable: apps_profitable,
      growing: apps_growing,
      stagnant: apps_stagnant,
      paused: apps_paused_final
    },
    revenue: {
      total: Math.round(factory_revenue_total * 100) / 100,
      growth_rate: Math.round(factory_revenue_growth * 100) / 100
    },
    system: {
      pipeline_success_rate: Math.round(pipeline_success_rate * 100) / 100,
      build_failures,
      repairs_last_24h,
      chaos_failures_last_24h
    }
  };

  await fs.mkdir(MONITOR_DIR, { recursive: true });
  await fs.writeFile(HEALTH_FILE, JSON.stringify(report, null, 2), "utf-8");

  return { ok: true, timestamp };
}
