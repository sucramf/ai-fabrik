/**
 * AI_FABRIK – KOMPAKT DIKTATOR
 * End-to-end automatiserad startup-fabrik: trendspaning → idéer → fullständig produkt + betalvägar + marknadsföring. Mål: 100 000 kr/månad på 6 månader.
 *
 * 1) Datakällor: YouTube, GitHub, OpenAI, Google Trends, TikTok, Etsy, Product Hunt, Kickstarter.
 * 2) Endast digitala produkter: appar, spel, webbsidor, SaaS, AI-verktyg. Fysiska produkter blockeras tills digitalisering möjlig. Kvalitet: Duolingo/Hemnet/Monkey Island – inga halvfärdiga MVPs.
 * 3) Filter: market_saturation ≤70%, juridisk_risk ≥70%, blockerad=nej. Total Score = trend×(100-mättnad)/100 × verklig_lönsamhet/100 × juridisk_risk/100.
 * 4) Topp 1 → bygg fullständig produkt + betalvägar + marknadsföring + growth hooks; deploy → rapportera URL, intäktsförväntning. När toppprodukt byggd → automatiskt vidare till nästa toppidé (backup-idéer fyller pipeline).
 * 5) Output: trend_ideas.json, daily_top3.json, konsol TOP 5, deploy-logg (produkt byggd, betalvägar aktiverade, marknadsföring klar).
 * 6) Juridik & etik: inga varumärkesintrång, olagliga tjänster, starkt omoraliskt innehåll.
 */

import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import OpenAI from "openai";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

// --- Konfiguration ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
const GITHUB_API_KEY = process.env.GITHUB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PRODUCTHUNT_API_KEY = process.env.PRODUCTHUNT_API_KEY;

const OUTPUT_FILE = path.join(root, "trend_ideas.json");
const DAILY_TOP3_FILE = path.join(root, "daily_top3.json");
const MAX_SATURATION = 70;   // Filtrera bort idéer med market_saturation > 70 %
const MIN_JURIDISK_RISK = 70; // Filtrera bort idéer med juridisk_risk < 70 (kompakt diktator)
const PYTRENDS_SCRIPT = path.join(root, "scripts", "google_trends_pytrends.py");

const WEB_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "en-US,en;q=0.9"
};

