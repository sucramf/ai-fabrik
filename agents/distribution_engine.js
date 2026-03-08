/**
 * DISTRIBUTION ENGINE – Automatic distribution content for every app built by the factory.
 *
 * For each app generates platform-ready content in:
 *   apps/<app_id>/distribution/   and   deploy/<app_id>/distribution/
 *
 * Files:
 *   - reddit_post.md       (Title, problem story, solution, soft CTA + target subreddits)
 *   - twitter_thread.md   (5-tweet thread: Hook, Problem, Solution, Demo, CTA)
 *   - indiehackers_post.md (Founder story: problem, why built, early results, ask for feedback)
 *   - producthunt_launch.md (Tagline, description, features, CTA)
 *
 * Logs: logs/distribution_engine.log
 */

import fs from "fs/promises";
import { AI_MODELS } from "../config/ai_models.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const LOGS_DIR = path.join(root, "logs");
const DISTRIBUTION_LOG = path.join(root, "logs", "distribution_engine.log");

const TARGET_SUBREDDITS = [
  "Entrepreneur",
  "SideProject",
  "Startups",
  "SaaS",
  "InternetIsBeautiful"
];

async function logDistribution(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(DISTRIBUTION_LOG, line, "utf-8").catch(() => {});
}

async function getAppContext(appId) {
  const appDir = path.join(APPS_DIR, appId);
  let spec = { product_name: appId, product_type: "micro_saas", features: [], value_proposition: "" };
  let idea = "";
  try {
    const specRaw = await fs.readFile(path.join(appDir, "spec.json"), "utf-8");
    spec = { ...spec, ...JSON.parse(specRaw) };
  } catch {
    // use defaults
  }
  try {
    idea = await fs.readFile(path.join(appDir, "idea.txt"), "utf-8");
    idea = (idea || "").trim();
  } catch {
    idea = spec.product_name || appId;
  }
  return { spec, idea };
}

/**
 * Generate distribution copy with OpenAI when available; else template fallbacks.
 */
async function generateWithAI(systemPrompt, userPrompt, fallback) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: AI_MODELS.generation,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.6
      });
      const text = (res.choices?.[0]?.message?.content || "").trim();
      if (text.length > 50) return text;
    } catch (e) {
      await logDistribution("OpenAI fallback: " + (e.message || String(e)));
    }
  }
  return fallback;
}

function buildRedditPost(idea, spec) {
  const name = spec.product_name || idea || "App";
  const valueProp = spec.value_proposition || `A simple tool for ${name}.`;
  const subredditsBlock = JSON.stringify({ subreddits: TARGET_SUBREDDITS }, null, 2);
  return `# ${name} – [Short hook that states the problem you solve]

## The problem

I kept running into [describe the pain: e.g. manual work, scattered tools, no simple way to X]. If you've ever had to [relatable scenario], you know how much time it eats.

## What we built

${valueProp}

We focused on one thing: [core benefit]. No bloat, no sign-up to try – just [main action]. It's the tool I wish existed when I was [target situation].

## Try it

If this sounds useful, you can try it here: [APP_URL]

---

Target subreddits:
${subredditsBlock}
`;
}

function buildTwitterThread(idea, spec) {
  const name = spec.product_name || idea || "App";
  const valueProp = spec.value_proposition || `Get things done with ${name}.`;
  return `Tweet 1 – Hook
We built ${name} because [one line problem]. Here's what it does 🧵

Tweet 2 – Problem
[2-3 sentences: the frustration, the time wasted, the "why isn't there a simple tool for this" moment.]

Tweet 3 – Solution
${valueProp}

Tweet 4 – Demo
[One line: "You just [action] and get [result]. No signup, no fluff."] Try it: [APP_URL]

Tweet 5 – CTA
If you need [core benefit], give ${name} a shot → [APP_URL]
Feedback welcome 🙏
`;
}

function buildIndieHackersPost(idea, spec) {
  const name = spec.product_name || idea || "App";
  const valueProp = spec.value_proposition || `A focused tool for ${name}.`;
  const features = Array.isArray(spec.features) ? spec.features : [];
  return `# Building ${name} – [one-line tagline]

## The problem

[2-3 sentences: what pain you had, who else has it, why existing options weren't enough.]

## Why we built it

${valueProp}

We wanted something that [core goal]: [feature 1], [feature 2], no sign-up to try.

## Early results

[Placeholder: early users, waitlist, or "Just launched – would love feedback."]

## Ask for feedback

If you're in [target audience] or have struggled with [problem], I'd love to hear what you think. Link in comments.
`;
}

