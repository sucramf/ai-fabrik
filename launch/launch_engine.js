/**
 * LAUNCH ENGINE – Automatically prepare and launch finished products.
 *
 * Generates: landing page content, SEO structure, directory submissions,
 * social content, monetization config. Never throws; all errors are caught and logged.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { setupPayments } from "../monetization/payment_router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const LAUNCH_DIR = path.join(root, "launch");
const LANDING_DIR = path.join(LAUNCH_DIR, "landing_pages");
const SEO_DIR = path.join(LAUNCH_DIR, "seo");
const SUBMISSIONS_DIR = path.join(LAUNCH_DIR, "submissions");
const SOCIAL_DIR = path.join(LAUNCH_DIR, "social");
const MONETIZATION_DIR = path.join(LAUNCH_DIR, "monetization");
const LOG_PATH = path.join(root, "logs", "launch_engine.log");

function slugify(name) {
  return (name || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "product";
}

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

function buildLandingContent(product, slug) {
  const name = product.name || slug;
  const desc = product.description || `A focused tool for ${product.target_users || "users"}.`;
  const features = Array.isArray(product.features) && product.features.length
    ? product.features
    : ["Easy to use", "Focused on one job", "No setup required"];
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    headline: name,
    subheadline: desc.slice(0, 120),
    benefits: [
      desc.slice(0, 80),
      ...features.slice(0, 3).map((f) => (typeof f === "string" ? f : f.label || "").slice(0, 60))
    ].filter(Boolean),
    features_list: features.slice(0, 8).map((f) => (typeof f === "string" ? f : f.label || String(f)).slice(0, 100)),
    call_to_action: "Get started free",
    cta_secondary: "See how it works"
  };
}

function buildSeoContent(product, slug) {
  const name = product.name || slug;
  const desc = (product.description || "").slice(0, 160);
  const category = (product.category || "web app").toString().replace(/\s+/g, " ");
  const primary = (name + " " + category).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    primary_keyword: primary || slug.replace(/-/g, " "),
    secondary_keywords: [
      category,
      product.target_users ? String(product.target_users).slice(0, 30) : null,
      "tool",
      "app"
    ].filter(Boolean),
    meta_title: (name + " – " + (desc.slice(0, 50) || "Simple, focused tool")).slice(0, 60),
    meta_description: desc.slice(0, 155) || `Use ${name} to get things done. Simple and focused.`,
    seo_headings: {
      h1: name,
      h2: [desc.slice(0, 60), "Features", "How it works", "Get started"].filter(Boolean)
    }
  };
}

function buildSubmissionsContent(product, slug) {
  const name = product.name || slug;
  const desc = (product.description || "").slice(0, 260);
  const url = product.url || `https://yoursite.com/${slug}`;
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    product_hunt: {
      name,
      tagline: desc.slice(0, 60),
      description: desc,
      url,
      topics: [product.category || "web app", "saas", "productivity"].filter(Boolean)
    },
    indie_hackers: {
      title: "Launch: " + name,
      body: `We built ${name} to solve a specific problem.\n\n${desc}\n\nTry it: ${url}`,
      url
    },
    reddit: {
      suggested_subreddits: ["SideProject", "SaaS", "startups", "Entrepreneur", "IMadeThis"],
      title: "I made " + name + " – " + (product.description || "").slice(0, 50),
      body: desc + "\n\nLink: " + url,
      disclaimer: "Follow each subreddit's rules; no spam."
    }
  };
}

function buildSocialContent(product, slug) {
  const name = product.name || slug;
  const desc = (product.description || "").slice(0, 200);
  const url = product.url || `https://yoursite.com/${slug}`;
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    twitter_x: {
      post: `Just launched: ${name}. ${desc.slice(0, 100)} ${url}`,
      thread_tip: "Add 2–3 tweets with benefits and a CTA."
    },
    linkedin: {
      post: `We've launched ${name}.\n\n${desc}\n\nBuilt for ${product.target_users || "teams and individuals"}.\n\nTry it: ${url}`
    },
    reddit_post: {
      title: "Launch: " + name,
      body: desc + "\n\n" + url
    }
  };
}

function buildMonetizationContent(product, slug) {
  const name = product.name || slug;
  return {
    product_slug: slug,
    generated_at: new Date().toISOString(),
    pricing_model: "freemium",
    options: [
      { id: "freemium", label: "Freemium", recommended: true, description: "Free tier + paid upgrades" },
      { id: "subscription", label: "Subscription", recommended: false, description: "Monthly/yearly plans" },
      { id: "one_time", label: "One-time purchase", recommended: false, description: "Single payment" },
      { id: "ads", label: "Ads", recommended: false, description: "Ad-supported free tier" }
    ],
    suggested_tiers: [
      { name: "Free", price: 0, features: ["Core features", "Limited usage"] },
      { name: "Pro", price: 9, period: "month", features: ["Unlimited", "Priority support"] }
    ],
    notes: `Configure actual pricing in payment_config.json. Product: ${name}.`
  };
}

/**
 * Prepare and launch a finished product: generate landing, SEO, submissions, social, monetization assets.
 * Never throws; errors are logged and returned as { ok: false }.
 *
 * @param {Object} product - { name, description?, url?, category?, features?, target_users? }
 * @returns {Promise<{ ok: boolean, slug?: string, error?: string }>}
 */
export async function launchProduct(product) {
  if (!product || typeof product !== "object") {
    await log("warn", "launchProduct called with invalid product", {});
    return { ok: false, error: "Invalid product" };
  }

  const slug = slugify(product.name || "product");
  const dirs = [
    { dir: LANDING_DIR, file: slug + ".json", build: () => buildLandingContent(product, slug) },
    { dir: SEO_DIR, file: slug + ".json", build: () => buildSeoContent(product, slug) },
    { dir: SUBMISSIONS_DIR, file: slug + ".json", build: () => buildSubmissionsContent(product, slug) },
    { dir: SOCIAL_DIR, file: slug + ".json", build: () => buildSocialContent(product, slug) },
    { dir: MONETIZATION_DIR, file: slug + ".json", build: () => buildMonetizationContent(product, slug) }
  ];

  try {
    for (const { dir, file, build } of dirs) {
      await fs.mkdir(dir, { recursive: true });
      const content = build();
      await fs.writeFile(path.join(dir, file), JSON.stringify(content, null, 2), "utf-8");
    }

    // Route payment config (Stripe or Ads) – must never crash launch pipeline
    const monetContent = buildMonetizationContent(product, slug);
    try {
      const paymentResult = await setupPayments({
        name: product.name || slug,
        slug,
        pricing_model: monetContent.pricing_model,
        suggested_tiers: monetContent.suggested_tiers,
        url: product.url || `https://yoursite.com/${slug}`
      });
      if (paymentResult.config_saved) {
        await log("info", "Payment config routed", { product: slug, provider: paymentResult.provider });
      }
    } catch (paymentErr) {
      await log("warn", "Payment router failed (non-fatal)", { product: slug, error: paymentErr.message });
    }

    await log("info", "Launch assets generated", { product: slug });
    return { ok: true, slug };
  } catch (e) {
    await log("error", "Launch engine failed", { product: slug, error: e.message });
    return { ok: false, slug, error: e.message };
  }
}
