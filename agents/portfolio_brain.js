/**
 * PORTFOLIO BRAIN – Analyze all factory products and rank by potential.
 *
 * Does not modify products; only analyzes and ranks. Output: portfolio/portfolio_status.json.
 * Prepares for automated investment decisions later.
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
const STATUS_FILE = path.join(root, "portfolio", "portfolio_status.json");

/**
 * Compute score from metrics (0+). Then classify: weak / experiment / promising / winner.
 */
function computeScoreAndStatus(metrics) {
  let score = 0;
  const users = Number(metrics?.users) || 0;
  const sessionTime = Number(metrics?.session_time) || 0;
  const bounceRate = Number(metrics?.bounce_rate) || 0;

  if (users > 1000) score += 3;
  else if (users > 100) score += 2;

  if (sessionTime > 60) score += 2;

  if (bounceRate < 0.5) score += 2;

  let status;
  if (score <= 1) status = "weak";
  else if (score <= 3) status = "experiment";
  else if (score <= 5) status = "promising";
  else status = "winner";

  return { score, status };
}

/**
 * Run portfolio analysis: scan apps/, load metrics, score each product, write portfolio_status.json.
 * @returns {Promise<{ ok: boolean, products: number }>}
 */
export async function runPortfolioAnalysis() {
  await fs.mkdir(PORTFOLIO_DIR, { recursive: true });

  let appDirs = [];
  try {
    appDirs = await fs.readdir(APPS_DIR);
  } catch (e) {
    if (e.code === "ENOENT") {
      await fs.writeFile(STATUS_FILE, JSON.stringify({ products: [], updated: new Date().toISOString() }, null, 2), "utf-8");
      return { ok: true, products: 0 };
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

  const evaluatedAt = new Date().toISOString();
  const products = [];

  for (const appId of appIds) {
    let metrics = {};
    for (const dir of [DATA_METRICS_DIR, METRICS_DIR]) {
      const metricsPath = path.join(dir, `${appId}.json`);
      try {
        const raw = await fs.readFile(metricsPath, "utf-8");
        metrics = JSON.parse(raw);
        break;
      } catch {
        // try next path
      }
    }

    const users = Number(metrics?.users) || 0;
    const sessionTime = Number(metrics?.session_time) || 0;
    const bounceRate = Number(metrics?.bounce_rate) || 0;

    const { score, status } = computeScoreAndStatus(metrics);

    products.push({
      appId,
      users,
      session_time: sessionTime,
      bounce_rate: bounceRate,
      score,
      status,
      evaluated_at: evaluatedAt
    });
  }

  const payload = { products, updated: evaluatedAt };
  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2), "utf-8");

  return { ok: true, products: products.length };
}