function buildProductHuntLaunch(idea, spec) {
  const name = spec.product_name || idea || "App";
  const valueProp = spec.value_proposition || `Simple, focused ${name}.`;
  const features = Array.isArray(spec.features) ? spec.features : [];
  const featureList = features.length ? features.map((f) => `- ${f}`).join("\n") : `- Simple and focused\n- No sign-up to try\n- One clear job`;
  return `# Product Hunt Launch – ${name}

## Tagline
${name} – ${(valueProp || "").slice(0, 60)}${(valueProp || "").length > 60 ? "…" : ""}

## Description
${valueProp}

## Features
${featureList}

## CTA
Try it free → [APP_URL]
`;
}

/**
 * Run distribution engine for one app: generate and write all distribution content.
 * @param {string} appId
 * @returns {Promise<{ ok: boolean, files?: string[] }>}
 */
export async function runDistributionEngine(appId) {
  if (!appId || typeof appId !== "string") {
    await logDistribution("runDistributionEngine skipped: no appId");
    return { ok: false, files: [] };
  }
  const appDir = path.join(APPS_DIR, appId);
  try {
    await fs.access(appDir);
  } catch {
    await logDistribution("runDistributionEngine skipped: app dir not found " + appId);
    return { ok: false, files: [] };
  }

  const { spec, idea } = await getAppContext(appId);
  const distApp = path.join(APPS_DIR, appId, "distribution");
  const distDeploy = path.join(DEPLOY_DIR, appId, "distribution");
  await fs.mkdir(distApp, { recursive: true });
  await fs.mkdir(distDeploy, { recursive: true });

  const productName = spec.product_name || idea || appId;
  const valueProp = spec.value_proposition || "";

  const redditContent = await generateWithAI(
    "You write a Reddit post for a new product launch. Format: Title (one line), then '## The problem' (short story), then '## What we built' (solution), then '## Try it' (soft CTA with [APP_URL]). Output only the markdown, no preamble. End with a line '---' and then 'Target subreddits:' and a JSON block: {\"subreddits\": [\"Entrepreneur\", \"SideProject\", \"Startups\", \"SaaS\", \"InternetIsBeautiful\"]}.",
    `Product: ${productName}. Idea: ${idea}. Value: ${valueProp}. Write an authentic, non-salesy Reddit post.`,
    buildRedditPost(idea, spec)
  );

  const twitterContent = await generateWithAI(
    "You write a 5-tweet launch thread. Format: 'Tweet 1 – Hook', 'Tweet 2 – Problem', 'Tweet 3 – Solution', 'Tweet 4 – Demo', 'Tweet 5 – CTA'. Each tweet under 280 chars. Use [APP_URL] for link. Output only the text.",
    `Product: ${productName}. Value: ${valueProp}. Write a concise Twitter thread.`,
    buildTwitterThread(idea, spec)
  );

  const indieContent = await generateWithAI(
    "You write an Indie Hackers 'founder story' post. Sections: ## The problem, ## Why we built it, ## Early results, ## Ask for feedback. Authentic, short paragraphs. Output only the markdown.",
    `Product: ${productName}. Idea: ${idea}. Value: ${valueProp}. Write a founder-style post.`,
    buildIndieHackersPost(idea, spec)
  );

  const phContent = await generateWithAI(
    "You write Product Hunt launch copy. Sections: ## Tagline (one line), ## Description (2-3 sentences), ## Features (bullet list), ## CTA (Try it → [APP_URL]). Output only the markdown.",
    `Product: ${productName}. Value: ${valueProp}. Features: ${JSON.stringify(spec.features || [])}.`,
    buildProductHuntLaunch(idea, spec)
  );

  const files = [
    "reddit_post.md",
    "twitter_thread.md",
    "indiehackers_post.md",
    "producthunt_launch.md"
  ];

  await fs.writeFile(path.join(distApp, "reddit_post.md"), redditContent, "utf-8");
  await fs.writeFile(path.join(distApp, "twitter_thread.md"), twitterContent, "utf-8");
  await fs.writeFile(path.join(distApp, "indiehackers_post.md"), indieContent, "utf-8");
  await fs.writeFile(path.join(distApp, "producthunt_launch.md"), phContent, "utf-8");

  await fs.writeFile(path.join(distDeploy, "reddit_post.md"), redditContent, "utf-8");
  await fs.writeFile(path.join(distDeploy, "twitter_thread.md"), twitterContent, "utf-8");
  await fs.writeFile(path.join(distDeploy, "indiehackers_post.md"), indieContent, "utf-8");
  await fs.writeFile(path.join(distDeploy, "producthunt_launch.md"), phContent, "utf-8");

  const relPaths = files.flatMap((f) => [`apps/${appId}/distribution/${f}`, `deploy/${appId}/distribution/${f}`]);
  await logDistribution("Distribution content generated for " + appId);
  return { ok: true, files: relPaths };
}
