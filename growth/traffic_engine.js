/**
 * TRAFFIC ENGINE – Automatically generate ongoing traffic strategies per product.
 *
 * Produces: SEO strategy, content plan, community distribution, growth loops.
 * Saves to growth/seo, growth/content, growth/community, growth/loops.
 * Never throws; all errors caught and logged. Does not crash build pipeline.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const GROWTH_DIR = path.join(root, "growth");
const SEO_DIR = path.join(GROWTH_DIR, "seo");
const CONTENT_DIR = path.join(GROWTH_DIR, "content");
const COMMUNITY_DIR = path.join(GROWTH_DIR, "community");
const LOOPS_DIR = path.join(GROWTH_DIR, "loops");
const LOG_PATH = path.join(root, "logs", "traffic_engine.log");

async function trafficLog(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload = data != null && data !== undefined
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

function slugify(name) {
  return (name || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
}

/** Build SEO strategy: long-tail keywords, article titles, internal linking. */
function buildSeoStrategy(product, slug) {
  const name = product.name || slug;
  const kw = (product.primary_keyword || name).toLowerCase();
  const category = (product.category || "tool").toLowerCase().replace(/\s+/g, " ");
  const users = (product.target_users || "users").toLowerCase();

  const longTailKeywords = [
    `best ${kw} for ${users}`,
    `free ${kw} online`,
    `how to use ${kw}`,
    `${kw} vs alternatives`,
    `${kw} for small teams`,
    `simple ${kw} ${category}`,
    `${kw} tutorial for beginners`,
    `affordable ${kw} ${users}`,
    `${kw} comparison ${new Date().getFullYear()}`,
    `${kw} best practices`
  ];

  const articleTitles = [
    `How to Get Started With ${name}`,
    `Why ${name} Is the Right ${category} for ${users}`,
    `5 Ways to Get More Value From ${name}`,
    `The Complete Guide to ${name} in 2024`,
    `${name} vs Competitors: What You Need to Know`
  ];

  const internalLinkingSuggestions = [
    { from: "homepage", to: "/features", anchor: "See all features" },
    { from: "homepage", to: "/pricing", anchor: "Pricing plans" },
    { from: "blog", to: "/", anchor: `Try ${name}` },
    { from: "features", to: "/pricing", anchor: "Choose your plan" },
    { from: "pricing", to: "/blog", anchor: "Read our guides" }
  ];

  return {
    product_slug: slug,
    product_name: name,
    generated_at: new Date().toISOString(),
    primary_keyword: product.primary_keyword || kw,
    long_tail_keywords: longTailKeywords,
    article_titles: articleTitles,
    internal_linking_suggestions: internalLinkingSuggestions
  };
}

/** Build content plan: blog ideas, comparison articles, tutorials. */
function buildContentPlan(product, slug) {
  const name = product.name || slug;
  const kw = (product.primary_keyword || product.name || slug).toLowerCase();
  const users = product.target_users || "teams";

  const blogPostIdeas = [
    `Introduction to ${name}: What It Does and Who It's For`,
    `5 Common Problems ${name} Solves`,
    `Getting Started With ${name} in Under 10 Minutes`,
    `How ${name} Fits Into Your Workflow`,
    `Case Study: How [Industry] Uses ${name}`,
    `Updates and New Features in ${name}`,
    `Tips to Get the Most From ${name}`,
    `${name} and Productivity: What the Data Shows`,
    `When to Upgrade From the Free Tier of ${name}`,
    `Integrating ${name} With Your Existing Tools`
  ];

  const comparisonArticles = [
    `${name} vs [Competitor A]: Which Is Right for You?`,
    `${name} vs [Competitor B]: Feature Comparison`,
    `${name} vs Spreadsheets: When to Use Which`,
    `Best ${kw} Tools Compared: ${name} and Alternatives`,
    `${name} vs Building In-House: Cost and Time`
  ];

  const tutorialArticles = [
    `Step-by-Step: Set Up ${name} for the First Time`,
    `How to [Key Task] With ${name}`,
    `Advanced ${name}: Power User Tips`,
    `Tutorial: Automating Workflows With ${name}`,
    `Troubleshooting Common ${name} Issues`
  ];

  return {
    product_slug: slug,
    product_name: name,
    generated_at: new Date().toISOString(),
    blog_post_ideas: blogPostIdeas,
    comparison_articles: comparisonArticles,
    tutorial_articles: tutorialArticles
  };
}

