/**
 * WORKERS – Build apps from ideas via product spec and capability filter.
 *
 * Pipeline: idea → product_architect (createProductSpec) → capability_filter (evaluateBuildability) → build.
 * BUILD_MODE: "ai_generated" (default) → ai_code_engine.generate(spec) → real app code.
 *             "template" → spec-driven template (index.html, app.js, styles.css from local builders).
 * If capability_filter rejects, log and skip. If allowed, build per BUILD_MODE.
 */

import fs from "fs/promises";
import { createProductSpec } from "./product_architect.js";
import { evaluateBuildability } from "./capability_filter.js";
import { generate as aiGenerate } from "./ai_code_engine.js";

const BUILD_MODE = (process.env.BUILD_MODE || "ai_generated").toLowerCase();

function slugifyId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function createMarketingText(idea) {
  const title = typeof idea === "string" ? idea : (idea?.idea_title || idea?.product_name || "Product");
  return [
    `Unlock the power of "${title}".`,
    "",
    "- Designed for busy people and small teams.",
    "- Simple, fast and focused on one clear job.",
    "- Ready to fit into your existing workflow.",
    "",
    "Start experimenting with a lightweight MVP today."
  ].join("\n");
}

/** Escape for HTML text content. */
function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build index.html from spec (single-page working tool). */
function buildIndexHtml(spec) {
  const name = esc(spec.product_name || "App");
  const type = (spec.product_type || "micro_saas").toLowerCase();
  const features = Array.isArray(spec.features) ? spec.features : [];
  const valueProp = esc(spec.value_proposition || "");

  const specForScript = JSON.stringify({
    product_type: spec.product_type,
    product_name: spec.product_name,
    features: spec.features
  }).replace(/</g, "\\u003c");

  const inputFields = buildInputFieldsByType(type, features);
  const outputSection = `
    <div class="output-section">
      <div class="output-header">
        <label class="output-label">Output</label>
        <button type="button" id="copyBtn" class="btn btn-secondary">Copy</button>
      </div>
      <div id="output" class="output-area" role="region" aria-live="polite"></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="app-header">
    <div class="header-inner">
      <span class="logo">A</span>
      <div>
        <h1 class="app-title">${name}</h1>
        <p class="app-tagline">AI_FABRIK</p>
      </div>
    </div>
  </header>

  <main class="app-main">
    ${valueProp ? `<p class="value-prop">${valueProp}</p>` : ""}
    <section class="tool-section">
      <form id="toolForm" class="tool-form">
        ${inputFields}
        <div class="actions">
          <button type="submit" id="runBtn" class="btn btn-primary">Run</button>
          <button type="button" id="clearBtn" class="btn btn-secondary">Clear</button>
        </div>
      </form>
      ${outputSection}
    </section>
  </main>

  <script>window.__SPEC__ = ${specForScript};</script>
  <script src="app.js"></script>
</body>
</html>`;
}

/** Return HTML for input fields based on product_type. */
function buildInputFieldsByType(productType, features) {
  switch (productType) {
    case "generator":
      return `
        <label for="inputText">Input</label>
        <textarea id="inputText" name="input" rows="4" placeholder="Enter text to transform or generate from…"></textarea>`;
    case "calculator":
      return `
        <label for="inputA">Value A</label>
        <input type="number" id="inputA" name="a" placeholder="0" />
        <label for="inputB">Value B</label>
        <input type="number" id="inputB" name="b" placeholder="0" />
        <label for="inputOp">Operation</label>
        <select id="inputOp" name="op">
          <option value="+">Add</option>
          <option value="-">Subtract</option>
          <option value="*">Multiply</option>
          <option value="/">Divide</option>
        </select>`;
    case "tracker":
      return `
        <label for="inputItem">Item to track</label>
        <div class="input-row">
          <input type="text" id="inputItem" name="item" placeholder="Add an item…" />
          <button type="button" id="addBtn" class="btn btn-primary">Add</button>
        </div>
        <div id="trackerList" class="tracker-list"></div>`;
    case "analyzer":
      return `
        <label for="inputText">Text to analyze</label>
        <textarea id="inputText" name="input" rows="5" placeholder="Paste or type text…"></textarea>`;
    case "directory":
      return `
        <label for="inputSearch">Search / filter</label>
        <input type="text" id="inputSearch" name="search" placeholder="Filter items…" />
        <div id="directoryList" class="directory-list"></div>`;
    default:
      return `
        <label for="inputText">Input</label>
        <textarea id="inputText" name="input" rows="4" placeholder="Enter input…"></textarea>`;
  }
}

