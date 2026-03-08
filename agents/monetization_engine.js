/**
 * MONETIZATION ENGINE – Auto-revenue layer for all generated apps.
 *
 * Injects pricing plan, paywall capability, and Stripe-ready checkout into each app
 * before deployment. Runs from full_product_pipeline after workers build, before QA.
 *
 * Injects:
 *   - pricing.json (Free / Pro $9 / Business $29)
 *   - pricing.html (pricing page)
 *   - billing.html (billing management placeholder)
 *   - subscribe.html (Stripe-ready checkout placeholder)
 *   - paywall.js (optional gate; default: no block)
 *
 * Logs: logs/monetization.log
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const APPS_DIR = path.join(root, "apps");
const DEPLOY_DIR = path.join(root, "deploy");
const LOGS_DIR = path.join(root, "logs");
const MONETIZATION_LOG = path.join(root, "logs", "monetization.log");

async function logMonetization(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(MONETIZATION_LOG, line, "utf-8").catch(() => {});
}

function getProductName(appDir) {
  try {
    return fsSync.readFileSync(path.join(appDir, "idea.txt"), "utf-8").trim();
  } catch {
    return path.basename(appDir).replace(/^app_/, "App ");
  }
}

/**
 * Generate pricing.json content (Free / Pro $9 / Business $29).
 */
function buildPricingJson() {
  return {
    plans: [
      { name: "Free", price: 0 },
      { name: "Pro", price: 9 },
      { name: "Business", price: 29 }
    ],
    currency: "USD",
    stripe_ready: true,
    updated_at: new Date().toISOString()
  };
}

/**
 * Generate pricing page HTML (matches factory app dark theme).
 */
