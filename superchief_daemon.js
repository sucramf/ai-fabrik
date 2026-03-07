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

import { filterByTrends } from "./marketing/trend_analyst.js";
import { runFullProductPipeline } from "./builders/full_product_pipeline.js";

const __filename = fileURLToPath(import.meta.url);
const root = process.cwd();
const IDEAS_SOURCE = path.join(root, "ideas", "ideas.json");
const APPROVED_JSON = path.join(root, "ideas", "approved_trend_ideas.json");
const REPORT_LOG = path.join(root, "superchief_report.log");
const CYCLE_INTERVAL_MS = 7 * 60 * 1000;

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
    return Array.isArray(list) ? list.filter((i) => typeof i === "string" && i.trim()) : [];
  } catch {
    return [];
  }
}

async function runCycle() {
  await loadEnv();
  console.log("\n========== DAEMON CYCLE", new Date().toISOString(), "==========\n");

  const candidates = await readCandidates();
  if (!candidates.length) {
    console.log("[DAEMON] No ideas in ideas/ideas.json. Skipping.\n");
    return;
  }

  const { approved, reportedToSuperchief } = await filterByTrends(candidates);
  const payload = { approvedIdeas: approved, uncertainIdeas: reportedToSuperchief.map((r) => r.idea) };
  await fs.mkdir(path.dirname(APPROVED_JSON), { recursive: true });
  await fs.writeFile(APPROVED_JSON, JSON.stringify(payload, null, 2), "utf-8");
  console.log("[DAEMON] Approved ideas:", approved.length, "| Uncertain:", reportedToSuperchief.length);

  const result = await runFullProductPipeline();
  console.log("[DAEMON] Full product pipeline done. PASS:", result.passedIds?.length ?? 0);
}

async function start() {
  await runCycle();
  setInterval(() => runCycle().catch((e) => console.error("[DAEMON] Cycle error:", e)), CYCLE_INTERVAL_MS);
}

start().catch((e) => {
  console.error("[DAEMON] Start failed:", e);
  process.exit(1);
});
