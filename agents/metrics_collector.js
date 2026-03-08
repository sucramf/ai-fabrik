/**
 * METRICS COLLECTOR – Automatic metrics collection for every deployed app.
 *
 * 1. Injects metrics.js into each app (after monetization in pipeline):
 *    - Count page views, unique users (localStorage id), conversions (subscribe clicks).
 *    - Data can be sent to a backend; file is updated by runUpdateAllMetrics each daemon cycle.
 *
 * 2. Each daemon cycle: runUpdateAllMetrics() ensures data/metrics/<app_id>.json exists
 *    with { app_id, users, pageviews, conversions, revenue, growth, updated_at }.
 *
 * Logs: logs/metrics.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const DATA_METRICS_DIR = path.join(root, "data", "metrics");
const METRICS_DIR = path.join(root, "metrics");
const REVENUE_METRICS_FILE = path.join(root, "data", "revenue_metrics.json");
const LOGS_DIR = path.join(root, "logs");
const METRICS_LOG = path.join(root, "logs", "metrics.log");

const METRICS_SCRIPT_TAG = '<script src="metrics.js"></script>';

async function logMetrics(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(METRICS_LOG, line, "utf-8").catch(() => {});
}

/**
 * Client-side metrics.js: count pageviews, unique users (localStorage), conversions (subscribe clicks).
 * Uses localStorage; can POST to window.AI_FABRIK_METRICS_URL or /report-metrics if available.
 */
function buildMetricsJs(appId) {
  const appIdJson = JSON.stringify(appId || "");
  return `(function() {
  var APP_ID = ${appIdJson};
  var KEY_PREFIX = 'ai_fabrik_metrics_' + (APP_ID || 'app') + '_';
  var KEY_USER_ID = KEY_PREFIX + 'userId';
  var KEY_PAGEVIEWS = KEY_PREFIX + 'pageviews';
  var KEY_CONVERSIONS = KEY_PREFIX + 'conversions';

  function getOrCreateUserId() {
    try {
      var id = localStorage.getItem(KEY_USER_ID);
      if (!id) {
        id = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(KEY_USER_ID, id);
      }
      return id;
    } catch (e) { return 'anon'; }
  }

  function getNum(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? def : (parseInt(v, 10) || def);
    } catch (e) { return def; }
  }
  function setNum(key, n) {
    try { localStorage.setItem(key, String(n)); } catch (e) {}
  }

  function incPageviews() {
    var n = getNum(KEY_PAGEVIEWS, 0);
    setNum(KEY_PAGEVIEWS, n + 1);
    return n + 1;
  }
  function incConversions() {
    var n = getNum(KEY_CONVERSIONS, 0);
    setNum(KEY_CONVERSIONS, n + 1);
    return n + 1;
  }

  getOrCreateUserId();
  incPageviews();

  document.addEventListener('click', function(e) {
    var t = e.target;
    var link = t.closest && t.closest('a');
    var href = (link && link.getAttribute('href')) || (t.getAttribute && t.getAttribute('href')) || '';
    var isSubscribe = href.indexOf('subscribe') !== -1 || (t.id && t.id === 'stripeBtn') || (t.className && String(t.className).indexOf('subscribe') !== -1);
    if (isSubscribe) incConversions();
  });

  function sendBeacon() {
    var url = typeof window.AI_FABRIK_METRICS_URL === 'string' ? window.AI_FABRIK_METRICS_URL : '/report-metrics';
    var payload = {
      app_id: APP_ID,
      users: 1,
      pageviews: getNum(KEY_PAGEVIEWS, 0),
      conversions: getNum(KEY_CONVERSIONS, 0)
    };
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function() {});
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendBeacon);
  else sendBeacon();
})();
`;
}

/**
 * Inject <script src="metrics.js"></script> before </body> if not already present.
 */
function injectScriptIntoHtml(html, scriptTag) {
  if (!html || typeof html !== "string") return html;
  if (html.includes("metrics.js")) return html;
  if (!html.includes("</body>")) return html + "\n" + scriptTag;
  return html.replace(/\s*<\/body\s*>/i, "\n  " + scriptTag + "\n</body>");
}

/**
 * Inject metrics.js into an app and add script tag to app.html/index.html.
 * Call after monetization_engine in pipeline.
 * @param {string} appId
 * @returns {Promise<{ ok: boolean, files: string[] }>}
 */
export async function injectMetrics(appId) {
  const safeId = (appId || "").toString().trim();
  if (!safeId || !safeId.startsWith("app_")) {
    await logMetrics("Skip metrics inject: invalid appId " + appId);
    return { ok: false, files: [] };
  }

  const appDir = path.join(APPS_DIR, safeId);
  const deployDir = path.join(DEPLOY_DIR, safeId);
  const files = [];

  try {
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(deployDir, { recursive: true });
  } catch (e) {
    await logMetrics("Metrics inject failed " + safeId + ": " + e.message);
    return { ok: false, files: [] };
  }

  const metricsJs = buildMetricsJs(safeId);
  for (const dir of [appDir, deployDir]) {
    const jsPath = path.join(dir, "metrics.js");
    await fs.writeFile(jsPath, metricsJs, "utf-8");
    files.push(path.relative(root, jsPath));

    for (const name of ["app.html", "index.html"]) {
      const htmlPath = path.join(dir, name);
          let html;
          try {
            html = await fs.readFile(htmlPath, "utf-8");
          } catch {
            continue;
          }
          const updated = injectScriptIntoHtml(html, METRICS_SCRIPT_TAG);
          if (updated !== html) {
            await fs.writeFile(htmlPath, updated, "utf-8");
            files.push(path.relative(root, htmlPath));
          }
        }
  }

  await logMetrics("Metrics script injected into " + safeId);
  return { ok: true, files };
}