/** Build community distribution: Reddit, Indie Hackers, Product Hunt, forums. */
function buildCommunityStrategy(product, slug) {
  const name = product.name || slug;
  const desc = (product.description || "").slice(0, 200);
  const category = product.category || "web app";
  const users = product.target_users || "developers and small teams";

  return {
    product_slug: slug,
    product_name: name,
    generated_at: new Date().toISOString(),
    reddit: {
      suggested_subreddits: ["SideProject", "SaaS", "startups", "Entrepreneur", "IMadeThis", "smallbusiness"],
      posting_strategy: "Share launch post and genuine use cases; avoid spam. Comment helpfully in threads before linking.",
      template_title: `I built ${name} – [one-line value prop]`,
      template_body: `Short intro.\n\n${desc}\n\nLink in comments. Open to feedback.`
    },
    indie_hackers: {
      strategy: "Post in 'Share your project' or 'Launch' with story and metrics when available.",
      template_title: `Launch: ${name}`,
      template_body: `What it does, who it's for, and why we built it.\n\n${desc}`
    },
    product_hunt: {
      strategy: "Schedule launch for Tuesday–Thursday; prepare tagline, description, and first comment.",
      tagline: `${name} – ${(desc || "Simple, focused tool").slice(0, 60)}`,
      first_comment_tip: "Thank the community; share one key differentiator and link to try."
    },
    niche_forums: {
      strategy: "Identify 3–5 forums where target users hang out; provide value first, then soft mention product.",
      suggested_places: [`${category} communities`, "Slack/Discord in your niche", "Hacker News Show HN", "BetaList", "AlternativeTo"]
    }
  };
}

/** Build growth loops: referral, viral mechanics, sharing incentives. */
function buildGrowthLoops(product, slug) {
  const name = product.name || slug;

  const referralLoopIdeas = [
    "Give 1 month free for each referred paying user; referrer gets 1 month free too.",
    "Referral link in dashboard with pre-written tweet/LinkedIn post.",
    "Leaderboard of top referrers with small rewards or badges.",
    "Team invite: invite teammates, unlock team features together."
  ];

  const viralMechanics = [
    "Shareable output: 'Share this result' button (e.g. link to view-only result).",
    "Embeddable widget: let users embed ${name} on their site or Notion.",
    "Public profiles or showcases: optional public page showing usage (with consent).",
    "Co-branded export: 'Created with ${name}' on exported PDFs or links."
  ].map((s) => s.replace("${name}", name));

  const userSharingIncentives = [
    "Unlock a premium feature after sharing once (e.g. tweet or LinkedIn).",
    "Discount or extended trial for sharing with 3 colleagues.",
    "Early access to new features for users who share feedback publicly.",
    "Referral credit: $5 off next invoice per successful referral."
  ];

  return {
    product_slug: slug,
    product_name: name,
    generated_at: new Date().toISOString(),
    referral_loop_ideas: referralLoopIdeas,
    viral_mechanics: viralMechanics,
    user_sharing_incentives: userSharingIncentives
  };
}

/**
 * Generate a full traffic plan for a product and save to growth/seo, content, community, loops.
 *
 * @param {Object} product - { name, slug?, description?, category?, target_users?, primary_keyword? }
 * @returns {Promise<{ seo_strategy: object, content_plan: object, community_strategy: object, growth_loops: object }>}
 */
export async function generateTrafficPlan(product) {
  const emptyPlan = {
    seo_strategy: null,
    content_plan: null,
    community_strategy: null,
    growth_loops: null
  };

  if (!product || typeof product !== "object") {
    await trafficLog("warn", "generateTrafficPlan called with invalid product", {});
    return emptyPlan;
  }

  const slug = product.slug || slugify(product.name || "product");
  const name = product.name || slug;

  try {
    const seoStrategy = buildSeoStrategy(product, slug);
    const contentPlan = buildContentPlan(product, slug);
    const communityStrategy = buildCommunityStrategy(product, slug);
    const growthLoops = buildGrowthLoops(product, slug);

    await fs.mkdir(SEO_DIR, { recursive: true });
    await fs.mkdir(CONTENT_DIR, { recursive: true });
    await fs.mkdir(COMMUNITY_DIR, { recursive: true });
    await fs.mkdir(LOOPS_DIR, { recursive: true });

    await fs.writeFile(path.join(SEO_DIR, slug + ".json"), JSON.stringify(seoStrategy, null, 2), "utf-8");
    await fs.writeFile(path.join(CONTENT_DIR, slug + ".json"), JSON.stringify(contentPlan, null, 2), "utf-8");
    await fs.writeFile(path.join(COMMUNITY_DIR, slug + ".json"), JSON.stringify(communityStrategy, null, 2), "utf-8");
    await fs.writeFile(path.join(LOOPS_DIR, slug + ".json"), JSON.stringify(growthLoops, null, 2), "utf-8");

    await trafficLog("info", "Traffic plan generated", { slug, product_name: name });

    return {
      seo_strategy: seoStrategy,
      content_plan: contentPlan,
      community_strategy: communityStrategy,
      growth_loops: growthLoops
    };
  } catch (e) {
    await trafficLog("error", "generateTrafficPlan failed", { slug, error: e.message });
    return emptyPlan;
  }
}