/** Build app.js with working logic per product_type. */
function buildAppJs(spec) {
  const type = (spec.product_type || "micro_saas").toLowerCase();
  const storageKey = `ai_fabrik_${(spec.product_name || "app").replace(/\W/g, "_").slice(0, 20)}`;

  const generators = {
    generator: `
      const text = (document.getElementById("inputText")?.value || "").trim();
      if (!text) { setOutput("Enter some text first."); return; }
      const words = text.split(/\\s+/).filter(Boolean);
      const lines = text.split(/\\n/).filter(Boolean);
      const out = [
        "Words: " + words.length,
        "Characters: " + text.length,
        "Lines: " + lines.length,
        "",
        "Bullet preview:",
        ...words.slice(0, 10).map(w => "• " + w)
      ].join("\\n");
      setOutput(out);
    `,
    calculator: `
      const a = Number(document.getElementById("inputA")?.value) || 0;
      const b = Number(document.getElementById("inputB")?.value) || 0;
      const op = document.getElementById("inputOp")?.value || "+";
      let r = 0;
      if (op === "+") r = a + b;
      else if (op === "-") r = a - b;
      else if (op === "*") r = a * b;
      else if (op === "/") r = b !== 0 ? a / b : "—";
      setOutput(String(r));
    `,
    tracker: `
      const list = getTrackerList();
      setOutput(list.length ? list.join("\\n") : "No items yet. Add items above.");
    `,
    analyzer: `
      const text = (document.getElementById("inputText")?.value || "").trim();
      if (!text) { setOutput("Enter text to analyze."); return; }
      const words = text.split(/\\s+/).filter(Boolean);
      const lines = text.split(/\\n/).filter(Boolean);
      setOutput([
        "Words: " + words.length,
        "Characters: " + text.length,
        "Lines: " + lines.length,
        "Sentences (approx): " + (text.split(/[.!?]+/).filter(Boolean).length || 1)
      ].join("\\n"));
    `,
    directory: `
      const list = getDirectoryList();
      const q = (document.getElementById("inputSearch")?.value || "").toLowerCase();
      const filtered = q ? list.filter(i => i.toLowerCase().includes(q)) : list;
      setOutput(filtered.length ? filtered.join("\\n") : "No items match.");
    `,
    micro_saas: `
      const text = (document.getElementById("inputText")?.value || "").trim();
      if (!text) { setOutput("Enter input first."); return; }
      const words = text.split(/\\s+/).filter(Boolean);
      setOutput("Processed: " + words.length + " word(s).\\n\\n" + text.slice(0, 500));
    `
  };

  return `
(function() {
  const spec = window.__SPEC__ || {};
  const type = (spec.product_type || "micro_saas").toLowerCase();
  const storageKey = "${storageKey}";

  function getOutputEl() { return document.getElementById("output"); }
  function setOutput(text) {
    const el = getOutputEl();
    if (el) el.textContent = text || "";
  }

  function getTrackerList() {
    try {
      const raw = localStorage.getItem(storageKey + "_tracker");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function setTrackerList(arr) {
    try { localStorage.setItem(storageKey + "_tracker", JSON.stringify(arr)); } catch {}
  }

  function getDirectoryList() {
    try {
      const raw = localStorage.getItem(storageKey + "_dir");
      return raw ? JSON.parse(raw) : ["Sample A", "Sample B", "Sample C"];
    } catch { return ["Sample A", "Sample B", "Sample C"]; }
  }
  function setDirectoryList(arr) {
    try { localStorage.setItem(storageKey + "_dir", JSON.stringify(arr)); } catch {}
  }

  document.getElementById("copyBtn")?.addEventListener("click", function() {
    const text = getOutputEl()?.textContent || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      this.textContent = "Copied!";
      setTimeout(function() { this.textContent = "Copy"; }.bind(this), 1500);
    }.bind(this));
  });

  document.getElementById("clearBtn")?.addEventListener("click", function() {
    setOutput("");
    if (document.getElementById("inputText")) document.getElementById("inputText").value = "";
    if (document.getElementById("inputA")) document.getElementById("inputA").value = "";
    if (document.getElementById("inputB")) document.getElementById("inputB").value = "";
  });

  if (type === "tracker") {
    function renderTracker() {
      const list = getTrackerList();
      const el = document.getElementById("trackerList");
      if (!el) return;
      el.innerHTML = list.map(function(item, i) {
        return \"<div class=\\\"tracker-item\\\"><span>\" + item.replace(/</g, \"&lt;\") + \"</span><button type=\\\"button\\\" data-i=\\\"\" + i + \"\\\" class=\\\"btn btn-small\\\">Remove</button></div>\";
      }).join("");
      el.querySelectorAll("[data-i]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const idx = parseInt(this.getAttribute("data-i"), 10);
          const arr = getTrackerList();
          arr.splice(idx, 1);
          setTrackerList(arr);
          renderTracker();
          setOutput(arr.length ? arr.join("\\n") : "No items yet.");
        });
      });
    }
    document.getElementById("addBtn")?.addEventListener("click", function() {
      const input = document.getElementById("inputItem");
      const v = (input?.value || "").trim();
      if (!v) return;
      const arr = getTrackerList();
      arr.push(v);
      setTrackerList(arr);
      if (input) input.value = "";
      renderTracker();
      setOutput(arr.join("\\n"));
    });
    renderTracker();
  }

  if (type === "directory") {
    document.getElementById("inputSearch")?.addEventListener("input", function() {
      (function() { ${generators.directory} })();
    });
  }

  document.getElementById("toolForm")?.addEventListener("submit", function(e) {
    e.preventDefault();
    (function() { ${generators[type] || generators.micro_saas} })();
  });
})();
`.trim();
}

