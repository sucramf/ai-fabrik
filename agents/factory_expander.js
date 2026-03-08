/**
 * FACTORY EXPANDER – Create new factory instances when a product becomes a strong winner.
 *
 * Winner definition (any one):
 *   - revenue > 1000
 *   - users > 10000
 *   - growth > 30%
 *
 * Reads: data/metrics/<app_id>.json
 * When winner detected: creates factories/<factory_id>/ with structure and core files.
 * Seeds ideas/ideas.json with category-specialized ideas.
 * Prevents duplicates: if factory already exists for the niche, skip.
 *
 * Logs: logs/factory_expansion.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const DATA_METRICS_DIR = path.join(root, "data", "metrics");
const APPS_DIR = path.join(root, "apps");
const FACTORIES_DIR = path.join(root, "factories");
const LOGS_DIR = path.join(root, "logs");
const EXPANSION_LOG = path.join(root, "logs", "factory_expansion.log");

const REVENUE_WINNER = 1000;
const USERS_WINNER = 10000;
const GROWTH_WINNER = 30;

const CATEGORY_KEYWORDS = {
  resume: ["resume", "cv", "job application", "cover letter", "interview", "career"],
  finance: ["finance", "budget", "money", "expense", "investment", "tax", "invoice"],
  productivity: ["productivity", "todo", "task", "time", "schedule", "organize", "workflow"],
  education: ["education", "learn", "course", "quiz", "study", "training", "tutorial"],
  health: ["health", "fitness", "meditation", "habit", "wellness", "tracker"],
  tools: ["tool", "generator", "calculator", "converter", "analyzer", "builder"]
};

const SEED_IDEAS_BY_CATEGORY = {
  resume: [
    "advanced AI resume optimizer",
    "AI job application automation",
    "AI cover letter generator",
    "AI interview simulator",
    "resume ATS checker",
    "career path recommender",
    "linkedin profile optimizer"
  ],
  finance: [
    "personal budget tracker with forecasts",
    "invoice generator for freelancers",
    "expense categorization with AI",
    "simple tax estimator",
    "subscription cost tracker",
    "savings goal calculator"
  ],
  productivity: [
    "daily focus timer with analytics",
    "task prioritization with Eisenhower matrix",
    "meeting notes summarizer",
    "habit streak tracker",
    "project timeline visualizer",
    "email draft writer"
  ],
  education: [
    "flashcard generator from text",
    "quiz builder for educators",
    "learning path recommender",
    "spaced repetition scheduler",
    "course outline generator"
  ],
  health: [
    "habit tracker with reminders",
    "water intake logger",
    "sleep quality tracker",
    "quick meditation timer",
    "workout logger"
  ],
  tools: [
    "document format converter",
    "batch text processor",
    "data extractor from text",
    "template-based generator",
    "simple API tester"
  ]
};

async function logExpansion(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(EXPANSION_LOG, line, "utf-8").catch(() => {});
}

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "app";
}

/**
 * Detect category from product name / idea. Returns category key or "tools".
 */
