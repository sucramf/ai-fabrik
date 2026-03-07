/**
 * IDEA EXPLOSION ENGINE – Generate many product ideas, score them, and return the best for the build pipeline.
 *
 * Flow: generate ~100 ideas with AI → score by usefulness, clarity, monetization, simplicity → sort → return top 5–10.
 * Output is compatible with builders/full_product_pipeline.js (each idea has title, description, product_type; pipeline can map to idea_title/idea_description).
 */

const PRODUCT_TYPES = ["generator", "calculator", "tracker", "analyzer", "directory", "micro_saas"];

const TOP_N_MIN = 5;
const TOP_N_MAX = 10;

/**
 * Score a single idea 0–100 using simple heuristics.
 * @param {{ title: string, description: string, product_type: string }} idea
 * @returns {number}
 */
function scoreIdea(idea) {
  const title = (idea.title || "").trim();
  const desc = (idea.description || "").trim().toLowerCase();
  const text = `${title} ${desc}`;
  const type = (idea.product_type || "micro_saas").toLowerCase();

  let usefulness = 0;
  const usefulWords = ["help", "create", "track", "analyze", "calculate", "generate", "find", "manage", "organize", "convert", "summarize", "score", "compare"];
  for (const w of usefulWords) {
    if (text.includes(w)) usefulness += 2;
  }
  usefulness = Math.min(25, usefulness);
  if (desc.length >= 30 && desc.length <= 200) usefulness += 5;

  let clarity = 0;
  const clarityWords = ["problem", "need", "want", "solve", "user", "for", "when", "who", "quick", "easy", "simple"];
  for (const w of clarityWords) {
    if (text.includes(w)) clarity += 2;
  }
  clarity = Math.min(25, clarity);
  if (desc.length >= 20) clarity += 3;

  let monetization = 0;
  const monetWords = ["subscription", "premium", "pay", "business", "team", "professional", "saas", "revenue", "freemium", "productivity", "tool"];
  for (const w of monetWords) {
    if (text.includes(w)) monetization += 3;
  }
  monetization = Math.min(25, monetization);

  const simplicityByType = {
    calculator: 25,
    tracker: 22,
    generator: 20,
    analyzer: 18,
    directory: 16,
    micro_saas: 14
  };
  let simplicity = simplicityByType[type] || 12;
  if (desc.length >= 40 && desc.length <= 120) simplicity += 3;
  if (desc.length > 200) simplicity = Math.max(0, simplicity - 5);
  simplicity = Math.min(25, simplicity);

  return usefulness + clarity + monetization + simplicity;
}

/**
 * Normalize product_type to one of the allowed values.
 */
function normalizeProductType(t) {
  const s = (t || "").toLowerCase().trim();
  return PRODUCT_TYPES.includes(s) ? s : "micro_saas";
}

/**
 * Generate ~100 product ideas via AI, score them, and return the top 5–10.
 * @returns {Promise<Array<{ title: string, description: string, product_type: string, score: number }>>}
 */
export async function generateTopIdeas() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("IDEA_EXPLOSION_ENGINE: OPENAI_API_KEY is required.");
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are a product ideation expert. Generate approximately 100 diverse product ideas for micro-SaaS web tools.

Each idea must be a small, buildable web application. Return a JSON array of objects. Each object has exactly:
- title: short product name (a few words)
- description: one or two sentences describing what the tool does and who it helps
- product_type: exactly one of: generator, calculator, tracker, analyzer, directory, micro_saas

Rules:
- Be diverse: mix of productivity, analysis, content, data, and utility tools.
- Each idea should be implementable as a single-page web app (no backend required for MVP).
- Prefer ideas that solve a clear problem for a specific user (e.g. "Blog title scorer for marketers" not "A thing that does stuff").
- Return ONLY the JSON array. No markdown, no code fence, no explanation. Start with [ and end with ].`;

  const userPrompt = `Generate approximately 100 product ideas as a JSON array. Each element: { "title": "...", "description": "...", "product_type": "generator"|"calculator"|"tracker"|"analyzer"|"directory"|"micro_saas" }. Return only the array.`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.8
  });

  const raw = (res.choices?.[0]?.message?.content || "").trim();
  const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  let list;
  try {
    list = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("IDEA_EXPLOSION_ENGINE: Model response was not valid JSON. " + (e.message || ""));
  }

  if (!Array.isArray(list)) {
    throw new Error("IDEA_EXPLOSION_ENGINE: Expected a JSON array of ideas.");
  }

  const ideas = list
    .filter((i) => i && (i.title || i.description))
    .map((i) => ({
      title: String(i.title || "").trim() || "Untitled",
      description: String(i.description || "").trim() || "",
      product_type: normalizeProductType(i.product_type)
    }))
    .filter((i) => i.description.length > 0);

  if (ideas.length === 0) {
    throw new Error("IDEA_EXPLOSION_ENGINE: No valid ideas in model response.");
  }

  const scored = ideas.map((idea) => ({
    ...idea,
    score: scoreIdea(idea)
  }));

  scored.sort((a, b) => (b.score - a.score));

  const topCount = Math.min(TOP_N_MAX, Math.max(TOP_N_MIN, Math.min(TOP_N_MAX, scored.length)));
  const topIdeas = scored.slice(0, topCount);

  return topIdeas;
}