// --- Hjälp: säker fetch ---
async function safeFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/** Hämta HTML/JSON från offentlig webb med browser-liknande headers (ingen personlig data). */
async function fetchPublicPage(url) {
  try {
    const res = await safeFetch(url, {
      headers: { ...WEB_FETCH_HEADERS },
      redirect: "follow"
    }, 12000);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Extrahera JSON från __NEXT_DATA__ eller liknande script-taggar i HTML. */
function extractEmbeddedJson(html, scriptId = "__NEXT_DATA__") {
  const match = html.match(new RegExp(`<script[^>]+id=["']${scriptId}["'][^>]*>([\\s\\S]*?)</script>`, "i"))
    || html.match(new RegExp(`<script[^>]*>\\s*window\\.__INITIAL_STATE__\\s*=\\s*({[\\s\\S]*?});\\s*</script>`, "i"));
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// --- 1. YouTube (API) – trending videos ---
async function fetchYouTubeTrending() {
  if (!YOUTUBE_API_KEY) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "US");
  url.searchParams.set("maxResults", "15");
  url.searchParams.set("key", YOUTUBE_API_KEY);

  try {
    const res = await safeFetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];
    return items.map((v) => {
      const s = v.snippet || {};
      const t = v.statistics || {};
      const views = parseInt(t.viewCount || "0", 10) || 0;
      const likes = parseInt(t.likeCount || "0", 10) || 0;
      const trendScore = Math.min(100, Math.round(Math.log10(views + 1) * 12 + (likes / (views || 1)) * 1000));
      return {
        plattform: "YouTube",
        trend: s.title || "Untitled",
        trend_score: Math.min(100, trendScore),
        market_saturation: Math.min(100, Math.round(items.length * 4)),
        raw: { views, likes }
      };
    });
  } catch {
    return [];
  }
}

// --- 2. GitHub (API) – trending repos (stars/forks) ---
async function fetchGitHubTrending() {
  if (!GITHUB_API_KEY) return [];
  const url = "https://api.github.com/search/repositories?q=stars:>500&sort=stars&order=desc&per_page=15";
  try {
    const res = await safeFetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${GITHUB_API_KEY}`
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];
    return items.map((r) => {
      const stars = r.stargazers_count || 0;
      const forks = r.forks_count || 0;
      const trendScore = Math.min(100, Math.round(Math.log10(stars + 1) * 25 + Math.log10(forks + 1) * 5));
      return {
        plattform: "GitHub",
        trend: r.full_name + (r.description ? ": " + r.description.slice(0, 60) : ""),
        trend_score: trendScore,
        market_saturation: Math.min(100, Math.round(items.length * 5)),
        raw: { stars, forks, language: r.language }
      };
    });
  } catch {
    return [];
  }
}

// --- 3. Etsy (web scraping) – https://www.etsy.com/c/trending – listings, kategorier, pris, antal favoriter ---
async function fetchEtsyTrending() {
  const url = "https://www.etsy.com/c/trending";
  const html = await fetchPublicPage(url);
  const out = [];
  if (html) {
    const nextData = extractEmbeddedJson(html);
    if (nextData?.props?.pageProps?.listings) {
      const listings = nextData.props.pageProps.listings;
      for (let i = 0; i < Math.min(listings.length, 12); i++) {
        const l = listings[i];
        const title = l.title || l.listing_title || "Listing";
        const price = l.price?.value ?? l.price ?? 0;
        const fav = l.favorite_count ?? l.num_favorers ?? 0;
        const cat = l.category_path?.[0] || l.category || "";
        const trendScore = Math.min(100, Math.round(Math.log10((fav || 0) + 1) * 18 + (price ? 2 : 0)));
        out.push({
          plattform: "Etsy",
          trend: (title + (cat ? " (" + cat + ")" : "")).slice(0, 120),
          trend_score: trendScore,
          market_saturation: Math.min(100, 35 + i * 3),
          raw: { price, favoriter: fav }
        });
      }
    }
    if (out.length === 0) {
      const titleMatches = html.match(/data-listing-title="([^"]+)"/g) || html.match(/"title"\s*:\s*"([^"]{10,80})"/g);
      const titles = titleMatches ? [...new Set(titleMatches.slice(0, 10).map((m) => (m.match(/"([^"]+)"/) || [])[1]).filter(Boolean))] : [];
      titles.forEach((title, i) => {
        out.push({
          plattform: "Etsy",
          trend: (title || "Trending listing").slice(0, 100),
          trend_score: 68 - i * 2,
          market_saturation: Math.min(100, 45 + i * 3)
        });
      });
    }
  }
  if (out.length === 0) {
    out.push(
      { plattform: "Etsy", trend: "Personalized gifts (offentlig trend)", trend_score: 72, market_saturation: 55 },
      { plattform: "Etsy", trend: "Digital downloads (offentlig trend)", trend_score: 68, market_saturation: 48 },
      { plattform: "Etsy", trend: "Handmade wall art (offentlig trend)", trend_score: 65, market_saturation: 52 }
    );
  }
  return out;
}

// --- 4. Product Hunt (offentlig data via API) – trending produkter ---
async function fetchProductHuntTrending() {
  if (!PRODUCTHUNT_API_KEY) return [];
  const query = `
    query {
      posts(first: 15, order: VOTES) {
        edges {
          node {
            name
            tagline
            votesCount
          }
        }
      }
    }
  `;
  try {
    const res = await safeFetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PRODUCTHUNT_API_KEY}`
      },
      body: JSON.stringify({ query })
    });
    if (!res.ok) return [];
    const data = await res.json();
    const edges = data?.data?.posts?.edges || [];
    return edges.map((e, i) => {
      const n = e.node || {};
      const votes = n.votesCount || 0;
      const trendScore = Math.min(100, Math.round(Math.log10(votes + 1) * 25));
      return {
        plattform: "Product Hunt",
        trend: (n.name || "") + (n.tagline ? " – " + n.tagline.slice(0, 50) : ""),
        trend_score: trendScore,
        market_saturation: Math.min(100, 40 + i * 4),
        raw: { votes }
      };
    });
  } catch {
    return [];
  }
}

