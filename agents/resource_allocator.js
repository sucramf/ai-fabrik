/**
 * RESOURCE ALLOCATOR – Connects strategy decisions with factory execution.
 *
 * Reads strategy/factory_strategy.json and writes resources/resource_allocation.json
 * with allocation levels (high / medium / low / minimal) per product.
 * Future agents use this to prioritize evolution, marketing, and growth.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const STRATEGY_FILE = path.join(root, "strategy", "factory_strategy.json");
const RESOURCES_DIR = path.join(root, "resources");
const ALLOCATION_FILE = path.join(root, "resources", "resource_allocation.json");

const ACTION_TO_ALLOCATION = {
  scale: "high",
  invest: "medium",
  continue_testing: "low",
  consider_shutdown: "minimal"
};

/** Per allocation level: build_budget, growth_budget, evolution_priority for allocation-aware evolution. */
const ALLOCATION_TO_BUDGETS = {
  high: { build_budget: 3, growth_budget: 3, evolution_priority: "high" },
  medium: { build_budget: 2, growth_budget: 2, evolution_priority: "medium" },
  low: { build_budget: 1, growth_budget: 1, evolution_priority: "low" },
  minimal: { build_budget: 0, growth_budget: 0, evolution_priority: "none" }
};

/**
 * Run resource allocator: read strategy, map action → allocation, write resource_allocation.json.
 * Exits safely if strategy file is missing.
 * @returns {Promise<{ ok: boolean, products: number }>}
 */
export async function runResourceAllocator() {
  let strategyData;
  try {
    const raw = await fs.readFile(STRATEGY_FILE, "utf-8");
    strategyData = JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, products: 0 };
    throw e;
  }

  const productList = strategyData?.products;
  if (!Array.isArray(productList) || productList.length === 0) {
    await fs.mkdir(RESOURCES_DIR, { recursive: true });
    await fs.writeFile(
      ALLOCATION_FILE,
      JSON.stringify({ products: [], updated: new Date().toISOString() }, null, 2),
      "utf-8"
    );
    return { ok: true, products: 0 };
  }

  const updated = new Date().toISOString();
  const products = productList.map((p) => {
    const allocation = ACTION_TO_ALLOCATION[p.action] || "minimal";
    const budgets = ALLOCATION_TO_BUDGETS[allocation] || ALLOCATION_TO_BUDGETS.minimal;
    return {
      appId: p.appId || "",
      allocation,
      build_budget: p.build_budget ?? budgets.build_budget,
      growth_budget: p.growth_budget ?? budgets.growth_budget,
      evolution_priority: p.evolution_priority ?? budgets.evolution_priority,
      decided_at: updated
    };
  });

  await fs.mkdir(RESOURCES_DIR, { recursive: true });
  await fs.writeFile(
    ALLOCATION_FILE,
    JSON.stringify({ products, updated }, null, 2),
    "utf-8"
  );

  return { ok: true, products: products.length };
}
