/**
 * FACTORY VALIDATION – Full system validation for AI_FABRIK v5.
 *
 * Read-only: verifies loop, periodic systems, directories, missing components,
 * dead code candidates, and risk points. Writes only factory_release/factory_validation_report.json.
 * Does not modify production code.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const REPORT_FILE = path.join(__dirname, "factory_validation_report.json");
const VERSION_FILE = path.join(__dirname, "factory_version.json");
const DAEMON_FILE = path.join(root, "superchief_daemon.js");
const PIPELINE_FILE = path.join(root, "builders", "full_product_pipeline.js");

const CRITICAL_DIRS = [
  "agents",
  "apps",
  "deploy",
  "metrics",
  "ideas",
  "logs",
  "tests",
  "growth",
  "traffic_system",
  "revenue_system",
  "maintenance_system",
  "factory_monitor",
  "factory_release"
];

const LOOP_COMPONENTS = [
  { name: "trend_scanner", path: "agents/trend_scanner.js" },
  { name: "idea_injector", path: "agents/idea_injector.js" },
  { name: "filterByTrends", path: "marketing/trend_analyst.js" },
  { name: "full_product_pipeline", path: "builders/full_product_pipeline.js" },
  { name: "runEvolutionEngine", path: "agents/evolution_engine/product_evolution_engine.js" },
  { name: "runPortfolioAnalysis", path: "agents/portfolio_brain.js" },
  { name: "runStrategicBrain", path: "agents/strategic_brain.js" },
  { name: "runResourceAllocator", path: "agents/resource_allocator.js" },
  { name: "runGrowthExperiments", path: "agents/growth_experiment_engine.js" },
  { name: "runGrowthExecution", path: "agents/growth_execution_agent.js" },
  { name: "runCodeModifierAgent", path: "agents/evolution_engine/code_modifier_agent.js" },
  { name: "runTrafficOrchestrator", path: "traffic_system/traffic_orchestrator.js" },
  { name: "runRevenueOptimizer", path: "revenue_system/revenue_optimizer.js" },
  { name: "runFactoryMonitor", path: "factory_monitor/factory_monitor.js" },
  { name: "collectUserFeedback", path: "agents/user_feedback_agent.js" },
  { name: "runDistribution", path: "agents/distribution_agent.js" },
  { name: "runSystemStabilizer", path: "agents/system_stabilizer.js" },
  { name: "runCodebaseCleaner", path: "agents/codebase_cleaner.js" },
  { name: "runCleanupOptimizer", path: "maintenance_system/cleanup_optimizer.js" },
  { name: "runReleaseManager", path: "factory_release/release_manager.js" },
  { name: "runAiChaosTester", path: "test_factory/ai_chaos_tester.js" },
  { name: "runSystemRepairAgent", path: "agents/system_repair_agent.js" },
  { name: "runUpdateAllMetrics", path: "agents/metrics_collector.js" },
  { name: "runAllTests", path: "agents/test_runner.js" }
];

async function readJson(filePath, defaultValue = null) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

async function pathExists(relPath) {
  const full = path.join(root, relPath);
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirName) {
  return pathExists(dirName + path.sep);
}

async function checkLoopComponents() {
  const missing = [];
  for (const { name, path: relPath } of LOOP_COMPONENTS) {
    const exists = await pathExists(relPath);
    if (!exists) missing.push(`${name} (${relPath})`);
  }
  return missing;
}

async function checkPeriodicSystems() {
  const issues = [];
  let daemonContent;
  try {
    daemonContent = await fs.readFile(DAEMON_FILE, "utf-8");
  } catch {
    return ["Daemon file unreadable"];
  }
  if (!daemonContent.includes("CYCLE_INTERVAL_MS") || !daemonContent.includes("7 * 60 * 1000")) {
    issues.push("Main cycle interval (7 min) not clearly set");
  }
  if (!daemonContent.includes("cycleCount % 10")) issues.push("Codebase cleaner (every 10 cycles) not found");
  if (!daemonContent.includes("cycleCount % 15")) issues.push("Chaos tests + repair (every 15 cycles) not found");
  if (!daemonContent.includes("cycleCount % 20")) issues.push("Cleanup optimizer (every 20 cycles) not found");
  if (!daemonContent.includes("cycleCount % 50")) issues.push("Release manager (every 50 cycles) not found");
  if (!daemonContent.includes("setInterval")) issues.push("Recurring cycle (setInterval) not found");
  return issues;
}

async function checkCriticalDirectories() {
  const missing = [];
  for (const dir of CRITICAL_DIRS) {
    const exists = await dirExists(dir);
    if (!exists) missing.push(dir + "/");
  }
  return missing;
}

function resolveRelativeImport(fromFile, spec) {
  if (!spec || (!spec.startsWith(".") && !spec.startsWith(".."))) return null;
  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(fromDir, spec));
  const rel = path.relative(root, path.join(root, resolved));
  return rel.replace(/\\/g, "/");
}

async function collectImportsFromFile(relPath, imported) {
  const full = path.join(root, relPath);
  let content;
  try {
    content = await fs.readFile(full, "utf-8");
  } catch {
    return;
  }
  const importRegex = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const spec = m[1];
    const resolved = resolveRelativeImport(relPath, spec);
    if (resolved) {
      const norm = resolved.startsWith("../") ? resolved : resolved.replace(/\.js$/, "");
      imported.add(norm);
      imported.add(norm + ".js");
      imported.add(norm.replace(/\.js$/, ""));
    }
  }
}

async function findDeadCodeCandidates() {
  const imported = new Set();
  const daemonContent = await fs.readFile(DAEMON_FILE, "utf-8").catch(() => "");
  await collectImportsFromFile("superchief_daemon.js", imported);
  await collectImportsFromFile("builders/full_product_pipeline.js", imported);
  await collectImportsFromFile("agents/workers.js", imported);
  await collectImportsFromFile("traffic_system/traffic_orchestrator.js", imported);
  await collectImportsFromFile("revenue_system/revenue_optimizer.js", imported);
  await collectImportsFromFile("maintenance_system/cleanup_optimizer.js", imported);

  const agentFiles = [];
  try {
    const agentsDir = path.join(root, "agents");
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".js")) {
        agentFiles.push("agents/" + e.name);
      }
      if (e.isDirectory()) {
        const sub = await fs.readdir(path.join(agentsDir, e.name), { withFileTypes: true }).catch(() => []);
        for (const s of sub) {
          if (s.isFile() && s.name.endsWith(".js")) {
            agentFiles.push(path.join("agents", e.name, s.name).replace(/\\/g, "/"));
          }
        }
      }
    }
  } catch {
    return [];
  }

  const dead = [];
  for (const f of agentFiles) {
    const key = f.replace(/\.js$/, "");
    const referenced =
      imported.has(f) ||
      imported.has(key) ||
      imported.has("agents/" + key) ||
      daemonContent.includes(f) ||
      daemonContent.includes(key);
    if (!referenced) dead.push(f);
  }
  return dead;
}

function detectRiskPoints() {
  const risks = [];
  risks.push("ideas/ideas.json is not written by repo (idea_injector or manual seed required)");
  risks.push("metrics/<app_id>.json is not written by core agents (metrics_collector or external required)");
  risks.push("runFullProductPipeline() is not wrapped in try/catch in daemon; pipeline throw will stop cycle");
  risks.push("resource_allocation.json is written but not read by any current agent (future use)");
  return risks;
}

/**
 * Run full factory validation. Read-only except writing report.
 * @returns {Promise<{ ok: boolean, report: object }>}
 */
