import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * PLATFORM POTENTIAL ANALYZER – Scores ideas for platform suitability.
 *
 * Export:
 *   - analyzePlatformPotential(ideas: string[]): Promise<{ scored: PlatformScore[], candidates: PlatformScore[] }>
 *
 * Evaluates each idea (0–100) on:
 *   - network_effects
 *   - multi_sided_market
 *   - expansion_opportunities
 *   - long_term_retention
 *
 * Ideas scoring >= 70 are treated as platform_candidates and appended to data/platform_candidates.json.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const CANDIDATES_PATH = path.join(DATA_DIR, "platform_candidates.json");

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "platform_analyzer.log");
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
    // ignore
  }
}

async function loadCandidates() {
  try {
    const raw = await fs.readFile(CANDIDATES_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveCandidates(candidates) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CANDIDATES_PATH, JSON.stringify(candidates, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write platform_candidates.json", { error: error.message });
  }
}

function scoreIdeaForPlatform(text) {
  const lower = text.toLowerCase();

  let network = 30;
  let multiSided = 30;
  let expansion = 30;
  let retention = 30;

  if (lower.includes("network") || lower.includes("community") || lower.includes("social")) {
    network += 25;
  }

  if (lower.includes("marketplace") || lower.includes("buyers and sellers") || lower.includes("creators and consumers")) {
    multiSided += 30;
  }

  if (lower.includes("api") || lower.includes("integrations") || lower.includes("ecosystem")) {
    expansion += 25;
  }

  if (lower.includes("subscription") || lower.includes("habit") || lower.includes("daily use")) {
    retention += 25;
  }

  const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));

  const scores = {
    network_effects: clamp(network),
    multi_sided_market: clamp(multiSided),
    expansion_opportunities: clamp(expansion),
    long_term_retention: clamp(retention),
  };

  const total = Math.round(
    scores.network_effects * 0.3 +
      scores.multi_sided_market * 0.3 +
      scores.expansion_opportunities * 0.2 +
      scores.long_term_retention * 0.2
  );

  return { ...scores, total_score: Math.max(0, Math.min(100, total)) };
}

export async function analyzePlatformPotential(ideas) {
  const list = Array.isArray(ideas)
    ? ideas.filter((i) => typeof i === "string" && i.trim())
    : [];

  if (list.length === 0) {
    await log("warn", "Platform Analyzer received no ideas", {});
    return { scored: [], candidates: [] };
  }

  const scored = [];
  const candidates = [];

  for (const raw of list) {
    const idea = raw.trim();
    const scores = scoreIdeaForPlatform(idea);
    const candidate = {
      idea,
      evaluated_at: new Date().toISOString(),
      ...scores,
      is_platform_candidate: scores.total_score >= 70,
    };
    scored.push(candidate);
    if (candidate.is_platform_candidate) {
      candidates.push(candidate);
    }
  }

  const existing = await loadCandidates();
  const merged = existing.concat(candidates);
  await saveCandidates(merged);

  await log("info", "Platform Analyzer evaluated ideas", {
    total: list.length,
    candidates: candidates.length,
  });

  return { scored, candidates };
}

async function selfTest() {
  const sample = [
    "Marketplace connecting creators and consumers with strong community features and API ecosystem",
    "One-off utility tool with no network effects",
  ];

  const result = await analyzePlatformPotential(sample);
  await log("info", "Platform Analyzer self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
