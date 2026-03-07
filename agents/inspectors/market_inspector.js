/**
 * MARKET INSPECTOR – Heuristisk version utan OpenAI.
 * Roll: Bekräfta marknadspotential, trend och konkurrensnivå.
 *
 * - Ingen OpenAI används (ingen OPENAI_API_KEY krävs).
 * - Tar en idésträng som input.
 * - Returnerar { pass, uncertain, reason }.
 * - Loggar alla kontroller till konsol och superchief_report.log.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const reportLogPath = path.join(root, "superchief_report.log");

async function log(section, line) {
  const block = `\n--- MARKET INSPECTOR: ${section} ---\n${line}\n--- End ---\n`;
  console.log(block);
  try {
    await fs.appendFile(reportLogPath, block + "\n", "utf-8");
  } catch {
    // Ignorera loggfel
  }
}

export async function inspectMarket(idea) {
  const text = idea.toLowerCase();

  // Enkel bedömning av mättnad / konkurrens
  const saturatedKeywords = [
    "todo",
    "notes",
    "calendar",
    "password manager",
    "chatbot",
    "time tracker",
    "habit tracker",
    "simple website builder"
  ];

  const promisingKeywords = [
    "b2b",
    "saas",
    "analytics",
    "dashboard",
    "workflow",
    "automation",
    "niche",
    "vertical",
    "industry",
    "for freelancers",
    "for agencies",
    "for small businesses"
  ];

  let saturationScore = 0;
  for (const k of saturatedKeywords) {
    if (text.includes(k)) saturationScore += 2;
  }

  let opportunityScore = 0;
  for (const k of promisingKeywords) {
    if (text.includes(k)) opportunityScore += 2;
  }

  // Kort idéer → osäkert
  if (idea.length < 20) {
    await log("UNCERTAIN", `Idea too short to judge: "${idea}"`);
    return { pass: false, uncertain: true, reason: "Idea description too short to assess market." };
  }

  // Hög saturation + låg opportunity → fail
  if (saturationScore >= 4 && opportunityScore <= 2) {
    const reason = "Market looks saturated for this type of product.";
    await log("FAIL", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: false, reason };
  }

  // Ok marknad men lite data → uncertain
  if (opportunityScore === 0 && saturationScore === 0) {
    const reason = "No strong signals of either saturation or clear opportunity.";
    await log("UNCERTAIN", `"${idea}" → ${reason}`);
    return { pass: false, uncertain: true, reason };
  }

  const reason = "Heuristic market check suggests non-saturated niche with some opportunity.";
  await log("PASS", `"${idea}" → ${reason}`);
  return { pass: true, uncertain: false, reason };
}
