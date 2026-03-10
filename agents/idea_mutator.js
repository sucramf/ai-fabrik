import fs from "fs/promises";
import path from "path";

/**
 * IDEA MUTATOR – Generates variations of successful apps.
 *
 * Exports:
 *   - mutateIdeas(apps): Promise<{ mutations: any[] }>
 *
 * Mutations are stored in data/mutated_ideas.json.
 */

const root = process.cwd();
const DATA_DIR = path.join(root, "data");
const MUTATED_PATH = path.join(DATA_DIR, "mutated_ideas.json");

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "idea_mutator.log");
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

async function loadMutations() {
  try {
    const raw = await fs.readFile(MUTATED_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function saveMutations(list) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(MUTATED_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (error) {
    await log("error", "Failed to write mutated_ideas.json", { error: error.message });
  }
}

function createMutationsFromApp(app) {
  const name = app.name || "App";
  return [
    {
      type: "niche variation",
      description: `${name} for a narrow vertical market (e.g. agencies or clinics).`,
    },
    {
      type: "geographic variation",
      description: `${name} adapted for a specific region or language market.`,
    },
    {
      type: "industry variation",
      description: `${name} retargeted for another industry with similar workflows.`,
    },
  ];
}

export async function mutateIdeas(apps) {
  const list = Array.isArray(apps)
    ? apps.filter((a) => a && typeof a.name === "string")
    : [];

  if (list.length === 0) {
    await log("warn", "Idea Mutator received no apps", {});
    return { mutations: [] };
  }

  const existing = await loadMutations();
  const mutations = [];

  for (const app of list) {
    const variants = createMutationsFromApp(app).map((v) => ({
      app: app.name,
      variant_type: v.type,
      description: v.description,
      created_at: new Date().toISOString(),
    }));
    mutations.push(...variants);
  }

  const merged = existing.concat(mutations);
  await saveMutations(merged);
  await log("info", "Idea Mutator created variants", { count: mutations.length });

  return { mutations };
}

async function selfTest() {
  const result = await mutateIdeas([{ name: "Demo App" }]);
  await log("info", "Idea Mutator self-test", result);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(() => {});
}
