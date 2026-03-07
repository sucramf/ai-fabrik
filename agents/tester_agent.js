/**
 * TESTER AGENT – Automatically test generated apps before deployment.
 *
 * Tests: HTML loads without errors, JS no syntax errors, main feature produces output,
 * UI elements exist for each feature, no placeholder text remains.
 *
 * Input: app_path, product_spec
 * Output: { passed: true | false, issues: [] }
 * If issues found, caller may send back to workers for rebuild.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 1. HTML loads without errors – structure and no critical script errors. */
function testHtmlLoads(html, issues) {
  if (!html || typeof html !== "string") {
    issues.push("HTML: no content");
    return;
  }
  if (html.length < 100) {
    issues.push("HTML: content too short");
  }
  if (!/<!DOCTYPE\s+html/i.test(html)) {
    issues.push("HTML: missing or invalid DOCTYPE");
  }
  if (!/<html[\s>]/i.test(html)) {
    issues.push("HTML: missing <html>");
  }
  if (!/<head[\s>]/i.test(html)) {
    issues.push("HTML: missing <head>");
  }
  if (!/<body[\s>]/.test(html) || !/<\/body\s*>/.test(html)) {
    issues.push("HTML: missing or invalid <body>");
  }
  if (!/<title>[^<]+<\/title>/i.test(html)) {
    issues.push("HTML: missing <title>");
  }
  if (/<script[^>]*>[\s\S]*?throw\s+new\s+Error/i.test(html)) {
    issues.push("HTML: inline script contains throw new Error");
  }
}

/** 2. JS has no syntax errors – parse with Function (syntax-only). */
function testJsNoSyntaxErrors(jsCode, issues) {
  if (jsCode == null || typeof jsCode !== "string") {
    issues.push("JS: no app.js content");
    return;
  }
  const trimmed = jsCode.trim();
  if (trimmed.length === 0) {
    issues.push("JS: app.js is empty");
    return;
  }
  try {
    new Function(trimmed);
  } catch (e) {
    if (e instanceof SyntaxError) {
      issues.push("JS: syntax error – " + e.message);
    } else {
      issues.push("JS: parse/run error – " + e.message);
    }
  }
}

