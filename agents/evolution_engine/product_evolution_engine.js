/**
 * PRODUCT EVOLUTION ENGINE – Allocation-aware product improvement plans.
 *
 * INPUTS (all optional; missing files must not crash the system):
 *   - metrics/<app_id>.json          – usage, engagement, performance (revenue, users, growth; default 0 if missing)
 *   - resources/resource_allocation.json – build_budget, growth_budget, evolution_priority per app
 *   - portfolio/product_status.json  – canonical allocation (grow/maintain/experiment/pause)
 *   - portfolio/portfolio_status.json – fallback when product_status.json absent (winner→grow, etc.)
 *   - feedback/<app_id>.json         – bug reports, feature requests, user sentiment
 *   - data/evolution_decisions.json – previous cycle state (cycles_no_activity) for DEAD detection
 *
 * ALLOCATION-AWARE STATE (mutate / scale / deprecate):
 *   - WINNER:   revenue > $100 OR growth > 10% → high mutation, bigger feature experiments
 *   - POTENTIAL: users > 100 but revenue < $100 → moderate mutation
 *   - EXPERIMENT: users < 100 and revenue = 0 → small mutations only
 *   - DEAD:     no growth and no users after several cycles → mark for deprecation
 *
 * OUTPUT:
 *   - apps/<app_id>/evolution_plan.json – improvement proposals only (never auto-modifies code).
 *   - data/evolution_decisions.json – per-app state, mutation_level, cycles_no_activity, budgets.
 *
 * RULE: Evolution plans are proposals only. They must NEVER modify application code automatically.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const METRICS_DIR = path.join(root, "metrics");
const DATA_METRICS_DIR = path.join(root, "data", "metrics");
const PORTFOLIO_DIR = path.join(root, "portfolio");
const PRODUCT_STATUS_FILE = path.join(root, "portfolio", "product_status.json");
const PORTFOLIO_STATUS_FILE = path.join(root, "portfolio", "portfolio_status.json");
const FEEDBACK_DIR = path.join(root, "feedback");
const DATA_DIR = path.join(root, "data");
const RESOURCE_ALLOCATION_FILE = path.join(root, "resources", "resource_allocation.json");
const EVOLUTION_DECISIONS_FILE = path.join(root, "data", "evolution_decisions.json");

/** Cycles with no users and no growth before marking DEAD. */
const CYCLES_FOR_DEAD = 5;
/** WINNER: revenue threshold (USD). */
const WINNER_REVENUE_THRESHOLD = 100;
/** WINNER: growth threshold (percentage 0–100). */
const WINNER_GROWTH_THRESHOLD = 10;
/** POTENTIAL: minimum users. */
const POTENTIAL_USERS_THRESHOLD = 100;

/** Allocation statuses that evolution respects. */
const ALLOCATION_STATUSES = ["grow", "maintain", "experiment", "pause"];

/** Map legacy portfolio_status (portfolio_brain) to allocation status for evolution. */
const LEGACY_STATUS_TO_ALLOCATION = {
  winner: "grow",
  promising: "maintain",
  experiment: "experiment",
  weak: "pause"
};

/**
 * Load product allocation status: prefer product_status.json, else derive from portfolio_status.json.
 * @returns {Promise<Map<string, string>>} appId -> "grow" | "maintain" | "experiment" | "pause"
 */
