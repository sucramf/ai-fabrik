/**
 * SUPERCHIEF DAEMON – Kontinuerlig körning.
 *
 * Varje cykel:
 * 1. Läser kandidatidéer från ideas/ideas.json
 * 2. Trend Analyst (live_sources) → skriver ideas/approved_trend_ideas.json
 * 3. Full Product Pipeline: build + marknadsföring + betalning + QA → deploy
 *
 * Intervall: 7 minuter (5–10 min enligt spec).
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import { runInspectorPipeline } from "./agents/inspector_pipeline.js";
import { runFullProductPipeline } from "./builders/full_product_pipeline.js";
import { runEvolutionEngine } from "./agents/evolution_engine/product_evolution_engine.js";
import { runCodeModifierAgent } from "./agents/evolution_engine/code_modifier_agent.js";
import { collectUserFeedback } from "./agents/user_feedback_agent.js";
import { runDistribution } from "./agents/distribution_agent.js";
import { runTrendScanner } from "./agents/trend_scanner.js";
import { runPortfolioAnalysis } from "./agents/portfolio_brain.js";
import { runStrategicBrain } from "./agents/strategic_brain.js";
import { runResourceAllocator } from "./agents/resource_allocator.js";
import { runGrowthExperiments } from "./agents/growth_experiment_engine.js";
import { runGrowthExecution } from "./agents/growth_execution_agent.js";
import { runIdeaInjector } from "./agents/idea_injector.js";
import { runUpdateAllMetrics } from "./agents/metrics_collector.js";
import { runAutoPublisher } from "./agents/auto_publisher.js";
import { runFactoryExpander } from "./agents/factory_expander.js";
import { runSystemStabilizer } from "./agents/system_stabilizer.js";
import { runCodebaseCleaner } from "./agents/codebase_cleaner.js";
import { runAllTests } from "./agents/test_runner.js";
import { runAiChaosTester } from "./test_factory/ai_chaos_tester.js";
import { runSystemRepairAgent } from "./agents/system_repair_agent.js";
import { runFactoryMonitor } from "./factory_monitor/factory_monitor.js";
import { runTrafficOrchestrator } from "./traffic_system/traffic_orchestrator.js";
import { runRevenueOptimizer } from "./revenue_system/revenue_optimizer.js";
import { runCleanupOptimizer } from "./maintenance_system/cleanup_optimizer.js";
import { runReleaseManager } from "./factory_release/release_manager.js";

const __filename = fileURLToPath(import.meta.url);
const root = process.cwd();
const IDEAS_SOURCE = path.join(root, "ideas", "ideas.json");
const REPORT_LOG = path.join(root, "superchief_report.log");
const DAEMON_LOG = path.join(root, "logs", "daemon.log");
const CYCLE_INTERVAL_MS = 7 * 60 * 1000;
const APPS_DIR = path.join(root, "apps");
let cycleCount = 0;

/** Structured log: writes to logs/daemon.log and console. Level: info | warn | error */
async function daemonLog(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data !== null && data !== undefined ? { level, message, ...(typeof data === "object" ? data : { value: data }) } : { level, message };
  const line = ts + " [" + level.toUpperCase() + "] " + (typeof payload === "object" && payload.message ? payload.message + (Object.keys(payload).length > 2 ? " " + JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))) : "") : JSON.stringify(payload));
  console.log(line);
  try {
    await fs.mkdir(path.dirname(DAEMON_LOG), { recursive: true });
    await fs.appendFile(DAEMON_LOG, line + "\n", "utf-8");
  } catch {
    // ignore
  }
}

