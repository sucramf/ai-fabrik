/**
 * QUALITY INSPECTOR – Heuristisk version utan OpenAI.
 * Roll: Kvalitetsbar – Spel ≥ Monkey Island, Webbsidor ≥ Hemnet, Appar/AI hög kvalitet.
 *
 * - Ingen OpenAI används.
 * - Tar artifact (HTML eller annat) som input.
 * - Kontrollerar grundläggande kvalitetssignaler i HTML:
 *   * DOCTYPE, <html>, <head>, <body>
 *   * titel, huvudrubrik, knappar/länkar
 *   * enkel layout/stil
 * - Returnerar { pass, uncertain, reason } och loggar till superchief_report.log.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");

async function log(section, line) {
  const block = `\n--- QUALITY INSPECTOR: ${section} ---\n${line}\n--- End ---\n`;
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // Ignorera loggfel
  }
}

/**
 * @param {string} artifact - HTML or artifact content
 * @param {string} [productType] - "game" | "website" | "app" | "ai" (default website)
 */
export async function inspectQuality(artifact, productType = "website") {
  const html = String(artifact || "");

  if (html.length < 100) {
    const reason = "Artifact too short to be a serious product.";
    await log("FAIL", reason);
    return { pass: false, uncertain: false, reason };
  }

  const hasDoctype = /<!DOCTYPE\s+html/i.test(html);
  const hasHtml = /<html[\s>]/i.test(html);
  const hasHead = /<head[\s>]/i.test(html);
  const hasBody = /<body[\s>]/i.test(html) && /<\/body\s*>/i.test(html);
  const hasTitle = /<title>[^<]+<\/title>/i.test(html);
  const hasH1 = /<h1[^>]*>[^<]+<\/h1>/i.test(html);
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
  if (!hasCta) issues.push("no obvious call-to-action (button/link)");

  if (issues.length === 0) {
    const reason =
      "Artifact looks like a complete, structured page with headings and CTA – passes heuristic quality bar.";
    await log("PASS", reason);
    return { pass: true, uncertain: false, reason };
  }

  // En eller två mindre brister → uncertain
  if (issues.length <= 2) {
    const reason = `Minor quality issues detected: ${issues.join(", ")}.`;
    await log("UNCERTAIN", reason);
    return { pass: false, uncertain: true, reason };
  }

  const reason = `Multiple structural/UX issues: ${issues.join(", ")}.`;
  await log("FAIL", reason);
  return { pass: false, uncertain: false, reason };
}
