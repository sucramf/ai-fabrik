import fs from "fs/promises";
import path from "path";

/**
 * REDDIT GROWTH ENGINE – Prepares helpful reply suggestions for Reddit.
 *
 * Exports:
 *   - queueRedditGrowthItems(queries): Promise<{ queued: any[] }>
 *
 * This module does not post to Reddit; it only prepares a queue under growth/reddit_queue.
 */

const root = process.cwd();
const QUEUE_DIR = path.join(root, "growth", "reddit_queue");
const LOG_PATH = path.join(root, "logs", "reddit_growth.log");

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

async function ensureQueueDir() {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
}

export async function queueRedditGrowthItems(requests) {
  const list = Array.isArray(requests)
    ? requests.filter((r) => r && typeof r.subreddit === "string" && typeof r.title === "string")
    : [];

  if (list.length === 0) {
    await log("warn", "Reddit Growth Engine received no valid requests", {});
    return { queued: [] };
  }

  await ensureQueueDir();

  const queued = [];

  for (const req of list) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.json`;
    const filePath = path.join(QUEUE_DIR, filename);

    const payload = {
      id,
      created_at: new Date().toISOString(),
      subreddit: req.subreddit,
      thread_url: req.thread_url || null,
      title: req.title,
      user_problem: req.user_problem || null,
      recommended_app: req.recommended_app || null,
      suggested_comment: req.suggested_comment || "",
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
      queued.push({ id, path: filePath });
    } catch (error) {
      await log("error", "Failed to write reddit queue item", { error: error.message });
    }
  }

  await log("info", "Reddit Growth Engine queued items", { count: queued.length });

  return { queued };
}

async function selfTest() {
  const result = await queueRedditGrowthItems([
    {
      subreddit: "someSub",
      title: "Looking for a tool to automate reports",
      user_problem: "User wants automated report generation",
      recommended_app: "Demo Analytics",
      suggested_comment: "You might like Demo Analytics – it automates recurring reports.",
    },
  ]);
  await log("info", "Reddit Growth self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