async function loadEnv() {
  const p = path.join(root, ".env");
  try {
    const c = await fs.readFile(p, "utf-8");
    for (const line of c.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // ignore
  }
}

async function readCandidates() {
  try {
    const raw = await fs.readFile(IDEAS_SOURCE, "utf-8");
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((i) => {
      if (typeof i === "string") return i.trim();
      if (i && typeof i === "object") return String(i.name || i.idea_title || i.idé || i.title || "").trim();
      return "";
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function runCycle() {
  cycleCount += 1;
  try {
    await loadEnv();
    await daemonLog("info", "DAEMON CYCLE " + cycleCount + " started");

    const stabilizerResult = await runSystemStabilizer().catch((e) => ({ ok: false, dirsCreated: 0, filesCreated: 0, filesRepaired: 0, agentsMissing: 0, missingAgents: [], corruptedApps: 0 }));
    await daemonLog("info", "System stabilizer done", { dirsCreated: stabilizerResult.dirsCreated ?? 0, filesCreated: stabilizerResult.filesCreated ?? 0, repaired: stabilizerResult.filesRepaired ?? 0, corruptedApps: stabilizerResult.corruptedApps ?? 0 });
    if ((stabilizerResult.missingAgents?.length ?? 0) > 0) {
      await daemonLog("warn", "Missing agents (will retry next cycle)", { missingAgents: stabilizerResult.missingAgents });
    }

    if (cycleCount % 10 === 0) {
      const cleanerResult = await runCodebaseCleaner().catch((e) => ({ ok: false, unusedMoved: 0, duplicatesDetected: 0 }));
      console.log("[DAEMON] Codebase cleaner done (every 10 cycles). Unused moved:", cleanerResult.unusedMoved ?? 0, "| Duplicates:", cleanerResult.duplicatesDetected ?? 0);
    }

      if (cycleCount % 20 === 0) {
      const cleanupResult = await runCleanupOptimizer().catch((e) => ({ ok: false, report: { timestamp: null, actions: [] } }));
      const actionCount = cleanupResult.report?.actions?.length ?? 0;
      console.log("[DAEMON] Cleanup optimizer done (every 20 cycles). Actions:", actionCount);
    }

    const trendResult = await runTrendScanner().catch((e) => ({ ok: false, added: 0, total: 0 }));
    console.log("[DAEMON] Trend scanner done. Added:", trendResult.added ?? 0, "| Total opportunities:", trendResult.total ?? 0);

    const injectResult = await runIdeaInjector().catch((e) => ({ ok: false, injected: 0, total: 0 }));
    console.log("[DAEMON] Idea injector done. Injected:", injectResult.injected ?? 0, "| Total ideas:", injectResult.total ?? 0);

    const candidates = await readCandidates();
    if (!candidates.length) {
      await daemonLog("info", "[DAEMON] No ideas in ideas/ideas.json. Skipping build.");
      return;
    }

    const inspectorResult = await runInspectorPipeline(candidates).catch((e) => {
      daemonLog("error", "Inspector pipeline failed", { error: e.message }).catch(() => {});
      return { approved: [], rejected: [], checked: candidates.length, approvedCount: 0, rejectedCount: candidates.length };
    });
    await daemonLog("info", "[DAEMON] Inspector pipeline done. Checked: " + inspectorResult.checked + " | Approved: " + inspectorResult.approvedCount + " | Rejected: " + inspectorResult.rejectedCount);
    if (inspectorResult.approvedCount === 0) {
      await daemonLog("warn", "[DAEMON] All ideas rejected by inspectors; build phase skipped this cycle.");
    }

    let result;
    try {
      result = await runFullProductPipeline();
    } catch (e) {
      await daemonLog("error", "runFullProductPipeline failed", { error: e.message, stack: e.stack });
      result = { ok: false, createdIds: [], passedIds: [], failedReports: [], filesCreated: [], allFilePaths: [] };
    }
    await daemonLog("info", "[DAEMON] Full product pipeline done. PASS: " + (result.passedIds?.length ?? 0));

      const testResult = await runAllTests().catch((e) => ({ ok: false, tests_run: 0, passed: 0, failed: 0 }));
    console.log("[DAEMON] Test runner done. Tests:", testResult.tests_run ?? 0, "| Passed:", testResult.passed ?? 0, "| Failed:", testResult.failed ?? 0);

      const publisherResult = await runAutoPublisher().catch((e) => ({ ok: false, queued: 0, apps: 0 }));
    console.log("[DAEMON] Auto publisher done. Queued:", publisherResult.queued ?? 0, "| Apps:", publisherResult.apps ?? 0);

    let evolutionResult;
    try {
      evolutionResult = await runEvolutionEngine();
    } catch (e) {
      await daemonLog("warn", "runEvolutionEngine failed", { error: e.message });
      evolutionResult = { processed: 0 };
    }
    await daemonLog("info", "[DAEMON] Evolution engine done. Processed: " + (evolutionResult.processed ?? 0));

      const codeModifierResult = await runCodeModifierAgent().catch((e) => ({ ok: false, processed: 0, applied: 0, errors: 1 }));
    console.log("[DAEMON] Code modifier agent done. Processed:", codeModifierResult.processed ?? 0, "| Applied:", codeModifierResult.applied ?? 0);

      const expanderResult = await runFactoryExpander().catch((e) => ({ ok: false, winners: 0, factoriesCreated: 0 }));
    console.log("[DAEMON] Factory expander done. Winners:", expanderResult.winners ?? 0, "| New factories:", expanderResult.factoriesCreated ?? 0);

      const metricsUpdateResult = await runUpdateAllMetrics().catch((e) => ({ ok: false, updated: 0 }));
    console.log("[DAEMON] Metrics collector done. Updated:", metricsUpdateResult.updated ?? 0);

      const portfolioResult = await runPortfolioAnalysis().catch((e) => ({ ok: false, products: 0 }));
    console.log("[DAEMON] Portfolio brain done. Products analyzed:", portfolioResult.products ?? 0);

    const strategyResult = await runStrategicBrain().catch((e) => ({ ok: false, products: 0 }));
  console.log("[DAEMON] Strategic brain done. Products in strategy:", strategyResult.products ?? 0);

    const allocatorResult = await runResourceAllocator().catch((e) => ({ ok: false, products: 0 }));
    console.log("[DAEMON] Resource allocator done. Products allocated:", allocatorResult.products ?? 0);

      const growthResult = await runGrowthExperiments().catch((e) => ({ ok: false, added: 0, total: 0 }));
    console.log("[DAEMON] Growth experiments done. Added:", growthResult.added ?? 0, "| Total:", growthResult.total ?? 0);

    const executionResult = await runGrowthExecution().catch((e) => ({ ok: false, executed: 0 }));
  console.log("[DAEMON] Growth execution done. Assets prepared:", executionResult.executed ?? 0);

    const trafficResult = await runTrafficOrchestrator().catch((e) => ({ ok: false, targets: 0, actionsRun: 0 }));
    console.log("[DAEMON] Traffic orchestrator done. Targets:", trafficResult.targets ?? 0, "| Actions run:", trafficResult.actionsRun ?? 0);

    const revenueResult = await runRevenueOptimizer().catch((e) => ({ ok: false, actions: 0, applied: 0 }));
    console.log("[DAEMON] Revenue optimizer done. Actions:", revenueResult.actions ?? 0, "| Applied:", revenueResult.applied ?? 0);

    try {
      const appDirs = await fs.readdir(APPS_DIR).catch(() => []);
      for (const name of appDirs) {
        if (!name.startsWith("app_")) continue;
        const full = path.join(APPS_DIR, name);
        const stat = await fs.stat(full).catch(() => null);
        if (stat && stat.isDirectory()) {
          await collectUserFeedback(name);
          await runDistribution(name);
        }
      }
    } catch (e) {
      console.warn("[DAEMON] User feedback collection skipped:", e.message);
    }

    if (cycleCount % 15 === 0) {
      const chaosResult = await runAiChaosTester().catch((e) => ({ ok: false, scenario: null, recovered: false, error: e.message }));
      console.log("[DAEMON] AI chaos tester done. Scenario:", chaosResult.scenario ?? "none", "| Recovered:", chaosResult.recovered ?? false);
      const repairResult = await runSystemRepairAgent().catch((e) => ({ ok: false, repairs_triggered: 0, repairs_succeeded: 0 }));
      console.log("[DAEMON] System repair agent done. Triggered:", repairResult.repairs_triggered ?? 0, "| Succeeded:", repairResult.repairs_succeeded ?? 0);
    }

    const monitorResult = await runFactoryMonitor({ pipelineResult: result }).catch((e) => ({ ok: false, timestamp: null }));
    console.log("[DAEMON] Factory monitor done. Health report:", monitorResult.ok ? monitorResult.timestamp : "skipped");

    if (cycleCount % 50 === 0) {
      const releaseResult = await runReleaseManager().catch((e) => ({ ok: false, stable: false, version: null, released: false }));
      await daemonLog("info", "Release manager done (every 50 cycles)", { stable: releaseResult.stable ?? false, version: releaseResult.version ?? "—", released: releaseResult.released ?? false });
    }

  } catch (cycleError) {
    await daemonLog("error", "Daemon cycle failed", { cycle: cycleCount, error: cycleError.message, stack: cycleError.stack });
  }
}

async function start() {
  await runCycle();
  setInterval(() => runCycle().catch((e) => console.error("[DAEMON] Cycle error:", e)), CYCLE_INTERVAL_MS);
}

start().catch((e) => {
  console.error("[DAEMON] Start failed:", e);
  process.exit(1);
});
