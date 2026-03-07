/**
 * QUALITY TESTER – Heuristisk QA-stickprov utan OpenAI.
 * Kvalitetsbar: webbsidor ≥ Hemnet (ren, professionell, användbar, trovärdig).
 *
 * - Ingen OpenAI används.
 * - Testar HTML-filer (app.html/index.html) eller en direkt HTML-sträng.
 * - Returnerar { passed, message }.
 */

import fs from "fs/promises";
import path from "path";

/**
 * @param {string} artifact - HTML content or path to app folder
 * @returns {Promise<{ passed: boolean, message: string }>}
 */
export async function testQuality(artifact) {
  let html =
    typeof artifact === "string" && (artifact.includes("<") || artifact.includes(">"))
      ? artifact
      : null;

  if (!html && typeof artifact === "string") {
    const root = process.cwd();
    const dir = path.resolve(root, artifact);
    const htmlPath = path.join(dir, "app.html");
    const altPath = path.join(dir, "index.html");
    try {
      if (await exists(htmlPath)) html = await fs.readFile(htmlPath, "utf-8");
      else if (await exists(altPath)) html = await fs.readFile(altPath, "utf-8");
    } catch {
      return { passed: false, message: "Could not read artifact" };
    }
  }

  if (!html || html.length < 100) {
    return { passed: false, message: "Too little HTML content for a real product." };
  }

  const hasDoctype = /<!DOCTYPE\s+html/i.test(html);
  const hasHtml = /<html[\s>]/i.test(html);
  const hasHead = /<head[\s>]/i.test(html);
  const hasBody = /<body[\s>]/i.test(html) && /<\/body\s*>/i.test(html);
  const hasTitle = /<title>[^<]+<\/title>/i.test(html);
  const hasH1 = /<h1[^>]*>[^<]+<\/h1>/i.test(html);
  const hasMetaViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
  const hasCta =
    /<button[^>]*>[^<]+<\/button>/i.test(html) ||
    /<a[^>]*class=["'][^"']*(btn|button|cta)[^"']*["'][^>]*>[^<]+<\/a>/i.test(html);

  const issues = [];
  if (!hasDoctype) issues.push("missing DOCTYPE");
  if (!hasHtml) issues.push("missing <html>");
  if (!hasHead) issues.push("missing <head>");
  if (!hasBody) issues.push("invalid or missing <body>");
  if (!hasTitle) issues.push("missing <title>");
  if (!hasH1) issues.push("missing main heading <h1>");
  if (!hasMetaViewport) issues.push("missing responsive <meta viewport>");
  if (!hasCta) issues.push("no clear call-to-action");

  if (issues.length === 0) {
    return { passed: true, message: "PASS" };
  }

  // Om bara småsaker saknas → fortfarande FAIL för QA, men med tydlig orsak
  return {
    passed: false,
    message: `Structural/UI issues detected: ${issues.join(", ")}`
  };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

