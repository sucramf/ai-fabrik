/**
 * AUTO PUBLISHER – Automatically queue and optionally publish distribution content.
 *
 * 1. Reads generated distribution content from apps/<app_id>/distribution/
 *    (reddit_post.md, twitter_thread.md, indiehackers_post.md, producthunt_launch.md)
 * 2. Maintains data/publish_queue.json: { "queue": [ { "app_id", "platform", "status" } ] }
 * 3. Modes (PUBLISH_MODE env):
 *    - "safe": only prepares posts and queue; writes publish/*_ready.txt for copy-paste
 *    - "auto": posts via APIs when keys exist (twitter, reddit, producthunt; indiehackers = prepare only)
 * 4. Supported platforms: reddit, twitter, producthunt, indiehackers
 *
 * Logs: logs/publisher.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DATA_DIR = path.join(root, "data");
const PUBLISH_QUEUE_PATH = path.join(root, "data", "publish_queue.json");
const PUBLISH_DIR = path.join(root, "publish");
const LOGS_DIR = path.join(root, "logs");
const PUBLISHER_LOG = path.join(root, "logs", "publisher.log");

const PLATFORMS = ["reddit", "twitter", "producthunt", "indiehackers"];
const DIST_FILES = {
  reddit: "reddit_post.md",
  twitter: "twitter_thread.md",
  producthunt: "producthunt_launch.md",
  indiehackers: "indiehackers_post.md"
};

async function logPublisher(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(PUBLISHER_LOG, line, "utf-8").catch(() => {});
}

async function loadPublishQueue() {
  try {
    const raw = await fs.readFile(PUBLISH_QUEUE_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.queue) ? data.queue : [];
  } catch {
    return [];
  }
}

async function savePublishQueue(queue) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PUBLISH_QUEUE_PATH, JSON.stringify({ queue }, null, 2), "utf-8");
}

function queueKey(entry) {
  return `${entry.app_id}|${entry.platform}`;
}

/**
 * Find all app IDs that have distribution content (at least one of the 4 .md files).
 */
async function getAppsWithDistribution() {
  const dirs = await fs.readdir(APPS_DIR).catch(() => []);
  const appIds = dirs.filter((d) => d.startsWith("app_"));
  const result = [];
  for (const appId of appIds) {
    const distDir = path.join(APPS_DIR, appId, "distribution");
    try {
      await fs.access(distDir);
    } catch {
      continue;
    }
    const files = await fs.readdir(distDir).catch(() => []);
    const hasAny = PLATFORMS.some((p) => files.includes(DIST_FILES[p]));
    if (hasAny) result.push(appId);
  }
  return result;
}

