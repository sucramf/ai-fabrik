/**
 * Stripe configuration. Keys from environment; leave empty until ready to accept payments.
 * Set in .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
 */
export const STRIPE_CONFIG = {
  secret_key: process.env.STRIPE_SECRET_KEY || "",
  publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || "",
  webhook_secret: process.env.STRIPE_WEBHOOK_SECRET || ""
};
