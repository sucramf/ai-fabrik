/**
 * PRODUCT ARCHITECT – Converts a raw idea into a structured product specification
 * before any code is generated. Used to align workers and pipeline with a clear spec.
 *
 * Quality goal: Duolingo / Hemnet / Monkey Island scope – focused, high-quality products.
 * NOT: massive platforms, MMO-scale systems, low-effort spam tools.
 *
 * Input: { idea_title, idea_description }
 * Output: Product spec (product_name, product_type, target_user, features, pages, tech_stack, etc.)
 */

import { AI_MODELS } from "../config/ai_models.js";

/** Allowed product categories – specs must use only these. */
const ALLOWED_PRODUCT_CATEGORIES = [
  "web app",
  "mobile app",
  "desktop app",
  "browser game",
  "casual web game",
  "SaaS micro-product",
  "focused platform",
  "specialized productivity tool",
  "niche consumer app",
  "content or learning product"
];

/** Normalized keys for lookup (lowercase, spaces → underscores). */
const ALLOWED_NORMALIZED = new Set(
  ALLOWED_PRODUCT_CATEGORIES.map((c) => c.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_"))
);

/** Out-of-scope types → closest allowed category. */
const DOWNGRADE_MAP = [
  { pattern: /\b(mmo|open\s*world|massive\s*multiplayer|world\s*of\s*warcraft)\b/i, to: "browser game" },
  { pattern: /\b(platform|mega\s*platform|infrastructure\s*platform)\b/i, to: "focused platform" },
  { pattern: /\b(ai\s*mega|mega\s*productivity|all-in-one\s*platform)\b/i, to: "specialized productivity tool" },
  { pattern: /\b(video\s*game|aaa\s*game|3d\s*game|game\s*engine)\b/i, to: "casual web game" },
  { pattern: /\b(social\s*network|messaging\s*platform|feed\s*platform)\b/i, to: "niche consumer app" },
  { pattern: /\b(generator|calculator|tracker|analyzer|directory)\b/i, to: "web app" },
  { pattern: /\b(micro\s*saas|micro_saas|saas)\b/i, to: "SaaS micro-product" },
  { pattern: /\b(productivity|planner|tool)\b/i, to: "specialized productivity tool" },
  { pattern: /\b(game|puzzle|quiz)\b/i, to: "browser game" },
  { pattern: /\b(learning|education|content)\b/i, to: "content or learning product" }
];

/** Trivial / spam patterns – idea is rejected, not downgraded. */
const REJECT_PATTERNS = [
  /\b(random\s*meme|meme\s*generator)\b/i,
  /\b(spam\s*generator|low-effort\s*tool)\b/i,
  /\b(clickbait|fake\s*news\s*generator)\b/i
];

const REQUIRED_PAGES = ["landing", "app", "pricing", "about"];

const DEFAULT_TECH_STACK = [
  "HTML",
  "Vanilla JS",
  "Node",
  "simple JSON storage"
];

function normalizeKey(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_").trim();
}

/**
 * Check if idea text matches reject patterns (trivial/spam). Returns rejection reason or null.
 */
function checkReject(ideaText) {
  const text = (ideaText || "").toLowerCase();
  for (const re of REJECT_PATTERNS) {
    if (re.test(text)) return "Trivial or spam idea; out of scope for factory.";
  }
  return null;
}

/**
 * Normalize product_type to one of ALLOWED_PRODUCT_CATEGORIES. Downgrade if outside scope; log adjustment.
 * @returns { { productType: string, adjusted: boolean, adjustmentLog?: string } }
 */
function normalizeProductType(value, ideaTextForLog = "") {
  const raw = (value || "").trim();
  const key = normalizeKey(raw);

  if (key && ALLOWED_NORMALIZED.has(key)) {
    const canonical = ALLOWED_PRODUCT_CATEGORIES.find((c) => normalizeKey(c) === key);
    return { productType: canonical || "web app", adjusted: false };
  }

  const text = (ideaTextForLog || raw).toLowerCase();
  for (const { pattern, to } of DOWNGRADE_MAP) {
    if (pattern.test(text)) {
      console.warn("[product_architect] Adjusted product_type outside scope:", JSON.stringify(raw), "→", to);
      return { productType: to, adjusted: true, adjustmentLog: `"${raw}" → ${to}` };
    }
  }

  console.warn("[product_architect] Unknown product_type, defaulting to web app:", JSON.stringify(raw));
  return { productType: "web app", adjusted: true, adjustmentLog: `"${raw}" → web app` };
}

/**
 * Normalize build_complexity to low | medium | high.
 */
function normalizeComplexity(value) {
  if (!value || typeof value !== "string") return "medium";
  const v = value.toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high") return v;
  if (v.startsWith("low") || v === "simple") return "low";
  if (v.startsWith("high") || v === "complex") return "high";
  return "medium";
}

/**
 * Estimate build hours from complexity.
 */
function estimateBuildHours(complexity) {
  switch (complexity) {
    case "low":
      return 8;
    case "high":
      return 80;
    default:
      return 24;
  }
}

/**
 * Build a heuristic spec when OpenAI is unavailable. Uses allowed categories only.
 */
function heuristicSpec(idea) {
  const title = (idea?.idea_title || idea?.idé || "").trim() || "Unnamed product";
  const desc = (idea?.idea_description || "").trim() || "";
  const text = `${title} ${desc}`;

  const rejectReason = checkReject(text);
  if (rejectReason) {
    const spec = {
      product_name: title.slice(0, 60) || "Product",
      product_type: "web app",
      target_user: "N/A",
      core_problem: "",
      value_proposition: "",
      features: [],
      pages: [...REQUIRED_PAGES],
      tech_stack: [...DEFAULT_TECH_STACK],
      monetization: "N/A",
      build_complexity: "low",
      estimated_build_hours: 8,
      rejected_by_architect: true,
      rejection_reason: rejectReason
    };
    console.warn("[product_architect] Idea rejected:", title, "–", rejectReason);
    return spec;
  }

  let suggested = "web app";
  if (/\b(game|puzzle|quiz)\b/.test(text)) suggested = "browser game";
  else if (/\b(learning|education|course)\b/.test(text)) suggested = "content or learning product";
  else if (/\b(saas|subscription|b2b|freelancer)\b/.test(text)) suggested = "SaaS micro-product";
  else if (/\b(productivity|planner|track|habit)\b/.test(text)) suggested = "specialized productivity tool";
  else if (/\b(calculat|compute|convert|estimate)\b/.test(text)) suggested = "web app";
  const { productType } = normalizeProductType(suggested, text);

  let complexity = "medium";
  if (/\b(api|integrat|backend|ai|ml|machine learning)\b/.test(text)) complexity = "high";
  else if (/\b(simple|basic|minimal|quick)\b/.test(text)) complexity = "low";

  const pages = [...REQUIRED_PAGES];
  const features = [
    "User can complete core action from app page",
    "Responsive layout",
    "Clear call-to-action"
  ];

  return {
    product_name: title.slice(0, 60) || "Product",
    product_type: productType,
    target_user: "Small businesses and individuals",
    core_problem: desc.slice(0, 200) || "Streamline a common task.",
    value_proposition: `Solve "${title}" with a focused, easy-to-use tool.`,
    features,
    pages,
    tech_stack: [...DEFAULT_TECH_STACK],
    monetization: "Freemium or one-time purchase",
    build_complexity: complexity,
    estimated_build_hours: estimateBuildHours(complexity),
    not_recommended_for_factory_build: complexity === "high",
    rejected_by_architect: false
  };
}

/**
 * Create a structured product specification from a raw idea.
 *
 * @param {Object} idea - { idea_title, idea_description } (idea_description optional)
 * @returns {Promise<Object>} Product spec with product_name, product_type, target_user,
 *   core_problem, value_proposition, features, pages, tech_stack, monetization,
 *   build_complexity, estimated_build_hours; plus not_recommended_for_factory_build if complexity is high.
 */
export async function createProductSpec(idea) {
  const title = (idea?.idea_title || idea?.idé || "").trim() || "Unnamed product";
  const description = (idea?.idea_description || "").trim() || "";

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return heuristicSpec({ idea_title: title, idea_description: description });
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: openaiKey });

  const categoriesList = ALLOWED_PRODUCT_CATEGORIES.map((c) => `"${c}"`).join(", ");
  const systemPrompt = `You are a product architect for a focused product factory. Goal: high-quality, scoped products (like Duolingo, Hemnet, Monkey Island). NOT: massive platforms, MMO-scale systems, or low-effort spam tools.

QUALITY RULES (every spec must satisfy):
- Solve a clear problem or provide meaningful entertainment.
- Have a clear primary user (one short sentence).
- Be realistically buildable by an automated factory (no multi-year platforms).
- Avoid trivial "spam generators" (e.g. random meme generator).
- Avoid giant infrastructure or MMO-scale systems.

PRODUCT TYPE (exactly one of): ${categoriesList}.
If the idea suggests something larger (e.g. "AI mega platform"), choose the closest allowed category (e.g. "specialized productivity tool" or "web app"). If it suggests an open-world MMO, use "browser game" or "casual web game". Never invent types outside this list.

OTHER RULES:
- pages MUST include at least: landing, app, pricing, about. You may add more (e.g. dashboard, settings) if needed.
- features: array of concise functional items (short strings), no more than 8.
- tech_stack: default to HTML, Vanilla JS, Node, simple JSON storage unless the idea clearly needs more.
- build_complexity: exactly one of low, medium, high. Prefer low or medium for factory buildability.
- estimated_build_hours: number (e.g. low=8-16, medium=20-40, high=60+).
- product_name: short, clear name (no slug).
- target_user: one short sentence (clear primary user).
- core_problem: one sentence.
- value_proposition: one sentence.
- monetization: one short phrase (e.g. "Freemium", "One-time purchase").

Return ONLY valid JSON with these keys: product_name, product_type, target_user, core_problem, value_proposition, features, pages, tech_stack, monetization, build_complexity, estimated_build_hours.`;

  const userPrompt = `Idea title: ${title}\nIdea description: ${description || "(none)"}\n\nProduce the product specification JSON.`;

  try {
    const res = await openai.chat.completions.create({
      model: AI_MODELS.reasoning,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    });

    const raw = (res.choices?.[0]?.message?.content || "").trim();
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "");
    const parsed = JSON.parse(jsonStr || "{}");

    const ideaText = `${title} ${description}`.trim();
    const rejectReason = checkReject(ideaText);
    if (rejectReason) {
      console.warn("[product_architect] Idea rejected:", title, "–", rejectReason);
      const spec = {
        product_name: String(parsed.product_name || title).slice(0, 80) || "Product",
        product_type: "web app",
        target_user: String(parsed.target_user || "").slice(0, 200),
        core_problem: String(parsed.core_problem || "").slice(0, 500),
        value_proposition: String(parsed.value_proposition || "").slice(0, 300),
        features: Array.isArray(parsed.features) ? parsed.features.slice(0, 12) : [],
        pages: [...new Set([...REQUIRED_PAGES, ...(Array.isArray(parsed.pages) ? parsed.pages : [])])],
        tech_stack: Array.isArray(parsed.tech_stack) && parsed.tech_stack.length ? parsed.tech_stack : [...DEFAULT_TECH_STACK],
        monetization: String(parsed.monetization || "").slice(0, 100),
        build_complexity: normalizeComplexity(parsed.build_complexity),
        estimated_build_hours: estimateBuildHours(normalizeComplexity(parsed.build_complexity)),
        rejected_by_architect: true,
        rejection_reason: rejectReason
      };
      return spec;
    }

    const { productType, adjusted, adjustmentLog } = normalizeProductType(parsed.product_type, ideaText);
    if (adjusted && adjustmentLog) {
      console.warn("[product_architect] Adjusted product_type:", adjustmentLog);
    }
    const complexity = normalizeComplexity(parsed.build_complexity);
    let pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const requiredSet = new Set(REQUIRED_PAGES);
    pages = [...new Set([...REQUIRED_PAGES, ...pages])];
    const features = Array.isArray(parsed.features)
      ? parsed.features.filter((f) => typeof f === "string" && f.trim()).slice(0, 12)
      : [];
    const techStack =
      Array.isArray(parsed.tech_stack) && parsed.tech_stack.length > 0
        ? parsed.tech_stack
        : [...DEFAULT_TECH_STACK];

    let estimatedBuildHours = parsed.estimated_build_hours;
    if (typeof estimatedBuildHours !== "number" || !Number.isFinite(estimatedBuildHours)) {
      estimatedBuildHours = estimateBuildHours(complexity);
    }
    estimatedBuildHours = Math.max(1, Math.min(500, Math.round(estimatedBuildHours)));

    const spec = {
      product_name: String(parsed.product_name || title).slice(0, 80) || "Product",
      product_type: productType,
      rejected_by_architect: false,
      target_user: String(parsed.target_user || "Small businesses and individuals").slice(0, 200),
      core_problem: String(parsed.core_problem || "").slice(0, 500),
      value_proposition: String(parsed.value_proposition || "").slice(0, 300),
      features: features.length ? features : ["Core workflow on app page", "Landing and pricing pages"],
      pages,
      tech_stack: techStack,
      monetization: String(parsed.monetization || "Freemium or one-time purchase").slice(0, 100),
      build_complexity: complexity,
      estimated_build_hours: estimatedBuildHours
    };

    if (complexity === "high") {
      spec.not_recommended_for_factory_build = true;
    }

    return spec;
  } catch (err) {
    console.warn("[product_architect] OpenAI failed, using heuristic spec:", err.message);
    return heuristicSpec({ idea_title: title, idea_description: description });
  }
}
