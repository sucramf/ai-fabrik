import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * MARKET INSPECTOR – Scores ideas on competition, demand, monetization, difficulty and SEO.
 *
 * Export:
 *   - inspectMarketIdeas(ideas: string[]): Promise<{ scored: MarketIdeaScore[], passed: MarketIdeaScore[], rejected: MarketIdeaScore[] }>
 *
 * Each idea is scored 0–100 based on:
 *   - competition_score
 *   - market_demand
 *   - monetization_potential
 *   - technical_difficulty
 *   - seo_opportunity
 *
 * Only ideas with total_score >= 70 are allowed to proceed.
 * Results are appended to data/filtered_ideas.json and logged to logs/market_inspector.log.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const FILTERED_PATH = path.join(DATA_DIR, "filtered_ideas.json");
const LOG_PATH = path.join(root, "logs", "market_inspector.log");

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
    // ignore logging errors
  }
}

async function loadFilteredIdeas() {
  try {
    const raw = await fs.readFile(FILTERED_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveFilteredIdeas(ideas) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILTERED_PATH, JSON.stringify(ideas, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write filtered_ideas.json", { error: error.message });
  }
}

function baseScores(text) {
  let competition = 50;
  let demand = 50;
  let monetization = 50;
  let difficulty = 50;
  let seo = 50;

  const lower = text.toLowerCase();

  if (lower.includes("enterprise") || lower.includes("b2b") || lower.includes("teams")) {
    demand += 15;
    monetization += 15;
  }

  if (lower.includes("subscription") || lower.includes("saas") || lower.includes("recurring")) {
    monetization += 20;
  }

  if (lower.includes("chrome extension") || lower.includes("plugin") || lower.includes("no-code")) {
    difficulty -= 10;
  }

  if (lower.includes("ai infrastructure") || lower.includes("real-time") || lower.includes("low latency")) {
    difficulty += 15;
  }

  if (lower.includes("many competitors") || lower.includes("crowded") || lower.includes("saturated")) {
    competition -= 20;
  } else if (lower.includes("blue ocean") || lower.includes("underserved")) {
    competition += 10;
  }

  if (lower.includes("search traffic") || lower.includes("long-tail keywords") || lower.includes("content strategy")) {
    seo += 20;
  }

  const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));

  return {
    competition_score: clamp(competition),
    market_demand: clamp(demand),
    monetization_potential: clamp(monetization),
    technical_difficulty: clamp(difficulty),
    seo_opportunity: clamp(seo),
  };
}

function totalScore(scores) {
  const { competition_score, market_demand, monetization_potential, technical_difficulty, seo_opportunity } = scores;
  const positive =
    market_demand * 0.3 +
    monetization_potential * 0.3 +
    seo_opportunity * 0.2 +
    competition_score * 0.2;
  const difficultyPenalty = (100 - technical_difficulty) * 0.1;
  return Math.round(Math.max(0, Math.min(100, positive + difficultyPenalty)));
}

export async function inspectMarketIdeas(ideas) {
  const list = Array.isArray(ideas)
    ? ideas.filter((i) => typeof i === "string" && i.trim())
    : [];

  if (list.length === 0) {
    await log("warn", "Market Inspector received no ideas", {});
    return { scored: [], passed: [], rejected: [] };
  }

  const scored = [];
  const passed = [];
  const rejected = [];

  for (const raw of list) {
    const idea = raw.trim();
    const scores = baseScores(idea);
    const total = totalScore(scores);
    const accepted = total >= 70;

    const record = {
      idea,
      evaluated_at: new Date().toISOString(),
      ...scores,
      total_score: total,
      accepted,
    };

    scored.push(record);
    if (accepted) passed.push(record); else rejected.push(record);
  }

  const existing = await loadFilteredIdeas();
  const merged = existing.concat(passed);
  await saveFilteredIdeas(merged);

  await log("info", "Market Inspector evaluated ideas", {
    total: list.length,
    passed: passed.length,
    rejected: rejected.length,
  });

  return { scored, passed, rejected };
}

async function selfTest() {
  const sample = [
    "B2B workflow platform for recurring subscription analytics with strong content strategy",
    "Tiny novelty meme generator for fun only",
  ];

  const result = await inspectMarketIdeas(sample);
  await log("info", "Market Inspector self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
