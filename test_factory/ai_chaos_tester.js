/**
 * AI CHAOS TESTER – Autonomous stress testing for the factory.
 *
 * Randomly selects a scenario from test_scenarios.json, simulates the failure,
 * runs system_stabilizer and a pipeline step, then records whether the factory
 * recovered. Results are written to tests/chaos_test_results.json.
 *
 * Run from daemon every 15 cycles. Does not break normal pipeline execution.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { runSystemStabilizer } from "../agents/system_stabilizer.js";
import { runPortfolioAnalysis } from "../agents/portfolio_brain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const SCENARIOS_PATH = path.join(__dirname, "test_scenarios.json");
const RESULTS_PATH = path.join(root, "tests", "chaos_test_results.json");
const APPS_DIR = path.join(root, "apps");
const IDEAS_FILE = path.join(root, "ideas", "ideas.json");
const REVENUE_METRICS_FILE = path.join(root, "data", "revenue_metrics.json");
const GROWTH_EXPERIMENTS_FILE = path.join(root, "growth", "growth_experiments.json");

/**
 * Get first app_* directory name from apps/, or null.
 */
async function getFirstAppId() {
  try {
    const names = await fs.readdir(APPS_DIR);
    const appId = names.find((n) => n.startsWith("app_"));
    return appId || null;
  } catch {
    return null;
  }
}

/**
 * Load scenarios from test_scenarios.json.
 */
