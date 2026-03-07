/**
 * TEST RUNNER – Produktionsklar. Stickprovskontroll: PASS/FAIL.
 * Rapporterar FAIL till Superchief; endast PASS ska deployas.
 */
import fs from "fs/promises";
import path from "path";

/**
 * @param {string} artifactPath - Path to app folder (e.g. deploy/app_123) or app.html file
 * @returns {Promise<{ passed: boolean, message: string }>}
 */
export async function runTests(artifactPath) {
  const root = process.cwd();
  let dir = path.resolve(root, artifactPath);
  let htmlPath = path.join(dir, "app.html");
  if (!(await exists(htmlPath))) {
    htmlPath = path.join(dir, "index.html");
  }
  if (!(await exists(htmlPath))) {
    if ((await statSafe(dir)).isFile?.()) htmlPath = dir;
    else return { passed: false, message: `Missing app.html/index.html in ${artifactPath}` };
  }
  const stat = await statSafe(htmlPath);
  if (!stat?.isFile?.()) return { passed: false, message: `Not a file: ${htmlPath}` };

  let html;
  try {
    html = await fs.readFile(htmlPath, "utf-8");
  } catch (e) {
    return { passed: false, message: `Read error: ${e.message}` };
  }

  const hasDoctype = /<!DOCTYPE\s+html/i.test(html);
  const hasBody = /<body[\s>]/.test(html) && /<\/body\s*>/.test(html);
  const hasContent = html.replace(/\s/g, "").length > 100;
  const noCriticalError = !/<script[^>]*>[\s\S]*?throw\s+new\s+Error/i.test(html);

  const passed = hasDoctype && hasBody && hasContent && noCriticalError;
  const message = passed
    ? "PASS"
    : [!hasDoctype && "missing DOCTYPE", !hasBody && "invalid body", !hasContent && "too short", !noCriticalError && "critical script error"].filter(Boolean).join("; ") || "FAIL";

  return { passed, message: passed ? "PASS" : message };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(p) {
  try {
    return await fs.stat(p);
  } catch {
    return {};
  }
}
