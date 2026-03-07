/**
 * TREND ANALYST – Prioriterar idéer enligt live-liknande marknads- och trenddata.
 *
 * Källor (konceptuellt):
 * - Google Trends, Reddit, X/Twitter, LinkedIn, YouTube Trends, Pinterest, TikTok
 * - Product Hunt, Kickstarter/Indiegogo, Amazon Best Sellers, Etsy Trending
 * - Stack Overflow, GitHub Trending, andra dev-plattformar
 *
 * Returnerar för varje idé:
 * { trend_score (0–100), market_saturation (0–100), pass, uncertain, reason }
 */
import { collectLiveSignals } from './live_sources.js';
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getText(res) {
  return (res.output?.[0]?.content?.[0]?.text ?? res.output_text ?? "")
    .trim()
    .replace(/^```json?\s*|\s*```$/g, "");
}

/**
 * Analyserar en idé mot trender mars–dec 2026 och intäktspotential.
 * @param {string} idea - Idé att utvärdera
 * @returns {Promise<{ trend_score: number, market_saturation: number, pass: boolean, uncertain: boolean, reason: string }>}
 */
export async function analyzeTrends(idea) {
  const res = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are a 2026 trend & market analyst. Evaluate this product/SaaS idea using conceptual signals from:
- Google Trends, Reddit, X/Twitter, LinkedIn, YouTube Trends, Pinterest, TikTok
- Product Hunt, Kickstarter/Indiegogo, Amazon Best Sellers, Etsy Trending
- Stack Overflow, GitHub Trending, and other developer communities

You do NOT have direct API access. Instead, approximate based on your knowledge of 2026 markets and likely patterns on these platforms.

Return ONLY valid JSON in this exact shape, no other text:
{"trend_score": 0-100, "market_saturation": 0-100, "pass": true/false, "uncertain": true/false, "reason": "short explanation in English"}

Definitions:
- trend_score: 0–100 where 0 = no real interest, 100 = very strong and growing multi-platform interest.
- market_saturation: 0–100 where 0 = no competition, 100 = extremely saturated with dominant players.

Strict rules:
- If uncertain is true, you MUST set pass to false.
- PASS should usually require trend_score >= 60 AND market_saturation <= 70.
- PASS only if there is real monetizable demand and room for a new product.

Idea to evaluate:
${idea}
`
  });

  try {
    const out = JSON.parse(getText(res));
    let trend_score = Number(out.trend_score);
    let market_saturation = Number(out.market_saturation);
    if (!Number.isFinite(trend_score)) trend_score = 0;
    if (!Number.isFinite(market_saturation)) market_saturation = 100;
    trend_score = Math.max(0, Math.min(100, trend_score));
    market_saturation = Math.max(0, Math.min(100, market_saturation));

    const uncertain = Boolean(out.uncertain);
    const pass = Boolean(out.pass) && !uncertain;

    return {
      trend_score,
      market_saturation,
      pass,
      uncertain,
      reason: String(out.reason ?? "").slice(0, 500)
    };
  } catch {
    return {
      trend_score: 0,
      market_saturation: 100,
      pass: false,
      uncertain: true,
      reason: "Trend Analyst parse error; report to Superchief."
    };
  }
}

/**
 * Analyserar alla idéer; returnerar endast de som är rekommenderade (pass och inte uncertain).
 * Idéer med uncertain=true rapporteras till Superchief och skickas inte vidare här.
 * Godkända idéer sorteras efter trend_score (högst först).
 * @param {string[]} ideas
 * @returns {Promise<{ approved: string[], reportedToSuperchief: { idea: string, reason: string, trend_score: number, market_saturation: number }[] }>}
 */
export async function filterByTrends(ideas) {
  const approvedDetails = [];
  const reportedToSuperchief = [];

  for (const idea of ideas) {
    const result = await analyzeTrends(idea);
    if (result.uncertain) {
      reportedToSuperchief.push({
        idea,
        reason: result.reason,
        trend_score: result.trend_score,
        market_saturation: result.market_saturation
      });
      continue;
    }
    if (result.pass) {
      approvedDetails.push({
        idea,
        trend_score: result.trend_score,
        market_saturation: result.market_saturation
      });
    }
  }

  approvedDetails.sort((a, b) => b.trend_score - a.trend_score);
  const approved = approvedDetails.map((x) => x.idea);

  return { approved, reportedToSuperchief };
}
