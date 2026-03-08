/**
 * PAYMENT ROUTER – Route product monetization to real payment providers.
 *
 * Supports: subscription, one_time_purchase, ads.
 * Writes config to monetization/stripe/{slug}.json or monetization/ads/{slug}.json.
 * No real API keys; placeholders only. Human inserts keys later.
 * Never throws; all errors are caught and logged.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const MONETIZATION_ROOT = path.join(root, "monetization");
const STRIPE_DIR = path.join(MONETIZATION_ROOT, "stripe");
const ADS_DIR = path.join(MONETIZATION_ROOT, "ads");
const LOG_PATH = path.join(root, "logs", "payment_router.log");

async function paymentLog(level, message, data = null) {
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

/**
 * Normalize pricing_model to one of: subscription, one_time_purchase, ads.
 * Freemium is treated as subscription (paid tiers).
 */
function normalizePricingModel(pricing_model) {
  const m = (pricing_model || "").toLowerCase();
  if (m === "ads" || m === "ad-supported") return "ads";
  if (m === "one_time_purchase" || m === "one_time" || m === "one-time") return "one_time_purchase";
  return "subscription"; // subscription, freemium, or default
}

/**
 * Setup payment configuration for a product. Routes to Stripe (subscription/one_time) or Ads.
 * Does NOT connect real API keys; writes placeholder config only.
 *
 * @param {Object} product - { name, slug, pricing_model?, suggested_tiers?, url? }
 * @returns {Promise<{ provider: string, payment_url: string, config_saved: boolean }>}
 */
export async function setupPayments(product) {
  const defaultResult = { provider: "none", payment_url: "", config_saved: false };

  if (!product || typeof product !== "object") {
    await paymentLog("warn", "setupPayments called with invalid product", {});
    return defaultResult;
  }

  const name = product.name || "Product";
  const slug = (product.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
  const pricingModel = normalizePricingModel(product.pricing_model);
  const suggestedTiers = Array.isArray(product.suggested_tiers) ? product.suggested_tiers : [];
  const url = product.url || `https://yoursite.com/${slug}`;

  try {
    if (pricingModel === "ads") {
      const config = {
        product_name: name,
        product_slug: slug,
        generated_at: new Date().toISOString(),
        provider: "google_adsense",
        _comment: "Insert AdSense publisher ID and client keys when ready. No live ads until configured.",
        ad_slots: [
          { id: "header", placement: "above_fold", size: "responsive", placeholder: "SET_AD_SLOT_ID" },
          { id: "sidebar", placement: "sidebar", size: "300x250", placeholder: "SET_AD_SLOT_ID" },
          { id: "footer", placement: "below_fold", size: "responsive", placeholder: "SET_AD_SLOT_ID" }
        ],
        placement_strategy: {
          above_fold: 1,
          sidebar: 1,
          below_fold: 1,
          max_per_page: 3
        }
      };
      await fs.mkdir(ADS_DIR, { recursive: true });
      await fs.writeFile(path.join(ADS_DIR, slug + ".json"), JSON.stringify(config, null, 2), "utf-8");
      await paymentLog("info", "Ads config saved", { slug, provider: "google_adsense" });
      return {
        provider: "google_adsense",
        payment_url: url,
        config_saved: true
      };
    }

    // Stripe path: subscription or one_time_purchase
    const pricingTiers = suggestedTiers.length
      ? suggestedTiers.map((t) => ({
          name: t.name || "Plan",
          price: t.price != null ? t.price : 0,
          period: t.period || "month",
          features: Array.isArray(t.features) ? t.features : []
        }))
      : [
          { name: "Free", price: 0, period: "month", features: ["Core features"] },
          { name: "Pro", price: 9, period: "month", features: ["Unlimited", "Support"] }
        ];

    const config = {
      product_name: name,
      product_slug: slug,
      generated_at: new Date().toISOString(),
      pricing_model: pricingModel,
      _comment: "Insert Stripe secret key and publishable key when ready. No live charges until configured.",
      stripe: {
        secret_key: "SET_STRIPE_SECRET_KEY",
        publishable_key: "SET_STRIPE_PUBLISHABLE_KEY"
      },
      pricing_tiers: pricingTiers,
      checkout_url: `https://checkout.stripe.com/PLACEHOLDER_${slug}`
    };

    await fs.mkdir(STRIPE_DIR, { recursive: true });
    await fs.writeFile(path.join(STRIPE_DIR, slug + ".json"), JSON.stringify(config, null, 2), "utf-8");
    await paymentLog("info", "Stripe config saved", { slug, provider: "stripe", pricing_model: pricingModel });

    return {
      provider: "stripe",
      payment_url: config.checkout_url,
      config_saved: true
    };
  } catch (e) {
    await paymentLog("error", "setupPayments failed", { slug, error: e.message });
    return { ...defaultResult, provider: pricingModel === "ads" ? "google_adsense" : "stripe", config_saved: false };
  }
}
