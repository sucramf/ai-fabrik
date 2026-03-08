/**
 * IDEA INJECTOR – Converts trend opportunities into product ideas and writes to ideas/ideas.json.
 *
 * 1. Reads ideas/trend_opportunities.json (fallback: data/trend_opportunities.json).
 * 2. Extracts idea strings from each opportunity.
 * 3. Scores each idea (market_size, competition, technical_difficulty, monetization_potential).
 * 4. Keeps only ideas above score threshold (default 60).
 * 5. Appends to ideas/ideas.json (no duplicates, max 50), output as array of strings.
 *
 * Failsafe: If trend_opportunities.json is missing or parsing fails, logs warning and leaves ideas.json unchanged.
 * Run after trend_scanner in daemon cycle.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const IDEAS_DIR = path.join(root, "ideas");
const LOGS_DIR = path.join(root, "logs");
const TREND_OPPORTUNITIES_PRIMARY = path.join(root, "ideas", "trend_opportunities.json");
const TREND_OPPORTUNITIES_FALLBACK = path.join(root, "data", "trend_opportunities.json");
const IDEAS_FILE = path.join(root, "ideas", "ideas.json");
const INJECTOR_LOG_PATH = path.join(root, "logs", "idea_injector.log");
const MAX_IDEAS = 50;
const SCORE_THRESHOLD = 60;

/** Structured log: writes to logs/idea_injector.log (same format as PHASE 1 pipeline log). */
async function injectorLog(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data !== null && data !== undefined
    ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
    : { level, message };
  const extra = typeof payload === "object" && payload.message
    ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
    : {};
  const line = ts + " [" + (level || "info").toUpperCase() + "] " + (payload.message || message) + (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");
  try {
    await fs.mkdir(path.dirname(INJECTOR_LOG_PATH), { recursive: true });
    await fs.appendFile(INJECTOR_LOG_PATH, line + "\n", "utf-8");
  } catch {
    // ignore
  }
}

/** Normalize idea string for duplicate check: lowercase, trim, collapse spaces. Use title part before " – " so "Title – desc" and "Title" match. */
function normalizeIdea(str) {
  if (str == null || typeof str !== "string") return "";
  const s = str.trim().split(/\s*–\s*/)[0].trim();
  return s.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Load trend opportunities. Failsafe: on missing file or parse error returns null (caller must not write ideas.json).
 * @returns {Promise<{ list: Array, error?: string }>}
 */
async function loadTrendOpportunitiesSafe() {
  let raw;
  try {
    raw = await fs.readFile(TREND_OPPORTUNITIES_PRIMARY, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") {
      try {
        raw = await fs.readFile(TREND_OPPORTUNITIES_FALLBACK, "utf-8");
      } catch (e2) {
        if (e2.code === "ENOENT") {
          await injectorLog("warn", "trend_opportunities.json missing (ideas/ and data/)", {});
          return { list: [], error: "missing" };
        }
        await injectorLog("warn", "Failed to read trend opportunities", { error: e2.message });
        return { list: [], error: e2.message };
      }
    } else {
      await injectorLog("warn", "Failed to read trend opportunities", { error: e.message });
      return { list: [], error: e.message };
    }
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    await injectorLog("warn", "trend_opportunities.json parse failed; leaving ideas.json unchanged", { error: e.message });
    return { list: [], error: "parse_failed" };
  }

  const list = Array.isArray(data) ? data : (data?.opportunities || data?.items || []);
  if (!Array.isArray(list)) {
    await injectorLog("warn", "trend_opportunities.json has no array; leaving ideas.json unchanged", {});
    return { list: [], error: "no_array" };
  }
  return { list: [...list].reverse() };
}

/**
 * Score an opportunity (0–100) from market_size, competition, technical_difficulty, monetization_potential.
 * Uses heuristics from potential, description, source when explicit fields absent.
 */
function scoreOpportunity(opp) {
  const potential = (opp.potential || opp.score || "").toString().toLowerCase();
  const desc = (opp.description || "").toLowerCase();
  const source = (opp.source || "").toLowerCase();

  // monetization_potential: high=25, medium=15, low=5
  let monetization = 15;
  if (potential === "high" || desc.includes("saas") || desc.includes("revenue")) monetization = 25;
  else if (potential === "low") monetization = 5;

  // market_size: infer from description length and keywords
  let market_size = 15;
  if (desc.includes("freelancer") || desc.includes("team") || desc.includes("startup") || desc.length > 80) market_size = 22;
  if (desc.includes("indie") || desc.includes("niche")) market_size = 18;

  // competition: lower competition = higher score (simplified: assume medium)
  const competition = 15;

  // technical_difficulty: simpler description = easier = higher score
  let technical_difficulty = 15;
  if (desc.length < 60 && !desc.includes("api") && !desc.includes("integration")) technical_difficulty = 22;
  else if (desc.length > 120) technical_difficulty = 10;

  const score = Math.min(100, Math.round(monetization + market_size + (25 - competition) + technical_difficulty));
  return score;
}

/**
 * Convert one opportunity to a simple idea string (title only for clarity).
 */
function opportunityToIdeaString(opp) {
  const title = (opp.trend || opp.title || "Unnamed product").trim();
  return title || null;
}

/**
 * Run idea injection: read trend opportunities, score, filter, dedupe, append to ideas/ideas.json (strings only).
 * @returns {Promise<{ ok: boolean, injected: number, total: number, extracted?: number, error?: string }>}
 */
export async function runIdeaInjector() {
  await injectorLog("info", "Idea injector start", {});

  const { list: opportunities, error: loadError } = await loadTrendOpportunitiesSafe();
  if (loadError && opportunities.length === 0) {
    await injectorLog("warn", "Idea injector exiting without writing; existing ideas.json unchanged", { reason: loadError });
    return { ok: true, injected: 0, total: 0, extracted: 0 };
  }

  const scored = [];
  for (let i = 0; i < opportunities.length; i++) {
    const ideaStr = opportunityToIdeaString(opportunities[i]);
    if (!ideaStr || !normalizeIdea(ideaStr)) continue;
    const score = scoreOpportunity(opportunities[i]);
    if (score < SCORE_THRESHOLD) continue;
    scored.push({ idea: ideaStr, score });
  }

  const extracted = scored.length;
  await injectorLog("info", "Ideas extracted from trend opportunities", { extracted, aboveThreshold: SCORE_THRESHOLD });

  let existingStrings = [];
  try {
    const raw = await fs.readFile(IDEAS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    existingStrings = arr.map((item) => {
      let s;
      if (typeof item === "string") s = item.trim();
      else if (item && typeof item === "object") s = String(item.name || item.idea_title || item.title || item.idea || "").trim();
      else s = "";
      if (!s) return "";
      const titleOnly = s.split(/\s*–\s*/)[0].trim();
      return titleOnly || s;
    }).filter(Boolean);
  } catch (e) {
    if (e.code !== "ENOENT") {
      await injectorLog("error", "Error reading ideas/ideas.json; not overwriting", { error: e.message });
      return { ok: false, injected: 0, total: 0, extracted };
    }
  }

  const existingSet = new Set(existingStrings.map(normalizeIdea).filter(Boolean));
  const toAppend = [];
  for (const { idea } of scored) {
    const key = normalizeIdea(idea);
    if (!key || existingSet.has(key)) continue;
    existingSet.add(key);
    toAppend.push(idea);
  }

  const merged = [...existingStrings, ...toAppend];
  const capped = merged.slice(0, MAX_IDEAS);
  await fs.mkdir(IDEAS_DIR, { recursive: true });
  await fs.writeFile(IDEAS_FILE, JSON.stringify(capped, null, 2), "utf-8");

  await injectorLog("info", "Ideas written to ideas/ideas.json", {
    written: capped.length,
    injected: toAppend.length,
    dropped: merged.length - capped.length
  });

  return {
    ok: true,
    injected: toAppend.length,
    total: capped.length,
    extracted
  };
}
