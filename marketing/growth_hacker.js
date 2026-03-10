/**
 * GROWTH HACKER – Writes concrete growth experiments per app.
 *
 * Behavior:
 *   - Appends channel-specific experiments to growth/growth_experiments.json.
 *   - Never throws; logs errors and returns a summary.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const GROWTH_FILE = path.join(root, "growth", "growth_experiments.json");
const LOG_PATH = path.join(root, "logs", "growth_hacker.log");

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

async function loadExperiments() {
  try {
    const raw = await fs.readFile(GROWTH_FILE, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveExperiments(list) {
  await fs.mkdir(path.dirname(GROWTH_FILE), { recursive: true });
  await fs.writeFile(GROWTH_FILE, JSON.stringify(list, null, 2), "utf-8");
}

export async function runGrowth(appId) {
  if (!appId) {
    await log("warn", "runGrowth called without appId", {});
    return { ok: false, experiments_added: 0 };
  }

  const existing = await loadExperiments();
  const key = (type) => `${appId}:${type}`;
  const existingKeys = new Set(existing.map((e) => key(e.experiment_type || e.type || "generic")));

  const templates = [
    {
      experiment_type: "seo_landing_page",
      description: "Create and optimize a dedicated SEO landing page for the app.",
    },
    {
      experiment_type: "reddit_launch",
      description: "Post a thoughtful launch and follow-up threads on relevant subreddits.",
    },
    {
      experiment_type: "email_onboarding",
      description: "Design a 3-email onboarding sequence for new signups.",
    },
    {
      experiment_type: "linkedin_thought_leadership",
      description: "Publish a short series of LinkedIn posts showing concrete use cases.",
    },
  ];

  const toAdd = [];
  for (const tpl of templates) {
    const k = key(tpl.experiment_type);
    if (existingKeys.has(k)) continue;
    toAdd.push({
      appId,
      experiment_type: tpl.experiment_type,
      description: tpl.description,
      status: "planned",
      created_at: new Date().toISOString(),
    });
  }

  if (!toAdd.length) {
    await log("info", "No new growth experiments (already present)", { appId });
    return { ok: true, experiments_added: 0 };
  }

  const updated = existing.concat(toAdd);
  try {
    await saveExperiments(updated);
    await log("info", "Growth experiments appended", { appId, count: toAdd.length });
    return { ok: true, experiments_added: toAdd.length };
  } catch (e) {
    await log("error", "Failed to save growth experiments", { appId, error: e.message });
    return { ok: false, experiments_added: 0, error: e.message };
  }
}