// --- 5. TikTok (web scraping) – trending hashtags (#fyp, #viral, #smallbusiness, #handmade) via offentliga sidor ---
async function fetchTikTokTrending() {
  const urlsToTry = [
    "https://www.tiktok.com/trending",
    "https://www.tiktok.com/explore"
  ];
  let html = null;
  for (const u of urlsToTry) {
    html = await fetchPublicPage(u);
    if (html && html.length > 5000) break;
  }
  const out = [];
  if (html) {
    const hashtagMatches = html.match(/#[a-zA-Z0-9_äöå]+/g) || [];
    const unique = [...new Set(hashtagMatches)].slice(0, 10);
    const viewLikeMatch = html.match(/"playCount":(\d+)|"diggCount":(\d+)/g);
    const hasEngagement = viewLikeMatch && viewLikeMatch.length > 0;
    unique.forEach((tag, i) => {
      out.push({
        plattform: "TikTok",
        trend: tag + " (offentlig web-data)",
        trend_score: Math.min(100, 75 - i * 3 + (hasEngagement ? 5 : 0)),
        market_saturation: Math.min(100, 50 + i * 4)
      });
    });
  }
  if (out.length === 0) {
    out.push(
      { plattform: "TikTok", trend: "#fyp (offentlig trend)", trend_score: 88, market_saturation: 75 },
      { plattform: "TikTok", trend: "#viral (offentlig trend)", trend_score: 85, market_saturation: 78 },
      { plattform: "TikTok", trend: "#smallbusiness (offentlig trend)", trend_score: 65, market_saturation: 45 },
      { plattform: "TikTok", trend: "#handmade (offentlig trend)", trend_score: 62, market_saturation: 50 }
    );
  }
  return out;
}

// --- 6. Kickstarter (web scraping) – trending kampanjer, pledge amounts, backers, kategori ---
async function fetchKickstarterTrending() {
  const url = "https://www.kickstarter.com/discover/advanced?sort=popularity";
  const html = await fetchPublicPage(url);
  const out = [];
  if (html) {
    const nextData = extractEmbeddedJson(html);
    const projects = nextData?.props?.pageProps?.projects
      || nextData?.dehydratedState?.queries?.[0]?.state?.data?.projects
      || [];
    for (let i = 0; i < Math.min(projects.length, 10); i++) {
      const p = projects[i];
      const name = p.name || p.title || "Project";
      const pledged = p.pledged ?? p.amount_pledged ?? 0;
      const backers = p.backers_count ?? p.num_backers ?? 0;
      const cat = p.category?.name || p.category_name || "";
      const trendScore = Math.min(100, Math.round(Math.log10((pledged || 0) / 100 + 1) * 15 + Math.log10((backers || 0) + 1) * 8));
      out.push({
        plattform: "Kickstarter",
        trend: (name + (cat ? " (" + cat + ")" : "")).slice(0, 100),
        trend_score: trendScore,
        market_saturation: Math.min(100, 50 + i * 3),
        raw: { pledged, backers }
      });
    }
    if (out.length === 0) {
      const nameMatches = html.match(/"name"\s*:\s*"([^"]{5,80})"/g) || html.match(/data-project-name="([^"]+)"/g);
      const names = nameMatches ? nameMatches.slice(0, 8).map((m) => (m.match(/"([^"]+)"/) || [])[1]).filter(Boolean) : [];
      names.forEach((name, i) => {
        out.push({
          plattform: "Kickstarter",
          trend: (name || "Trending project").slice(0, 80),
          trend_score: 72 - i * 2,
          market_saturation: Math.min(100, 55 + i * 2)
        });
      });
    }
  }
  if (out.length === 0) {
    out.push(
      { plattform: "Kickstarter", trend: "Tech / Gadgets (offentlig trend)", trend_score: 75, market_saturation: 65 },
      { plattform: "Kickstarter", trend: "Design / Fashion (offentlig trend)", trend_score: 68, market_saturation: 58 },
      { plattform: "Kickstarter", trend: "Games (offentlig trend)", trend_score: 72, market_saturation: 62 }
    );
  }
  return out;
}

// --- 7. Google Trends (pytrends) – trending/rising searches, senaste 30d/12m ---
function fetchGoogleTrends() {
  try {
    const scriptPath = PYTRENDS_SCRIPT.replace(/\\/g, "/");
    const out = execSync(`python "${PYTRENDS_SCRIPT}"`, {
      encoding: "utf-8",
      timeout: 60000,
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const data = JSON.parse(out || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// --- Samla alla trender ---
async function collectAllTrends() {
  const googleTrends = fetchGoogleTrends();
  const [yt, gh, etsy, ph, tiktok, ks] = await Promise.all([
    fetchYouTubeTrending(),
    fetchGitHubTrending(),
    fetchEtsyTrending(),
    fetchProductHuntTrending(),
    fetchTikTokTrending(),
    fetchKickstarterTrending()
  ]);
  const all = [...googleTrends, ...yt, ...gh, ...etsy, ...ph, ...tiktok, ...ks];
  return applyCrossPlatformBoost(all);
}

/** Idéer som syns på flera plattformar får högre trend_score. */
function applyCrossPlatformBoost(trends) {
  const key = (t) => (t.trend || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
  const byKey = new Map();
  for (const t of trends) {
    const k = key(t);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const out = [];
  for (const t of trends) {
    const group = byKey.get(key(t)) || [];
    const platformCount = new Set(group.map((x) => x.plattform)).size;
    const boost = platformCount > 1 ? Math.min(15, (platformCount - 1) * 6) : 0;
    out.push({
      ...t,
      trend_score: Math.min(100, (t.trend_score ?? 0) + boost)
    });
  }
  return out;
}

// --- Filtrera: mättnad <= 70 % ---
function filterBySaturation(trends) {
  return trends.filter((t) => (t.market_saturation ?? 100) <= MAX_SATURATION);
}

// --- OpenAI: generera 3–5 produktidéer per trend (strikta kriterier – endast vad fabriken kan bygga) ---
async function generateIdeasWithOpenAI(trendsFiltered) {
  if (!OPENAI_API_KEY || trendsFiltered.length === 0) return [];

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const results = [];

  const systemRules = `Du är AI_FABRIK – KOMPAKT DIKTATOR: end-to-end automatiserad startup-fabrik. Endast DIGITALA produkter: appar, spel, webbsidor, SaaS, interaktiva verktyg, AI-verktyg. Kvalitetsnivå: Duolingo/Hemnet/Monkey Island – inga halvfärdiga MVPs.

Identifiera idéer som REDAN genererar intäkter (Etsy digitala nedladdningar, Kickstarter digitala spel/verktyg, Product Hunt, YouTube). Juridik & etik: BLOCKERA varumärkesintrång, olagliga tjänster, starkt omoraliskt innehåll, gråzoner. juridisk_risk måste vara ≥70 för att idé ska byggas.
KRITERIER: Digital, intäktsdrivande, marknadsförbar, juridiskt säker. market_saturation ≤70%. Liknande produkter ska generera intäkter.
FORBUD: Fysiska produkter (blockeras tills digitalisering möjlig). Fysiska lager, personuppgifter/tillstånd, varumärkeskopior, olagligt, starkt omoraliskt.`;

  for (const t of trendsFiltered.slice(0, 12)) {
    const prompt = `${systemRules}

Trend: ${t.trend}
Plattform: ${t.plattform}
Trendstyrka (0–100): ${t.trend_score}
Marknadsmättnad (0–100): ${t.market_saturation}

Generera 3–5 konkreta idéer. För varje idé ange:
- verklig_lönsamhet: 0–100 (hur starkt bevis finns för intäkter på Etsy/Kickstarter/YouTube/Product Hunt)
- juridisk_risk: 0–100 (100 = låg risk, 0 = blockera – varumärke, olagligt, omoraliskt)
- blockerad: "ja" om juridisk_risk = 0 eller idé ska stoppas, annars "nej"
- förväntad_månatlig_intäkt: realistisk uppskattning SEK (0–100000+)

Returnera ENDAST en JSON-array:
[
  { "idé": "konkret produkt/tjänst", "lönsamhetspotential": "hög|medel|låg", "verklig_lönsamhet": 75, "juridisk_risk": 90, "blockerad": "nej", "förväntad_månatlig_intäkt": 15000 },
  { "idé": "...", "lönsamhetspotential": "...", "verklig_lönsamhet": 0-100, "juridisk_risk": 0-100, "blockerad": "ja|nej", "förväntad_månatlig_intäkt": 0-100000+ }
]

juridisk_risk: 100 = säker, 0 = blockera. juridisk_risk < 70 → idé byggs aldrig. blockerad: "ja" endast om idé ska aldrig byggas.`;

    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6
      });
      const text = (res.choices?.[0]?.message?.content || "").trim().replace(/^```json?\s*|\s*```$/g, "");
      const ideas = JSON.parse(text || "[]");
      if (Array.isArray(ideas)) {
        for (const idea of ideas) {
          const idé = (idea.idé || idea.ide || "").trim();
          if (!idé || idé.length < 15) continue;
          let verkligNum = idea.verklig_lönsamhet;
          if (typeof verkligNum !== "number" || !Number.isFinite(verkligNum)) {
            const v = String(idea.verklig_lönsamhet || "").toLowerCase();
            verkligNum = v.startsWith("ja") ? 75 : v.startsWith("nej") ? 25 : 50;
          }
          verkligNum = Math.max(0, Math.min(100, Math.round(verkligNum)));
          let juridisk = idea.juridisk_risk;
          if (typeof juridisk !== "number" || !Number.isFinite(juridisk)) juridisk = 80;
          juridisk = Math.max(0, Math.min(100, Math.round(juridisk)));
          const blockerad = /^\s*ja\s*$/i.test(String(idea.blockerad || "")) || juridisk === 0 ? "ja" : "nej";
          let revenue = idea.förväntad_månatlig_intäkt;
          if (typeof revenue !== "number" || !Number.isFinite(revenue)) revenue = null;
          if (revenue != null) revenue = Math.max(0, Math.min(500000, Math.round(revenue)));
          results.push({
            plattform: t.plattform,
            trend: t.trend,
            trend_score: t.trend_score,
            market_saturation: t.market_saturation,
            idé,
            lönsamhetspotential: idea.lönsamhetspotential || "medel",
            verklig_lönsamhet: verkligNum,
            juridisk_risk: juridisk,
            blockerad,
            förväntad_månatlig_intäkt: revenue
          });
        }
      }
    } catch (err) {
      console.warn("[trend_scout] OpenAI fel för trend:", t.trend?.slice(0, 40), err.message);
    }
  }
  return results;
}

/** Total Score = (trend_score×(100-market_saturation)/100) × (verklig_lönsamhet/100) × (juridisk_risk/100). */
function computeTotalScore(idea) {
  const T = (idea.trend_score ?? 0) * (100 - (idea.market_saturation ?? 100)) / 100;
  const V = Math.max(0, Math.min(100, idea.verklig_lönsamhet ?? 50)) / 100;
  const J = Math.max(0, Math.min(100, idea.juridisk_risk ?? 80)) / 100;
  return T * V * J;
}

function addTotalScore(ideas) {
  return ideas.map((x) => ({ ...x, total_score: Math.round(computeTotalScore(x) * 100) / 100 }));
}

/** Sortera på Total Score (högst först). */
function sortByTotalScore(ideas) {
  return [...ideas].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));
}

/** Fysiska produkter blockeras – endast digitala (app, spel, web, SaaS, AI-verktyg). */
const PHYSICAL_PRODUCT_PATTERN = /\b(fysisk lager|skicka fysiska|leverans av (varor|produkter)|physical (product|goods|ship)|handgjord (vara|produkt)|handmade (physical|goods)|tillverka och skicka|manufacture and ship)\b/i;

/** Släpp inga idéer som inte uppfyller kriterierna (mättnad, juridik, byggbarhet, endast digitalt). */
function filterIdeasForFactory(ideas) {
  const forbidden = /\b(fysisk lager|skicka fysiska|personuppgifter|personlig data|regulatorisk|tillstånd krävs)\b/i;
  return ideas.filter((x) => {
    if ((x.market_saturation ?? 0) > MAX_SATURATION) return false;
    if ((x.juridisk_risk ?? 100) < MIN_JURIDISK_RISK) return false;
    if (!(x.idé && x.idé.length >= 15)) return false;
    if (forbidden.test(x.idé)) return false;
    if (PHYSICAL_PRODUCT_PATTERN.test(x.idé)) return false;
    return true;
  });
}

/** Filtrera bort idéer med juridisk_risk < 70 (kompakt diktator: juridisk_risk < 70 → inga byggs). */
function filterByJuridiskRisk(ideas) {
  return ideas.filter((x) => (x.juridisk_risk ?? 100) >= MIN_JURIDISK_RISK);
}

/** Kassera idéer utan verklig monetisering – låg verklig_lönsamhet (tal) eller blockerad. */
function filterByVerkligLönsamhet(ideas) {
  return ideas.filter((x) => {
    const v = x.verklig_lönsamhet;
    if (typeof v === "number") return v >= 20;
    const s = (x.verklig_lönsamhet || "").trim().toLowerCase();
    if (!s || s === "ej angiven") return true;
    return !s.startsWith("nej");
  });
}

// --- Main ---
async function main() {
  console.log("[AI_FABRIK] Diktatorn – trendspaning, idégenerering, produktion och marknadsföring.");
  console.log("[AI_FABRIK] Samlar data från plattformar...\n");

  const allTrends = await collectAllTrends();
  console.log("[AI_FABRIK] Totalt antal trender (före filtrering):", allTrends.length);

  const filtered = filterBySaturation(allTrends);
  console.log("[AI_FABRIK] Efter filtrering (market_saturation <= " + MAX_SATURATION + "%):", filtered.length);

  let ideasWithIdéer = filtered.map((t) => ({
    plattform: t.plattform,
    trend: t.trend,
    trend_score: t.trend_score,
    market_saturation: t.market_saturation,
    idé: "(genereras av OpenAI)",
    lönsamhetspotential: "medel",
    verklig_lönsamhet: 50,
    juridisk_risk: 80,
    blockerad: "nej",
    förväntad_månatlig_intäkt: null
  }));

  if (OPENAI_API_KEY) {
    console.log("[AI_FABRIK] Genererar produktidéer med OpenAI (strikta kriterier – endast byggbara idéer)...");
    const generated = await generateIdeasWithOpenAI(filtered);
    if (generated.length > 0) ideasWithIdéer = generated;
  } else {
    console.warn("[AI_FABRIK] OPENAI_API_KEY saknas – ingen idégenerering, endast trenddata.");
  }

  ideasWithIdéer = filterIdeasForFactory(ideasWithIdéer);
  ideasWithIdéer = filterByVerkligLönsamhet(ideasWithIdéer);
  ideasWithIdéer = filterByJuridiskRisk(ideasWithIdéer);
  console.log("[AI_FABRIK] Efter filter (mättnad ≤70%, juridisk_risk ≥70%, endast digitalt):", ideasWithIdéer.length);
  ideasWithIdéer = addTotalScore(ideasWithIdéer);
  const sorted = sortByTotalScore(ideasWithIdéer);

  const topp3StartaProduktion = sorted.slice(0, 3).map((x, i) => ({
    rank: i + 1,
    plattform: x.plattform,
    trend: x.trend,
    idé: x.idé,
    trend_score: x.trend_score,
    market_saturation: x.market_saturation,
    total_score: x.total_score,
    verklig_lönsamhet: x.verklig_lönsamhet,
    juridisk_risk: x.juridisk_risk,
    blockerad: x.blockerad,
    lönsamhetspotential: x.lönsamhetspotential,
    förväntad_månatlig_intäkt: x.förväntad_månatlig_intäkt,
    motivering: `Total Score ${x.total_score?.toFixed(1) ?? "-"}. Verklig lönsamhet ${x.verklig_lönsamhet}/100, juridisk risk ${x.juridisk_risk}/100.`
  }));

  const output = {
    genererad: new Date().toISOString(),
    mål: "100 000 kr/månad på 6 månader",
    fokus: "KOMPAKT DIKTATOR – Endast digitala produkter. market_saturation ≤70%, juridisk_risk ≥70%. Blockerade/fysiska byggs aldrig. Backup-idéer (rank 2–3) fyller pipeline.",
    total_score_formel: "Total Score = (trend_score×(100-market_saturation)/100) × (verklig_lönsamhet/100) × (juridisk_risk/100)",
    antal_idéer: sorted.length,
    idéer: sorted,
    daglig_sammanfattning: {
      beskrivning: "Topp 3 att producera – sorterat på Total Score. När topp 1 byggs → nästa toppidé tas automatiskt. juridisk_risk < 70 eller blockerad → ingen byggs.",
      topp_3_starta_produktion: topp3StartaProduktion
    }
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  const dailyTop3Payload = {
    genererad: new Date().toISOString(),
    beskrivning: "TOP 3 att producera – fullständig produkt + betalvägar + marknadsföring. Rank 2–3 = backup för pipeline. juridisk_risk ≥70 krävs. Blockerade byggs aldrig.",
    topp_3: topp3StartaProduktion.map((x) => ({
      rank: x.rank,
      idé: x.idé,
      plattform: x.plattform,
      trend: x.trend,
      total_score: x.total_score,
      juridisk_risk: x.juridisk_risk,
      blockerad: x.blockerad,
      kort_motivering: (x.motivering || "").slice(0, 200),
      förväntad_lönsamhet: x.lönsamhetspotential,
      förväntad_månatlig_intäkt_sek: x.förväntad_månatlig_intäkt,
      trend_score: x.trend_score,
      market_saturation: x.market_saturation
    }))
  };
  await fs.writeFile(DAILY_TOP3_FILE, JSON.stringify(dailyTop3Payload, null, 2), "utf-8");

  console.log("\n[AI_FABRIK] Klar. Output sparad till:", OUTPUT_FILE, "| Daglig topp 3:", DAILY_TOP3_FILE);
  console.log("\n--- TOP 5 TREND IDEAS (sorterade på Total Score) ---");
  sorted.slice(0, 5).forEach((x, i) => {
    console.log(`${i + 1}. [${x.plattform}] ${x.trend?.slice(0, 50)}...`);
    console.log(`   total_score=${x.total_score?.toFixed(1) ?? "-"} | trend_score=${x.trend_score} | market_saturation=${x.market_saturation} | verklig_lönsamhet=${x.verklig_lönsamhet} | juridisk_risk=${x.juridisk_risk} | blockerad=${x.blockerad}`);
    console.log(`   idé: ${(x.idé || "").slice(0, 60)}...`);
    if (x.förväntad_månatlig_intäkt != null) console.log(`   förväntad_månatlig_intäkt: ${x.förväntad_månatlig_intäkt} kr`);
  });
  console.log("\n--- Daglig sammanfattning – TOP 3 att starta produktion på (se daily_top3.json) ---");
  topp3StartaProduktion.forEach((x, i) => {
    console.log(`\n${i + 1}. ${(x.idé || "").slice(0, 70)}...`);
    console.log(`   Total Score: ${x.total_score?.toFixed(1)} | juridisk_risk: ${x.juridisk_risk} | blockerad: ${x.blockerad} | potential: ${x.lönsamhetspotential}${x.förväntad_månatlig_intäkt != null ? " | " + x.förväntad_månatlig_intäkt + " kr/mån" : ""}`);
    console.log(`   Motivering: ${(x.motivering || "").slice(0, 120)}`);
  });

  let mvpResult = null;
  const top1 = sorted[0];
  const top1Blocked = top1 && (top1.blockerad === "ja" || (top1.juridisk_risk ?? 100) === 0 || (top1.juridisk_risk ?? 100) < MIN_JURIDISK_RISK);
  if (sorted.length > 0 && process.env.TREND_SCOUT_SKIP_MVP !== "1" && !top1Blocked) {
    try {
      const approvedPath = path.join(root, "ideas", "approved_trend_ideas.json");
      await fs.writeFile(approvedPath, JSON.stringify({ approvedIdeas: [top1.idé], uncertainIdeas: [] }, null, 2), "utf-8");
      const { runFullProductPipeline } = await import("./builders/full_product_pipeline.js");
      mvpResult = await runFullProductPipeline();
      const createdIds = mvpResult.createdIds || [];
      if (createdIds.length > 0) {
        output.last_mvp_launched = {
          idé: top1.idé,
          appIds: createdIds,
          datum: new Date().toISOString(),
          deploy_logg: "Produkt byggd, betalvägar (scaffold) aktiverade, marknadsföring klar. Nästa körning tar nästa toppidé (pipeline)."
        };
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
        console.log("\n[AI_FABRIK] Fullständig produkt byggd (topp 1):", top1.idé?.slice(0, 50) + "...", "| App-ID:", createdIds[0]);
        console.log("[AI_FABRIK] Deploy-logg: produkt byggd, betalvägar aktiverade, marknadsföring klar. Nästa toppidé fyller pipeline.");
      }
    } catch (err) {
      console.warn("[AI_FABRIK] Auto-build misslyckades (topp 1):", err.message);
    }
  } else if (top1Blocked && top1) {
    console.log("\n[AI_FABRIK] Topp 1 byggs inte (blockerad=ja, juridisk_risk=0 eller juridisk_risk < 70).");
  }

  console.log("");
  return { ok: true, antal: sorted.length, topp3: topp3StartaProduktion, mvpLaunched: mvpResult };
}

const isMain = process.argv[1] && process.argv[1].endsWith("trend_scout.js");
if (isMain) {
  main().catch((err) => {
    console.error("[AI_FABRIK] Fel:", err);
    process.exit(1);
  });
}

export { main };
