/**
 * AI CODE ENGINE – Generate full application code from product spec using AI.
 *
 * spec.json → ai_code_engine.generate(spec) → real application code → apps/<id>
 *
 * Output: index.html, app.js, styles.css, logic.js, README.md
 * Product types: generator, calculator, tracker, analyzer, directory, micro_saas.
 *
 * Uses OPENAI_API_KEY. Vanilla HTML/JS/CSS (no build step) for pipeline compatibility.
 */

import { AI_MODELS } from "../config/ai_models.js";

const PRODUCT_TYPE_LOGIC_HINTS = {
  generator: "generate something from user input",
  calculator: "perform a real calculation",
  tracker: "store entries using localStorage",
  analyzer: "analyze user text or data",
  directory: "provide searchable items",
  micro_saas: "provide a useful transformation tool"
};

/**
 * Generate full application code from a product spec.
 * @param {Object} spec - Product spec (product_name, product_type, features, value_proposition, etc.)
 * @returns {Promise<{ indexHtml: string, appJs: string, stylesCss: string, logicJs: string, readme: string }>}
 */
export async function generate(spec) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("AI_CODE_ENGINE: OPENAI_API_KEY is required for ai_generated build mode.");
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey });

  const productName = spec.product_name || "App";
  const productType = (spec.product_type || "micro_saas").toLowerCase();
  const features = Array.isArray(spec.features) ? spec.features : [];
  const valueProp = spec.value_proposition || "";
  const logicHint = PRODUCT_TYPE_LOGIC_HINTS[productType] || PRODUCT_TYPE_LOGIC_HINTS.micro_saas;

  const systemPrompt = `You are a senior product engineer and full-stack developer.
Your job is to generate a complete, working web application that solves a real user problem.

The application must:
- perform a meaningful task
- produce useful output for the user
- feel like a real micro-tool someone would actually use

Avoid trivial transformations such as reversing text or simple placeholder utilities.
Prefer tools that help users:
- analyze data
- generate useful content
- make decisions
- track progress
- calculate values
- organize information

Every generated app should feel like a small but useful SaaS tool.

VALUE CHECK (do this mentally before generating code; do NOT include these answers in your JSON output):
- What problem does this tool solve?
- Who would use it?
- What useful output will the user receive?
Use this evaluation to guide your implementation. Your final response must be ONLY the JSON object with the 5 files.

UI requirements:
- Clear, labeled input fields (labels that describe what the user should enter).
- Labeled buttons (e.g. "Run", "Analyze", "Calculate" — not generic "Submit" unless it fits).
- A meaningful output area (e.g. id="output" or role="region") where results are shown.
- User feedback: show loading state, result text, or clear messages (e.g. "Processing...", then the result or "No input provided").
The interface must look like a real tool, not a blank form.

Logic requirements (logic.js):
- Contain real logic that produces meaningful output from user input.
- Be at least 15 lines long.
- Export at least one function that app.js imports and calls.
- Prefer logic types such as: text analysis, keyword extraction, scoring systems, simple forecasting, calculators, productivity helpers, data summarization.
- Do NOT implement trivial logic (e.g. only reversing a string or uppercasing).

Technical requirements:
- Implement the logic in logic.js with export function ... (e.g. export function processInput(input) { ... }).
- app.js must import and call those functions (e.g. import { processInput } from './logic.js'; call processInput(userInput) when the user runs the tool).
- index.html must load app.js as a module: <script type="module" src="app.js"></script>. Do NOT add a separate script tag for logic.js.
- Use vanilla HTML, CSS, and JavaScript only. No React, no build step. ES modules only.
- Product type: ${productType}. Logic must: ${logicHint}
- App name: ${productName}. Value proposition: ${valueProp || "N/A"}. Features: ${features.slice(0, 6).join(", ") || "General purpose"}.

Output format: Return a single JSON object with these exact keys (each value is the full file content as a string). In JSON, escape double quotes as \\" and newlines as \\n. Do not include the value-check answers or any text outside the JSON.
- indexHtml: full <!DOCTYPE html>... with <script type="module" src="app.js"></script> before </body>, labeled inputs, a labeled button, and an output area with a way to show feedback/results.
- appJs: must start with import from './logic.js', then attach DOM listeners and call the imported functions; show loading/result/error feedback in the output area.
- stylesCss: complete CSS so the interface looks like a real tool (layout, typography, spacing, clear sections).
- logicJs: at least 15 lines of real code with one or more export function declarations that implement a meaningful task (analysis, calculation, generation, scoring, summarization, etc.).
- readme: short README (project name, what problem it solves, how to run: open index.html).`;

  const userPrompt = `Product spec (JSON):
${JSON.stringify({
  product_name: productName,
  product_type: productType,
  value_proposition: valueProp,
  features
}, null, 2)}

Generate a tool that delivers real user value. Your response must be only the JSON object with keys: indexHtml, appJs, stylesCss, logicJs, readme. No markdown code fence, no value-check text — only the JSON.`;

  const retryPrompt = `RETRY: The previous logic.js was too short or had no real logic. You MUST output logic.js with more than 10 lines of actual code and at least one exported function that app.js imports and calls. Implement meaningful logic (e.g. analysis, calculation, scoring, summarization) — no placeholders or trivial transformations.`;

  function countLogicLines(logicCode) {
    if (typeof logicCode !== "string") return 0;
    return logicCode.split("\n").filter((l) => l.trim().length > 0).length;
  }

  function parseResponse(content) {
    const raw = (content || "").trim();
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error("AI_CODE_ENGINE: Model response was not valid JSON. " + (e.message || ""));
    }
  }

  function normalizeFiles(parsed) {
    const indexHtml = typeof parsed.indexHtml === "string" ? parsed.indexHtml : "";
    const appJs = typeof parsed.appJs === "string" ? parsed.appJs : "";
    const stylesCss = typeof parsed.stylesCss === "string" ? parsed.stylesCss : "";
    const logicJs = typeof parsed.logicJs === "string" ? parsed.logicJs : "// Core logic (optional)\n";
    const readme = typeof parsed.readme === "string" ? parsed.readme : `# ${productName}\n\nGenerated by AI_FABRIK. Open index.html to run.\n`;
    return { indexHtml, appJs, stylesCss, logicJs, readme };
  }

  function ensureHtmlAssets(html) {
    let finalIndex = html;
    if (!finalIndex.includes("styles.css")) {
      finalIndex = finalIndex.replace("</head>", '  <link rel="stylesheet" href="styles.css" />\n</head>');
    }
    if (!finalIndex.includes("app.js")) {
      finalIndex = finalIndex.replace("</body>", '<script type="module" src="app.js"></script>\n</body>');
    }
    const scriptTag = finalIndex.match(/<script[^>]*src=["']app\.js["'][^>]*>/i);
    if (scriptTag && !scriptTag[0].includes("type=\"module\"") && !scriptTag[0].includes("type='module'")) {
      finalIndex = finalIndex.replace(/<script([^>]*)src=["']app\.js["']([^>]*)>/i, "<script type=\"module\"$1src=\"app.js\"$2>");
    }
    return finalIndex;
  }

  try {
    let messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const res = await openai.chat.completions.create({
      model: AI_MODELS.generation,
      messages,
      temperature: 0.2
    });

    let parsed = parseResponse(res.choices?.[0]?.message?.content);
    let { indexHtml, appJs, stylesCss, logicJs, readme } = normalizeFiles(parsed);

    if (!indexHtml || !appJs) {
      throw new Error("AI_CODE_ENGINE: Generated response missing indexHtml or appJs.");
    }

    const logicLineCount = countLogicLines(logicJs);
    if (logicLineCount <= 10) {
      messages.push({ role: "assistant", content: res.choices?.[0]?.message?.content || "" });
      messages.push({ role: "user", content: retryPrompt });
      const res2 = await openai.chat.completions.create({
        model: AI_MODELS.generation,
        messages,
        temperature: 0.2
      });
      parsed = parseResponse(res2.choices?.[0]?.message?.content);
      const retried = normalizeFiles(parsed);
      if (countLogicLines(retried.logicJs) > logicLineCount) {
        indexHtml = retried.indexHtml;
        appJs = retried.appJs;
        stylesCss = retried.stylesCss;
        logicJs = retried.logicJs;
        readme = retried.readme;
      }
    }

    const finalIndex = ensureHtmlAssets(indexHtml);

    return {
      indexHtml: finalIndex,
      appJs,
      stylesCss: stylesCss || "/* Generated styles */\nbody { margin: 0; font-family: system-ui; }\n",
      logicJs,
      readme
    };
  } catch (err) {
    if (err.message && err.message.startsWith("AI_CODE_ENGINE:")) throw err;
    throw new Error("AI_CODE_ENGINE: " + (err.message || String(err)));
  }
}

/**
 * Apply evolution plan to existing app code. Returns updated files only; does not delete or replace unrelated code.
 * @param {Object} spec - Product spec (product_name, product_type, features, etc.)
 * @param {Object} currentFiles - { indexHtml, appJs, logicJs, stylesCss }
 * @param {Object} evolutionPlan - { suggestions: string[], allocation_status?: string, reasoning?: string[] }
 * @param {{ maxChangeScope?: 'small'|'medium'|'large' }} options - small = minimal patches, large = allow broader refactors
 * @returns {Promise<{ indexHtml: string, appJs: string, logicJs: string, stylesCss: string }>}
 */
export async function applyEvolution(spec, currentFiles, evolutionPlan, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("AI_CODE_ENGINE: OPENAI_API_KEY is required for applyEvolution.");
  }

  const suggestions = Array.isArray(evolutionPlan?.suggestions) ? evolutionPlan.suggestions : [];
  if (suggestions.length === 0) {
    return {
      indexHtml: currentFiles.indexHtml || "",
      appJs: currentFiles.appJs || "",
      logicJs: currentFiles.logicJs || "",
      stylesCss: currentFiles.stylesCss || ""
    };
  }

  const scope = options.maxChangeScope || "medium";
  const scopeInstruction =
    scope === "small"
      ? "Make MINIMAL changes: only the smallest edits needed to address each suggestion. Do not refactor or restructure."
      : scope === "large"
        ? "You may refactor and improve structure as needed to implement the suggestions well."
        : "Make focused changes to address the suggestions; avoid unnecessary refactors.";

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey });

  function parseResponse(content) {
    const raw = (content || "").trim();
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error("AI_CODE_ENGINE: applyEvolution response was not valid JSON. " + (e.message || ""));
    }
  }

  function ensureHtmlAssets(html) {
    if (!html || typeof html !== "string") return html;
    let finalIndex = html;
    if (!finalIndex.includes("styles.css")) {
      finalIndex = finalIndex.replace("</head>", '  <link rel="stylesheet" href="styles.css" />\n</head>');
    }
    if (!finalIndex.includes("app.js")) {
      finalIndex = finalIndex.replace("</body>", '<script type="module" src="app.js"></script>\n</body>');
    }
    const scriptTag = finalIndex.match(/<script[^>]*src=["']app\.js["'][^>]*>/i);
    if (scriptTag && !scriptTag[0].includes("type=\"module\"") && !scriptTag[0].includes("type='module'")) {
      finalIndex = finalIndex.replace(/<script([^>]*)src=["']app\.js["']([^>]*)>/i, "<script type=\"module\"$1src=\"app.js\"$2>");
    }
    return finalIndex;
  }

  const systemPrompt = `You are a senior developer applying improvement suggestions to an existing web app.
Rules:
- PRESERVE all existing functionality. Do not remove or break working behavior.
- Apply ONLY the requested improvements from the evolution plan.
- Output a single JSON object with exactly these keys: indexHtml, appJs, logicJs, stylesCss. Each value is the full file content as a string (escape newlines as \\n and double quotes as \\" in JSON).
- Keep the same tech stack: vanilla HTML, CSS, ES modules; indexHtml must load app.js as type="module"; app.js may import from logic.js.
${scopeInstruction}
Do not include any text outside the JSON.`;

  const userPrompt = `Product: ${spec?.product_name || "App"}

Evolution suggestions to apply:
${suggestions.map((s) => `- ${s}`).join("\n")}

Current code files:

=== indexHtml ===
${(currentFiles.indexHtml || "").slice(0, 12000)}

=== appJs ===
${(currentFiles.appJs || "").slice(0, 8000)}

=== logicJs ===
${(currentFiles.logicJs || "").slice(0, 8000)}

=== stylesCss ===
${(currentFiles.stylesCss || "").slice(0, 6000)}

Return the updated files as a single JSON object: { "indexHtml": "...", "appJs": "...", "logicJs": "...", "stylesCss": "..." }. Only the JSON, no markdown.`;

  const res = await openai.chat.completions.create({
    model: AI_MODELS.generation,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  });

  const parsed = parseResponse(res.choices?.[0]?.message?.content);
  const indexHtml = typeof parsed.indexHtml === "string" ? parsed.indexHtml : (currentFiles.indexHtml || "");
  const appJs = typeof parsed.appJs === "string" ? parsed.appJs : (currentFiles.appJs || "");
  const logicJs = typeof parsed.logicJs === "string" ? parsed.logicJs : (currentFiles.logicJs || "");
  const stylesCss = typeof parsed.stylesCss === "string" ? parsed.stylesCss : (currentFiles.stylesCss || "");

  const finalIndex = ensureHtmlAssets(indexHtml);

  return {
    indexHtml: finalIndex,
    appJs: appJs || currentFiles.appJs || "",
    logicJs: logicJs || currentFiles.logicJs || "",
    stylesCss: stylesCss || currentFiles.stylesCss || ""
  };
}