function buildPricingHtml(productName) {
  const title = productName || "App";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pricing – ${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 56rem; margin: 0 auto; }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    .sub { color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }
    .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .plan { background: rgba(30,41,59,.5); border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .plan h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
    .plan .price { font-size: 1.5rem; font-weight: 700; color: #6366f1; }
    .plan .price span { font-size: 0.85rem; font-weight: 400; color: #94a3b8; }
    .plan p { margin: 0.5rem 0; font-size: 0.9rem; color: #94a3b8; }
    .plan a { display: inline-block; margin-top: 0.75rem; padding: 0.5rem 1rem; background: #6366f1; color: #fff; border-radius: 0.5rem; text-decoration: none; font-weight: 500; }
    .plan a:hover { background: #4f46e5; }
    nav { margin-bottom: 1.5rem; }
    nav a { color: #94a3b8; text-decoration: none; margin-right: 1rem; }
    nav a:hover { color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <nav><a href="app.html">← App</a> <a href="billing.html">Billing</a> <a href="subscribe.html">Subscribe</a></nav>
    <h1>Pricing</h1>
    <p class="sub">${title} – choose your plan</p>
    <div class="plans" id="plans"></div>
  </div>
  <script>
    (function() {
      fetch('pricing.json').then(r => r.json()).then(data => {
        const el = document.getElementById('plans');
        (data.plans || []).forEach(p => {
          const div = document.createElement('div');
          div.className = 'plan';
          const price = p.price === 0 ? 'Free' : '$' + p.price + (p.interval ? '/' + p.interval : '');
          div.innerHTML = '<h2>' + (p.name || '') + '</h2><div class="price">' + price + '</div><p>Choose this plan</p><a href="subscribe.html?plan=' + encodeURIComponent(p.name || '') + '">Select</a>';
          el.appendChild(div);
        });
      }).catch(() => { document.getElementById('plans').innerHTML = '<p>Load pricing.json to see plans.</p>'; });
    })();
  </script>
</body>
</html>`;
}

/**
 * Generate billing page (placeholder for billing management).
 */
function buildBillingHtml(productName) {
  const title = productName || "App";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Billing – ${title}</title>
  <style>
    body { margin: 0; font-family: system-ui; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 40rem; margin: 0 auto; }
    h1 { font-size: 1.25rem; }
    nav { margin-bottom: 1.5rem; }
    nav a { color: #94a3b8; text-decoration: none; margin-right: 1rem; }
    nav a:hover { color: #e2e8f0; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <nav><a href="app.html">← App</a> <a href="pricing.html">Pricing</a> <a href="subscribe.html">Subscribe</a></nav>
    <h1>Billing</h1>
    <p>Manage your subscription and payment methods. Stripe-ready – configure your keys in payment_config.json.</p>
  </div>
</body>
</html>`;
}

/**
 * Generate subscribe/checkout page (Stripe-ready placeholder).
 */
function buildSubscribeHtml(productName) {
  const title = productName || "App";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscribe – ${title}</title>
  <style>
    body { margin: 0; font-family: system-ui; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 40rem; margin: 0 auto; }
    h1 { font-size: 1.25rem; }
    nav { margin-bottom: 1.5rem; }
    nav a { color: #94a3b8; text-decoration: none; margin-right: 1rem; }
    nav a:hover { color: #e2e8f0; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #6366f1; color: #fff; border-radius: 0.5rem; text-decoration: none; font-weight: 500; border: none; cursor: pointer; }
    .btn:hover { background: #4f46e5; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <nav><a href="app.html">← App</a> <a href="pricing.html">Pricing</a> <a href="billing.html">Billing</a></nav>
    <h1>Subscribe</h1>
    <p>Stripe-ready checkout. Set STRIPE_PUBLISHABLE_KEY in payment_config.json to enable live checkout.</p>
    <button class="btn" id="stripeBtn">Subscribe with Stripe</button>
  </div>
  <script>
    document.getElementById('stripeBtn').addEventListener('click', function() {
      var plan = (new URLSearchParams(location.search)).get('plan') || 'Pro';
      console.log('Checkout plan:', plan);
      alert('Stripe checkout will open here. Configure Stripe keys in payment_config.json.');
    });
  </script>
</body>
</html>`;
}

/**
 * Generate paywall.js – optional gate; does not block by default (can be enabled per app).
 */
function buildPaywallJs() {
  return `/**
 * Paywall – optional gate. Include in app.html if you want to restrict access.
 * By default requires nothing; set window.PAYWALL_REQUIRED = true to redirect non-pro users to pricing.
 */
(function() {
  if (typeof window === 'undefined') return;
  function check() {
    if (window.PAYWALL_REQUIRED && !localStorage.getItem('ai_fabrik_pro')) {
      var base = location.pathname.replace(/\\/[^/]*$/, '');
      if (!location.pathname.includes('pricing') && !location.pathname.includes('subscribe'))
        location.href = (base || '') + '/pricing.html';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
  else check();
})();
`;
}

/**
 * Inject monetization into an app: pricing.json, pricing.html, billing.html, subscribe.html, paywall.js.
 * Writes to both apps/<appId> and deploy/<appId>.
 * @param {string} appId - e.g. app_1234_5678
 * @returns {Promise<{ ok: boolean, files: string[] }>}
 */
export async function runMonetization(appId) {
  const safeId = (appId || "").toString().trim();
  if (!safeId || !safeId.startsWith("app_")) {
    await logMonetization("Skip monetization: invalid appId " + appId);
    return { ok: false, files: [] };
  }

  const appDir = path.join(APPS_DIR, safeId);
  const deployDir = path.join(DEPLOY_DIR, safeId);

  try {
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(deployDir, { recursive: true });
  } catch (e) {
    await logMonetization("Monetization failed " + safeId + ": " + e.message);
    return { ok: false, files: [] };
  }

  const productName = getProductName(appDir);
  const pricingJson = buildPricingJson();
  const pricingHtml = buildPricingHtml(productName);
  const billingHtml = buildBillingHtml(productName);
  const subscribeHtml = buildSubscribeHtml(productName);
  const paywallJs = buildPaywallJs();

  const files = [];
  const write = async (dir, name, content) => {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf-8");
    files.push(path.relative(root, filePath));
  };

  for (const dir of [appDir, deployDir]) {
    await write(dir, "pricing.json", pricingJson);
    await write(dir, "pricing.html", pricingHtml);
    await write(dir, "billing.html", billingHtml);
    await write(dir, "subscribe.html", subscribeHtml);
    await write(dir, "paywall.js", paywallJs);
  }

  await logMonetization("Monetization injected into " + safeId);
  return { ok: true, files };
}

/**
 * Load existing pricing from app dir; never remove plans. Merge with defaults if missing.
 */
async function loadExistingPricing(appDir) {
  try {
    const raw = await fs.readFile(path.join(appDir, "pricing.json"), "utf-8");
    const data = JSON.parse(raw);
    const plans = Array.isArray(data.plans) ? data.plans : [];
    return {
      plans: plans.length ? plans : buildPricingJson().plans,
      currency: data.currency || "USD",
      stripe_ready: data.stripe_ready !== false,
      updated_at: data.updated_at || new Date().toISOString()
    };
  } catch {
    return {
      ...buildPricingJson(),
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Apply a revenue action: add or improve monetization only. Never remove existing plans.
 * @param {string} appId
 * @param {string} action - add_freemium_tier | adjust_pricing | add_upsell | add_paywall | add_premium_feature | add_subscription
 * @returns {Promise<{ ok: boolean, files: string[] }>}
 */
export async function applyRevenueAction(appId, action) {
  const safeId = (appId || "").toString().trim();
  if (!safeId || !safeId.startsWith("app_")) {
    await logMonetization("applyRevenueAction skip: invalid appId " + appId);
    return { ok: false, files: [] };
  }

  const appDir = path.join(APPS_DIR, safeId);
  const deployDir = path.join(DEPLOY_DIR, safeId);
  try {
    await fs.access(appDir);
  } catch {
    await logMonetization("applyRevenueAction skip: app dir not found " + safeId);
    return { ok: false, files: [] };
  }

  let pricing = await loadExistingPricing(appDir);
  const plans = [...(pricing.plans || [])];

  const hasFree = plans.some((p) => Number(p.price) === 0);
  const paidPlans = plans.filter((p) => Number(p.price) > 0);
  const maxPrice = paidPlans.length ? Math.max(...paidPlans.map((p) => Number(p.price))) : 0;

  switch ((action || "").toLowerCase()) {
    case "add_freemium_tier":
      if (!hasFree) {
        plans.unshift({ name: "Free", price: 0, interval: "month" });
      }
      break;
    case "adjust_pricing":
      if (paidPlans.length > 0) {
        for (let i = 0; i < plans.length; i++) {
          const p = Number(plans[i].price);
          if (p > 0) {
            const newPrice = Math.round(p * 1.1) || p + 1;
            plans[i] = { ...plans[i], price: newPrice, interval: plans[i].interval || "month" };
          }
        }
      }
      break;
    case "add_upsell":
      if (maxPrice < 99 && !plans.some((p) => (p.name || "").toLowerCase().includes("enterprise"))) {
        plans.push({ name: "Enterprise", price: Math.max(99, maxPrice + 30), interval: "month" });
      }
      break;
    case "add_premium_feature":
      if (paidPlans.length === 1 && !plans.some((p) => (p.name || "").toLowerCase().includes("pro"))) {
        const mid = Number(paidPlans[0].price) || 29;
        plans.splice(plans.length - 1, 0, { name: "Pro", price: Math.max(9, Math.round(mid / 2)), interval: "month" });
      }
      break;
    case "add_subscription":
      for (let i = 0; i < plans.length; i++) {
        if (!plans[i].interval) plans[i] = { ...plans[i], interval: "month" };
      }
      break;
    case "add_paywall":
      pricing.paywall_enabled = true;
      break;
    default:
      await logMonetization("applyRevenueAction unknown action: " + action);
      return { ok: false, files: [] };
  }

  pricing.plans = plans;
  pricing.updated_at = new Date().toISOString();

  const productName = getProductName(appDir);
  const files = [];
  const write = async (dir, name, content) => {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf-8");
    files.push(path.relative(root, filePath));
  };

  for (const dir of [appDir, deployDir]) {
    await fs.mkdir(dir, { recursive: true });
    await write(dir, "pricing.json", pricing);
    await write(dir, "pricing.html", buildPricingHtml(productName));
    await write(dir, "subscribe.html", buildSubscribeHtml(productName));
    await write(dir, "paywall.js", buildPaywallJs());
  }

  await logMonetization("applyRevenueAction " + action + " applied to " + safeId);
  return { ok: true, files };
}
