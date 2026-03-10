/**
 * WORKERS – Build apps from ideas via product spec and capability filter.
 *
 * Pipeline: idea → product_architect (createProductSpec) → capability_filter (evaluateBuildability) → build.
 * BUILD_MODE: "ai_generated" (default) → ai_code_engine.generate(spec) → real app code.
 *             "template" → spec-driven template (index.html, app.js, styles.css from local builders).
 *
 * HK-UPGRADE: Visual Engine & Design System
 * - Master Design System: Tailwind (CDN) + Inter font + Dark mode baseline.
 * - Consistent layout tokens via styles.css (CSS variables + micro-interactions).
 * - UI-Polisher: subtle output highlight and button feedback on actions.
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
    <div class="output-section mt-6">
      <div class="output-header flex items-center justify-between mb-2">
        <label class="output-label text-xs font-medium text-slate-400 tracking-wide">Output</label>
        <button type="button" id="copyBtn" class="btn btn-secondary text-xs">Copy</button>
      </div>
      <div id="output" class="output-area" role="region" aria-live="polite"></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif']
          },
          colors: {
            brand: {
              500: '#6366F1',
              600: '#4F46E5',
              950: '#020617'
            }
          },
          boxShadow: {
            'elevated': '0 18px 45px rgba(15,23,42,0.9)'
          },
        }
      }
    };
  </script>
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="bg-slate-950 text-slate-50">
  <div class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
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
        <form id="toolForm" class="tool-form" autocomplete="off">
          ${inputFields}
          <div class="actions">
            <button type="submit" id="runBtn" class="btn btn-primary">Run</button>
            <button type="button" id="clearBtn" class="btn btn-secondary">Clear</button>
          </div>
        </form>
        ${outputSection}
      </section>
    </main>
  </div>

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
      const words = text.split(/\s+/).filter(Boolean);
      const lines = text.split(/\n/).filter(Boolean);
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
      const words = text.split(/\s+/).filter(Boolean);
      const lines = text.split(/\n/).filter(Boolean);
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
      const words = text.split(/\s+/).filter(Boolean);
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
    if (!el) return;
    el.textContent = text || "";
    // UI-Polisher: subtle flash on update
    el.classList.remove("output--flash");
    void el.offsetWidth; // force reflow for consecutive updates
    el.classList.add("output--flash");
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
    const btn = this;
    navigator.clipboard.writeText(text).then(function() {
      const original = btn.textContent;
      btn.textContent = "Copied";
      btn.classList.add("btn--pulse");
      setTimeout(function() {
        btn.textContent = original;
        btn.classList.remove("btn--pulse");
      }, 1200);
    });
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
        return "<div class=\\"tracker-item\\"><span>" + item.replace(/</g, "&lt;") + "</span><button type=\\"button\\" data-i=\\"" + i + "\\" class=\\"btn btn-small\\">Remove</button></div>";
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

  // Main submit handler
  document.getElementById("toolForm")?.addEventListener("submit", function(e) {
    e.preventDefault();
    (function() { ${generators[type] || generators.micro_saas} })();
  });
})();
`.trim();
}

/** Build styles.css – Master Design System (Tailwind-friendly, Inter, Dark mode). */
function buildStylesCss() {
  return `
:root {
  --hk-bg: #020617;
  --hk-bg-elevated: #020617;
  --hk-surface: #020617;
  --hk-surface-soft: #020617;
  --hk-border-subtle: rgba(148, 163, 184, 0.18);
  --hk-border-strong: rgba(148, 163, 184, 0.32);
  --hk-text-primary: #e5e7eb;
  --hk-text-muted: #9ca3af;
  --hk-accent: #6366f1;
  --hk-accent-soft: rgba(99, 102, 241, 0.15);
  --hk-accent-strong: #4f46e5;
  --hk-radius-lg: 0.9rem;
  --hk-radius-md: 0.7rem;
  --hk-radius-pill: 999px;
  --hk-shadow-elevated: 0 18px 45px rgba(15,23,42,0.9);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top left, #0b1120, #020617 55%, #000 100%);
  color: var(--hk-text-primary);
}

.app-header {
  border-bottom: 1px solid var(--hk-border-subtle);
  background: radial-gradient(circle at top left, rgba(99,102,241,0.2), rgba(15,23,42,0.95));
  backdrop-filter: blur(18px);
}

.header-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1rem 1.75rem;
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.logo {
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 0.8rem;
  background: linear-gradient(135deg, #818cf8, #4f46e5);
  color: #f9fafb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  box-shadow: 0 12px 30px rgba(79,70,229,0.55);
}

.app-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.app-tagline {
  margin: 0.18rem 0 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--hk-text-muted);
}

.app-main {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.75rem 1.75rem 2.25rem;
}

.value-prop {
  margin: 0 0 1.5rem;
  font-size: 0.95rem;
  color: var(--hk-text-muted);
}

.tool-section {
  position: relative;
  background: radial-gradient(circle at top left, rgba(15,23,42,0.9), rgba(15,23,42,0.96));
  border-radius: 1.1rem;
  padding: 1.5rem 1.5rem 1.8rem;
  border: 1px solid var(--hk-border-subtle);
  box-shadow: var(--hk-shadow-elevated);
}

.tool-section::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  border: 1px solid transparent;
  background: radial-gradient(circle at top left, rgba(148,163,184,0.45), transparent 55%);
  opacity: 0.08;
  pointer-events: none;
}

.tool-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.tool-form label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--hk-text-muted);
}

.tool-form input[type="text"],
.tool-form input[type="number"],
.tool-form textarea,
.tool-form select {
  padding: 0.55rem 0.8rem;
  border-radius: var(--hk-radius-md);
  border: 1px solid var(--hk-border-subtle);
  background: rgba(15,23,42,0.96);
  color: var(--hk-text-primary);
  font-size: 0.95rem;
  outline: none;
  transition: border-color 140ms ease-out, box-shadow 140ms ease-out, background-color 140ms ease-out, transform 80ms ease-out;
}

.tool-form textarea {
  min-height: 110px;
  resize: vertical;
}

.tool-form input:focus-visible,
.tool-form textarea:focus-visible,
.tool-form select:focus-visible {
  border-color: var(--hk-accent);
  box-shadow: 0 0 0 1px rgba(129,140,248,0.7);
}

.input-row {
  display: flex;
  gap: 0.55rem;
}

.input-row input {
  flex: 1;
}

.actions {
  display: flex;
  gap: 0.55rem;
  margin-top: 0.4rem;
}

.btn {
  position: relative;
  padding: 0.52rem 1.05rem;
  border-radius: var(--hk-radius-pill);
  font-weight: 500;
  font-size: 0.87rem;
  cursor: pointer;
  border: none;
  outline: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  transition: background-color 140ms ease-out, transform 80ms ease-out, box-shadow 140ms ease-out, filter 140ms ease-out;
}

.btn-primary {
  background: linear-gradient(to right, #6366f1, #4f46e5);
  color: #f9fafb;
  box-shadow: 0 18px 30px rgba(79,70,229,0.4);
}

.btn-primary:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(30,64,175,0.08);
  color: var(--hk-text-primary);
  border: 1px solid rgba(148,163,184,0.35);
}

.btn-secondary:hover {
  background: rgba(30,64,175,0.16);
}

.btn-small {
  padding: 0.28rem 0.6rem;
  font-size: 0.75rem;
}

.btn:focus-visible {
  box-shadow: 0 0 0 1px rgba(191,219,254,0.7), 0 0 0 4px rgba(59,130,246,0.45);
}

.btn--pulse {
  animation: hk-btn-pulse 0.9s ease-out;
}

@keyframes hk-btn-pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99,102,241,0.5); }
  60% { transform: scale(1.03); box-shadow: 0 0 0 10px rgba(99,102,241,0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99,102,241,0); }
}

.output-section {
  margin-top: 1.6rem;
}

.output-label {
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hk-text-muted);
}

.output-area {
  min-height: 4.2rem;
  padding: 0.9rem 1rem;
  background: radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.98));
  border-radius: var(--hk-radius-md);
  border: 1px solid var(--hk-border-strong);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
  line-height: 1.4;
  transition: border-color 140ms ease-out, box-shadow 140ms ease-out, background-color 140ms ease-out;
}

.output--flash {
  border-color: rgba(129,140,248,0.9);
  box-shadow: 0 0 0 1px rgba(129,140,248,0.7);
}

.tracker-list,
.directory-list {
  margin-top: 0.6rem;
}

.tracker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px dashed rgba(51,65,85,0.8);
}

.tracker-item span {
  flex: 1;
  font-size: 0.9rem;
}

@media (max-width: 640px) {
  .header-inner,
  .app-main {
    padding-left: 1.1rem;
    padding-right: 1.1rem;
  }

  .tool-section {
    padding: 1.3rem 1.2rem 1.4rem;
  }
}
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
