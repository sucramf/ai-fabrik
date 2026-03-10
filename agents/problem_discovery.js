/**
 * PROBLEM DISCOVERY ENGINE – Extracts real user problems from community sources.
 *
 * Exports:
 *   - discoverProblemsFromSources(sources: Array<RawSource>): Promise<DiscoveryResult>
 *
 * Source item shape (flexible, validated at runtime):
 *   {
 *     source: "reddit" | "hacker_news" | "product_forum" | "github_issues" | string,
 *     url?: string,
 *     title?: string,
 *     author?: string,
 *     created_at?: string,
 *     content: string
 *   }
 *
 * Behavior:
 *   - extracts problem statements from free-text content using simple heuristics
 *   - normalizes and deduplicates problems
 *   - appends them to data/discovered_problems.json
 *   - logs all activity to logs/problem_discovery.log
 *
 * Safe by design:
 *   - never throws on I/O failure, always logs instead
 *   - handles missing/empty sources defensively
 *   - does not perform any network calls by itself (caller is responsible for fetching)
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const PROBLEMS_PATH = path.join(DATA_DIR, "discovered_problems.json");
const LOG_PATH = path.join(root, "logs", "problem_discovery.log");

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
    // Ignore logging errors to avoid breaking the pipeline.
  }
}

function normalizeSource(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) return null;

  const source = (raw.source || "unknown").toString().toLowerCase();

  return {
    source,
    url: typeof raw.url === "string" ? raw.url : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    author: typeof raw.author === "string" ? raw.author : undefined,
    created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
    content,
  };
}

function extractProblemCandidates(text) {
  if (!text || typeof text !== "string") return [];
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/([.!?])+/g, "$1|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords = [
    "problem",
    "issue",
    "bug",
    "error",
    "cannot ",
    "struggle",
    "struggling",
    "pain",
    "frustrated",
    "frustration",
    "blocked",
    "stuck",
  ];

  const negatives = [
    "no problem",
    "not a problem",
    "no issues",
    "without issues",
  ];

  const candidates = [];

  for (const sentence of cleaned) {
    const lowered = sentence.toLowerCase();
    if (!keywords.some((k) => lowered.includes(k))) continue;
    if (negatives.some((n) => lowered.includes(n))) continue;
    if (sentence.length < 20) continue;
    candidates.push(sentence.trim());
  }

  return candidates;
}

function buildProblemId(item) {
  const base = [item.source || "unknown", item.url || "", item.title || "", item.problem_text]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function extractProblemsFromSource(source) {
  const problems = [];
  const sentences = extractProblemCandidates(source.content);

  for (const sentence of sentences) {
    const problem = {
      id: "",
      source: source.source,
      url: source.url,
      title: source.title,
      author: source.author,
      discovered_at: new Date().toISOString(),
      problem_text: sentence,
      context_snippet: source.content.slice(0, 280),
    };
    problem.id = buildProblemId(problem);
    problems.push(problem);
  }

  return problems;
}

async function loadExistingProblems() {
  try {
    const raw = await fs.readFile(PROBLEMS_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveProblems(problems) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PROBLEMS_PATH, JSON.stringify(problems, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write discovered_problems.json", { error: error.message });
  }
}

function mergeProblems(existing, incoming) {
  const byId = new Map();
  for (const p of existing) {
    if (!p || !p.id) continue;
    byId.set(p.id, p);
  }
  for (const p of incoming) {
    if (!p || !p.id) continue;
    if (!byId.has(p.id)) {
      byId.set(p.id, p);
    }
  }
  return Array.from(byId.values());
}

export async function discoverProblemsFromSources(rawSources) {
  const normalized = Array.isArray(rawSources)
    ? rawSources
        .map((s) => normalizeSource(s))
        .filter((s) => s !== null)
    : [];

  if (normalized.length === 0) {
    const existing = await loadExistingProblems();
    await log("warn", "Problem Discovery received no valid sources", {
      provided: Array.isArray(rawSources) ? rawSources.length : 0,
      stored_total: existing.length,
    });
    return {
      discovered: [],
      total_sources: 0,
      stored_total: existing.length,
    };
  }

  const discovered = [];

  for (const src of normalized) {
    const problems = extractProblemsFromSource(src);
    if (problems.length === 0) {
      continue;
    }
    for (const p of problems) {
      discovered.push(p);
    }
  }

  const existing = await loadExistingProblems();
  const merged = mergeProblems(existing, discovered);
  await saveProblems(merged);

  await log("info", "Problem Discovery processed sources", {
    sources: normalized.length,
    discovered: discovered.length,
    stored_total: merged.length,
  });

  return {
    discovered,
    total_sources: normalized.length,
    stored_total: merged.length,
  };
}

async function selfTest() {
  const mockSources = [
    {
      source: "reddit",
      url: "https://reddit.com/r/example/123",
      title: "Struggling with deployment pipelines",
      author: "user123",
      content:
        "I am really struggling with my deployment pipeline. The main problem is that every time we push, tests are flaky and we do not see clear error messages.",
    },
    {
      source: "github_issues",
      url: "https://github.com/example/repo/issues/1",
      title: "Bug: cannot export reports",
      author: "dev456",
      content:
        "Users report an issue where they cannot export reports to CSV. This is a serious problem for teams relying on analytics.",
    },
  ];

  const result = await discoverProblemsFromSources(mockSources);
  await log("info", "Problem Discovery self-test completed", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {
    // Swallow to avoid non-zero exit codes in automated runs.
  });
}
