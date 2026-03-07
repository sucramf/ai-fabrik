/**
 * LIVE SOURCES – Samlar in live-liknande marknadssignaler för en idé.
 *
 * OBS:
 * - Den här modulen är byggd för att prata med riktiga API:er, men kräver att du
 *   fyller i korrekta endpoints och credentials i `.env`.
 * - För att slippa hårdkoda alla vendor‑specifika scheman antar vi att varje
 *   konfigurerat endpoint returnerar JSON där vi kan härleda:
 *     - trend_score   (0–100 eller 0–1 eller redan normaliserad)
 *     - saturation    (0–100 eller 0–1 eller redan normaliserad)
 *   Om fältnamn skiljer sig (score, popularity, market_saturation, etc.)
 *   försöker vi mappa dem defensivt.
 *
 * Stödda källor (inga Reddit‑anrop här):
 * - Google Trends / Custom Search
 * - Twitter / X
 * - YouTube Trends
 * - Product Hunt
 * - Kickstarter / Indiegogo
 * - Amazon Best Sellers
 * - Etsy Trending
 * - Pinterest
 * - LinkedIn
 * - TikTok / Discover
 * - GitHub Trending
 *
 * För varje idé returneras ett samlat objekt:
 * {
 *   trend_score: 0–100,
 *   market_saturation: 0–100,
 *   pass: boolean,
 *   uncertain: boolean,
 *   reason: string
 * }
 */

/**
 * Förväntade env‑variabler (läggs i .env):
 *
 * GOOGLE_TRENDS_ENDPOINT
 * GOOGLE_API_KEY
 *
 * TWITTER_ENDPOINT        (t.ex. egen backend som wrappar Twitter/X API)
 * TWITTER_BEARER_TOKEN
 *
 * YOUTUBE_TRENDS_ENDPOINT
 * YOUTUBE_API_KEY
 *
 * PRODUCTHUNT_ENDPOINT
 * PRODUCTHUNT_TOKEN
 *
 * KICKSTARTER_ENDPOINT
 * KICKSTARTER_TOKEN
 *
 * AMAZON_ENDPOINT
 * AMAZON_ACCESS_KEY_ID
 * AMAZON_SECRET_ACCESS_KEY
 *
 * ETSY_ENDPOINT
 * ETSY_API_KEY
 *
 * PINTEREST_ENDPOINT
 * PINTEREST_ACCESS_TOKEN
 *
 * LINKEDIN_ENDPOINT
 * LINKEDIN_CLIENT_ID
 * LINKEDIN_CLIENT_SECRET
 *
 * TIKTOK_ENDPOINT
 * TIKTOK_ACCESS_TOKEN
 *
 * GITHUB_TRENDING_ENDPOINT
 * GITHUB_TOKEN
 */

const SOURCES = [
  {
    id: "google_trends",
    envUrl: "GOOGLE_TRENDS_ENDPOINT",
    envKey: "GOOGLE_API_KEY",
    weight: 1.2
  },
  {
    id: "twitter_x",
    envUrl: "TWITTER_ENDPOINT",
    envKey: "TWITTER_API_KEY",
    weight: 1.0
  },
  {
    id: "youtube_trends",
    envUrl: "YOUTUBE_TRENDS_ENDPOINT",
    envKey: "YOUTUBE_API_KEY",
    weight: 1.0
  },
  {
    id: "product_hunt",
    envUrl: "PRODUCTHUNT_ENDPOINT",
    envKey: "PRODUCTHUNT_API_KEY",
    weight: 1.3
  },
  {
    id: "kickstarter",
    envUrl: "KICKSTARTER_ENDPOINT",
    envKey: "KICKSTARTER_API_KEY",
    weight: 0.8
  },
  {
    id: "amazon_bestsellers",
    envUrl: "AMAZON_ENDPOINT",
    envKey: "AMAZON_API_KEY",
    weight: 1.0
  },
  {
    id: "etsy_trending",
    envUrl: "ETSY_ENDPOINT",
    envKey: "ETSY_API_KEY",
    weight: 0.9
  },
  {
    id: "pinterest",
    envUrl: "PINTEREST_ENDPOINT",
    envKey: "PINTEREST_API_KEY",
    weight: 0.7
  },
  {
    id: "linkedin",
    envUrl: "LINKEDIN_ENDPOINT",
    envKey: "LINKEDIN_API_KEY",
    weight: 0.8
  },
  {
    id: "tiktok_discover",
    envUrl: "TIKTOK_ENDPOINT",
    envKey: "TIKTOK_API_KEY",
    weight: 1.1
  },
  {
    id: "github_trending",
    envUrl: "GITHUB_TRENDING_ENDPOINT",
    envKey: "GITHUB_API_KEY",
    weight: 1.2
  }
];

/**
 * Säker fetch med timeout och defensiv JSON‑parsing.
 */
