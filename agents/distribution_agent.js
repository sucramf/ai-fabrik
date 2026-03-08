/**
 * DISTRIBUTION AGENT – Generate marketing and distribution content for each product.
 *
 * Creates distribution/<appId>.md with structured content for SEO, launch posts, and directory submissions.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DISTRIBUTION_DIR = path.join(root, "distribution");

/**
 * Load product context from apps/<appId>/spec.json and idea.txt.
 * @param {string} appId
 * @returns {Promise<{ productName: string, description: string, valueProposition: string, features: string[], targetUser: string }>}
 */
async function loadAppContext(appId) {
  const appDir = path.join(APPS_DIR, appId);
  let productName = appId.replace(/^app_/, "App ").replace(/_/g, " ");
  let description = "";
  let valueProposition = "";
  let features = [];
  let targetUser = "";

  try {
    const specPath = path.join(appDir, "spec.json");
    const raw = await fs.readFile(specPath, "utf-8");
    const spec = JSON.parse(raw);
    productName = spec.product_name || productName;
    valueProposition = spec.value_proposition || spec.core_problem || "";
    targetUser = spec.target_user || "";
    if (Array.isArray(spec.features) && spec.features.length > 0) {
      features = spec.features.slice(0, 6).map((f) => (typeof f === "string" ? f : String(f)).trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  if (!description) {
    try {
      const ideaPath = path.join(appDir, "idea.txt");
      description = await fs.readFile(ideaPath, "utf-8").then((s) => s.trim());
    } catch {
      // ignore
    }
  }
  if (!description) description = valueProposition || `${productName} – a focused tool to get the job done.`;

  if (features.length === 0) {
    features = [
      "Simple, focused interface",
      "No signup required to try",
      "Works in the browser"
    ];
  }

  return { productName, description, valueProposition, features, targetUser };
}

/**
 * Build markdown content for distribution/<appId>.md.
 */
function buildMarkdown(ctx) {
  const { productName, description, valueProposition, features, targetUser } = ctx;
  const lines = [
    `# ${productName}`,
    "",
    description,
    "",
    "## What it does",
    "",
    valueProposition || `This app helps you accomplish a specific task quickly and clearly.`,
    "",
    "## Features",
    "",
    ...features.map((f) => `- ${f}`),
    "",
    "## Who it is for",
    "",
    targetUser || "Anyone who needs a simple, focused tool for this task.",
    "",
    "## Why it is useful",
    "",
    valueProposition || `It saves time and keeps the workflow straightforward.`,
    "",
    "## Try it",
    "",
    "Use the app to see the value yourself – no signup required. Perfect for trying before committing.",
    ""
  ];
  return lines.join("\n");
}

/**
 * Generate distribution/<appId>.md for the given app. Overwrites if exists.
 * @param {string} appId - App directory name (e.g. app_123)
 * @returns {Promise<{ ok: boolean, path?: string }>}
 */
export async function runDistribution(appId) {
  try {
    await fs.mkdir(DISTRIBUTION_DIR, { recursive: true });
  } catch (e) {
    return { ok: false };
  }

  const safeId = (appId || "").toString().replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  if (!safeId) return { ok: false };

  const ctx = await loadAppContext(appId);
  const markdown = buildMarkdown(ctx);
  const filePath = path.join(DISTRIBUTION_DIR, `${safeId}.md`);

  try {
    await fs.writeFile(filePath, markdown, "utf-8");
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false };
  }
}
