/**
 * PRICING MONETIZATION AGENT – Suggests concrete pricing models.
 *
 * Export:
 *   - suggestPricing(idea: string): Promise<{ model: string, monthly_price_suggestions: number[], notes: string }>
 */

export async function suggestPricing(idea) {
  const text = (idea || "").toLowerCase();

  let model = "subscription";
  const prices: number[] = [];

  if (text.includes("enterprise") || text.includes("b2b") || text.includes("teams")) {
    model = "tiered_subscription";
    prices.push(29, 79, 199);
  } else if (text.includes("api") || text.includes("developer")) {
    model = "usage_based";
    prices.push(19, 49, 149);
  } else if (text.includes("one-time") || text.includes("lifetime")) {
    model = "one_time_license";
    prices.push(49, 99);
  } else {
    model = "simple_subscription";
    prices.push(9, 19, 39);
  }

  const notes =
    "Pricing suggestions are indicative and should be validated with real users. " +
    "Adjust anchors based on target market and perceived value.";

  return { model, monthly_price_suggestions: prices, notes };
}
