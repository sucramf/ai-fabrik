/**
 * PRODUCT ARCHITECT – Converts a raw idea into a structured product specification
 * before any code is generated. Used to align workers and pipeline with a clear spec.
 *
 * Input: { idea_title, idea_description }
 * Output: Product spec (product_name, product_type, target_user, features, pages, tech_stack, etc.)
 */

const PRODUCT_TYPES = [
  "generator",
  "calculator",
  "tracker",
  "analyzer",
  "directory",
  "micro_saas"
];

const REQUIRED_PAGES = ["landing", "app", "pricing", "about"];

const DEFAULT_TECH_STACK = [
  "HTML",
  "Vanilla JS",
  "Node",
  "simple JSON storage"
];

/**
 * Normalize product_type to one of the allowed enum values.
 */
function normalizeProductType(value) {
  if (!value || typeof value !== "string") return "micro_saas";
  const v = value.toLowerCase().replace(/\s+/g, "_").trim();
  if (PRODUCT_TYPES.includes(v)) return v;
  if (v.includes("generat")) return "generator";
  if (v.includes("calculat") || v.includes("calc")) return "calculator";
  if (v.includes("track")) return "tracker";
  if (v.includes("analyz") || v.includes("analys")) return "analyzer";
  if (v.includes("director") || v.includes("list") || v.includes("directory")) return "directory";
  return "micro_saas";
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
 * Build a heuristic spec when OpenAI is unavailable.
 */
function heuristicSpec(idea) {
  const title = (idea?.idea_title || idea?.idé || "").trim() || "Unnamed product";
  const desc = (idea?.idea_description || "").trim() || "";
  const text = `${title} ${desc}`.toLowerCase();

  let productType = "micro_saas";
  if (/\b(generat|create|build|make)\b/.test(text) && !/calculator|tracker/.test(text))
    productType = "generator";
  else if (/\b(calculat|compute|convert|estimate)\b/.test(text)) productType = "calculator";
  else if (/\b(track|log|monitor|habit)\b/.test(text)) productType = "tracker";
  else if (/\b(analyz|analys|insight|report|dashboard)\b/.test(text)) productType = "analyzer";
  else if (/\b(directory|list|find|search|index)\b/.test(text)) productType = "directory";

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
    not_recommended_for_factory_build: complexity === "high"
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

  const systemPrompt = `You are a product architect. Convert a raw idea into a structured product specification.

Rules:
- product_type MUST be exactly one of: generator, calculator, tracker, analyzer, directory, micro_saas.
- pages MUST include at least: landing, app, pricing, about. You may add more (e.g. dashboard, settings) if needed.
- features: array of concise functional items (short strings), no more than 8.
- tech_stack: default to HTML, Vanilla JS, Node, simple JSON storage unless the idea clearly needs more (e.g. database, external API).
- build_complexity: exactly one of low, medium, high.
  - low: simple UI + logic, no external API, minimal state.
  - medium: one API integration or multiple UI components.
  - high: complex backend, heavy AI dependency, or many integrations.
- If build_complexity is high, the idea is "not recommended for factory build".
- estimated_build_hours: number (e.g. low=8-16, medium=20-40, high=60+).
- product_name: short, clear name (no slug).
- target_user: one short sentence.
- core_problem: one sentence.
- value_proposition: one sentence.
- monetization: one short phrase (e.g. "Freemium", "One-time purchase").

Return ONLY valid JSON with these keys: product_name, product_type, target_user, core_problem, value_proposition, features, pages, tech_stack, monetization, build_complexity, estimated_build_hours.`;

  const userPrompt = `Idea title: ${title}\nIdea description: ${description || "(none)"}\n\nProduce the product specification JSON.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    });

    const raw = (res.choices?.[0]?.message?.content || "").trim();
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "");
    const parsed = JSON.parse(jsonStr || "{}");

    const productType = normalizeProductType(parsed.product_type);
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
