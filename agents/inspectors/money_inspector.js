/**
 * MONEY INSPECTOR – Heuristisk version utan OpenAI.
 * Roll: Bedöm intäktspotential och monetiseringsbarhet.
 *
 * - Ingen OpenAI används.
 * - Tar idétext som input.
 * - Returnerar { pass, uncertain, reason }.
 * - Loggar till konsol och superchief_report.log.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");

async function log(section, line) {
  const block = `\n--- MONEY INSPECTOR: ${section} ---\n${line}\n--- End ---\n`;
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // Ignorera loggfel
  }
}

export async function inspectMoney(idea) {
  const text = idea.toLowerCase();

  const monetizationKeywords = [
    "subscription",
    "abonnemang",
    "saas",
    "b2b",
    "license",
    "licence",
    "paid plan",
    "pricing",
    "tier",
    "upgrade",
    "freelancer",
    "for freelancers",
    "invoice",
    "calculator",
    "tool",
    "generator"
  ];

  const weakKeywords = ["open source only", "no monetization", "free only", "completely free"];

  let monetScore = 0;
  for (const k of monetizationKeywords) {
    if (text.includes(k)) monetScore += 2;
  }

  let weakScore = 0;
  for (const k of weakKeywords) {
    if (text.includes(k)) weakScore += 2;
  }

  if (idea.length < 20) {
    const reason = "Idea description too short to assess revenue model.";
    await log("UNCERTAIN", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: true, reason };
  }

  if (weakScore >= 2 && monetScore === 0) {
    const reason = "Monetization unclear or explicitly free-only.";
    await log("FAIL", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: false, reason };
  }

  if (monetScore === 0) {
    const reason = "No explicit monetization model detected.";
    await log("UNCERTAIN", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: true, reason };
  }

  const reason = "Idea contains clear hints of a monetizable SaaS/revenue model.";
  await log("PASS", `"${idea}" → ${reason}`);
  return { pass: true, uncertain: false, reason };
}
