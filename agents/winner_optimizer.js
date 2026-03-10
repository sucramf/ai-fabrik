import { detectWinner } from "./metrics_analyzer.js";
import fs from "fs/promises";
import path from "path";

/**
 * WINNER OPTIMIZER – Applies optimization actions when a winner app is detected.
 *
 * Exports:
 *   - runWinnerOptimization(metricsList?): Promise<{ winners: any[], actions: any[] }>
 *
 * Actions are logged to logs/winner_loop.log.
 */

const root = process.cwd();

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "winner_loop.log");
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
    // ignore
  }
}

export async function runWinnerOptimization(metricsList) {
  const { winners } = await detectWinner(metricsList);

  if (!winners || winners.length === 0) {
    await log("info", "No winner detected, skipping optimization", {});
    return { winners: [], actions: [] };
  }

  const actions = winners.map((w) => ({
    app_id: w.app_id || "unknown",
    timestamp: new Date().toISOString(),
    steps: [
      "optimize landing page",
      "add features",
      "generate SEO",
      "improve pricing",
    ],
  }));

  for (const action of actions) {
    await log("info", "Winner optimization triggered", action);
  }

  return { winners, actions };
}

async function selfTest() {
  const mockMetrics = [
    { app_id: "demo", traffic: 150, signups: 20, conversion: 3.5 },
    { app_id: "low", traffic: 50, signups: 2, conversion: 1 },
  ];

  const result = await runWinnerOptimization(mockMetrics);
  await log("info", "Winner Optimizer self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
