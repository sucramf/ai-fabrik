/**
 * USER FEEDBACK AGENT – Persists feedback events per app.
 *
 * Export:
 *   - collectFeedback(appId: string, entry?: { type: string, message: string }): Promise<{ ok: boolean, count: number }>
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const FEEDBACK_DIR = path.join(root, "feedback");
const LOG_PATH = path.join(root, "logs", "user_feedback_agent.log");

async function log(level, message, data = null) {
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

async function loadFeedback(appId) {
  const file = path.join(FEEDBACK_DIR, `${appId}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const json = JSON.parse(raw);
    return { file, list: Array.isArray(json) ? json : [] };
  } catch {
    return { file, list: [] };
  }
}

async function saveFeedback(file, list) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf-8");
}

export async function collectFeedback(appId, entry) {
  if (!appId) {
    await log("warn", "collectFeedback called without appId", {});
    return { ok: false, count: 0 };
  }

  const { file, list } = await loadFeedback(appId);

  if (entry && typeof entry === "object") {
    const normalized = {
      timestamp: new Date().toISOString(),
      type: entry.type || "note",
      message: entry.message || "",
    };
    list.push(normalized);
  }

  try {
    await saveFeedback(file, list);
    await log("info", "Feedback stored", { appId, count: list.length });
    return { ok: true, count: list.length };
  } catch (e) {
    await log("error", "Failed to store feedback", { appId, error: e.message });
    return { ok: false, count: list.length };
  }
}
