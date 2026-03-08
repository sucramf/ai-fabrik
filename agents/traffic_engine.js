/**
 * TRAFFIC ENGINE – Automatic SEO/traffic assets for every app built by the factory.
 *
 * For each app in apps/<app_id>:
 *   - apps/<app_id>/seo/   and   deploy/<app_id>/seo/
 *     - keywords.json   (10 long-tail keywords)
 *     - meta.json       (title, description, keywords)
 *     - landing_page.html (headline, features, CTA, meta tags)
 *     - blog_post.md    (1500–2000 word SEO article)
 *
 * Logs: logs/traffic_engine.log
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { AI_MODELS } from "../config/ai_models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const LOGS_DIR = path.join(root, "logs");
const TRAFFIC_LOG = path.join(root, "logs", "traffic_engine.log");

async function logTraffic(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(TRAFFIC_LOG, line, "utf-8").catch(() => {});
}

/**
 * Load app context: spec.json + idea.txt.
 */
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
 * Generate 10 long-tail keywords from app idea/spec. Uses OpenAI if available; else heuristic.
 */
async function generateKeywords(idea, spec) {
  const productName = spec.product_name || idea || "app";
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: AI_MODELS.generation,
        messages: [
          {
            role: "system",
            content: "You output only valid JSON. Generate exactly 10 long-tail SEO keywords (phrases users would search) for the given product. Return JSON: { \"keywords\": [ \"phrase 1\", \"phrase 2\", ... ] }. No other text."
          },
          {
            role: "user",
            content: `Product: ${productName}. Idea: ${idea}. Type: ${spec.product_type || "tool"}. Generate 10 long-tail search keywords.`
          }
        ],
        temperature: 0.6
      });
      const raw = (res.choices?.[0]?.message?.content || "").trim().replace(/^```json?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10) : [];
      if (list.length >= 5) return list.map((k) => String(k).trim()).filter(Boolean);
    } catch (e) {
      await logTraffic("generateKeywords OpenAI fallback: " + (e.message || String(e)));
    }
  }
  // Heuristic fallback
  const base = productName.toLowerCase().replace(/\s+/g, " ");
  const words = base.split(/\s+/).filter(Boolean);
  const templates = [
    `${base} free`,
    `${base} online`,
    `best ${base}`,
    `free ${base} tool`,
    `${base} generator`,
    `create ${base}`,
    `${words[0] || base} tool`,
    `online ${base}`,
    `${base} no sign up`,
    `${base} app`
  ];
  return templates.slice(0, 10);
}

/**
 * Build meta.json (title, description, keywords array).
 */
function buildMeta(idea, spec, keywords) {
  const title = spec.product_name || idea || "App";
  const desc = spec.value_proposition || `Use ${title} – simple, focused tool.`;
  return {
    title: title.length > 60 ? title.slice(0, 57) + "..." : title,
    description: (desc.length > 160 ? desc.slice(0, 157) + "..." : desc).replace(/"/g, "'"),
    keywords: Array.isArray(keywords) ? keywords.slice(0, 10) : []
  };
}

/**
 * Build landing_page.html from meta + spec. CTA links to app (relative app.html in deploy).
 */
function buildLandingPage(meta, spec, appId) {
  const title = meta.title || spec.product_name || "App";
  const desc = meta.description || "";
  const keywordsMeta = (meta.keywords || []).slice(0, 10).join(", ");
  const features = Array.isArray(spec.features) ? spec.features : [];
  const appUrl = "app.html";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta name="keywords" content="${escapeHtml(keywordsMeta)}" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; line-height: 1.6; }
    .container { max-width: 42rem; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin: 0 0 1rem; }
    .lead { color: #94a3b8; margin-bottom: 1.5rem; }
    ul { padding-left: 1.25rem; margin: 1rem 0; }
    .cta { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #6366f1; color: #fff; text-decoration: none; border-radius: 0.5rem; font-weight: 600; }
    .cta:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(desc)}</p>
    <ul>
      ${features.map((f) => `<li>${escapeHtml(String(f))}</li>`).join("\n      ")}
    </ul>
    <a href="${escapeHtml(appUrl)}" class="cta">Try ${escapeHtml(title)}</a>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate 1500–2000 word SEO blog post. Uses OpenAI if available; else short template.
 */
async function generateBlogPost(idea, spec, keywords) {
  const productName = spec.product_name || idea || "App";
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.trim()) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const kwList = (keywords || []).slice(0, 10).join(", ");
      const res = await openai.chat.completions.create({
        model: AI_MODELS.generation,
        messages: [
          {
            role: "system",
            content: "You are an SEO content writer. Write a single markdown article (1500–2000 words) that targets the given keywords naturally. Use headings (##, ###), short paragraphs, and a clear structure. Output only the markdown, no preamble."
          },
          {
            role: "user",
            content: `Product: ${productName}. Value: ${spec.value_proposition || "N/A"}. Target keywords: ${kwList}. Write a helpful, informative SEO article that would rank for these terms. Length: 1500–2000 words. Markdown only.`
          }
        ],
        temperature: 0.5
      });
      const md = (res.choices?.[0]?.message?.content || "").trim();
      if (md.length >= 800) return md;
    } catch (e) {
      await logTraffic("generateBlogPost OpenAI fallback: " + (e.message || String(e)));
    }
  }
  const kwList = (keywords || []).slice(0, 5);
  return `# ${productName}: A Quick Guide

${spec.value_proposition || `Learn how ${productName} can help you.`}

## What Is ${productName}?

${productName} is a focused tool that solves a specific problem. Whether you're looking for ${kwList[0] || "a simple solution"} or ${kwList[1] || "an easy way to get started"}, this app is designed to be straightforward and effective.

## Key Benefits

- **Simple to use** – Get started in minutes.
- **No fluff** – Built to do one thing well.
- **Always available** – Use it when you need it.

## Who Is It For?

If you've ever searched for ${kwList[2] || "a tool like this"} or wanted ${kwList[3] || "something that just works"}, ${productName} is for you.

## Try It

Ready to see what ${productName} can do? Use the app and see the results for yourself. No sign-up required to get started.
`;
}

/**
 * Run traffic engine for one app: generate and write all SEO assets to apps/<id>/seo and deploy/<id>/seo.
 * @param {string} appId - e.g. app_1772878246712_7696
 * @returns {Promise<{ ok: boolean, files?: string[] }>}
 */
export async function runTrafficEngine(appId) {
  if (!appId || typeof appId !== "string") {
    await logTraffic("runTrafficEngine skipped: no appId");
    return { ok: false, files: [] };
  }
  const appDir = path.join(APPS_DIR, appId);
  try {
    await fs.access(appDir);
  } catch {
    await logTraffic("runTrafficEngine skipped: app dir not found " + appId);
    return { ok: false, files: [] };
  }

  const { spec, idea } = await getAppContext(appId);
  const seoApp = path.join(APPS_DIR, appId, "seo");
  const seoDeploy = path.join(DEPLOY_DIR, appId, "seo");
  await fs.mkdir(seoApp, { recursive: true });
  await fs.mkdir(seoDeploy, { recursive: true });

  const keywords = await generateKeywords(idea, spec);
  const keywordsPayload = { keywords };
  const meta = buildMeta(idea, spec, keywords);
  const landingHtml = buildLandingPage(meta, spec, appId);
  const blogMd = await generateBlogPost(idea, spec, keywords);

  const files = [
    path.join(seoApp, "keywords.json"),
    path.join(seoApp, "meta.json"),
    path.join(seoApp, "landing_page.html"),
    path.join(seoApp, "blog_post.md")
  ];

  await fs.writeFile(path.join(seoApp, "keywords.json"), JSON.stringify(keywordsPayload, null, 2), "utf-8");
  await fs.writeFile(path.join(seoApp, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
  await fs.writeFile(path.join(seoApp, "landing_page.html"), landingHtml, "utf-8");
  await fs.writeFile(path.join(seoApp, "blog_post.md"), blogMd, "utf-8");

  await fs.writeFile(path.join(seoDeploy, "keywords.json"), JSON.stringify(keywordsPayload, null, 2), "utf-8");
  await fs.writeFile(path.join(seoDeploy, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
  await fs.writeFile(path.join(seoDeploy, "landing_page.html"), landingHtml, "utf-8");
  await fs.writeFile(path.join(seoDeploy, "blog_post.md"), blogMd, "utf-8");

  const relPaths = [
    `apps/${appId}/seo/keywords.json`,
    `apps/${appId}/seo/meta.json`,
    `apps/${appId}/seo/landing_page.html`,
    `apps/${appId}/seo/blog_post.md`,
    `deploy/${appId}/seo/keywords.json`,
    `deploy/${appId}/seo/meta.json`,
    `deploy/${appId}/seo/landing_page.html`,
    `deploy/${appId}/seo/blog_post.md`
  ];
  await logTraffic("Traffic assets generated for " + appId);
  return { ok: true, files: relPaths };
}
