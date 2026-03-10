/**
 * IDEA FILTER – Ruthless Investor 2.0.
 * HK-UPGRADE: Uses both textual heuristics and LLM judgment + optional market_signals.json context.
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

function heuristicReject(idea) {
  const text = (idea || "").toLowerCase();
  const banned = [
    "token", "crypto", "nft", "betting", "trading bot", "get rich", "casino",
    "ai prompt pack", "logo generator", "domain generator", "seo spam", "followers", "likes",
  ];
  if (text.length < 25) return true;
  return banned.some((b) => text.includes(b));
}

export async function filterIdea(idea) {
  if (heuristicReject(idea)) {
    return false;
  }

  const signals = await loadMarketSignals();
  const signalsSnippet = signals
    .map((s) => {
      const src = s.source || s.channel || "unknown";
      const desc = s.problem || s.description || s.title || "";
      return `- [${src}] ${desc}`;
    })
    .join("\n");

  const contextBlock = signalsSnippet
    ? `Relevant market signals (for context, do NOT override safety):\n${signalsSnippet}\n\n`
    : "";

  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `${contextBlock}You are a ruthless startup investor in 2026.\n\nYour job is to judge startup ideas with a focus on real market pull and profit-first economics.\n\nReject ideas that are:\n- legally risky\n- ethically sensitive\n- medical, immigration, asylum, legal advice\n- financial advice or trading signals\n- extremely saturated markets (generic todo apps, generic CRMs, generic chatbots)\n- easily replaced by ChatGPT alone\n- impossible to monetize or with unclear payer\n- vanity or gimmick tools with no repeat usage\n\nPrefer ideas that:\n- solve a concrete, painful problem mentioned in the signals above\n- are clearly monetizable as SaaS\n- have a specific target user and buying persona\n- have solid unit economics potential (LTV/CAC > ~3 in a realistic scenario)\n- are niche but non-tiny markets\n\nIdea:\n${idea}\n\nAnswer ONLY with:\nPASS\nor\nREJECT`,
  });

  const answer = res.output_text.trim();
  return answer === "PASS";
}
