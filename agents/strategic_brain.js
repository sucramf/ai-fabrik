/**
 * STRATEGIC BRAIN – High-level decisions about the product portfolio.
 *
 * Reads portfolio/portfolio_status.json and produces strategy/factory_strategy.json
 * with per-product actions (scale, invest, continue_testing, consider_shutdown).
 * Guides automated scaling and shutdown decisions later.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const PORTFOLIO_STATUS_FILE = path.join(root, "portfolio", "portfolio_status.json");
const STRATEGY_DIR = path.join(root, "strategy");
const STRATEGY_FILE = path.join(root, "strategy", "factory_strategy.json");

const STATUS_TO_ACTION = {
  winner: "scale",
  promising: "invest",
  experiment: "continue_testing",
  weak: "consider_shutdown"
};

/**
 * Run strategic brain: read portfolio status, map status → action, write factory_strategy.json.
 * Exits safely if portfolio_status.json is missing.
 * @returns {Promise<{ ok: boolean, products: number }>}
 */
export async function runStrategicBrain() {
  let portfolioData;
  try {
    const raw = await fs.readFile(PORTFOLIO_STATUS_FILE, "utf-8");
    portfolioData = JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, products: 0 };
    throw e;
  }

  const productList = portfolioData?.products;
  if (!Array.isArray(productList) || productList.length === 0) {
    await fs.mkdir(STRATEGY_DIR, { recursive: true });
    await fs.writeFile(
      STRATEGY_FILE,
      JSON.stringify({ products: [], updated: new Date().toISOString() }, null, 2),
      "utf-8"
    );
    return { ok: true, products: 0 };
  }

  const updated = new Date().toISOString();
  const products = productList.map((p) => ({
    appId: p.appId || "",
    status: p.status || "weak",
    action: STATUS_TO_ACTION[p.status] || "consider_shutdown",
    evaluated_at: p.evaluated_at || updated
  }));

  await fs.mkdir(STRATEGY_DIR, { recursive: true });
  await fs.writeFile(
    STRATEGY_FILE,
    JSON.stringify({ products, updated }, null, 2),
    "utf-8"
  );

  return { ok: true, products: products.length };
}
