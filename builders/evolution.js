/**
 * EVOLUTION – Idéfiltrering utan OpenAI.
 *
 * Roll: filterIdeas(ideas) → bästa idéer. Anropas av Superchief och
 * av superchief_from_trend_json.js.
 *
 * Viktigt:
 * - Ingen OpenAI används här (ingen risk för OPENAI_API_KEY-krasch).
 * - Om ideas inte ges, försöker vi läsa från ideas/approved_trend_ideas.json.
 * - Denna modul gör EN sak: välja vilka idéer som går vidare.
 *   Själva bygg/QA/deploy/marknadsföring hanteras av Superchief-skriptet.
 */

import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const approvedIdeasJsonPath = path.join(root, "ideas", "approved_trend_ideas.json");

/**
 * Läser godkända idéer från ideas/approved_trend_ideas.json.
 * Förväntat format (minst ett av fälten):
 * {
 *   "approvedIdeas": ["idea1", "idea2", ...],
 *   "approved": ["idea1", "idea2", ...]
 * }
 */
async function readApprovedIdeasFromJson() {
  try {
    const raw = await fs.readFile(approvedIdeasJsonPath, "utf-8");
    const json = JSON.parse(raw);
    const list = json.approvedIdeas || json.approved || [];
    if (!Array.isArray(list)) return [];
    return list.filter((i) => typeof i === "string" && i.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Enkel, deterministisk ranking:
 * - Längre, mer beskrivande idéer premieras (fler ord/tecken)
 * - Idéer med vissa nyckelord får ett litet lyft (SaaS, AI, B2B etc.)
 */
function scoreIdea(idea) {
  const text = idea.toLowerCase();
  const lengthScore = Math.min(40, idea.length / 2); // längre text → lite högre poäng

  let keywordScore = 0;
  if (text.includes("saas")) keywordScore += 15;
  if (text.includes("ai")) keywordScore += 10;
  if (text.includes("b2b")) keywordScore += 8;
  if (text.includes("subscription") || text.includes("abonnemang")) keywordScore += 8;
  if (text.includes("automation") || text.includes("automated")) keywordScore += 6;
  if (text.includes("analytics") || text.includes("dashboard")) keywordScore += 6;
  if (text.includes("api")) keywordScore += 5;

  return lengthScore + keywordScore;
}

/**
 * Huvudfunktion:
 *
 * - Om ideas inte ges eller är tom:
 *   * läs ideas/approved_trend_ideas.json och använd dess approved-lista
 * - Om ideas ges:
 *   * använd den lista som skickas in
 *
 * - Sortera idéer på score (högst först)
 * - Returnera top N (eller alla om N < 10)
 *
 * @param {string[]|undefined} ideas
 * @returns {Promise<string[]>}
 */
export async function filterIdeas(ideas) {
  let sourceIdeas = ideas;

  if (!Array.isArray(sourceIdeas) || sourceIdeas.length === 0) {
    sourceIdeas = await readApprovedIdeasFromJson();
  }

  if (!Array.isArray(sourceIdeas) || sourceIdeas.length === 0) {
    console.log("Evolution: no ideas provided or found in approved_trend_ideas.json");
    return [];
  }

  const scored = sourceIdeas
    .filter((i) => typeof i === "string" && i.trim().length > 0)
    .map((idea) => ({
      idea,
      score: scoreIdea(idea)
    }));

  scored.sort((a, b) => b.score - a.score);

  // Heuristik: om många idéer → ta top 10, annars alla
  const limit = scored.length > 10 ? 10 : scored.length;
  const best = scored.slice(0, limit).map((x) => x.idea);

  console.log("\nEvolution (no-OpenAI) selected ideas:");
  best.forEach((idea, i) => console.log(`${i + 1}. ${idea}`));

  return best;
}
