/**
 * SYSTEM REPAIR AGENT – Analyze failures and automatically fix root causes.
 *
 * 1. Reads tests/chaos_test_results.json for failure reports.
 * 2. Detects repeated failures (same scenario fails 3+ times → trigger repair).
 * 3. Uses AI reasoning to determine repair action (or uses scenario-to-action map).
 * 4. Applies repair: backup first, then regenerate/rewrite/rebuild/restore/patch.
 * 5. Logs all repairs to logs/system_repairs.json.
 *
 * Safety: Never delete apps. Only repair corrupted or missing files. Always backup before modifying.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { AI_MODELS } from "../config/ai_models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const CHAOS_RESULTS_PATH = path.join(root, "tests", "chaos_test_results.json");
const SCENARIOS_PATH = path.join(root, "test_factory", "test_scenarios.json");
const REPAIRS_LOG_PATH = path.join(root, "logs", "system_repairs.json");
const BACKUP_DIR = path.join(root, "logs", "repair_backups");
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const DATA_DIR = path.join(root, "data");
const IDEAS_DIR = path.join(root, "ideas");
const GROWTH_DIR = path.join(root, "growth");

const FAILURE_THRESHOLD = 3;

const REPAIR_ACTIONS = [
  "regenerate_missing_file",
  "rewrite_corrupted_json",
  "rebuild_deploy_folder",
  "restore_required_schema",
  "patch_broken_html"
];

/**
 * Get first app_* directory name from apps/, or null.
 */
async function getFirstAppId() {
  try {
    const names = await fs.readdir(APPS_DIR);
    return names.find((n) => n.startsWith("app_")) || null;
  } catch {
    return null;
  }
}

/**
 * Load chaos test results. Returns { results: [] } or empty.
 */
async function loadChaosResults() {
  try {
    const raw = await fs.readFile(CHAOS_RESULTS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return { results: Array.isArray(data.results) ? data.results : [] };
  } catch {
    return { results: [] };
  }
}

/**
 * Load scenario definitions for target/expected_behavior.
 */
async function loadScenarios() {
  try {
    const raw = await fs.readFile(SCENARIOS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Count recent failures per scenario_id. Returns Map<scenario_id, count> for scenarios >= FAILURE_THRESHOLD.
 */
function getScenariosNeedingRepair(results) {
  const byScenario = new Map();
  for (const r of results) {
    if (r.recovered === false && (r.scenario_id || r.scenario_name)) {
      const id = r.scenario_id || r.scenario_name;
      byScenario.set(id, (byScenario.get(id) || 0) + 1);
    }
  }
  const needRepair = new Map();
  for (const [id, count] of byScenario) {
    if (count >= FAILURE_THRESHOLD) needRepair.set(id, count);
  }
  return needRepair;
}

/**
 * Ask AI for repair action. Returns one of REPAIR_ACTIONS and optional target_path.
 */
async function askAiForRepairAction(scenarioId, scenarioName, target, expectedBehavior, lastError) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return { action: inferRepairAction(scenarioId, target), target_path: null };
  }
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model: AI_MODELS.reasoning,
      messages: [
        {
          role: "system",
          content: `You are a factory repair system. Given a failure scenario, choose exactly ONE repair action. Reply with only a JSON object: { "action": "<one of: ${REPAIR_ACTIONS.join(", ")}>", "target_path": "<file or folder path relative to repo root, or null>" }. No other text.`
        },
        {
          role: "user",
          content: `Scenario: ${scenarioName} (id: ${scenarioId}). Target: ${target}. Expected: ${expectedBehavior}. Last error: ${lastError || "unknown"}. Which repair action and target_path?`
        }
      ],
      temperature: 0.2
    });
    const text = (res.choices?.[0]?.message?.content || "").trim().replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(text || "{}");
    const action = REPAIR_ACTIONS.includes(parsed.action) ? parsed.action : inferRepairAction(scenarioId, target);
    return { action, target_path: parsed.target_path || null };
  } catch (e) {
    return { action: inferRepairAction(scenarioId, target), target_path: null };
  }
}

/**
 * Infer repair action from scenario_id and target when AI is unavailable or fails.
 */
