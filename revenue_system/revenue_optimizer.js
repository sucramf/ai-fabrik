/**
 * REVENUE OPTIMIZER – Automatic monetization optimization per app.
 *
 * 1. Reads metrics/<app_id>.json, data/revenue_metrics.json, apps/<app_id>/pricing.json (if exists),
 *    portfolio/portfolio_status.json, resources/resource_allocation.json
 * 2. Detects revenue opportunities (low users + high traffic, many users + low revenue, profitable)
 * 3. Writes revenue_system/revenue_actions.json
 * 4. Applies each action via monetization_engine.applyRevenueAction (add/improve only; never remove pricing)
 * 5. Skips paused apps (allocation minimal)
 *
 * Safety: never remove existing pricing; only add or improve. Missing data handled gracefully.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { runMonetization, applyRevenueAction } from "../agents/monetization_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const REVENUE_DIR = path.join(root, "revenue_system");
const ACTIONS_FILE = path.join(root, "revenue_system", "revenue_actions.json");
const PORTFOLIO_FILE = path.join(root, "portfolio", "portfolio_status.json");
const ALLOCATION_FILE = path.join(root, "resources", "resource_allocation.json");
const REVENUE_METRICS_FILE = path.join(root, "data", "revenue_metrics.json");
const METRICS_DIR = path.join(root, "metrics");
const DATA_METRICS_DIR = path.join(root, "data", "metrics");
const APPS_DIR = path.join(root, "apps");

const PAUSED_ALLOCATION = "minimal";

const ACTIONS = [
  "add_freemium_tier",
  "adjust_pricing",
  "add_upsell",
  "add_paywall",
  "add_premium_feature",
  "add_subscription"
];

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
  const data = await readJson(REVENUE_METRICS_FILE, { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

async function readAppMetrics(appId) {
  for (const dir of [DATA_METRICS_DIR, METRICS_DIR]) {
    try {
      const raw = await fs.readFile(path.join(dir, `${appId}.json`), "utf-8");
      return JSON.parse(raw);
    } catch {
      continue;
    }
  }
  return {};
}

async function readAppPricing(appId) {
  try {
    const raw = await fs.readFile(path.join(APPS_DIR, appId, "pricing.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getProductName(appId) {
  try {
    const raw = await fs.readFile(path.join(APPS_DIR, appId, "spec.json"), "utf-8");
    const spec = JSON.parse(raw);
    return (spec.product_name || "").trim() || appId;
  } catch {
    return appId;
  }
}

/**
 * Detect revenue opportunities and return suggested action + priority.
 */
function detectOpportunity(appMetrics, revenueRecord, existingPricing) {
  const visitors = Number(revenueRecord?.visitors) || 0;
  const signups = Number(revenueRecord?.signups) || 0;
  const revenue = Number(revenueRecord?.revenue) || 0;
  const users = Number(appMetrics?.users) || visitors || 0;
  const conversionRate = Number(revenueRecord?.conversion_rate) || (visitors > 0 ? signups / visitors : 0);

  const hasPaidPlans = existingPricing?.plans?.some((p) => Number(p.price) > 0);
  const hasFreePlan = existingPricing?.plans?.some((p) => Number(p.price) === 0);

  if (revenue > 0 && hasPaidPlans) {
    return { action: "adjust_pricing", priority: "high" };
  }
  if (users >= 100 && revenue === 0 && hasPaidPlans) {
    return { action: "add_paywall", priority: "high" };
  }
  if (visitors >= 50 && signups < visitors * 0.05 && !hasFreePlan) {
    return { action: "add_freemium_tier", priority: "high" };
  }
  if (users >= 50 && revenue === 0) {
    return { action: "add_subscription", priority: "medium" };
  }
  if (hasPaidPlans && existingPricing?.plans?.length <= 2) {
    return { action: "add_premium_feature", priority: "medium" };
  }
  if (hasPaidPlans && revenue > 0) {
    return { action: "add_upsell", priority: "low" };
  }
  return null;
}

/**
 * Run revenue optimizer: select apps, detect opportunities, write revenue_actions.json, apply via monetization_engine.
 * @returns {Promise<{ ok: boolean, actions: number, applied: number }>}
 */
export async function runRevenueOptimizer() {
  const [portfolioProducts, allocationProducts, revenueProducts] = await Promise.all([
    readPortfolio(),
    readAllocation(),
    readRevenueMetrics()
  ]);

  const allocationByApp = new Map();
  for (const a of allocationProducts) {
    if (a.appId) allocationByApp.set(a.appId, (a.allocation || "").toLowerCase());
  }

  const revenueByProductName = new Map();
  for (const p of revenueProducts) {
    const name = (p.product_name || "").trim();
    if (name) revenueByProductName.set(name, p);
  }

  const actions = [];
  for (const p of portfolioProducts) {
    const appId = p.appId;
    if (!appId || !appId.startsWith("app_")) continue;
    if ((allocationByApp.get(appId) || "") === PAUSED_ALLOCATION) continue;

    const productName = await getProductName(appId);
    const revenueRecord = revenueByProductName.get(productName) || {};
    const appMetrics = await readAppMetrics(appId);
    const existingPricing = await readAppPricing(appId);

    const opportunity = detectOpportunity(appMetrics, revenueRecord, existingPricing);
    if (!opportunity || !ACTIONS.includes(opportunity.action)) continue;

    actions.push({
      app_id: appId,
      action: opportunity.action,
      priority: opportunity.priority
    });
  }

  actions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  const payload = {
    actions,
    updated: new Date().toISOString()
  };
  await fs.mkdir(REVENUE_DIR, { recursive: true });
  await fs.writeFile(ACTIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");

  let applied = 0;
  for (const a of actions) {
    const hasPricing = await readAppPricing(a.app_id);
    if (!hasPricing) {
      const result = await runMonetization(a.app_id).catch(() => ({ ok: false }));
      if (result.ok) applied += 1;
    } else {
      const result = await applyRevenueAction(a.app_id, a.action).catch(() => ({ ok: false }));
      if (result.ok) applied += 1;
    }
  }

  return { ok: true, actions: actions.length, applied };
}
