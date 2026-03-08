/**
 * GROWTH EXECUTION AGENT – Execute planned growth experiments by generating marketing assets.
 *
 * Reads growth/growth_experiments.json, generates marketing/<appId>/<experiment_type>.md for each "planned" experiment,
 * then updates status to "prepared". Assets are ready for manual or automated posting.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const GROWTH_DIR = path.join(root, "growth");
const MARKETING_DIR = path.join(root, "marketing");
const EXPERIMENTS_FILE = path.join(root, "growth", "growth_experiments.json");

function slugifyExperimentType(experimentType) {
  return (experimentType || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .slice(0, 60) || "experiment";
}

async function getProductName(appId) {
  const appDir = path.join(APPS_DIR, appId);
  try {
    const raw = await fs.readFile(path.join(appDir, "spec.json"), "utf-8");
    const spec = JSON.parse(raw);
    return spec.product_name || appId;
  } catch {
    try {
      return await fs.readFile(path.join(appDir, "idea.txt"), "utf-8").then((s) => s.trim()) || appId;
    } catch {
      return appId;
    }
  }
}

/**
 * Generate marketing content body by experiment type. Product name and appId are filled in.
 */
function generateContentByType(experimentType, productName, appId) {
  const cta = `Try ${productName} – no signup required. [Use the app](/${appId}/) to see the value yourself.`;
  const type = (experimentType || "").toLowerCase();

  if (type.includes("seo") || type.includes("landing")) {
    return `## SEO landing page copy\n\nHeadline: ${productName} – [benefit in one line]\n\nMeta description (155 chars): Get [benefit]. ${productName} helps you [core action]. Try free, no signup.\n\nH1: ${productName}\n\nIntro paragraph: [2–3 sentences on the problem and how ${productName} solves it. Include primary keyword naturally.]\n\nFeatures section: [3 bullet points with subheadings]\n\n## Call to action\n\n${cta}`;
  }
  if (type.includes("reddit")) {
    return `## Reddit post (helpful, non-promotional)\n\nTitle: [Question or tip that relates to what the product does, e.g. "How do you usually do X?"]\n\nBody: [Share a genuine tip or observation. In the last line, mention you built a small tool for this: "I made a simple tool to do X – link in comments if anyone wants to try it."]\n\nComment (link): ${productName}: [short URL or path /${appId}/]\n\n## Call to action\n\n${cta}`;
  }
  if (type.includes("product hunt")) {
    return `## Product Hunt launch\n\nTagline: [One line, under 60 chars]\n\nDescription: [2–3 sentences. What it does, who it's for, why now.]\n\nFirst comment: Thanks for the support! [One sentence on what you'd love people to try first.] Link: /${appId}/\n\n## Call to action\n\n${cta}`;
  }
  if (type.includes("blog")) {
    return `## Blog article outline\n\nTitle: How to [achieve outcome] with [method] – ${productName} guide\n\nIntro: [Problem + promise of the post]\n\nSteps: 1) [Step one] 2) [Step two] 3) [Step three – use ${productName} here]\n\nSection: Why ${productName} helps – [2 short paragraphs]\n\nConclusion + CTA: [Recap and invite to try the tool]\n\n## Call to action\n\n${cta}`;
  }
  if (type.includes("short-form") || type.includes("video")) {
    return `## Short-form video script (30–60 sec)\n\nHook (0–3 sec): [Question or bold claim]\n\nProblem (3–15 sec): [One sentence]\n\nDemo (15–45 sec): [Show ${productName} – "You do X, you get Y."]\n\nCTA (45–60 sec): "Link in bio" / "Try it free – link below"\n\n## Call to action\n\n${cta}`;
  }
  if (type.includes("directory")) {
    return `## Directory submission\n\nProduct name: ${productName}\n\nOne-liner: [What it does in one sentence]\n\nDescription: [2–3 sentences. Problem, solution, who it's for.]\n\nCategory: [e.g. Productivity, Developer Tools]\n\nLink: /${appId}/\n\n## Call to action\n\n${cta}`;
  }

  return `## Content\n\n[Marketing content for: ${experimentType}]\n\nProduct: ${productName}\n\n## Call to action\n\n${cta}`;
}

/**
 * Build full markdown asset content.
 */
function buildAssetMarkdown(appId, experimentType, productName, content) {
  return [
    "# Marketing Asset",
    "",
    `Product: ${appId}`,
    `Experiment: ${experimentType}`,
    "",
    "## Content",
    "",
    content,
    "",
    "---",
    "",
    "Call to action: Try the product – no signup required.",
    ""
  ].join("\n");
}

/**
 * Run growth execution: read experiments, for each "planned" generate asset, write to marketing/<appId>/<type>.md, set status to "prepared", save.
 * @returns {Promise<{ ok: boolean, executed: number }>}
 */
export async function runGrowthExecution() {
  await fs.mkdir(MARKETING_DIR, { recursive: true });

  let list = [];
  try {
    const raw = await fs.readFile(EXPERIMENTS_FILE, "utf-8");
    const data = JSON.parse(raw);
    list = Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, executed: 0 };
    return { ok: false, executed: 0 };
  }

  const planned = list.filter((e) => e && e.status === "planned");
  let executed = 0;

  for (const exp of planned) {
    const appId = exp.appId;
    const experimentType = exp.experiment_type || "experiment";
    if (!appId) continue;

    try {
      const productName = await getProductName(appId);
      const content = generateContentByType(experimentType, productName, appId);
      const fullMarkdown = buildAssetMarkdown(appId, experimentType, productName, content);

      const appMarketingDir = path.join(MARKETING_DIR, appId);
      await fs.mkdir(appMarketingDir, { recursive: true });

      const filename = slugifyExperimentType(experimentType) + ".md";
      const filePath = path.join(appMarketingDir, filename);
      await fs.writeFile(filePath, fullMarkdown, "utf-8");

      exp.status = "prepared";
      executed++;
    } catch (e) {
      console.warn("[growth_execution] Skip experiment", appId, experimentType, e.message);
    }
  }

  if (executed > 0) {
    try {
      await fs.writeFile(EXPERIMENTS_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.warn("[growth_execution] Could not update experiments file:", e.message);
    }
  }

  return { ok: true, executed };
}