/** Build styles.css. */
function buildStylesCss() {
  return `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
.app-header { border-bottom: 1px solid #334155; background: rgba(15,23,42,.9); }
.header-inner { max-width: 56rem; margin: 0 auto; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
.logo { width: 2rem; height: 2rem; background: #6366f1; color: #fff; border-radius: 0.5rem; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; }
.app-title { margin: 0; font-size: 1.25rem; font-weight: 600; }
.app-tagline { margin: 0.25rem 0 0; font-size: 0.75rem; color: #94a3b8; }
.app-main { max-width: 56rem; margin: 0 auto; padding: 1.5rem; }
.value-prop { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; }
.tool-section { background: rgba(30,41,59,.5); border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
.tool-form { display: flex; flex-direction: column; gap: 0.75rem; }
.tool-form label { font-size: 0.8rem; font-weight: 500; color: #94a3b8; }
.tool-form input[type="text"], .tool-form input[type="number"], .tool-form textarea, .tool-form select {
  padding: 0.5rem 0.75rem; border: 1px solid #475569; border-radius: 0.5rem; background: #1e293b; color: #e2e8f0; font-size: 1rem;
}
.tool-form textarea { min-height: 100px; resize: vertical; }
.input-row { display: flex; gap: 0.5rem; }
.input-row input { flex: 1; }
.actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.9rem; cursor: pointer; border: none; }
.btn-primary { background: #6366f1; color: #fff; }
.btn-primary:hover { background: #4f46e5; }
.btn-secondary { background: #334155; color: #e2e8f0; }
.btn-secondary:hover { background: #475569; }
.btn-small { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
.output-section { margin-top: 1.5rem; }
.output-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.output-label { font-size: 0.8rem; color: #94a3b8; }
.output-area { min-height: 4rem; padding: 1rem; background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem; white-space: pre-wrap; word-break: break-word; }
.tracker-list, .directory-list { margin-top: 0.5rem; }
.tracker-item { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid #334155; }
.tracker-item span { flex: 1; }
@media (max-width: 640px) { .header-inner, .app-main { padding-left: 1rem; padding-right: 1rem; } }
`.trim();
}

/** Write AI-generated app files to appFolder and deployFolder. Pipeline-compatible: app.html, app.js, styles.css. */
async function buildFromAiGenerated(spec, id) {
  const files = await aiGenerate(spec);
  const appFolder = `apps/${id}`;
  const deployFolder = `deploy/${id}`;
  await fs.mkdir(appFolder, { recursive: true });
  await fs.mkdir(deployFolder, { recursive: true });

  const ideaTitle = spec.product_name || spec.idea_title || "App";
  const marketingText = createMarketingText(ideaTitle);

  await fs.writeFile(`${appFolder}/idea.txt`, ideaTitle, "utf-8");
  await fs.writeFile(`${appFolder}/spec.json`, JSON.stringify(spec, null, 2), "utf-8");
  await fs.writeFile(`${appFolder}/marketing.txt`, marketingText, "utf-8");
  await fs.writeFile(`${appFolder}/index.html`, files.indexHtml, "utf-8");
  await fs.writeFile(`${appFolder}/app.html`, files.indexHtml, "utf-8");
  await fs.writeFile(`${appFolder}/app.js`, files.appJs, "utf-8");
  await fs.writeFile(`${appFolder}/styles.css`, files.stylesCss, "utf-8");
  await fs.writeFile(`${appFolder}/logic.js`, files.logicJs, "utf-8");
  await fs.writeFile(`${appFolder}/README.md`, files.readme, "utf-8");

  await fs.writeFile(`${deployFolder}/index.html`, files.indexHtml, "utf-8");
  await fs.writeFile(`${deployFolder}/app.html`, files.indexHtml, "utf-8");
  await fs.writeFile(`${deployFolder}/app.js`, files.appJs, "utf-8");
  await fs.writeFile(`${deployFolder}/styles.css`, files.stylesCss, "utf-8");
  await fs.writeFile(`${deployFolder}/logic.js`, files.logicJs, "utf-8");
}

