/**
 * TRAFFIC PUBLISHER – Publish launch content and marketing posts to real platforms.
 *
 * Prepares publish-ready files for Reddit, Indie Hackers, Product Hunt; generates
 * SEO blog articles; updates sitemap. Actual posting APIs can be connected later.
 * Never throws; all errors caught and logged. Must not crash build pipeline.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const GROWTH_DIR = path.join(root, "growth");
const COMMUNITY_DIR = path.join(GROWTH_DIR, "community");
const CONTENT_DIR = path.join(GROWTH_DIR, "content");
const PUBLISH_QUEUE_DIR = path.join(GROWTH_DIR, "publish_queue");
const REDDIT_QUEUE_DIR = path.join(PUBLISH_QUEUE_DIR, "reddit");
const INDIE_HACKERS_QUEUE_DIR = path.join(PUBLISH_QUEUE_DIR, "indie_hackers");
const PRODUCT_HUNT_QUEUE_DIR = path.join(PUBLISH_QUEUE_DIR, "product_hunt");
const CONTENT_BLOG_DIR = path.join(root, "content", "blog");
const SITEMAP_PATH = path.join(root, "content", "sitemap.xml");
const LOG_PATH = path.join(root, "logs", "traffic_publisher.log");

async function publisherLog(level, message, data = null) {
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

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "post";
}

/**
 * Publish traffic for a product: queue Reddit, Indie Hackers, Product Hunt; generate blog articles; update sitemap.
 *
 * @param {Object} product - { name, slug?, description?, url?, primary_keyword? }
 * @returns {Promise<{ reddit: boolean, indie_hackers: boolean, product_hunt: boolean, blog_articles: number, sitemap_updated: boolean }>}
 */