async function readDistributionFile(appId, platform) {
  const file = path.join(APPS_DIR, appId, "distribution", DIST_FILES[platform]);
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Format Reddit post for paste: title (first # line), then body (rest without subreddits block).
 */
function formatRedditReady(md) {
  const lines = (md || "").split("\n");
  let title = "";
  const bodyLines = [];
  let inSubreddits = false;
  for (const line of lines) {
    if (line.startsWith("# ") && !title) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (line.trim() === "---" || line.toLowerCase().includes("target subreddits")) {
      inSubreddits = true;
      continue;
    }
    if (inSubreddits) continue;
    if (line.startsWith("## ")) bodyLines.push(line.replace(/^##\s+/, "**").replace(/$/, "**"));
    else bodyLines.push(line);
  }
  return `Title:\n${title}\n\nBody:\n${bodyLines.join("\n").trim()}`;
}

/**
 * Format Twitter thread: extract each tweet block for copy-paste.
 */
function formatTwitterReady(md) {
  const raw = (md || "").trim();
  return raw.replace(/^Tweet \d+ – [A-Za-z]+\n/gm, "---\nTweet $&").trim();
}

/**
 * Format Product Hunt: tagline, description, features, CTA.
 */
function formatProductHuntReady(md) {
  return (md || "").trim();
}

/**
 * Format Indie Hackers: full post.
 */
function formatIndieHackersReady(md) {
  return (md || "").trim();
}

/**
 * Safe mode: write publish/reddit_ready.txt, twitter_ready.txt, producthunt_ready.txt, indiehackers_ready.txt.
 * Each file contains one block per app (app_id header + formatted content).
 */
async function writeReadyFiles(appIds) {
  await fs.mkdir(PUBLISH_DIR, { recursive: true });
  const byPlatform = { reddit: [], twitter: [], producthunt: [], indiehackers: [] };
  for (const appId of appIds) {
    for (const platform of PLATFORMS) {
      const md = await readDistributionFile(appId, platform);
      if (!md.trim()) continue;
      let formatted = "";
      if (platform === "reddit") formatted = formatRedditReady(md);
      else if (platform === "twitter") formatted = formatTwitterReady(md);
      else if (platform === "producthunt") formatted = formatProductHuntReady(md);
      else formatted = formatIndieHackersReady(md);
      byPlatform[platform].push({ appId, content: formatted });
    }
  }
  for (const platform of PLATFORMS) {
    const blocks = byPlatform[platform].map(({ appId, content }) => `========== ${appId} ==========\n\n${content}\n`);
    const full = blocks.join("\n\n");
    await fs.writeFile(path.join(PUBLISH_DIR, `${platform}_ready.txt`), full || `(No content for ${platform})`, "utf-8");
  }
}

/**
 * Auto mode: attempt to post via APIs. Stub implementation – real APIs require OAuth/keys.
 * When env keys are set we log intent; actual posting can be implemented with platform SDKs.
 */
async function tryAutoPublish(appId, platform, content) {
  const keyMap = {
    reddit: "REDDIT_CLIENT_ID",
    twitter: "TWITTER_BEARER_TOKEN",
    producthunt: "PRODUCTHUNT_API_TOKEN",
    indiehackers: "INDIEHACKERS_API_KEY"
  };
  const keyName = keyMap[platform];
  const hasKey = process.env[keyName] && process.env[keyName].trim();
  if (!hasKey) {
    await logPublisher(`Auto publish skipped for ${appId} / ${platform}: no ${keyName}`);
    return { ok: false, reason: "no_key" };
  }
  await logPublisher(`Auto publish: would post to ${platform} for ${appId} (API key present; implement SDK call for real post)`);
  return { ok: true, status: "prepared" };
}

/**
 * Main entry: scan apps with distribution, update queue, write ready files (safe) or attempt auto publish (auto).
 */
export async function runAutoPublisher() {
  const mode = (process.env.PUBLISH_MODE || "safe").toLowerCase();
  await fs.mkdir(LOGS_DIR, { recursive: true });

  const appIds = await getAppsWithDistribution();
  if (appIds.length === 0) {
    await logPublisher("No apps with distribution content found.");
    return { ok: true, queued: 0, apps: 0 };
  }

  let queue = await loadPublishQueue();
  const seen = new Set(queue.map((e) => queueKey(e)));

  for (const appId of appIds) {
    let added = false;
    for (const platform of PLATFORMS) {
      const key = `${appId}|${platform}`;
      if (seen.has(key)) continue;
      const md = await readDistributionFile(appId, platform);
      if (!md.trim()) continue;
      queue.push({ app_id: appId, platform, status: "pending", queued_at: new Date().toISOString() });
      seen.add(key);
      added = true;
    }
    if (added) await logPublisher("Queued distribution for " + appId);
  }

  await savePublishQueue(queue);

  if (mode === "safe") {
    await writeReadyFiles(appIds);
    await logPublisher("Safe mode: ready files written to publish/");
  } else if (mode === "auto") {
    await writeReadyFiles(appIds);
    for (const entry of queue.filter((e) => e.status === "pending")) {
      const content = await readDistributionFile(entry.app_id, entry.platform);
      const result = await tryAutoPublish(entry.app_id, entry.platform, content);
      if (result.ok) {
        entry.status = "prepared";
      }
    }
    await savePublishQueue(queue);
  }

  return { ok: true, queued: queue.length, apps: appIds.length };
}