/** Write app structure from spec to appFolder and deployFolder (template mode). */
async function buildFromSpec(spec, id) {
  const appFolder = `apps/${id}`;
  const deployFolder = `deploy/${id}`;
  await fs.mkdir(appFolder, { recursive: true });
  await fs.mkdir(deployFolder, { recursive: true });

  const indexHtml = buildIndexHtml(spec);
  const appJs = buildAppJs(spec);
  const stylesCss = buildStylesCss();
  const ideaTitle = spec.product_name || spec.idea_title || "App";
  const marketingText = createMarketingText(ideaTitle);

  await fs.writeFile(`${appFolder}/idea.txt`, ideaTitle, "utf-8");
  await fs.writeFile(`${appFolder}/spec.json`, JSON.stringify(spec, null, 2), "utf-8");
  await fs.writeFile(`${appFolder}/marketing.txt`, marketingText, "utf-8");
  await fs.writeFile(`${appFolder}/index.html`, indexHtml, "utf-8");
  await fs.writeFile(`${appFolder}/app.html`, indexHtml, "utf-8");
  await fs.writeFile(`${appFolder}/app.js`, appJs, "utf-8");
  await fs.writeFile(`${appFolder}/styles.css`, stylesCss, "utf-8");

  await fs.writeFile(`${deployFolder}/index.html`, indexHtml, "utf-8");
  await fs.writeFile(`${deployFolder}/app.html`, indexHtml, "utf-8");
  await fs.writeFile(`${deployFolder}/app.js`, appJs, "utf-8");
  await fs.writeFile(`${deployFolder}/styles.css`, stylesCss, "utf-8");
}

/** Normalize idea to { idea_title, idea_description }. */
function normalizeIdea(idea) {
  if (idea && typeof idea === "object" && (idea.idea_title != null || idea.idé != null)) {
    return {
      idea_title: String(idea.idea_title ?? idea.idé ?? "").trim() || "Unnamed product",
      idea_description: String(idea.idea_description ?? idea.core_problem ?? "").trim()
    };
  }
  const s = String(idea ?? "").trim();
  return { idea_title: s || "Unnamed product", idea_description: "" };
}

/** Create one app: idea → spec → capability filter → build if allowed. Returns app id or null if skipped. */
async function createOneApp(idea) {
  const id = slugifyId();
  const ideaInput = normalizeIdea(idea);

  let spec;
  try {
    spec = await createProductSpec(ideaInput);
  } catch (err) {
    console.warn("[workers] createProductSpec failed for:", ideaInput.idea_title?.slice(0, 50), err.message);
    return null;
  }

  let evaluation;
  try {
    evaluation = await evaluateBuildability(spec);
  } catch (err) {
    console.warn("[workers] evaluateBuildability failed:", err.message);
    return null;
  }

  if (!evaluation.allowed) {
    console.log("[workers] REJECTED (skip build):", spec.product_name || ideaInput.idea_title);
    console.log("[workers] Reason:", evaluation.reason);
    if (evaluation.adjusted_scope?.length) {
      console.log("[workers] Adjusted scope suggestions:", evaluation.adjusted_scope);
    }
    return null;
  }

  try {
    if (BUILD_MODE === "ai_generated") {
      try {
        await buildFromAiGenerated(spec, id);
        console.log("APP CREATED (ai_generated):", id, "—", spec.product_name || ideaInput.idea_title);
        return id;
      } catch (aiErr) {
        console.warn("[workers] ai_code_engine failed, falling back to template:", aiErr.message);
        await buildFromSpec(spec, id);
        console.log("APP CREATED (template fallback):", id, "—", spec.product_name || ideaInput.idea_title);
        return id;
      }
    }
    await buildFromSpec(spec, id);
    console.log("APP CREATED (template):", id, "—", spec.product_name || ideaInput.idea_title);
    return id;
  } catch (err) {
    console.warn("[workers] build failed:", err.message);
    return null;
  }
}

export async function createApps(ideas) {
  if (!Array.isArray(ideas)) {
    ideas = String(ideas || "")
      .split("\n")
      .map((i) => i.replace(/^[0-9]+\.\s*/, "").trim())
      .filter(Boolean);
  }

  const createdIds = [];
  for (const idea of ideas) {
    const id = await createOneApp(idea);
    if (id) createdIds.push(id);
  }

  console.log("DONE BUILDING APPS (spec-driven). Created:", createdIds.length);
  return createdIds;
}
