/**
 * LEGAL INSPECTOR – Heuristisk version utan OpenAI.
 * Roll: Juridik, copyright, moral (GDPR, ansvar, känsliga ämnen).
 *
 * - Ingen OpenAI används.
 * - Tar idétext som input.
 * - Kollar mot uppenbart känsliga / reglerade områden.
 * - Returnerar { pass, uncertain, reason } och loggar till superchief_report.log.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");

async function log(section, line) {
  const block = `\n--- LEGAL INSPECTOR: ${section} ---\n${line}\n--- End ---\n`;
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // Ignorera loggfel
  }
}

export async function inspectLegal(idea) {
  const text = idea.toLowerCase();

  const highRiskKeywords = [
    "medical",
    "health diagnosis",
    "diagnostic",
    "asylum",
    "immigration advice",
    "visa advice",
    "legal advice",
    "juridisk rådgivning",
    "financial advice",
    "trading bot",
    "investment recommendations",
    "loan approval",
    "credit scoring",
    "children data",
    "biometric",
    "face recognition"
  ];

  for (const k of highRiskKeywords) {
    if (text.includes(k)) {
      const reason = `High legal/ethical risk keyword detected ("${k}").`;
      await log("FAIL", `"${idea}" → ${reason}`);
      return { pass: false, uncertain: false, reason };
    }
  }

  // Copyright / scraping / trademark risk
  const copyrightScrapingTrademark = [
    { k: "download movies", reason: "Copyright violation risk" },
    { k: "movie downloader", reason: "Copyright violation risk" },
    { k: "netflix download", reason: "Copyright violation risk" },
    { k: "scrape ", reason: "Scraping may violate ToS or law" },
    { k: "scraping ", reason: "Scraping may violate ToS or law" },
    { k: "illegal source", reason: "Illegal sources not allowed" },
    { k: "pirate", reason: "Copyright violation risk" },
    { k: "torrent", reason: "Copyright violation risk" },
    { k: "clone netflix", reason: "Trademark and copyright risk" },
    { k: "like spotify", reason: "Trademark resemblance risk" },
    { k: "spotify clone", reason: "Trademark resemblance risk" },
    { k: "youtube downloader", reason: "Copyright/ToS violation risk" }
  ];
  for (const { k, reason } of copyrightScrapingTrademark) {
    if (text.includes(k)) {
      await log("FAIL", `"${idea}" → ${reason}`);
      return { pass: false, uncertain: false, reason };
    }
  }

  // GDPR / data-relaterat – inte direkt fail, men flagga om oklart
  if (text.includes("personal data") || text.includes("user tracking") || text.includes("gdpr")) {
    const reason =
      "Handles personal data or tracking; requires careful GDPR/compliance review (treat as uncertain).";
    await log("UNCERTAIN", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: true, reason };
  }

  const reason = "No obvious high-risk legal/ethical issues detected.";
  await log("PASS", `"${idea}" → ${reason}`);
  return { pass: true, uncertain: false, reason };
}