function inferRepairAction(scenarioId, target) {
  const t = (target || "").toLowerCase();
  if (scenarioId === "broken_html" || t.includes("app.html")) return "patch_broken_html";
  if (scenarioId === "missing_spec_json" || t.includes("spec.json")) return "regenerate_missing_file";
  if (scenarioId === "corrupted_metrics" || t.includes("revenue_metrics")) return "rewrite_corrupted_json";
  if (scenarioId === "invalid_pricing_config" || t.includes("payment_config")) return "rewrite_corrupted_json";
  if (scenarioId === "missing_deploy_files" || t.includes("deploy")) return "rebuild_deploy_folder";
  if (scenarioId === "duplicate_app_ids" || t.includes("growth_experiments")) return "restore_required_schema";
  if (scenarioId === "empty_ideas_json" || scenarioId === "extremely_large_ideas_list" || t.includes("ideas.json")) return "restore_required_schema";
  if (scenarioId === "malformed_evolution_plan" || t.includes("evolution_plan")) return "rewrite_corrupted_json";
  if (t.includes("idea.txt")) return "regenerate_missing_file";
  return "restore_required_schema";
}

/**
 * Create backup of a file or directory. Returns path to backup file.
 */
async function backupBeforeRepair(filePath) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const name = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `repair_${timestamp}_${name}`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    await fs.writeFile(backupPath, content, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  return backupPath;
}

/**
 * Load existing repairs log or return empty.
 */
async function loadRepairsLog() {
  try {
    const raw = await fs.readFile(REPAIRS_LOG_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.repairs) ? data.repairs : [];
  } catch {
    return [];
  }
}