/**
 * Default metrics payload for one app.
 */
function defaultMetricsPayload(appId) {
  return {
    app_id: appId,
    users: 0,
    pageviews: 0,
    conversions: 0,
    revenue: 0,
    growth: 0,
    updated_at: new Date().toISOString()
  };
}

/**
 * Update data/metrics/<app_id>.json for one app. Merge with existing or create new.
 * @param {string} appId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function updateMetricsForApp(appId) {
  const safeId = (appId || "").toString().trim();
  if (!safeId || !safeId.startsWith("app_")) return { ok: false };

  await fs.mkdir(DATA_METRICS_DIR, { recursive: true });
  const filePath = path.join(DATA_METRICS_DIR, `${safeId}.json`);

  let current = defaultMetricsPayload(safeId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    current = {
      app_id: parsed.app_id || safeId,
      users: Number(parsed.users) || 0,
      pageviews: Number(parsed.pageviews) || 0,
      conversions: Number(parsed.conversions) || 0,
      revenue: Number(parsed.revenue) || 0,
      growth: Number(parsed.growth) || 0,
      updated_at: new Date().toISOString()
    };
  } catch (e) {
    if (e.code !== "ENOENT") {
      await logMetrics("Metrics read error " + safeId + ": " + e.message);
    }
  }

  await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf-8");
  await logMetrics("Metrics updated for " + safeId);
  return { ok: true };
}

/**
 * Load revenue_metrics.json (source of truth). Returns [] if missing or invalid.
 * @returns {Promise<Array<{ product_name: string, revenue?: number, signups?: number, visitors?: number }>>}
 */
async function loadRevenueMetrics() {
  try {
    const raw = await fs.readFile(REVENUE_METRICS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.products) ? data.products : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    await logMetrics("Revenue metrics read error: " + e.message);
    return [];
  }
}

/**
 * Build map app_id -> product_name from apps/<app_id>/spec.json.
 * @returns {Promise<Map<string, string>>}
 */
async function buildAppIdToProductName() {
  const map = new Map();
  let dirs = [];
  try {
    dirs = await fs.readdir(APPS_DIR);
  } catch (e) {
    if (e.code === "ENOENT") return map;
    return map;
  }
  for (const name of dirs) {
    if (!name.startsWith("app_")) continue;
    const specPath = path.join(APPS_DIR, name, "spec.json");
    try {
      const raw = await fs.readFile(specPath, "utf-8");
      const spec = JSON.parse(raw);
      const productName = (spec.product_name || "").trim();
      if (productName) map.set(name, productName);
    } catch {
      // no spec or invalid
    }
  }
  return map;
}

function normalizeProductName(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Write metrics/<app_id>.json from revenue_metrics (source of truth).
 * Schema: { app_id, revenue, users, growth_rate, updated_at }.
 */
async function writePerAppMetricsFile(appId, revenueRecord) {
  const revenue = Number(revenueRecord?.revenue) || 0;
  const users = Number(revenueRecord?.signups ?? revenueRecord?.visitors) || 0;
  const growth_rate = 0;
  const payload = {
    app_id: appId,
    revenue,
    users,
    growth_rate,
    growth: growth_rate,
    updated_at: new Date().toISOString()
  };
  await fs.mkdir(METRICS_DIR, { recursive: true });
  const filePath = path.join(METRICS_DIR, `${appId}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

/**
 * Update metrics files for all deployed apps. Call every daemon cycle.
 * Uses data/revenue_metrics.json as source of truth; writes metrics/<app_id>.json
 * so portfolio_brain and evolution_engine can read per-app metrics.
 * @returns {Promise<{ ok: boolean, updated: number }>}
 */
export async function runUpdateAllMetrics() {
  const revenueProducts = await loadRevenueMetrics();
  const byProductName = new Map();
  for (const p of revenueProducts) {
    const key = normalizeProductName(p.product_name);
    if (key) byProductName.set(key, p);
  }

  const appIdToProduct = await buildAppIdToProductName();
  await fs.mkdir(METRICS_DIR, { recursive: true });

  let updated = 0;
  for (const [appId, productName] of appIdToProduct) {
    const key = normalizeProductName(productName);
    const record = byProductName.get(key) || {};
    await writePerAppMetricsFile(appId, record).catch((e) => {
      logMetrics("Metrics write " + appId + ": " + e.message);
    });
    updated++;
  }

  // Also write for apps in deploy/ that have no spec (use app_id only, zeroed metrics)
  let deployDirs = [];
  try {
    deployDirs = await fs.readdir(DEPLOY_DIR);
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, updated };
  }
  for (const name of deployDirs) {
    if (!name.startsWith("app_")) continue;
    const stat = await fs.stat(path.join(DEPLOY_DIR, name)).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    if (appIdToProduct.has(name)) continue;
    await writePerAppMetricsFile(name, {}).catch(() => ({}));
    updated++;
  }

  return { ok: true, updated };
}