export async function publishTraffic(product) {
  const defaultResult = { reddit: false, indie_hackers: false, product_hunt: false, blog_articles: 0, sitemap_updated: false };

  if (!product || typeof product !== "object") {
    await publisherLog("warn", "publishTraffic called with invalid product", {});
    return defaultResult;
  }

  const name = product.name || "Product";
  const slug = product.slug || slugify(product.name || "product");
  const description = (product.description || "").slice(0, 500);
  const baseUrl = (product.url || `https://yoursite.com/${slug}`).replace(/\/[^/]+\/?$/, "") || "https://yoursite.com";
  const productUrl = product.url || `${baseUrl}/${slug}`;
  const primaryKeyword = product.primary_keyword || name;

  try {
    let community = null;
    let contentPlan = null;

    try {
      const communityRaw = await fs.readFile(path.join(COMMUNITY_DIR, slug + ".json"), "utf-8");
      community = JSON.parse(communityRaw);
    } catch {
      community = {
        reddit: { template_title: `I built ${name}`, template_body: description || "Link in comments.", suggested_subreddits: ["SideProject", "SaaS"] },
        indie_hackers: { template_title: `Launch: ${name}`, template_body: description || "What it does and who it's for." },
        product_hunt: { tagline: name, strategy: "Launch Tuesday–Thursday.", first_comment_tip: "Thanks for checking us out!" }
      };
    }

    try {
      const contentRaw = await fs.readFile(path.join(CONTENT_DIR, slug + ".json"), "utf-8");
      contentPlan = JSON.parse(contentRaw);
    } catch {
      contentPlan = {
        blog_post_ideas: [`Introduction to ${name}`, `How to use ${name}`],
        comparison_articles: [],
        tutorial_articles: []
      };
    }

    // 1. Reddit – publish-ready file
    await fs.mkdir(REDDIT_QUEUE_DIR, { recursive: true });
    const reddit = community.reddit || {};
    const subreddits = Array.isArray(reddit.suggested_subreddits) ? reddit.suggested_subreddits : ["SideProject"];
    const redditPayload = {
      product_slug: slug,
      product_name: name,
      prepared_at: new Date().toISOString(),
      title: reddit.template_title || `I built ${name}`,
      body: reddit.template_body || `${description}\n\nLink: ${productUrl}`,
      target_subreddit: subreddits[0],
      all_subreddits: subreddits,
      url: productUrl,
      posting_strategy: reddit.posting_strategy || "Share once; comment helpfully."
    };
    await fs.writeFile(path.join(REDDIT_QUEUE_DIR, slug + ".json"), JSON.stringify(redditPayload, null, 2), "utf-8");

    // 2. Indie Hackers – publish-ready file
    await fs.mkdir(INDIE_HACKERS_QUEUE_DIR, { recursive: true });
    const ih = community.indie_hackers || {};
    const ihPayload = {
      product_slug: slug,
      product_name: name,
      prepared_at: new Date().toISOString(),
      title: ih.template_title || `Launch: ${name}`,
      body: ih.template_body || `${description}\n\nTry it: ${productUrl}`,
      url: productUrl
    };
    await fs.writeFile(path.join(INDIE_HACKERS_QUEUE_DIR, slug + ".json"), JSON.stringify(ihPayload, null, 2), "utf-8");

    // 3. Product Hunt – launch payload
    await fs.mkdir(PRODUCT_HUNT_QUEUE_DIR, { recursive: true });
    const ph = community.product_hunt || {};
    const phPayload = {
      product_slug: slug,
      product_name: name,
      prepared_at: new Date().toISOString(),
      tagline: (ph.tagline || name).slice(0, 60),
      description: description.slice(0, 260),
      url: productUrl,
      first_comment: ph.first_comment_tip || "Thanks for checking us out! Link to try in the description.",
      strategy: ph.strategy || "Schedule for Tuesday–Thursday."
    };
    await fs.writeFile(path.join(PRODUCT_HUNT_QUEUE_DIR, slug + ".json"), JSON.stringify(phPayload, null, 2), "utf-8");

    // 4. SEO blog articles from content plan titles
    const allTitles = [
      ...(Array.isArray(contentPlan.blog_post_ideas) ? contentPlan.blog_post_ideas : []),
      ...(Array.isArray(contentPlan.comparison_articles) ? contentPlan.comparison_articles : []),
      ...(Array.isArray(contentPlan.tutorial_articles) ? contentPlan.tutorial_articles : [])
    ].slice(0, 20);

    await fs.mkdir(CONTENT_BLOG_DIR, { recursive: true });
    const blogSlugs = [];
    for (let i = 0; i < allTitles.length; i++) {
      const title = allTitles[i];
      if (!title || typeof title !== "string") continue;
      const articleSlug = slug + "-" + slugify(title).slice(0, 40) + (i > 0 ? "-" + i : "");
      const md = [
        "# " + title,
        "",
        "**Product:** " + name,
        "",
        description ? description + "\n" : "",
        "",
        "---",
        "",
        "*Generated by AI_FABRIK traffic publisher. Replace with full article content.*",
        "",
        "Try [" + name + "](" + productUrl + ")."
      ].join("\n");
      await fs.writeFile(path.join(CONTENT_BLOG_DIR, articleSlug + ".md"), md, "utf-8");
      blogSlugs.push(articleSlug);
    }

    // 5. Sitemap – update with product page and blog articles
    const urls = [productUrl];
    blogSlugs.forEach((s) => urls.push(`${baseUrl}/blog/${s}`));

    let existingUrls = [];
    try {
      const sitemapRaw = await fs.readFile(SITEMAP_PATH, "utf-8");
      const locMatches = sitemapRaw.match(/<loc>([^<]+)<\/loc>/g);
      if (locMatches) {
        existingUrls = locMatches.map((m) => m.replace(/<\/?loc>/g, "").trim());
      }
    } catch {
      // no sitemap yet
    }

    const today = new Date().toISOString().slice(0, 10);
    const newUrls = urls.filter((u) => !existingUrls.includes(u));
    const allUrls = [...existingUrls, ...newUrls];

    const sitemapXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...allUrls.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc><lastmod>${today}</lastmod></url>`),
      "</urlset>"
    ].join("\n");
    await fs.mkdir(path.dirname(SITEMAP_PATH), { recursive: true });
    await fs.writeFile(SITEMAP_PATH, sitemapXml, "utf-8");

    await publisherLog("info", "Traffic publish queue and blog updated", { product: slug, blog_count: blogSlugs.length });
    return {
      reddit: true,
      indie_hackers: true,
      product_hunt: true,
      blog_articles: blogSlugs.length,
      sitemap_updated: true
    };
  } catch (e) {
    await publisherLog("error", "publishTraffic failed", { slug, error: e.message });
    return defaultResult;
  }
}
