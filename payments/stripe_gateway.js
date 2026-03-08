/**
 * STRIPE GATEWAY – Full payment flow; inactive until Stripe keys are in .env.
 *
 * createCheckoutSession: returns placeholder URL if keys missing, real session when keys exist.
 * handleWebhook: updates data/subscriptions.json and logs revenue for Stripe events.
 * verifyStripeConfig: logs warning if keys missing; never throws.
 */

import fs from "fs/promises";
import path from "path";
import { createHmac, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { STRIPE_CONFIG } from "../config/stripe_config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const MONETIZATION_STRIPE_DIR = path.join(root, "monetization", "stripe");
const DATA_DIR = path.join(root, "data");
const SUBSCRIPTIONS_PATH = path.join(DATA_DIR, "subscriptions.json");
const LOG_PATH = path.join(root, "logs", "stripe_gateway.log");

async function stripeLog(level, message, data = null) {
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

function hasValidKeys() {
  const sk = (STRIPE_CONFIG.secret_key || "").trim();
  const pk = (STRIPE_CONFIG.publishable_key || "").trim();
  return sk.length > 0 && pk.length > 0 &&
    !sk.startsWith("SET_") && !pk.startsWith("SET_") &&
    (sk.startsWith("sk_") || sk.startsWith("sk_test_") || sk.startsWith("sk_live_")) &&
    (pk.startsWith("pk_") || pk.startsWith("pk_test_") || pk.startsWith("pk_live_"));
}

/**
 * Verify Stripe config. If keys missing, log warning and return false. Never throws.
 * @returns {Promise<boolean>} true if keys are present and look valid
 */
export async function verifyStripeConfig() {
  try {
    if (hasValidKeys()) {
      await stripeLog("info", "Stripe config verified", { active: true });
      return true;
    }
    await stripeLog("warn", "Stripe keys missing or invalid; payment system inactive. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to .env to activate.");
    return false;
  } catch (e) {
    await stripeLog("warn", "verifyStripeConfig error (non-fatal)", { error: e.message });
    return false;
  }
}

async function loadStripeProductConfig(slug) {
  try {
    const raw = await fs.readFile(path.join(MONETIZATION_STRIPE_DIR, slug + ".json"), "utf-8");
    const config = JSON.parse(raw);
    const tiers = config.pricing_tiers || [];
    const placeholderUrl = config.checkout_url || `https://checkout.stripe.com/PLACEHOLDER_${slug}`;
    return { tiers, placeholderUrl, product_name: config.product_name || slug };
  } catch {
    return {
      tiers: [{ name: "Pro", price: 9, period: "month", features: [] }],
      placeholderUrl: `https://checkout.stripe.com/PLACEHOLDER_${slug}`,
      product_name: slug
    };
  }
}

async function loadSubscriptions() {
  try {
    const raw = await fs.readFile(SUBSCRIPTIONS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

async function saveSubscriptions(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBSCRIPTIONS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function findTier(tiers, tierName) {
  const name = (tierName || "").toLowerCase();
  return tiers.find((t) => (t.name || "").toLowerCase() === name) || tiers.find((t) => (t.name || "").toLowerCase() === "pro") || tiers[0];
}

/**
 * Create a Stripe Checkout Session for a product and tier.
 * If keys missing: return checkout_url placeholder. If keys exist: call Stripe API and return real session URL.
 *
 * @param {Object} product - { name?, slug }
 * @param {string} tier - tier name (e.g. "Pro")
 * @param {Object} options - { success_url?, cancel_url?, customer_email? }
 * @returns {Promise<{ checkout_url: string, session_id?: string }>}
 */
export async function createCheckoutSession(product, tier, options = {}) {
  const slug = (product?.slug || product?.name || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
  const { tiers, placeholderUrl, product_name } = await loadStripeProductConfig(slug);
  const selectedTier = findTier(tiers, tier);
  const amountCents = Math.round((selectedTier.price || 0) * 100);
  const successUrl = options.success_url || options.url || `https://yoursite.com/${slug}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = options.cancel_url || options.url || `https://yoursite.com/${slug}`;

  if (!hasValidKeys()) {
    await stripeLog("info", "Checkout session placeholder (keys missing)", { slug, tier: selectedTier.name });
    return { checkout_url: placeholderUrl };
  }

  try {
    const body = new URLSearchParams({
      mode: "subscription",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": `${product_name} – ${selectedTier.name}`,
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][recurring][interval]": (selectedTier.period || "month").toLowerCase() === "year" ? "year" : "month",
      "line_items[0][quantity]": "1",
      "metadata[product_slug]": slug,
      "metadata[tier]": selectedTier.name || "pro"
    });
    if (options.customer_email) body.set("customer_email", options.customer_email);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + STRIPE_CONFIG.secret_key.trim(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    const text = await res.text();
    if (!res.ok) {
      await stripeLog("error", "Stripe checkout session failed", { slug, status: res.status, body: text.slice(0, 200) });
      return { checkout_url: placeholderUrl };
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = Object.fromEntries(new URLSearchParams(text));
    }
    const checkoutUrl = parsed.url || parsed.checkout_url || placeholderUrl;
    const sessionId = parsed.id || null;
    await stripeLog("info", "Checkout session created", { slug, session_id: sessionId });
    return { checkout_url: checkoutUrl, session_id: sessionId };
  } catch (e) {
    await stripeLog("error", "createCheckoutSession failed", { slug, error: e.message });
    return { checkout_url: placeholderUrl };
  }
}

/**
 * Verify Stripe webhook signature (raw body + Stripe-Signature header value).
 * @param {string} rawBody - request body as string
 * @param {string} signature - Stripe-Signature header
 * @returns {object|null} parsed event or null if invalid
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = (STRIPE_CONFIG.webhook_secret || "").trim();
  if (!secret || !signature) return null;
  const parts = signature.split(",").reduce((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return null;
  const payload = t + "." + rawBody;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = Buffer.from(v1, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (received.length !== expectedBuf.length || !timingSafeEqual(received, expectedBuf)) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

/**
 * Handle a verified Stripe event. Updates data/subscriptions.json and logs revenue.
 * Supported: checkout.session.completed, invoice.paid, customer.subscription.created, customer.subscription.deleted.
 *
 * @param {Object} event - Stripe event { id, type, data: { object } }
 */
export async function handleWebhook(event) {
  if (!event || !event.type) {
    await stripeLog("warn", "handleWebhook called with invalid event");
    return;
  }

  const obj = event.data?.object || {};
  const subs = await loadSubscriptions();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const customerId = obj.customer || obj.customer_email;
        const clientReferenceId = obj.client_reference_id || obj.customer_email || ("cust_" + (obj.customer || "anonymous"));
        const userId = String(clientReferenceId);
        const subscriptionId = obj.subscription;
        const metadata = obj.metadata || {};
        const productSlug = metadata.product_slug || "default";
        const tier = metadata.tier || "pro";
        if (!subs[userId]) subs[userId] = {};
        subs[userId][productSlug] = {
          status: "active",
          tier,
          started_at: new Date().toISOString(),
          stripe_subscription_id: subscriptionId || null
        };
        await saveSubscriptions(subs);
        await stripeLog("info", "Subscription active (checkout.session.completed)", { user_id: userId, product_slug: productSlug, tier });
        break;
      }
      case "invoice.paid": {
        const customerId = obj.customer;
        const amount = (obj.amount_paid != null ? obj.amount_paid : obj.amount_paid) || 0;
        await stripeLog("info", "Revenue event (invoice.paid)", { customer_id: customerId, amount_cents: amount, event_id: event.id });
        break;
      }
      case "customer.subscription.created": {
        const customerId = obj.customer;
        const subId = obj.id;
        const metadata = obj.metadata || {};
        const productSlug = metadata.product_slug || "default";
        const userId = String(customerId || subId);
        if (!subs[userId]) subs[userId] = {};
        subs[userId][productSlug] = {
          status: "active",
          tier: metadata.tier || "pro",
          started_at: new Date().toISOString(),
          stripe_subscription_id: subId
        };
        await saveSubscriptions(subs);
        await stripeLog("info", "Subscription created", { user_id: userId, product_slug: productSlug });
        break;
      }
      case "customer.subscription.deleted": {
        const customerId = obj.customer;
        const subId = obj.id;
        const metadata = obj.metadata || {};
        const productSlug = metadata.product_slug || "default";
        for (const uid of Object.keys(subs)) {
          if (subs[uid][productSlug]?.stripe_subscription_id === subId || (Object.keys(subs[uid]).length === 1 && customerId && uid === String(customerId))) {
            if (subs[uid][productSlug]) {
              subs[uid][productSlug].status = "cancelled";
              subs[uid][productSlug].ended_at = new Date().toISOString();
            }
            break;
          }
        }
        await saveSubscriptions(subs);
        await stripeLog("info", "Subscription cancelled", { product_slug: productSlug, subscription_id: subId });
        break;
      }
      default:
        await stripeLog("info", "Webhook event (unhandled)", { type: event.type, id: event.id });
    }
  } catch (e) {
    await stripeLog("error", "handleWebhook failed", { type: event.type, error: e.message });
  }
}

/**
 * Verify webhook signature and handle event. Use this from your HTTP handler.
 * @param {string} rawBody - raw request body
 * @param {string} signature - Stripe-Signature header
 */
export async function verifyAndHandleWebhook(rawBody, signature) {
  const event = verifyWebhookSignature(rawBody, signature);
  if (!event) {
    await stripeLog("warn", "Webhook signature verification failed");
    return;
  }
  await handleWebhook(event);
}
