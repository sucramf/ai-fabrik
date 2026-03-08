/**
 * TREND & OPPORTUNITY SCANNER – Find product opportunities from trends and save as ideas.
 *
 * Only digital products (web apps, tools, SaaS, games, platforms). Physical products are ignored.
 * Writes to ideas/trend_opportunities.json. Later will scan YouTube, TikTok, Google Trends, Product Hunt, Reddit, Indie Hacker.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const IDEAS_DIR = path.join(root, "ideas");
const OPPORTUNITIES_FILE = path.join(root, "ideas", "trend_opportunities.json");

/** Simulated digital-trend opportunities (digital only; no physical products). */
const SIMULATED_TRENDS = [
  { title: "AI writing prompt generator", description: "Web tool that suggests and refines prompts for AI writing assistants.", source: "simulated: AI tools", potential: "high" },
  { title: "Micro learning quiz app", description: "Short daily quizzes for learning a skill in 5 minutes. Browser-based, no app store.", source: "simulated: educational apps", potential: "medium" },
  { title: "Browser-based word puzzle game", description: "Daily word puzzle game playable in the browser, shareable results.", source: "simulated: browser games", potential: "high" },
  { title: "Meeting cost calculator", description: "SaaS tool that estimates the cost of meetings by duration and attendees for teams.", source: "simulated: productivity tools", potential: "medium" },
  { title: "Niche invoice generator for freelancers", description: "Simple web app to create and send invoices for a specific niche (e.g. translators, designers).", source: "simulated: niche SaaS", potential: "medium" },
  { title: "AI summarizer for long articles", description: "Paste a URL or text and get a short summary. Web-only tool.", source: "simulated: AI tools", potential: "high" },
  { title: "Habit streak tracker", description: "Minimal web app to track daily habits and streak counts with optional export.", source: "simulated: productivity tools", potential: "low" },
  { title: "Simple A/B headline tester", description: "Landing page headline A/B test tool for indie makers. No code required.", source: "simulated: niche SaaS", potential: "medium" }
];

function slugify(title) {
  return (title || "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function generateId(title) {
  return `trend_${Date.now()}_${slugify(title)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Load existing opportunities from ideas/trend_opportunities.json. Returns [] if missing or invalid.
 */
async function loadOpportunities() {
  try {
    const raw = await fs.readFile(OPPORTUNITIES_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    return [];
  }
}

/**
 * Save opportunities array to ideas/trend_opportunities.json.
 */
async function saveOpportunities(list) {
  await fs.mkdir(IDEAS_DIR, { recursive: true });
  await fs.writeFile(
    OPPORTUNITIES_FILE,
    JSON.stringify(list, null, 2),
    "utf-8"
  );
}

/**
 * Run the trend scanner: ensure ideas/ and trend_opportunities.json exist, add simulated opportunities (no duplicate IDs).
 * @returns {Promise<{ ok: boolean, added: number, total: number }>}
 */
export async function runTrendScanner() {
  await fs.mkdir(IDEAS_DIR, { recursive: true });

  let list = await loadOpportunities();
  if (!Array.isArray(list)) list = [];

  const existingIds = new Set((list || []).map((e) => e.id).filter(Boolean));
  const existingTitles = new Set((list || []).map((e) => (e.title || "").toLowerCase().trim()).filter(Boolean));
  const added = [];
  const now = new Date().toISOString();

  for (const t of SIMULATED_TRENDS) {
    const id = generateId(t.title);
    const titleKey = (t.title || "").toLowerCase().trim();
    if (existingIds.has(id) || existingTitles.has(titleKey)) continue;
    existingIds.add(id);
    existingTitles.add(titleKey);
    added.push({
      id,
      title: t.title,
      description: t.description,
      source: t.source,
      potential: t.potential,
      created_at: now
    });
  }

  list = list.concat(added);
  await saveOpportunities(list);

  return { ok: true, added: added.length, total: list.length };
}
