/**
 * PRODUCT QUALITY GATE – Evaluates ideas for seriousness and long-term value.
 *
 * Export: evaluateIdeas(ideas: string[]):
 *  - rejects novelty/gimmick/low-value ideas
 *  - scores problem_severity, market_need, long_term_usefulness, platform_potential (1–10)
 *  - total_score must be >= 28 to pass
 *  - writes reviews to data/quality_reviews.json
 *  - logs activity to logs/product_quality_gate.log
 *
 * Safe: missing files/dirs never crash; errors are logged.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const REVIEWS_PATH = path.join(DATA_DIR, "quality_reviews.json");
const LOG_PATH = path.join(root, "logs", "product_quality_gate.log");

async function log(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data != null && data !== undefined
    ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
    : { level, message };
  const extra = typeof payload === "object" && payload.message
    ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
    : {};
  const line = ts + " [" + (level || "info").toUpperCase() + "] " + (payload.message || message) + (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
    // ignore logging errors
  }
}

const FORBIDDEN_PATTERNS = [
  /novelty/i,
  /gimmick/i,
  /"just for fun"/i,
  /ai wrapper/i,
  /wrapper tool/i,
  /random generator/i,
  /idea generator/i,
  /name generator/i,
  /logo generator/i,
  /meme generator/i,
  /seo tool/i,
  /keyword spinner/i,
  /prompt pack/i
];

function isClearlyLowValue(idea) {
  if (!idea || typeof idea !== "string") return true;
  const text = idea.toLowerCase();
  if (text.length < 30) return true;
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

function scoreIdea(idea) {
  const text = (idea || "").toLowerCase();

  // Base scores
  let problemSeverity = 6;
  let marketNeed = 6;
  let longTerm = 6;
  let platformPotential = 5;

  if (isClearlyLowValue(idea)) {
    problemSeverity = 3;
    marketNeed = 3;
    longTerm = 2;
    platformPotential = 2;
  } else {
    if (text.includes("b2b") || text.includes("teams") || text.includes("workflow")) {
      problemSeverity += 2;
      marketNeed += 2;
    }
    if (text.includes("subscription") || text.includes("saas") || text.includes("recurring")) {
      longTerm += 2;
    }
    if (text.includes("platform") || text.includes("marketplace") || text.includes("ecosystem")) {
      platformPotential += 3;
    }
    if (text.includes("niche") || text.includes("specialized") || text.includes("for designers") || text.includes("for developers")) {
      marketNeed += 1;
      longTerm += 1;
    }
  }

  // Clamp 1–10
  const clamp = (x) => Math.max(1, Math.min(10, Math.round(x)));
  problemSeverity = clamp(problemSeverity);
  marketNeed = clamp(marketNeed);
  longTerm = clamp(longTerm);
  platformPotential = clamp(platformPotential);

  const total = problemSeverity + marketNeed + longTerm + platformPotential;
  const accepted = total >= 28 && !isClearlyLowValue(idea);

  const reasons = [];
  if (!accepted) {
    if (isClearlyLowValue(idea)) reasons.push("Rejected: novelty/gimmick/low-value pattern detected.");
    if (total < 28) reasons.push("Rejected: total score below threshold (" + total + " < 28).");
  } else {
    reasons.push("Accepted: serious problem, clear need and long-term potential.");
  }

  return {
    problem_severity: problemSeverity,
    market_need: marketNeed,
    long_term_usefulness: longTerm,
    platform_potential: platformPotential,
    total_score: total,
    accepted,
    reasons
  };
}

async function loadExistingReviews() {
  try {
    const raw = await fs.readFile(REVIEWS_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveReviews(reviews) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(REVIEWS_PATH, JSON.stringify(reviews, null, 2), "utf-8");
  } catch (e) {
    await log("error", "Failed to write quality_reviews.json", { error: e.message });
  }
}

/**
 * Evaluate a list of idea strings.
 * Returns { approved, rejected, reviews } and persists reviews to disk.
 */
export async function evaluateIdeas(ideas) {
  const list = Array.isArray(ideas) ? ideas.filter((i) => typeof i === "string" && i.trim()) : [];
  if (list.length === 0) {
    await log("warn", "No ideas provided to Product Quality Gate", {});
    return { approved: [], rejected: [], reviews: [] };
  }

  const existing = await loadExistingReviews();
  const newReviews = [];
  const approved = [];
  const rejected = [];

  for (const raw of list) {
    const idea = raw.trim();
    const scores = scoreIdea(idea);
    const review = {
      idea,
      evaluated_at: new Date().toISOString(),
      ...scores
    };
    newReviews.push(review);
    if (scores.accepted) approved.push(idea); else rejected.push(idea);
  }

  const all = existing.concat(newReviews);
  await saveReviews(all);
  await log("info", "Product Quality Gate evaluated ideas", { checked: list.length, approved: approved.length, rejected: rejected.length });

  return { approved, rejected, reviews: newReviews };
}
