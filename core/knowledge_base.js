import fs from "fs/promises";
import path from "path";

/**
 * KNOWLEDGE BASE – Stores factory insights from products and experiments.
 */

const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const MEMORY_PATH = path.join(DATA_DIR, "factory_memory.json");

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "knowledge_base.log");
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

async function loadInsights() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveInsights(list) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(MEMORY_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write factory_memory.json", { error: error.message });
  }
}

export async function addInsight(entry) {
  if (!entry || typeof entry !== "object") {
    await log("warn", "addInsight called with invalid entry", {});
    return;
  }

  const normalized = {
    type: entry.type || "generic",
    source: entry.source || "unknown",
    context: entry.context || null,
    insight: entry.insight || "",
    created_at: entry.created_at || new Date().toISOString(),
  };

  const existing = await loadInsights();
  existing.push(normalized);
  await saveInsights(existing);
  await log("info", "Insight added to knowledge base", normalized);
}

export async function listInsights() {
  return loadInsights();
}