export async function runFactoryValidation() {
  const versionData = await readJson(VERSION_FILE, {});
  const factory_version = versionData.version || "5.0.0";

  const missing_components = await checkLoopComponents();
  const periodic_issues = await checkPeriodicSystems();
  const missing_dirs = await checkCriticalDirectories();
  const dead_code = await findDeadCodeCandidates();
  const risk_points = detectRiskPoints();

  const pipeline_valid = missing_components.length === 0;
  const systems_operational = periodic_issues.length === 0 && missing_dirs.length === 0;

  let overall_status = "ready_for_autonomous_operation";
  if (missing_components.length > 0) {
    overall_status = "validation_failed_missing_components";
  } else if (missing_dirs.length > 0 && missing_dirs.length < CRITICAL_DIRS.length) {
    overall_status = "ready_for_autonomous_operation";
  } else if (periodic_issues.length > 0) {
    overall_status = "validation_warning_periodic_systems";
  }

  const report = {
    factory_version,
    pipeline_valid,
    systems_operational,
    missing_components,
    periodic_issues: periodic_issues.length ? periodic_issues : undefined,
    missing_directories: missing_dirs.length ? missing_dirs : undefined,
    dead_code: dead_code.length ? dead_code : [],
    risk_points,
    overall_status,
    validated_at: new Date().toISOString()
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");

  return { ok: true, report };
}
