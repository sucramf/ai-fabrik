import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * METRICS ANALYZER – Collects and evaluates product metrics.
 *
 * Exports:
 *   - recordMetrics(entry): Promise<void>
 *   - detectWinner(metricsList?): Promise<{ winners: any[] }>
 *
 * Metrics stored in data/metrics.json.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const METRICS_PATH = path.join(DATA_DIR, "metrics.json");

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

async function loadMetrics() {
  try {
    const raw = await fs.readFile(METRICS_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveMetrics(list) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(METRICS_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write metrics.json", { error: error.message });
  }
}

export async function recordMetrics(entry) {
  if (!entry || typeof entry !== "object") {
    await log("warn", "recordMetrics called with invalid entry", {});
    return;
  }

  const normalized = {
    app_id: entry.app_id || entry.app || "unknown",
    timestamp: entry.timestamp || new Date().toISOString(),
    traffic: Number(entry.traffic || 0),
    signups: Number(entry.signups || 0),
    conversion: Number(entry.conversion || 0),
    retention: Number(entry.retention || 0),
  };

  const existing = await loadMetrics();
  existing.push(normalized);
  await saveMetrics(existing);
  await log("info", "Recorded metrics", normalized);
}

export async function detectWinner(metricsList) {
  const list = Array.isArray(metricsList) ? metricsList : await loadMetrics();

  const winners = list.filter((m) => {
    const trafficOk = m.traffic > 100;
    const signupsOk = m.signups > 10;
    const conversionOk = Number(m.conversion) > 2;
    return trafficOk && signupsOk && conversionOk;
  });

  if (winners.length > 0) {
    await log("info", "Winner apps detected", { count: winners.length });
  }

  return { winners };
}

async function selfTest() {
  await recordMetrics({ app_id: "demo", traffic: 150, signups: 20, conversion: 3.5 });
  const result = await detectWinner();
  await log("info", "Metrics Analyzer self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