function detectCategory(productName, idea) {
  const combined = `${productName || ""} ${idea || ""}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) return cat;
  }
  return "tools";
}

/**
 * Derive factory_id from app (product name / idea). E.g. "AI Resume Builder" -> factory_ai_resume_builder.
 */
function deriveFactoryId(productName, idea) {
  const name = (productName || idea || "factory").trim();
  const slug = slugify(name);
  return "factory_" + (slug || "niche");
}

function isWinner(metrics) {
  const revenue = Number(metrics?.revenue) || 0;
  const users = Number(metrics?.users) || 0;
  const growth = Number(metrics?.growth) || 0;
  return revenue > REVENUE_WINNER || users > USERS_WINNER || growth > GROWTH_WINNER;
}

async function getAppProductName(appId) {
  const specPath = path.join(APPS_DIR, appId, "spec.json");
  const ideaPath = path.join(APPS_DIR, appId, "idea.txt");
  let productName = "";
  let idea = "";
  try {
    const raw = await fs.readFile(specPath, "utf-8");
    const spec = JSON.parse(raw);
    productName = spec.product_name || "";
  } catch {
    // ignore
  }
  try {
    idea = await fs.readFile(ideaPath, "utf-8");
    idea = (idea || "").trim();
  } catch {
    // ignore
  }
  return { productName, idea };
}

async function readMetrics(appId) {
  const file = path.join(DATA_METRICS_DIR, `${appId}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Copy a file or directory recursively. Uses fs.cp when available (Node 16.7+).
 */
async function copyRecursive(src, dest) {
  const stat = await fs.stat(src).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      await copyRecursive(path.join(src, e.name), path.join(dest, e.name));
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

/**
 * Create a new factory at factories/<factory_id>/ with structure and core files.
 */
async function createFactory(factoryId, category) {
  const base = path.join(FACTORIES_DIR, factoryId);
  try {
    await fs.access(base);
    return { created: false, path: base };
  } catch {
    // dir does not exist, create
  }

  await fs.mkdir(path.join(base, "apps"), { recursive: true });
  await fs.mkdir(path.join(base, "data"), { recursive: true });
  await fs.mkdir(path.join(base, "ideas"), { recursive: true });
  await fs.mkdir(path.join(base, "deploy"), { recursive: true });
  await fs.mkdir(path.join(base, "logs"), { recursive: true });

  const coreDirs = ["agents", "builders"];
  for (const dir of coreDirs) {
    const src = path.join(root, dir);
    const dest = path.join(base, dir);
    try {
      await fs.access(src);
      await copyRecursive(src, dest);
    } catch (e) {
      await logExpansion("Copy failed " + dir + ": " + (e.message || String(e)));
    }
  }

  const coreFiles = [
    { from: "superchief_daemon.js", to: "superchief_daemon.js" },
    { from: "MASTER_MAP.md", to: "MASTER_MAP.md" },
    { from: "AI_FABRIK_CONTEXT.md", to: "AI_FABRIK_CONTEXT.md" }
  ];
  for (const { from: f, to: t } of coreFiles) {
    const src = path.join(root, f);
    const dest = path.join(base, t);
    try {
      await fs.copyFile(src, dest);
    } catch (e) {
      await logExpansion("Copy file failed " + f + ": " + (e.message || String(e)));
    }
  }

  const seedIdeas = SEED_IDEAS_BY_CATEGORY[category] || SEED_IDEAS_BY_CATEGORY.tools;
  const ideasPath = path.join(base, "ideas", "ideas.json");
  await fs.writeFile(ideasPath, JSON.stringify(seedIdeas, null, 2), "utf-8");

  await logExpansion("New factory created: " + factoryId);
  return { created: true, path: base };
}

/**
 * Main entry: scan data/metrics for winner apps, create factory per winner niche (no duplicate factory_id).
 */
export async function runFactoryExpander() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(DATA_METRICS_DIR, { recursive: true });

  let metricFiles = [];
  try {
    metricFiles = await fs.readdir(DATA_METRICS_DIR);
  } catch {
    return { ok: true, winners: 0, factoriesCreated: 0 };
  }

  const appIds = metricFiles
    .filter((f) => f.endsWith(".json") && f.startsWith("app_"))
    .map((f) => path.basename(f, ".json"));

  const winners = [];
  for (const appId of appIds) {
    const metrics = await readMetrics(appId);
    if (!isWinner(metrics)) continue;
    const { productName, idea } = await getAppProductName(appId);
    const category = detectCategory(productName, idea);
    const factoryId = deriveFactoryId(productName, idea);
    winners.push({ appId, factoryId, category, productName, idea });
  }

  let factoriesCreated = 0;
  for (const w of winners) {
    const factoryPath = path.join(FACTORIES_DIR, w.factoryId);
    try {
      await fs.access(factoryPath);
      await logExpansion("Factory already exists for niche, skip: " + w.factoryId);
      continue;
    } catch {
      // does not exist, create
    }
    const result = await createFactory(w.factoryId, w.category);
    if (result.created) factoriesCreated++;
  }

  return { ok: true, winners: winners.length, factoriesCreated };
}
