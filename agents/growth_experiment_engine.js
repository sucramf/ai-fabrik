/**
 * GROWTH EXPERIMENT ENGINE – Generate growth and marketing experiments per product.
 *
 * Output: growth/growth_experiments.json. Experiments will later be executed by automated marketing agents.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const GROWTH_DIR = path.join(root, "growth");
const EXPERIMENTS_FILE = path.join(root, "growth", "growth_experiments.json");

/** Default experiment types and descriptions to generate per app. */
const EXPERIMENT_TEMPLATES = [
  { experiment_type: "SEO landing page experiment", description: "Create and A/B test an SEO-optimized landing page with targeted keywords." },
  { experiment_type: "Reddit community post", description: "Share the product in relevant subreddits with a helpful, non-promotional angle." },
  { experiment_type: "Product Hunt launch", description: "Prepare and schedule a Product Hunt launch with tagline, description, and media." },
  { experiment_type: "Blog article", description: "Write a how-to or problem/solution blog post that links to the product." },
  { experiment_type: "Short-form video idea", description: "Create a 30–60 second demo or tip video for TikTok, Reels, or Shorts." },
  { experiment_type: "Directory submission", description: "Submit the product to relevant directories (e.g. BetaList, SaaSHub, alternativeTo)." }
];

/**
 * Load existing experiments from growth/growth_experiments.json. Returns [] if missing or invalid.
 */
async function loadExperiments() {
  try {
    const raw = await fs.readFile(EXPERIMENTS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    return [];
  }
}

/**
 * Run growth experiment engine: scan apps/, add planned experiments (no duplicate appId + experiment_type), save.
 * @returns {Promise<{ ok: boolean, added: number, total: number }>}
 */
export async function runGrowthExperiments() {
  await fs.mkdir(GROWTH_DIR, { recursive: true });

  let list = await loadExperiments();
  if (!Array.isArray(list)) list = [];

  const existingKeys = new Set(
    list.map((e) => `${e.appId || ""}\t${e.experiment_type || ""}`).filter(Boolean)
  );

  let appDirs = [];
  try {
    appDirs = await fs.readdir(APPS_DIR);
  } catch (e) {
    if (e.code === "ENOENT") {
      await fs.writeFile(EXPERIMENTS_FILE, JSON.stringify(list, null, 2), "utf-8");
      return { ok: true, added: 0, total: list.length };
    }
    throw e;
  }

  const appIds = [];
  for (const name of appDirs) {
    if (!name.startsWith("app_")) continue;
    const full = path.join(APPS_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && stat.isDirectory()) appIds.push(name);
  }

  const now = new Date().toISOString();
  const added = [];

  for (const appId of appIds) {
    for (const t of EXPERIMENT_TEMPLATES) {
      const key = `${appId}\t${t.experiment_type}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      added.push({
        appId,
        experiment_type: t.experiment_type,
        description: t.description,
        status: "planned",
        created_at: now
      });
    }
  }

  list = list.concat(added);
  await fs.writeFile(EXPERIMENTS_FILE, JSON.stringify(list, null, 2), "utf-8");

  return { ok: true, added: added.length, total: list.length };
}