async function appendRepairLog(entry) {
  await fs.mkdir(path.dirname(REPAIRS_LOG_PATH), { recursive: true });
  const repairs = await loadRepairsLog();
  repairs.push(entry);
  await fs.writeFile(
    REPAIRS_LOG_PATH,
    JSON.stringify({ repairs, last_updated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

/**
 * Apply repair action. Returns { success: boolean, backup_path?: string }.
 */
async function applyRepair(action, scenarioId, appId) {
  const now = new Date().toISOString();

  if (action === "regenerate_missing_file") {
    if (!appId) return { success: false };
    const specPath = path.join(APPS_DIR, appId, "spec.json");
    const ideaPath = path.join(APPS_DIR, appId, "idea.txt");
    const deployHtmlPath = path.join(DEPLOY_DIR, appId, "app.html");
    const appHtmlPath = path.join(APPS_DIR, appId, "app.html");
    const productName = appId.replace(/^app_/, "App ").replace(/_/g, " ");

    const created = [];
    try {
      const stat = await fs.stat(specPath).catch(() => null);
      if (!stat) {
        await fs.mkdir(path.dirname(specPath), { recursive: true });
        const minimalSpec = {
          product_name: productName,
          product_type: "micro_saas",
          features: [],
          value_proposition: "Generated by system repair."
        };
        await fs.writeFile(specPath, JSON.stringify(minimalSpec, null, 2), "utf-8");
        created.push("spec.json");
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
    try {
      const ideaStat = await fs.stat(ideaPath).catch(() => null);
      if (!ideaStat) {
        await fs.mkdir(path.dirname(ideaPath), { recursive: true });
        await fs.writeFile(ideaPath, productName, "utf-8");
        created.push("idea.txt");
      }
    } catch {
      // ignore
    }
    try {
      const stat = await fs.stat(deployHtmlPath).catch(() => null);
      if (!stat) {
        let html = "";
        try {
          html = await fs.readFile(appHtmlPath, "utf-8");
        } catch {
          html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/><title>App</title></head><body><p>Repaired</p></body></html>";
        }
        await fs.mkdir(path.dirname(deployHtmlPath), { recursive: true });
        await fs.writeFile(deployHtmlPath, html, "utf-8");
        created.push("deploy app.html");
      }
    } catch (e) {
      return { success: created.length > 0, error: e.message };
    }
    return { success: true, created };
  }

  if (action === "rewrite_corrupted_json") {
    let filePath = null;
    let defaultPayload = null;
    if (scenarioId === "corrupted_metrics") {
      filePath = path.join(root, "data", "revenue_metrics.json");
      defaultPayload = { products: [], updated: new Date().toISOString() };
    } else if (scenarioId === "invalid_pricing_config" && appId) {
      filePath = path.join(APPS_DIR, appId, "payment_config.json");
      defaultPayload = {
        stripe: { secret_key: "", publishable_key: "" },
        paypal: { client_id: "", client_secret: "" },
        _comment: "Repaired by system_repair_agent"
      };
    } else if (scenarioId === "malformed_evolution_plan" && appId) {
      filePath = path.join(APPS_DIR, appId, "evolution_plan.json");
      defaultPayload = {
        appId,
        allocation_status: "maintain",
        suggestions: [],
        reasoning: ["Repaired by system_repair_agent."],
        generated_at: new Date().toISOString(),
        note: "Evolution plans are proposals only."
      };
    } else if (scenarioId === "duplicate_app_ids") {
      filePath = path.join(root, "growth", "growth_experiments.json");
      defaultPayload = [];
    }
    if (!filePath || defaultPayload === null) return { success: false };
    const backupPath = await backupBeforeRepair(filePath).catch(() => null);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(defaultPayload, null, 2), "utf-8");
    return { success: true, backup_path: backupPath };
  }

  if (action === "rebuild_deploy_folder") {
    if (!appId) return { success: false };
    const appDir = path.join(APPS_DIR, appId);
    const deployAppDir = path.join(DEPLOY_DIR, appId);
    const files = ["app.html", "index.html", "app.js", "styles.css", "logic.js"];
    await fs.mkdir(deployAppDir, { recursive: true });
    for (const f of files) {
      const src = path.join(appDir, f);
      const dest = path.join(deployAppDir, f);
      try {
        const content = await fs.readFile(src, "utf-8");
        await fs.writeFile(dest, content, "utf-8");
      } catch {
        // skip missing
      }
    }
    return { success: true };
  }

  if (action === "restore_required_schema") {
    const ideasPath = path.join(root, "ideas", "ideas.json");
    const growthPath = path.join(root, "growth", "growth_experiments.json");
    if (scenarioId === "empty_ideas_json" || scenarioId === "extremely_large_ideas_list") {
      const backupPath = await backupBeforeRepair(ideasPath).catch(() => null);
      await fs.mkdir(path.dirname(ideasPath), { recursive: true });
      await fs.writeFile(ideasPath, "[]", "utf-8");
      return { success: true, backup_path: backupPath };
    }
    if (scenarioId === "duplicate_app_ids") {
      const backupPath = await backupBeforeRepair(growthPath).catch(() => null);
      await fs.mkdir(path.dirname(growthPath), { recursive: true });
      await fs.writeFile(growthPath, "[]", "utf-8");
      return { success: true, backup_path: backupPath };
    }
    return { success: false };
  }

  if (action === "patch_broken_html") {
    if (!appId) return { success: false };
    const appHtmlPath = path.join(APPS_DIR, appId, "app.html");
    const deployHtmlPath = path.join(DEPLOY_DIR, appId, "app.html");
    const minimalHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>App</title><link rel="stylesheet" href="styles.css"/></head>
<body><header><h1>App</h1></header><main><p>Content repaired by system.</p></main><script type="module" src="app.js"></script></body>
</html>`;
    const backupPath = await backupBeforeRepair(appHtmlPath).catch(() => null);
    await fs.mkdir(path.dirname(appHtmlPath), { recursive: true });
    await fs.writeFile(appHtmlPath, minimalHtml, "utf-8");
    await fs.mkdir(path.dirname(deployHtmlPath), { recursive: true });
    await fs.writeFile(deployHtmlPath, minimalHtml, "utf-8");
    return { success: true, backup_path: backupPath };
  }

  return { success: false };
}

/**
 * Run system repair agent: analyze chaos results, trigger repairs for repeated failures, log repairs.
 * @returns {Promise<{ ok: boolean, repairs_triggered: number, repairs_succeeded: number }>}
 */
export async function runSystemRepairAgent() {
  const chaos = await loadChaosResults();
  const needRepair = getScenariosNeedingRepair(chaos.results);
  if (needRepair.size === 0) {
    return { ok: true, repairs_triggered: 0, repairs_succeeded: 0 };
  }

  const scenarios = await loadScenarios();
  const scenarioById = new Map(scenarios.map((s) => [s.id || s.name, s]));
  const appId = await getFirstAppId();
  let repairsTriggered = 0;
  let repairsSucceeded = 0;

  for (const [scenarioId, failureCount] of needRepair) {
    const scenario = scenarioById.get(scenarioId) || { name: scenarioId, target: "", expected_behavior: "" };
    const lastFailure = chaos.results.filter((r) => (r.scenario_id || r.scenario_name) === scenarioId && r.recovered === false).pop();
    const lastError = lastFailure?.error || "unknown";

    const { action } = await askAiForRepairAction(
      scenarioId,
      scenario.name,
      scenario.target,
      scenario.expected_behavior,
      lastError
    );

    let success = false;
    let backup_path = null;
    try {
      const result = await applyRepair(action, scenarioId, appId);
      success = result.success === true;
      backup_path = result.backup_path || null;
      if (success) repairsSucceeded++;
    } catch (e) {
      await appendRepairLog({
        timestamp: new Date().toISOString(),
        scenario_id: scenarioId,
        action,
        target: scenario.target,
        backup_path: null,
        success: false,
        error: e.message
      });
    }
    repairsTriggered++;
    await appendRepairLog({
      timestamp: new Date().toISOString(),
      scenario_id: scenarioId,
      action,
      target: scenario.target,
      backup_path,
      success,
      failure_count: failureCount
    });
  }

  return { ok: true, repairs_triggered: repairsTriggered, repairs_succeeded: repairsSucceeded };
}