async function loadProductAllocation() {
  const map = new Map();

  // 1. Try portfolio/product_status.json (canonical allocation)
  try {
    const raw = await fs.readFile(PRODUCT_STATUS_FILE, "utf-8");
    const data = JSON.parse(raw);
    const products = data?.products;
    if (Array.isArray(products)) {
      for (const p of products) {
        const appId = p.appId || p.app_id;
        const status = (p.status || "").toLowerCase();
        if (appId && ALLOCATION_STATUSES.includes(status)) {
          map.set(appId, status);
        }
      }
      return map;
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[evolution_engine] product_status.json:", e.message);
  }

  // 2. Fallback: portfolio/portfolio_status.json (legacy status → allocation)
  try {
    const raw = await fs.readFile(PORTFOLIO_STATUS_FILE, "utf-8");
    const data = JSON.parse(raw);
    const products = data?.products;
    if (Array.isArray(products)) {
      for (const p of products) {
        const appId = p.appId || p.app_id;
        const legacy = (p.status || "weak").toLowerCase();
        const status = LEGACY_STATUS_TO_ALLOCATION[legacy] ?? "pause";
        if (appId) map.set(appId, status);
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[evolution_engine] portfolio_status.json:", e.message);
  }

  return map;
}

/**
 * Load resource allocation (allocation level + budgets) per app.
 * allocation: high | medium | low | minimal — used to drive evolution plan intensity.
 * @returns {Promise<Map<string, { allocation: string, build_budget: number, growth_budget: number, evolution_priority: string }>>}
 */
async function loadResourceAllocation() {
  const map = new Map();
  try {
    const raw = await fs.readFile(RESOURCE_ALLOCATION_FILE, "utf-8");
    const data = JSON.parse(raw);
    const products = data?.products;
    if (Array.isArray(products)) {
      for (const p of products) {
        const appId = p.appId || p.app_id;
        if (!appId) continue;
        const allocation = String(p.allocation || "medium").toLowerCase();
        map.set(appId, {
          allocation: allocation === "high" || allocation === "low" || allocation === "minimal" ? allocation : "medium",
          build_budget: Number(p.build_budget) || 0,
          growth_budget: Number(p.growth_budget) || 0,
          evolution_priority: String(p.evolution_priority || "none").toLowerCase()
        });
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[evolution_engine] resource_allocation.json:", e.message);
  }
  return map;
}

/**
 * Resolve effective allocation status for plan generation using resource allocation level.
 * high → aggressive (grow-like); medium → normal (portfolio status); low → minimal; minimal → pause.
 */
function effectiveAllocationFromResource(allocationLevel, portfolioAllocationStatus) {
  if (allocationLevel === "minimal") return "pause";
  if (allocationLevel === "low") return "minimal";
  if (allocationLevel === "high") return "aggressive";
  return portfolioAllocationStatus;
}

/**
 * Normalize metrics: if metrics/<app_id>.json missing, assume revenue=0, users=0, growth=0.
 * @param {Object} raw - Raw metrics from loadMetrics
 * @returns {{ revenue: number, users: number, growth: number }}
 */
function normalizeMetrics(raw) {
  const revenue = Number(raw?.revenue);
  const users = Number(raw?.users);
  const growth = Number(raw?.growth);
  return {
    revenue: Number.isFinite(revenue) ? revenue : 0,
    users: Number.isFinite(users) ? users : 0,
    growth: Number.isFinite(growth) ? growth : 0
  };
}

/**
 * Load previous evolution decisions (for cycles_no_activity and state history).
 * @returns {Promise<Object>} { appId: { state, mutation_level, cycles_no_activity?, ... } }
 */
async function loadPreviousEvolutionDecisions() {
  try {
    const raw = await fs.readFile(EVOLUTION_DECISIONS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data?.decisions && typeof data.decisions === "object" ? data.decisions : {};
  } catch (e) {
    if (e.code !== "ENOENT") return {};
    return {};
  }
}

/**
 * Compute allocation-aware state: WINNER | POTENTIAL | EXPERIMENT | DEAD.
 * @param {{ revenue: number, users: number, growth: number }} m - Normalized metrics
 * @param {Object} previous - Previous decision for this app (cycles_no_activity)
 * @returns {"WINNER"|"POTENTIAL"|"EXPERIMENT"|"DEAD"}
 */
function computeState(m, previous) {
  const cyclesNoActivity = Number(previous?.cycles_no_activity) || 0;

  if (m.revenue > WINNER_REVENUE_THRESHOLD || m.growth > WINNER_GROWTH_THRESHOLD) {
    return "WINNER";
  }
  if (m.users > POTENTIAL_USERS_THRESHOLD && m.revenue < WINNER_REVENUE_THRESHOLD) {
    return "POTENTIAL";
  }
  if (m.users === 0 && m.growth === 0 && m.revenue === 0) {
    if (cyclesNoActivity >= CYCLES_FOR_DEAD) return "DEAD";
  }
  if (m.users < POTENTIAL_USERS_THRESHOLD && m.revenue === 0) {
    return "EXPERIMENT";
  }

  return "EXPERIMENT";
}

/**
 * Mutation level from state: WINNER → high, POTENTIAL → medium, EXPERIMENT → low, DEAD → deprecate.
 * @param {string} state
 * @returns {"high"|"medium"|"low"|"deprecate"}
 */
function getMutationLevel(state) {
  switch (state) {
    case "WINNER": return "high";
    case "POTENTIAL": return "medium";
    case "EXPERIMENT": return "low";
    case "DEAD": return "deprecate";
    default: return "low";
  }
}

/**
 * Update cycles_no_activity: increment if no users and no growth, else 0.
 */
function nextCyclesNoActivity(m, previous) {
  const had = Number(previous?.cycles_no_activity) || 0;
  if (m.users === 0 && m.growth === 0 && m.revenue === 0) {
    return had + 1;
  }
  return 0;
}

/**
 * Load metrics for an app. Tries data/metrics/<app_id>.json then metrics/<app_id>.json. Returns {} if missing or invalid.
 */
async function loadMetrics(appId) {
  for (const dir of [DATA_METRICS_DIR, METRICS_DIR]) {
    const file = path.join(dir, `${appId}.json`);
    try {
      const raw = await fs.readFile(file, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== "ENOENT") console.warn("[evolution_engine] metrics", file, e.message);
    }
  }
  return {};
}

/**
 * Load feedback for an app. Returns [] if missing or invalid.
 */
async function loadFeedback(appId) {
  const file = path.join(FEEDBACK_DIR, `${appId}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : data?.entries ? data.entries : [];
  } catch (e) {
    if (e.code !== "ENOENT") return [];
    console.warn("[evolution_engine] feedback", file, e.message);
    return [];
  }
}

/**
 * Base suggestions from metrics (used across statuses where relevant).
 */
function suggestionsFromMetrics(metrics) {
  const out = [];
  const bounceRate = Number(metrics?.bounce_rate);
  const sessionTime = Number(metrics?.session_time);
  const users = Number(metrics?.users);

  if (Number.isFinite(bounceRate) && bounceRate > 0.6) {
    out.push("Improve onboarding UX to reduce bounce rate (e.g. clearer first step, progress indicator, or welcome flow).");
  }
  if (Number.isFinite(sessionTime) && sessionTime < 30) {
    out.push("Add engagement features to increase session time (e.g. save state, related actions, or guided workflows).");
  }
  if (Number.isFinite(users) && users < 100) {
    out.push("Consider sharing or virality mechanics to grow users (e.g. share result, invite link, or referral).");
  }
  return out;
}

/**
 * Extract improvement hints from feedback entries (bugs, feature requests).
 */
function suggestionsFromFeedback(feedback) {
  const out = [];
  if (!Array.isArray(feedback) || feedback.length === 0) return out;
  const bugs = feedback.filter((e) => e.type === "bug" || (e.type && e.type.toLowerCase().includes("bug")));
  const features = feedback.filter((e) => e.type === "feature" || (e.type && e.type.toLowerCase().includes("feature")));
  if (bugs.length > 0) {
    out.push(`Address ${bugs.length} bug report(s) from user feedback.`);
  }
  if (features.length > 0) {
    out.push(`Consider feature requests from feedback (${features.length} item(s)).`);
  }
  return out;
}

/**
 * Generate evolution plan content by allocation status.
 * Returns { suggestions, reasoning }.
 */
function generatePlanByStatus(allocationStatus, metrics, feedback) {
  const fromMetrics = suggestionsFromMetrics(metrics);
  const fromFeedback = suggestionsFromFeedback(feedback);
  const reasoning = [];

  switch (allocationStatus) {
    case "grow": {
      reasoning.push("Product is allocated GROW. Plan focuses on major improvements to maximize growth and revenue.");
      const suggestions = [
        ...fromMetrics,
        ...fromFeedback,
        "Prioritize major feature improvements that increase retention and conversion.",
        "Invest in UX improvements (onboarding, core flows, clarity).",
        "Consider performance upgrades (load time, responsiveness).",
        "Evaluate monetization optimization (pricing, paywall, upsells)."
      ];
      return { suggestions: [...new Set(suggestions)], reasoning };
    }

    case "maintain": {
      reasoning.push("Product is allocated MAINTAIN. Plan focuses on stability and small optimizations.");
      const suggestions = [
        ...fromFeedback,
        "Focus on bug fixes and stability improvements.",
        "Apply small UX improvements only where low-risk.",
        "Avoid large feature changes; prioritize reliability."
      ];
      if (fromMetrics.length > 0) {
        suggestions.push("Optionally address metrics-driven improvements with minimal scope.");
      }
      return { suggestions: [...new Set(suggestions)], reasoning };
    }

    case "experiment": {
      reasoning.push("Product is allocated EXPERIMENT. Plan encourages bold experiments and alternative directions.");
      const suggestions = [
        ...fromMetrics,
        ...fromFeedback,
        "Try bold feature experiments that differentiate the product.",
        "Explore alternative product directions or new use cases.",
        "Consider unusual growth features (viral loops, partnerships, new channels)."
      ];
      return { suggestions: [...new Set(suggestions)], reasoning };
    }

    case "minimal": {
      reasoning.push("Resource allocation is LOW. Plan focuses on minimal, low-risk improvements only.");
      const suggestions = [
        ...fromFeedback.filter((_, i) => i < 1),
        "Consider one small stability or copy fix; avoid feature changes."
      ];
      return { suggestions: [...new Set(suggestions)].slice(0, 2), reasoning };
    }

    case "aggressive": {
      reasoning.push("Resource allocation is HIGH. Plan is aggressive: major features, UX, and monetization.");
      const suggestions = [
        ...fromMetrics,
        ...fromFeedback,
        "Prioritize major feature improvements that increase retention and conversion.",
        "Invest in UX (onboarding, core flows, clarity).",
        "Consider performance and monetization optimization."
      ];
      return { suggestions: [...new Set(suggestions)], reasoning };
    }

    case "pause":
    default: {
      return {
        suggestions: [],
        reasoning: ["Product is allocated PAUSE. No evolution plan generated; product is not scheduled for changes."]
      };
    }
  }
}

/**
 * Run the evolution engine: for each app, resolve allocation, load metrics and feedback,
 * compute allocation-aware state (WINNER/POTENTIAL/EXPERIMENT/DEAD), write evolution_plan.json
 * and data/evolution_decisions.json.
 */
export async function runEvolutionEngine() {
  await fs.mkdir(METRICS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  let appDirs = [];
  try {
    appDirs = await fs.readdir(APPS_DIR);
  } catch (e) {
    if (e.code === "ENOENT") {
      return { ok: true, processed: 0, message: "apps/ not found" };
    }
    throw e;
  }

  const appIds = [];
  for (const name of appDirs) {
    if (!name.startsWith("app_")) continue;
    const full = path.join(APPS_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && stat.isDirectory()) appIds.push(name);
  }

  const allocationByApp = await loadProductAllocation();
  const resourceAllocation = await loadResourceAllocation();
  const previousDecisions = await loadPreviousEvolutionDecisions();
  const decisions = {};
  let processed = 0;

  for (const appId of appIds) {
    const rawMetrics = await loadMetrics(appId);
    const m = normalizeMetrics(rawMetrics);
    const previous = previousDecisions[appId] || {};
    const state = computeState(m, previous);
    const mutation_level = getMutationLevel(state);
    const cycles_no_activity = nextCyclesNoActivity(m, previous);

    const resource = resourceAllocation.get(appId) || {};
    decisions[appId] = {
      state,
      mutation_level,
      cycles_no_activity,
      build_budget: resource.build_budget,
      growth_budget: resource.growth_budget,
      evolution_priority: resource.evolution_priority,
      revenue: m.revenue,
      users: m.users,
      growth: m.growth,
      updated_at: new Date().toISOString()
    };

    const portfolioAllocationStatus = allocationByApp.get(appId) ?? "maintain";
    const allocationLevel = resourceAllocation.get(appId)?.allocation ?? "medium";
    const allocationStatus = effectiveAllocationFromResource(allocationLevel, portfolioAllocationStatus);
    const metrics = rawMetrics;
    const feedback = await loadFeedback(appId);

    const effectivePause = allocationStatus === "pause" || state === "DEAD";

    if (effectivePause) {
      const appDir = path.join(APPS_DIR, appId);
      await fs.mkdir(appDir, { recursive: true });
      const reasoning = state === "DEAD"
        ? ["Product is marked DEAD (no growth and no users after several cycles). Mark for deprecation; no evolution."]
        : ["Product is allocated PAUSE. No evolution; plan is intentionally empty."];
      const plan = {
        appId,
        allocation_status: "pause",
        evolution_state: state,
        mutation_level,
        suggestions: state === "DEAD" ? ["Mark for deprecation; consider archiving or sunsetting."] : [],
        reasoning,
        generated_at: new Date().toISOString(),
        metrics_used: Object.keys(metrics).length > 0,
        feedback_used: feedback.length > 0,
        note: "Evolution plans are proposals only. They never modify code automatically."
      };
      await fs.writeFile(path.join(appDir, "evolution_plan.json"), JSON.stringify(plan, null, 2), "utf-8");
      processed++;
      continue;
    }

    const { suggestions, reasoning } = generatePlanByStatus(allocationStatus, metrics, feedback);
    const plan = {
      appId,
      allocation_status: allocationStatus,
      evolution_state: state,
      mutation_level,
      reasoning,
      suggestions,
      generated_at: new Date().toISOString(),
      metrics_used: Object.keys(metrics).length > 0,
      feedback_used: feedback.length > 0,
      note: "Evolution plans are proposals only. They never modify code automatically."
    };

    const appDir = path.join(APPS_DIR, appId);
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(appDir, "evolution_plan.json"), JSON.stringify(plan, null, 2), "utf-8");
    processed++;
  }

  const decisionsPayload = {
    decisions,
    updated: new Date().toISOString()
  };
  await fs.writeFile(EVOLUTION_DECISIONS_FILE, JSON.stringify(decisionsPayload, null, 2), "utf-8");

  return { ok: true, processed, appIds: appIds.length };
}
