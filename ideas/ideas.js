/**
 * IDEAS – Generates SaaS ideas via LLM.
 * HK-UPGRADE: Market Feedback Loop
 * - Reads market_signals.json to seed idea generation with real signals.
 */
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const root = process.cwd();
const SIGNALS_PATH = path.join(root, "data", "market_signals.json");

async function loadMarketSignals() {
  try {
    const raw = await fs.readFile(SIGNALS_PATH, "utf-8");
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json.slice(0, 20);
  } catch {
    return [];
  }
}

export async function generateIdeas(count = 10) {
  const signals = await loadMarketSignals();
  const signalsSnippet = signals
    .map((s) => {
      const src = s.source || s.channel || "unknown";
      const desc = s.problem || s.description || s.title || "";
      return `- [${src}] ${desc}`;
    })
    .join("\n");

  const contextBlock = signalsSnippet
    ? `Recent market signals (problems users actually mention):\n${signalsSnippet}\n\n`
    : "";

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `You are a startup idea generator in March 2026.\n\n${contextBlock}Generate ${count} SaaS web tool ideas.\n\nRules:\n- one clear function\n- must be derived from the problems/signals above when provided\n- useful for normal people or small businesses\n- realistic to build fast\n- possible to charge money\n- avoid legal risk or sensitive topics\n- avoid extremely crowded markets\n\nReturn ONLY a numbered list of ideas.`,
  });

  const text = res.output_text;

  const ideas = text
    .split("\n")
    .map((i) => i.replace(/^[0-9\-\.\*\s]+/, "").trim())
    .filter((i) => i.length > 20);

  return ideas;
}