async function loadScenarios() {
  try {
    const raw = await fs.readFile(SCENARIOS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[CHAOS_TESTER] Could not load scenarios:", e.message);
    return [];
  }
}

/**
 * Load existing chaos test results or return empty array.
 */
async function loadResults() {
  try {
    const raw = await fs.readFile(RESULTS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Save results to tests/chaos_test_results.json.
 */
async function saveResults(results) {
  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(
    RESULTS_PATH,
    JSON.stringify(
      {
        results,
        last_updated: new Date().toISOString(),
        total_runs: results.length
      },
      null,
      2
    ),
    "utf-8"
  );
}

/**
 * Apply chaos for the given scenario. Returns backup data for restore (or null).
 */
async function applyChaos(scenario) {
  const action = scenario.action || "";
  const appId = await getFirstAppId();
  let backup = null;

  if (action === "overwrite_with_invalid_html") {
    if (!appId) return null;
    const filePath = path.join(APPS_DIR, appId, "app.html");
    try {
      backup = await fs.readFile(filePath, "utf-8");
    } catch {
      backup = "";
    }
    await fs.writeFile(filePath, "<html><body broken", "utf-8");
    return { filePath, backup };
  }

  if (action === "delete_file") {
    const target = (scenario.target || "").toLowerCase();
    let filePath;
    if (target.includes("spec.json")) {
      if (!appId) return null;
      filePath = path.join(APPS_DIR, appId, "spec.json");
    } else if (target.includes("deploy")) {
      if (!appId) return null;
      filePath = path.join(root, "deploy", appId, "app.html");
    } else if (target.includes("idea.txt")) {
      if (!appId) return null;
      filePath = path.join(APPS_DIR, appId, "idea.txt");
    } else {
      return null;
    }
    try {
      backup = await fs.readFile(filePath, "utf-8");
    } catch {
      backup = null;
    }
    await fs.unlink(filePath).catch(() => {});
    return { filePath, backup };
  }

  if (action === "corrupt_json") {
    const target = (scenario.target || "").toLowerCase();
    let filePath;
    if (target.includes("revenue_metrics")) {
      filePath = REVENUE_METRICS_FILE;
    } else if (target.includes("payment_config")) {
      if (!appId) return null;
      filePath = path.join(APPS_DIR, appId, "payment_config.json");
    } else if (target.includes("evolution_plan")) {
      if (!appId) return null;
      filePath = path.join(APPS_DIR, appId, "evolution_plan.json");
    } else {
      return null;
    }
    try {
      backup = await fs.readFile(filePath, "utf-8");
    } catch {
      backup = "{}";
    }
    await fs.writeFile(filePath, "{ invalid json !!", "utf-8");
    return { filePath, backup };
  }

  if (action === "inject_duplicates") {
    try {
      backup = await fs.readFile(GROWTH_EXPERIMENTS_FILE, "utf-8");
    } catch {
      backup = "[]";
    }
    const data = JSON.parse(backup || "[]");
    const list = Array.isArray(data) ? data : [];
    const dup = list[0] ? { ...list[0], _chaos_dup: Date.now() } : { appId: "app_0", experiment_type: "seo", status: "planned" };
    await fs.mkdir(path.dirname(GROWTH_EXPERIMENTS_FILE), { recursive: true });
    await fs.writeFile(GROWTH_EXPERIMENTS_FILE, JSON.stringify([...list, dup, dup], null, 2), "utf-8");
    return { filePath: GROWTH_EXPERIMENTS_FILE, backup };
  }

  if (action === "write_empty_array") {
    try {
      backup = await fs.readFile(IDEAS_FILE, "utf-8");
    } catch {
      backup = "[]";
    }
    await fs.mkdir(path.dirname(IDEAS_FILE), { recursive: true });
    await fs.writeFile(IDEAS_FILE, "[]", "utf-8");
    return { filePath: IDEAS_FILE, backup };
  }

  if (action === "write_large_list") {
    try {
      backup = await fs.readFile(IDEAS_FILE, "utf-8");
    } catch {
      backup = "[]";
    }
    const large = Array.from({ length: 500 }, (_, i) => `Chaos test idea ${i} placeholder`);
    await fs.mkdir(path.dirname(IDEAS_FILE), { recursive: true });
    await fs.writeFile(IDEAS_FILE, JSON.stringify(large, null, 2), "utf-8");
    return { filePath: IDEAS_FILE, backup };
  }

  return null;
}

/**
 * Restore state from backup (so next daemon cycle is not stuck).
 */
async function restoreBackup(backupInfo) {
  if (!backupInfo || !backupInfo.filePath) return;
  try {
    await fs.mkdir(path.dirname(backupInfo.filePath), { recursive: true });
    const content = backupInfo.backup != null ? backupInfo.backup : (backupInfo.filePath.endsWith(".json") ? "{}" : "");
    await fs.writeFile(backupInfo.filePath, content, "utf-8");
  } catch (e) {
    console.warn("[CHAOS_TESTER] Restore failed:", backupInfo.filePath, e.message);
  }
}

/**
 * Run one chaos test: pick scenario, apply chaos, run stabilizer + pipeline step, record result, restore.
 * @returns {Promise<{ ok: boolean, scenario: string, recovered: boolean, error?: string }>}
 */
export async function runAiChaosTester() {
  const scenarios = await loadScenarios();
  if (scenarios.length === 0) {
    return { ok: true, scenario: null, recovered: true, message: "No scenarios loaded" };
  }

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const scenarioId = scenario.id || scenario.name || "unknown";
  let backupInfo = null;
  let recovered = false;
  let errorMessage = null;

  try {
    backupInfo = await applyChaos(scenario);
  } catch (e) {
    errorMessage = "apply_chaos: " + e.message;
    const result = {
      scenario_id: scenarioId,
      scenario_name: scenario.name,
      timestamp: new Date().toISOString(),
      recovered: false,
      error: errorMessage,
      expected_behavior: scenario.expected_behavior
    };
    const results = await loadResults();
    results.push(result);
    await saveResults(results);
    return { ok: true, scenario: scenarioId, recovered: false, error: errorMessage };
  }

  try {
    const stabilizerResult = await runSystemStabilizer().catch((e) => ({ ok: false, message: e.message }));
    const portfolioResult = await runPortfolioAnalysis().catch((e) => ({ ok: false, products: 0, message: e.message }));

    recovered = (stabilizerResult && stabilizerResult.ok !== false) && (portfolioResult && (portfolioResult.products !== undefined || portfolioResult.ok !== false));
    if (!recovered && !errorMessage) {
      errorMessage = [stabilizerResult?.message, portfolioResult?.message].filter(Boolean).join("; ") || "Pipeline step failed";
    }
  } catch (e) {
    recovered = false;
    errorMessage = e.message || String(e);
  } finally {
    await restoreBackup(backupInfo);
  }

  const result = {
    scenario_id: scenarioId,
    scenario_name: scenario.name,
    timestamp: new Date().toISOString(),
    recovered,
    error: errorMessage || undefined,
    expected_behavior: scenario.expected_behavior
  };

  const results = await loadResults();
  results.push(result);
  await saveResults(results);

  return {
    ok: true,
    scenario: scenarioId,
    recovered,
    error: errorMessage || undefined
  };
}