async function safeFetchJson(url, options = {}, timeoutMs = 8000) {
  if (typeof fetch !== "function") {
    return { error: "fetch_not_available" };
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch (err) {
    clearTimeout(id);
    return { error: String(err?.message || err) };
  }
}

/**
 * Försök extrahera trend_score och market_saturation ur godtycklig JSON.
 */
function extractScoresFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { trendScore: null, saturation: null, meta: payload };
  }

  const candidates = Array.isArray(payload) ? payload[0] || {} : payload;

  const num = (v) => (typeof v === "number" ? v : NaN);

  const tsCandidates = [
    num(candidates.trend_score),
    num(candidates.trendScore),
    num(candidates.score),
    num(candidates.popularity),
    num(candidates.interest)
  ];
  const msCandidates = [
    num(candidates.market_saturation),
    num(candidates.saturation),
    num(candidates.competition),
    num(candidates.crowdedness)
  ];

  let trendScore = tsCandidates.find((v) => Number.isFinite(v));
  let saturation = msCandidates.find((v) => Number.isFinite(v));

  // Skala 0–1 till 0–100 om det ser rimligt ut.
  if (Number.isFinite(trendScore) && trendScore <= 1 && trendScore >= 0) {
    trendScore *= 100;
  }
  if (Number.isFinite(saturation) && saturation <= 1 && saturation >= 0) {
    saturation *= 100;
  }

  if (!Number.isFinite(trendScore)) trendScore = null;
  if (!Number.isFinite(saturation)) saturation = null;

  return { trendScore, saturation, meta: payload };
}

async function collectFromSource(source, idea) {
  const url = process.env[source.envUrl];
  if (!url) return null;

  const headers = {
    "Content-Type": "application/json"
  };

  const token = process.env[source.envKey];
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = JSON.stringify({ idea });

  const payload = await safeFetchJson(url, { method: "POST", headers, body });

  if (payload && payload.error === "fetch_not_available") {
    return {
      source: source.id,
      trendScore: null,
      saturation: null,
      error: "Global fetch is not available in this runtime."
    };
  }

  const { trendScore, saturation, meta } = extractScoresFromPayload(payload);

  return {
    source: source.id,
    trendScore,
    saturation,
    raw: meta
  };
}

/**
 * Huvudfunktion:
 * Samlar in signaler från alla konfigurerade källor och returnerar
 * ett normaliserat beslutsobjekt.
 *
 * @param {string} idea
 * @returns {Promise<{ trend_score: number, market_saturation: number, pass: boolean, uncertain: boolean, reason: string }>}
 */
export async function collectLiveSignals(idea) {
  const perSourceResults = [];

  for (const src of SOURCES) {
    try {
      const res = await collectFromSource(src, idea);
      if (res) perSourceResults.push(res);
    } catch (err) {
      perSourceResults.push({
        source: src.id,
        trendScore: null,
        saturation: null,
        error: String(err?.message || err)
      });
    }
  }

  const usable = perSourceResults.filter(
    (r) => Number.isFinite(r.trendScore) || Number.isFinite(r.saturation)
  );

  if (!usable.length) {
    return {
      trend_score: 0,
      market_saturation: 100,
      pass: false,
      uncertain: true,
      reason:
        "No live signals available (endpoints or credentials missing, or responses not parseable)."
    };
  }

  let weightSum = 0;
  let trendSum = 0;
  let satSum = 0;

  for (const r of usable) {
    const src = SOURCES.find((s) => s.id === r.source);
    const w = src?.weight ?? 1;
    const ts = Number.isFinite(r.trendScore) ? r.trendScore : null;
    const ms = Number.isFinite(r.saturation) ? r.saturation : null;

    if (ts !== null || ms !== null) {
      weightSum += w;
      if (ts !== null) trendSum += w * ts;
      if (ms !== null) satSum += w * ms;
    }
  }

  if (!weightSum) {
    return {
      trend_score: 0,
      market_saturation: 100,
      pass: false,
      uncertain: true,
      reason: "Live sources configured but did not return usable scores."
    };
  }

  let trend_score = trendSum / weightSum;
  let market_saturation = satSum / weightSum;

  trend_score = Math.max(0, Math.min(100, Number.isFinite(trend_score) ? trend_score : 0));
  market_saturation = Math.max(
    0,
    Math.min(100, Number.isFinite(market_saturation) ? market_saturation : 100)
  );

  const strongTrend = trend_score >= 60;
  const acceptableSaturation = market_saturation <= 70;

  // Heuristisk osäkerhet: få källor eller motsägelsefulla signaler.
  const distinctSources = new Set(usable.map((r) => r.source)).size;
  const uncertain =
    distinctSources < 2 ||
    (trend_score > 50 && market_saturation > 80) ||
    (trend_score < 40 && market_saturation < 30);

  const pass = strongTrend && acceptableSaturation && !uncertain;

  const reason = [
    `Aggregated from ${distinctSources} live source(s).`,
    `trend_score=${trend_score.toFixed(1)}, market_saturation=${market_saturation.toFixed(1)}.`,
    pass
      ? "Signals suggest monetizable demand and non-saturated market."
      : uncertain
      ? "Signals are conflicting or insufficient; requires Superchief review."
      : "Signals do not justify a new product in this market right now."
  ].join(" ");

  return {
    trend_score,
    market_saturation,
    pass,
    uncertain,
    reason
  };
}