/** 3. Main feature produces output – JS has logic that writes to output area. */
function testMainFeatureProducesOutput(html, jsCode, issues) {
  const hasOutputEl = /id=["']output["']/i.test(html) || /getElementById\s*\(\s*["']output["']\s*\)/i.test(html) || /getElementById\s*\(\s*["']output["']\s*\)/i.test(jsCode);
  if (!hasOutputEl) {
    issues.push("Main feature: no output element (id='output') in HTML or JS");
  }
  const jsWritesOutput =
    /setOutput\s*\(/i.test(jsCode) ||
    /\.textContent\s*=/i.test(jsCode) ||
    /\.innerHTML\s*=/i.test(jsCode) ||
    /getElementById\s*\(\s*["']output["']\s*\)/i.test(jsCode);
  if (!jsWritesOutput) {
    issues.push("Main feature: JS does not appear to write to output (setOutput, textContent, or getElementById('output'))");
  }
}

/** 4. UI elements exist for each feature – form, run button, output, copy; type-specific inputs. */
function testUiElementsForFeatures(html, productSpec, issues) {
  const spec = productSpec || {};
  const type = (spec.product_type || "micro_saas").toLowerCase();

  const requiredSelectors = [
    { re: /<form[\s>]/i, name: "form" },
    { re: /id=["'](toolForm|mainForm)["']/i, name: "main form (id=toolForm)" },
    { re: /id=["']runBtn["']|type=["']submit["']/i, name: "Run/submit button" },
    { re: /id=["']output["']/i, name: "output area (id=output)" },
    { re: /id=["']copyBtn["']/i, name: "Copy button" }
  ];
  for (const { re, name } of requiredSelectors) {
    if (!re.test(html)) {
      issues.push("UI: missing " + name);
    }
  }

  const typeInputs = {
    generator: [/id=["']inputText["']/i],
    calculator: [/id=["']inputA["']/i, /id=["']inputB["']/i],
    tracker: [/id=["']inputItem["']/i, /id=["']trackerList["']/i],
    analyzer: [/id=["']inputText["']/i],
    directory: [/id=["']inputSearch["']/i, /id=["']directoryList["']/i],
    micro_saas: [/id=["']inputText["']/i]
  };
  const inputs = typeInputs[type] || typeInputs.micro_saas;
  for (const re of inputs) {
    if (!re.test(html)) {
      issues.push("UI: missing expected input/container for product_type=" + type);
      break;
    }
  }

  const features = Array.isArray(spec.features) ? spec.features : [];
  if (features.length > 0) {
    const hasLabels = /<label[\s>]/i.test(html);
    const hasActions = /btn-primary|Run|Submit/i.test(html);
    if (!hasLabels) {
      issues.push("UI: no labels for inputs (features expect usable form)");
    }
    if (!hasActions) {
      issues.push("UI: no primary action button (Run/Submit)");
    }
  }
}

/** 5. No placeholder text remains – exclude acceptable placeholders in inputs. */
function testNoPlaceholderTextRemains(html, jsCode, issues) {
  const forbidden = [
    { re: /\bLorem\s+ipsum\b/i, msg: "Placeholder 'Lorem ipsum' remains" },
    { re: /\bTODO\b/i, msg: "TODO remains in output" },
    { re: /\bFIXME\b/i, msg: "FIXME remains" },
    { re: /\[SET_[A-Z_]+\]/i, msg: "Unreplaced [SET_...] placeholder" },
    { re: /SET_YOUR_[A-Z_]+/i, msg: "Unreplaced SET_YOUR_... placeholder" },
    { re: /Replace\s+this\s+with\s+your\s+own/i, msg: "Generic 'Replace this' placeholder" },
    { re: /Add\s+your\s+(own\s+)?(content|text)\s+here/i, msg: "Generic 'Add your content here' placeholder" }
  ];
  const combined = (html || "") + "\n" + (jsCode || "");
  for (const { re, msg } of forbidden) {
    if (re.test(combined)) {
      issues.push("Placeholder: " + msg);
    }
  }
}

/**
 * Run all app tests. Returns { passed, issues }.
 * Caller may send app back to workers for rebuild when passed === false.
 *
 * @param {string} app_path - Path to app folder (e.g. deploy/app_123 or apps/app_123)
 * @param {Object} product_spec - Product spec (product_type, features, etc.)
 * @returns {Promise<{ passed: boolean, issues: string[] }>}
 */
export async function runAppTests(app_path, product_spec) {
  const issues = [];
  const dir = path.resolve(root, app_path);

  const stat = await fs.stat(dir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    return { passed: false, issues: ["app_path is not a directory: " + app_path] };
  }

  let htmlPath = path.join(dir, "index.html");
  if (!(await exists(htmlPath))) {
    htmlPath = path.join(dir, "app.html");
  }
  if (!(await exists(htmlPath))) {
    return { passed: false, issues: ["Missing index.html and app.html in " + app_path] };
  }

  let html;
  let jsCode = null;
  try {
    html = await fs.readFile(htmlPath, "utf-8");
  } catch (e) {
    return { passed: false, issues: ["Could not read HTML: " + e.message] };
  }

  const jsPath = path.join(dir, "app.js");
  if (await exists(jsPath)) {
    try {
      jsCode = await fs.readFile(jsPath, "utf-8");
    } catch (e) {
      issues.push("Could not read app.js: " + e.message);
    }
  } else {
    issues.push("Missing app.js");
  }

  testHtmlLoads(html, issues);
  testJsNoSyntaxErrors(jsCode, issues);
  testMainFeatureProducesOutput(html, jsCode, issues);
  testUiElementsForFeatures(html, product_spec, issues);
  testNoPlaceholderTextRemains(html, jsCode, issues);

  const passed = issues.length === 0;
  return { passed, issues };
}
