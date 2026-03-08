/**
 * CAPABILITY FILTER – Rejects ideas that are too complex for automated factory builds.
 * Uses product_spec (e.g. from product_architect) to decide allowed/rejected and suggest simplified scope.
 *
 * Input: product_spec
 * Output: { allowed, reason, adjusted_scope }
 */

/** Allowed product categories (product_architect output). Normalize: lowercase, spaces/hyphens → underscore. */
const ALLOWED_PRODUCT_TYPES = new Set([
  "web_app",
  "mobile_app",
  "desktop_app",
  "browser_game",
  "casual_web_game",
  "saas_micro_product",
  "focused_platform",
  "specialized_productivity_tool",
  "niche_consumer_app",
  "content_or_learning_product",
  "generator",
  "calculator",
  "tracker",
  "analyzer",
  "directory",
  "micro_saas"
]);

/** Allowed category keywords (product_name, core_problem, value_proposition). */
const ALLOWED_CATEGORY_KEYWORDS = [
  "generator", "generate", "calculator", "calculate", "tracker", "track", "tracking",
  "micro saas", "micro-saas", "niche", "seo", "keyword", "meta tag", "sitemap",
  "creator", "content", "thumbnail", "caption", "hashtag", "schedule post"
];

/** Reject: full social networks. */
const REJECT_SOCIAL = [
  "social network", "social platform", "feed", "friends", "followers", "messaging platform",
  "chat app", "community platform", "like and share", "news feed"
];

/** Reject: AAA games. */
const REJECT_GAMES = [
  "aaa game", "video game", "multiplayer game", "3d game", "game engine",
  "real-time multiplayer", "game with graphics"
];

/** Reject: legal/medical advisory. */
const REJECT_LEGAL_MEDICAL = [
  "legal advice", "juridisk rådgivning", "medical advice", "health diagnosis",
  "diagnostic", "treatment recommendation", "legal document", "contract advice",
  "medical recommendation", "clinical"
];

/** Reject: marketplaces requiring human moderation. */
const REJECT_MARKETPLACE_MODERATION = [
  "marketplace", "peer-to-peer", "p2p", "user-generated content", "ugc",
  "moderation", "human review", "approval workflow", "seller verification",
  "buyer and seller", "escrow", "dispute resolution"
];

function searchSpec(spec, term) {
  const text = [
    spec.product_name,
    spec.core_problem,
    spec.value_proposition,
    spec.target_user || "",
    (spec.features || []).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes(term.toLowerCase());
}

function matchesAny(spec, terms) {
  return terms.some((term) => searchSpec(spec, term));
}

/**
 * Build adjusted_scope suggestions when the idea is rejected.
 */
function suggestAdjustedScope(spec, rejectionReason) {
  const suggestions = [];

  if (spec.build_complexity === "high" || (spec.estimated_build_hours || 0) > 40) {
    suggestions.push("Reduce to a single core feature (one input → one output or one dashboard).");
    suggestions.push("Avoid external APIs or use at most one read-only API.");
    suggestions.push("Target 8–40 build hours: landing + app page + simple logic only.");
  }

  if (matchesAny(spec, REJECT_SOCIAL)) {
    suggestions.push("Simplify to a single utility: e.g. a generator or calculator, not a full social feed.");
    suggestions.push("Consider: standalone content generator or link-in-bio tool instead of a network.");
  }

  if (matchesAny(spec, REJECT_GAMES)) {
    suggestions.push("Consider: a game-related calculator, tracker, or asset generator instead of a full game.");
    suggestions.push("Example: score calculator, playtime tracker, or simple level/stat generator.");
  }

  if (matchesAny(spec, REJECT_LEGAL_MEDICAL)) {
    suggestions.push("Factory cannot build advisory tools. Consider: document template generator or checklist only.");
    suggestions.push("Avoid any wording that implies legal or medical advice or diagnosis.");
  }

  if (matchesAny(spec, REJECT_MARKETPLACE_MODERATION)) {
    suggestions.push("Simplify to a directory or listing tool without user-to-user transactions.");
    suggestions.push("Consider: curated list, generator, or SEO tool instead of a moderated marketplace.");
  }

  const productTypeNorm = (spec.product_type || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!ALLOWED_PRODUCT_TYPES.has(productTypeNorm)) {
    suggestions.push("Reframe as one of: web app, browser game, SaaS micro-product, specialized productivity tool, niche consumer app, content or learning product.");
  } else if (!ALLOWED_CATEGORY_KEYWORDS.some((k) => searchSpec(spec, k)) &&
    !["web_app", "generator", "calculator", "tracker", "micro_saas", "saas_micro_product"].includes(productTypeNorm)) {
    suggestions.push("Add a clear angle: e.g. SEO tool, creator tool, or niche micro-SaaS to fit factory scope.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Simplify scope to match: generators, calculators, trackers, or niche micro-SaaS (e.g. SEO or creator tools).");
  }

  return suggestions;
}

/**
 * Evaluate whether a product spec is buildable by the automated factory.
 *
 * @param {Object} product_spec - Output from createProductSpec (product_architect).
 * @returns {Promise<{ allowed: boolean, reason: string, adjusted_scope: string[] }>}
 */
export async function evaluateBuildability(product_spec) {
  const spec = product_spec || {};
  const reasons = [];

  if (spec.build_complexity === "high") {
    reasons.push("build_complexity is high (factory only supports low/medium).");
  }

  const hours = typeof spec.estimated_build_hours === "number" ? spec.estimated_build_hours : 0;
  if (hours > 40) {
    reasons.push(`estimated_build_hours (${hours}) exceeds factory limit of 40.`);
  }

  const productType = (spec.product_type || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (productType && !ALLOWED_PRODUCT_TYPES.has(productType)) {
    reasons.push(`product_type "${spec.product_type}" is not in allowed categories (web app, browser game, SaaS micro-product, specialized productivity tool, etc.).`);
  }

  if (spec.rejected_by_architect && spec.rejection_reason) {
    reasons.push("Rejected by product architect: " + spec.rejection_reason);
  }

  if (matchesAny(spec, REJECT_SOCIAL)) {
    reasons.push("product resembles a full social network (not in scope).");
  }
  if (matchesAny(spec, REJECT_GAMES)) {
    reasons.push("product resembles an AAA or complex game (not in scope).");
  }
  if (matchesAny(spec, REJECT_LEGAL_MEDICAL)) {
    reasons.push("product resembles legal/medical advisory tools (not in scope).");
  }
  if (matchesAny(spec, REJECT_MARKETPLACE_MODERATION)) {
    reasons.push("product resembles a marketplace requiring human moderation (not in scope).");
  }

  const allowed = reasons.length === 0;
  const reason = allowed
    ? "Within factory capability: allowed product type and complexity."
    : reasons.join(" ");

  const adjusted_scope = allowed ? [] : suggestAdjustedScope(spec, reason);

  return {
    allowed,
    reason,
    adjusted_scope
  };
}
