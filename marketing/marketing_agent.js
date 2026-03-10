import fs from "fs/promises";
import path from "path";

/**
 * MARKETING AGENT – Sends production-ready copy to an external webhook.
 *
 * Environment:
 *   - MARKETING_WEBHOOK: HTTPS endpoint that will receive JSON payloads.
 *
 * Export:
 *   - runMarketing(appId: string, idea: string): Promise<{ ok: boolean, delivered: boolean, statusCode?: number, error?: string }>
 */

const root = process.cwd();
const LOG_PATH = path.join(root, "logs", "marketing_agent.log");

async function log(level, message, data = null) {
  const ts = new Date().toISOString();
  const payload =
    data != null && data !== undefined
      ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
      : { level, message };
  const extra =
    typeof payload === "object" && payload.message
      ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
      : {};
  const line =
    ts +
    " [" + (level || "info").toUpperCase() + "] " +
    (payload.message || message) +
    (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");

  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
  }
}

function buildChannelCopy(idea) {
  const title = idea || "Product";
  return {
    google_ads: [
      `Headline 1: ${title} – Try free`,
      `Headline 2: Simple tool for teams`,
      `Headline 3: No credit card required`,
      `Description: Get started with "${title}" in minutes. Built for small teams.`,
      `Final URL: [SET_YOUR_LANDING_URL]`,
    ].join("\n"),
    tiktok: [
      `Hook: "${title}" – the tool you didn't know you needed.`,
      `CTA: Link in bio to try free.`,
      `Hashtags: #saas #productivity #tool #mvp`,
    ].join("\n"),
    youtube: [
      `Title: ${title} – Demo & walkthrough`,
      `Description: Quick demo of "${title}". Try it at [SET_URL].`,
      `CTA: Link in description for free trial.`,
    ].join("\n"),
    linkedin: [
      `Post: We built "${title}" to solve one thing really well.`,
      `CTA: Try it free – link in comments.`,
      `Audience: SMB, freelancers, startups.`,
    ].join("\n"),
    pinterest: [
      `Pin title: ${title}`,
      `Description: "${title}" – simple, focused tool. Link to try.`,
      `Board: SaaS & productivity tools`,
    ].join("\n"),
    product_hunt: [
      `Tagline: ${title}`,
      `Description: "${title}" – [one sentence value prop].`,
      `First comment: Thanks for checking us out! Link to try: [SET_URL].`,
    ].join("\n"),
  };
}

async function postToWebhook(payload) {
  const url = process.env.MARKETING_WEBHOOK;
  if (!url) {
    await log("warn", "MARKETING_WEBHOOK not configured; skipping delivery", {});
    return { ok: false, delivered: false, error: "MARKETING_WEBHOOK not configured" };
  }

  if (typeof fetch !== "function") {
    await log("error", "Global fetch is not available; cannot send marketing webhook", {});
    return { ok: false, delivered: false, error: "fetch_not_available" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const statusCode = res.status;
    const ok = statusCode >= 200 && statusCode < 300;

    if (!ok) {
      const text = await res.text().catch(() => "");
      await log("warn", "Marketing webhook responded with non-2xx", { statusCode, body: text.slice(0, 500) });
      return { ok: false, delivered: false, statusCode, error: "non_2xx_response" };
    }

    await log("info", "Marketing webhook delivered", { statusCode });
    return { ok: true, delivered: true, statusCode };
  } catch (e) {
    clearTimeout(timeout);
    await log("error", "Marketing webhook failed", { error: e.message });
    return { ok: false, delivered: false, error: e.message };
  }
}

export async function runMarketing(appId, idea) {
  const channels = buildChannelCopy(idea || "");
  const payload = {
    app_id: appId,
    idea: idea || "",
    generated_at: new Date().toISOString(),
    channels,
  };

  const result = await postToWebhook(payload);
  return result;
}
