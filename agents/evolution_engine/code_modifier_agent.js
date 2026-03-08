/**
 * CODE MODIFIER AGENT – Apply evolution plans to existing app code.
 *
 * For each app in apps/<app_id>/:
 * 1. Check evolution_plan.json exists.
 * 2. If it exists and has suggestions (and allocation is not pause), load spec + current code.
 * 3. Call ai_code_engine.applyEvolution() with spec, current files, and plan.
 * 4. Write updated index.html, app.js, logic.js, styles.css to apps/<id> and deploy/<id>.
 *
 * Safety: Never delete the app. Keep existing functionality. Modify only what the plan requests.
 * Allocation: low → small patches; high → allow bigger changes; medium → focused changes.
 *
 * Run after runEvolutionEngine() in the daemon cycle.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { applyEvolution } from "../ai_code_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const LOGS_DIR = path.join(root, "logs");
const CODE_MODIFIER_LOG = path.join(root, "logs", "code_modifier.log");

async function logModifier(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(CODE_MODIFIER_LOG, line, "utf-8").catch(() => {});
}

/**
 * Map allocation status to change scope for applyEvolution.
 * low / minimal / pause → small; high / aggressive / grow → large; else medium.
 */
function getMaxChangeScope(evolutionPlan) {
  const status = (evolutionPlan?.allocation_status || "").toLowerCase();
  if (status === "pause" || status === "minimal" || status === "low") return "small";
  if (status === "high" || status === "aggressive" || status === "grow") return "large";
  return "medium";
}

/**
 * Load evolution_plan.json for an app. Return null if missing or invalid.
 */
async function loadEvolutionPlan(appDir) {
  const planPath = path.join(appDir, "evolution_plan.json");
  try {
    const raw = await fs.readFile(planPath, "utf-8");
    const plan = JSON.parse(raw);
    return plan;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    await logModifier("Invalid evolution_plan.json in " + appDir + ": " + e.message);
    return null;
  }
}

/**
 * Load spec.json for an app. Return {} if missing.
 */
async function loadSpec(appDir) {
  const specPath = path.join(appDir, "spec.json");
  try {
    const raw = await fs.readFile(specPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Load current code files (index.html or app.html, app.js, logic.js, styles.css). Missing files = "".
 */
async function loadCurrentFiles(appDir) {
  const readSafe = async (file) => {
    try {
      return await fs.readFile(path.join(appDir, file), "utf-8");
    } catch {
      return "";
    }
  };

  let indexHtml = await readSafe("index.html");
  if (!indexHtml) indexHtml = await readSafe("app.html");

  const appJs = await readSafe("app.js");
  const logicJs = await readSafe("logic.js");
  const stylesCss = await readSafe("styles.css");

  return { indexHtml, appJs, logicJs, stylesCss };
}

/**
 * Apply evolution for one app. Returns { ok: boolean, applied: boolean, error?: string }.
 */
async function applyEvolutionForApp(appId) {
  const appDir = path.join(APPS_DIR, appId);
  const deployDir = path.join(DEPLOY_DIR, appId);

  const plan = await loadEvolutionPlan(appDir);
  if (!plan) return { ok: true, applied: false };

  const allocationStatus = (plan.allocation_status || "").toLowerCase();
  if (allocationStatus === "pause") {
    await logModifier(`[${appId}] Skip: allocation is pause.`);
    return { ok: true, applied: false };
  }

  const suggestions = Array.isArray(plan.suggestions) ? plan.suggestions.filter((s) => typeof s === "string" && s.trim()) : [];
  if (suggestions.length === 0) {
    await logModifier(`[${appId}] Skip: no suggestions in plan.`);
    return { ok: true, applied: false };
  }

  const spec = await loadSpec(appDir);
  const currentFiles = await loadCurrentFiles(appDir);

  if (!currentFiles.indexHtml && !currentFiles.appJs) {
    await logModifier(`[${appId}] Skip: no existing code to modify.`);
    return { ok: true, applied: false };
  }

  const maxChangeScope = getMaxChangeScope(plan);

  let updated;
  try {
    updated = await applyEvolution(spec, currentFiles, plan, { maxChangeScope });
  } catch (e) {
    await logModifier(`[${appId}] applyEvolution failed: ${e.message}`);
    return { ok: false, applied: false, error: e.message };
  }

  if (!updated.indexHtml && !updated.appJs) {
    return { ok: true, applied: false };
  }

  try {
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(deployDir, { recursive: true });

    const html = updated.indexHtml || currentFiles.indexHtml || "";
    await fs.writeFile(path.join(appDir, "index.html"), html, "utf-8");
    await fs.writeFile(path.join(appDir, "app.html"), html, "utf-8");
    await fs.writeFile(path.join(appDir, "app.js"), updated.appJs || currentFiles.appJs || "", "utf-8");
    await fs.writeFile(path.join(appDir, "logic.js"), updated.logicJs || currentFiles.logicJs || "", "utf-8");
    await fs.writeFile(path.join(appDir, "styles.css"), updated.stylesCss || currentFiles.stylesCss || "", "utf-8");

    await fs.writeFile(path.join(deployDir, "index.html"), html, "utf-8");
    await fs.writeFile(path.join(deployDir, "app.html"), html, "utf-8");
    await fs.writeFile(path.join(deployDir, "app.js"), updated.appJs || currentFiles.appJs || "", "utf-8");
    await fs.writeFile(path.join(deployDir, "logic.js"), updated.logicJs || currentFiles.logicJs || "", "utf-8");
    await fs.writeFile(path.join(deployDir, "styles.css"), updated.stylesCss || currentFiles.stylesCss || "", "utf-8");

    await logModifier(`[${appId}] Applied evolution (${suggestions.length} suggestions, scope=${maxChangeScope}).`);
  } catch (e) {
    await logModifier(`[${appId}] Write failed: ${e.message}`);
    return { ok: false, applied: false, error: e.message };
  }

  return { ok: true, applied: true };
}

/**
 * Run code modifier: for each app with evolution_plan.json and suggestions, apply evolution and write updated code.
 * @returns {Promise<{ ok: boolean, processed: number, applied: number, errors: number }>}
 */
export async function runCodeModifierAgent() {
  let appDirs = [];
  try {
    appDirs = await fs.readdir(APPS_DIR);
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, processed: 0, applied: 0, errors: 0 };
    throw e;
  }

  const appIds = appDirs.filter((name) => name.startsWith("app_"));
  let processed = 0;
  let applied = 0;
  let errors = 0;

  for (const appId of appIds) {
    const full = path.join(APPS_DIR, appId);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const result = await applyEvolutionForApp(appId).catch((e) => {
      logModifier("Error for " + appId + ": " + e.message);
      return { ok: false, applied: false, error: e.message };
    });

    processed++;
    if (result.applied) applied++;
    if (!result.ok) errors++;
  }

  return { ok: errors === 0, processed, applied, errors };
}
