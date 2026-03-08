/**
 * MARKET VALUE INSPECTOR – Ensures ideas have realistic revenue potential.
 *
 * Even if an idea passes legal + capability checks, it must show:
 * - monetization potential
 * - real user demand
 * - plausible distribution channel
 *
 * Return: { pass, uncertain, reason }.
 * Logs to logs/market_value_inspector.log.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const LOG_PATH = path.join(root, "logs", "market_value_inspector.log");

async function log(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data !== null && data !== undefined
    ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
    : { level, message };
  const extra = typeof payload === "object" && payload.message
    ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
    : {};
  const line = ts + " [" + (level || "info").toUpperCase() + "] " + (payload.message || message) + (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");
  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
    // ignore
  }
}

/** Spam / low-value patterns → reject */
const SPAM_PATTERNS = [
  { re: /\b(random\s*meme|meme\s*generator)\b/i, reason: "Random meme generator – no real market value" },
  { re: /\b(fake\s*news\s*generator|fake\s*news\s*tool)\b/i, reason: "Fake news generator – unethical, no viable monetization" },
  { re: /\b(clickbait\s*generator|clickbait\s*tool)\b/i, reason: "Clickbait generator – low-value spam" },
  { re: /\b(random\s*fact\s*generator|random\s*cat\s*fact|random\s*trivia)\b/i, reason: "Random fact generator – no monetization path" },
  { re: /\b(content\s*spinner|article\s*spinner|rewrite\s*spam)\b/i, reason: "Trivial content spinner – spam pattern" },
  { re: /\b(low-effort\s*ai\s*wrapper|simple\s*chatgpt\s*wrapper)\b/i, reason: "Low-effort AI wrapper – no distinct value" },
  { re: /\b(clone\s+.+\s*but\s+worse|worse\s*clone)\b/i, reason: "Clone-without-differentiation – no market value" },
  { re: /\b(no\s*monetization|free\s*only\s*no\s*revenue|no\s*revenue\s*path)\b/i, reason: "No monetization path" }
];

/** Signals of real demand / monetization / distribution */
const DEMAND_SIGNALS = [
  /\b(saas|subscription|b2b|freelancer|agency|small\s*business|startup)\b/i,
  /\b(calculator|tracker|planner|tool|dashboard|workflow|automation)\b/i,
  /\b(invoice|payment|billing|pricing|tier|plan)\b/i,
  /\b(seo|keyword|meta|landing|conversion)\b/i,
  /\b(game|puzzle|quiz|learning|education|course|duolingo)\b/i,
  /\b(niche|vertical|industry|for\s+developers|for\s+designers|for\s+teams)\b/i,
  /\b(problem|solve|streamline|productivity|efficiency)\b/i,
  /\b(community|reddit|product\s*hunt|indie|maker)\b/i
];

/** Target user signals */
const TARGET_USER_SIGNALS = [
  /\b(for\s+freelancers|for\s+teams|for\s+students|for\s+developers|for\s+small\s*business)\b/i,
  /\b(target\s*user|primary\s*user|audience)\b/i,
  /\b(b2b|b2c|consumer|professional)\b/i
];

/**
 * Inspect an idea for market value: monetization potential, real demand, plausible distribution.
 * @param {string} idea - Raw idea string
 * @returns {Promise<{ pass: boolean, uncertain: boolean, reason: string }>}
 */
export async function inspectMarketValue(idea) {
  const text = (idea || "").trim();
  if (!text) {
    await log("info", "Market value check", { idea: "", pass: false, reason: "Empty idea" });
    return { pass: false, uncertain: false, reason: "Empty idea" };
  }

  const lower = text.toLowerCase();

  for (const { re, reason } of SPAM_PATTERNS) {
    if (re.test(lower)) {
      await log("info", "Market value check", { idea: text.slice(0, 80), pass: false, reason });
      return { pass: false, uncertain: false, reason };
    }
  }

  let demandScore = 0;
  for (const re of DEMAND_SIGNALS) {
    if (re.test(lower)) demandScore += 1;
  }

  let targetScore = 0;
  for (const re of TARGET_USER_SIGNALS) {
    if (re.test(lower)) targetScore += 1;
  }

  if (demandScore >= 1 || targetScore >= 1) {
    await log("info", "Market value check", { idea: text.slice(0, 80), pass: true });
    return { pass: true, uncertain: false, reason: "Clear practical problem, SaaS/tool, entertainment, target user, or distribution channel" };
  }

  if (text.length < 25) {
    await log("info", "Market value check", { idea: text.slice(0, 80), pass: false, uncertain: true, reason: "Idea too short to assess market value" });
    return { pass: false, uncertain: true, reason: "Idea too short to assess market value" };
  }

  await log("info", "Market value check", { idea: text.slice(0, 80), pass: false, uncertain: true, reason: "No clear monetization or demand signals" });
  return { pass: false, uncertain: true, reason: "No clear monetization or demand signals" };
}
