import fs from "fs/promises";
import path from "path";

/**
 * PORTFOLIO BRAIN – Classifies products using Profit-First unit economics and suggests allocation.
 *
 * HK-UPGRADE:
 * - Uses LTV/CAC ratio where available.
 * - Products with LTV/CAC < 1.5 are forced into "Sunset" bucket.
 * - Profit-first allocation: prioritize Core/Growth with strong ratios.
 */

const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const PORTFOLIO_PATH = path.join(DATA_DIR, "product_portfolio.json");

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "portfolio_brain.log");
  const ts = new Date().toISOString();
  const payload =
    data != null && data !== undefined
      ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
      : { level, message };
  const extra =
    typeof payload === "object" && payload.message
      ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
      : {};
  const line =
    ts +
    " [" + (level || "info").toUpperCase() + "] " +
    (payload.message || message) +
    (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");

  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
  }
}

function computeLtvCac(metricsEntry) {
  if (!metricsEntry) return null;
  const ltv = Number(metricsEntry.ltv || metricsEntry.LTV || 0);
  const cac = Number(metricsEntry.cac || metricsEntry.CAC || 0);
  if (!ltv || !cac || cac <= 0) return null;
  return ltv / cac;
}

function classifyProduct(project, metricsEntry, lifecycleInfo) {
  const traffic = (metricsEntry && metricsEntry.traffic) || 0;
  const retention = (metricsEntry && metricsEntry.retention) || 0;
  const stage = (lifecycleInfo && lifecycleInfo.stage) || "unknown";
  const ratio = computeLtvCac(metricsEntry);

  if (stage === "sunset") return "Sunset";

  if (ratio !== null) {
    if (ratio < 1.5) return "Sunset";
    if (ratio >= 3 && (traffic >= 200 || retention > 30)) return "Core";
  }

  if (traffic < 50) return "Experiments";
  if (traffic >= 50 && traffic < 200) return "Growth";
  if (traffic >= 200 || retention > 30) return "Core";
  return "Experiments";
}

export async function buildPortfolioSnapshot(projects, metrics, lifecycle) {
  const projList = Array.isArray(projects) ? projects : [];
  const metricList = Array.isArray(metrics) ? metrics : [];
  const lifecycleList = Array.isArray(lifecycle) ? lifecycle : [];

  const byProjectMetrics = new Map();
  for (const m of metricList) {
    const id = m.app_id || m.project_id || m.name;
    if (!id) continue;
    if (!byProjectMetrics.has(id)) byProjectMetrics.set(id, m);
  }

  const byProjectLifecycle = new Map();
  for (const l of lifecycleList) {
    const id = l.project_id || l.name;
    if (!id) continue;
    byProjectLifecycle.set(id, l);
  }

  const classified = [];

  for (const p of projList) {
    const id = p.id || p.name;
    if (!id) continue;
    const metricsEntry = byProjectMetrics.get(id) || null;
    const lifecycleInfo = byProjectLifecycle.get(id) || null;
    const bucket = classifyProduct(p, metricsEntry, lifecycleInfo);
    const ratio = computeLtvCac(metricsEntry);

    classified.push({
      project_id: id,
      name: p.name || id,
      bucket,
      metrics: metricsEntry,
      lifecycle: lifecycleInfo,
      unit_economics: {
        ltv: metricsEntry?.ltv ?? metricsEntry?.LTV ?? null,
        cac: metricsEntry?.cac ?? metricsEntry?.CAC ?? null,
        ltv_cac_ratio: ratio,
      },
    });
  }

  const counts = classified.reduce(
    (acc, c) => {
      acc[c.bucket] = (acc[c.bucket] || 0) + 1;
      return acc;
    },
    { Experiments: 0, Growth: 0, Core: 0, Sunset: 0 }
  );

  const allocation = {
    core_and_growth: 60,
    experiments: 25,
    opportunities: 15,
    profit_first_rule: "Prioritize Core and Growth products with LTV/CAC ≥ 3. Deprioritize Sunset (<1.5).",
  };

  const snapshot = {
    generated_at: new Date().toISOString(),
    products: classified,
    counts,
    allocation,
  };

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PORTFOLIO_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write product_portfolio.json", { error: error.message });
  }

  await log("info", "Portfolio snapshot updated", { total: classified.length });

  return snapshot;
}

async function selfTest() {
  const snapshot = await buildPortfolioSnapshot(
    [
      { id: "appA", name: "App A" },
      { id: "appB", name: "App B" },
      { id: "appC", name: "App C" },
    ],
    [
      { app_id: "appA", traffic: 220, retention: 40, ltv: 300, cac: 80 },
      { app_id: "appB", traffic: 40, retention: 5, ltv: 50, cac: 40 },
      { app_id: "appC", traffic: 120, retention: 15, ltv: 90, cac: 90 },
    ],
    [
      { project_id: "appB", stage: "sunset" },
    ]
  );
  await log("info", "Portfolio brain self-test", { total: snapshot.products.length });
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
