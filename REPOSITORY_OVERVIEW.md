# AI_FABRIK – Repository Overview

This document explains the entire AI_FABRIK codebase: agents, app generation, pipeline, deployment, and weaknesses.

---

## 1. All Agents

Agents are the decision and execution units. They are **rule-based/heuristic** (no OpenAI in inspectors or workers) except where noted.

### 1.1 Boss (`agents/boss.js`)

- **Role:** Delegates build jobs to workers. Called by Superchief with a number or list of ideas.
- **API:** `runFactory(numberOfApps)` → calls `createApps()` from workers.
- **Note:** Rarely used directly; the main flow uses **trend_scout** → **full_product_pipeline** or **Superchief** → workers.

### 1.2 Workers (`agents/workers.js`)

- **Role:** Build apps from approved ideas. **Fully deterministic, template-based; no OpenAI.**
- **API:** `createApps(ideas)` – `ideas` can be an array of strings or a newline-separated string.
- **Behaviour:**
  - For each idea: generates a unique ID `app_${Date.now()}_${random}`.
  - Creates `apps/<id>/`: `idea.txt`, `app.html`, `marketing.txt`.
  - Creates `deploy/<id>/`: `index.html` (landing), `app.html` (same as apps).
  - **App HTML:** Single template: Tailwind, header “AI_FABRIK”, title = idea, hero + “Idea scratchpad” (textarea + Run test / Clear) with `localStorage`. No idea-specific logic—every app is the same structure with the idea as title/copy.
- **Output:** Array of created app IDs.

### 1.3 Inspectors (all heuristic, no OpenAI)

| Agent | File | Role | Input | Output |
|-------|------|------|--------|--------|
| **Market** | `agents/inspectors/market_inspector.js` | Market potential, trend, competition | Idea string | `{ pass, uncertain, reason }` |
| **Money** | `agents/inspectors/money_inspector.js` | Revenue potential, monetization | Idea string | `{ pass, uncertain, reason }` |
| **Legal** | `agents/inspectors/legal_inspector.js` | Legal risk, sensitive topics (medical, financial advice, etc.) | Idea string | `{ pass, uncertain, reason }` |
| **Quality** | `agents/inspectors/quality_inspector.js` | Structural quality of built artifact | HTML string (or path) | `{ pass, uncertain, reason }` |

- **Market:** Keyword lists (saturated vs promising); pass/uncertain/fail from counts.
- **Money:** Monetization keywords (subscription, SaaS, etc.) vs weak (free only); score threshold.
- **Legal:** Blocklist of high-risk keywords (medical, legal advice, financial advice, children data, etc.); any match → fail.
- **Quality:** Checks for DOCTYPE, `<html>`, `<head>`, `<body>`, `<title>`, `<h1>`, and a CTA (button or `.btn`/`.cta` link). Logs to `superchief_report.log`.

### 1.4 Superchief (`agents/superchief.js`)

- **Role:** Top-level decision point. No idea/product proceeds without passing Superchief. Only PASS products are listed in the deploy index.
- **Flow:**
  1. **Ideas:** `generateIdeas(10)` from `ideas/ideas.js` (OpenAI – GPT-4.1-mini) → raw ideas.
  2. **Trend analyst:** `filterByTrends(ideas)` from `marketing/trend_analyst.js` → trend-approved list.
  3. **Evolution:** `filterIdeas(trendApproved)` from `builders/evolution.js` (deterministic ranking by length + keywords) → best ideas.
  4. **Inspectors:** For each idea, run **Market → Money → Legal**. Only ideas that pass all three go to build.
  5. **Build:** `createApps(passedInspectors)` (workers).
  6. **QA:** For each built app: **Quality Inspector** (HTML) + **test_runner** + **quality_tester**. Only PASS → added to deploy index.
  7. **Deploy index:** `buildDeployIndex(passedIds)` – writes `deploy/index.html` with links to `./<appId>/`.
  8. **Post-build:** `runMarketing()`, `suggestPricing()`, `runGrowth()` for each PASS app (currently stubs).
- **Entry:** `npm start` → `node agents/superchief.js`.

### 1.5 Supporting “agents” (marketing/pricing/growth)

- **marketing_agent.js:** `runMarketing(appId, idea)` – **stub** (returns `{ ok: true, reason: "stub" }`).
- **pricing_monetization_agent.js:** `suggestPricing(idea)` – **stub** (returns freemium + "stub").
- **growth_hacker.js:** `runGrowth(appId)` – **stub**.

So: **real agents** are Boss, Workers, four Inspectors, and Superchief. Marketing/pricing/growth are placeholders.

---

## 2. How Apps Are Generated

- **Single source of app content:** `agents/workers.js` → `createAppHtml(idea)` and `createLandingPageHtml(idea, marketingText)`.
- **Process:**
  1. Idea string (e.g. “Anpassningsbara lanterns med kreativ design”) is passed to `createApps([idea])`.
  2. Workers generate `app_<timestamp>_<random>` and create:
     - `apps/<id>/idea.txt` – idea string.
     - `apps/<id>/app.html` – one fixed HTML template with:
       - `<title>`, `<h1>` = idea.
       - Hero text: generic “lightweight, auto-generated SaaS-style tool…”
       - “Idea scratchpad”: textarea + “Run quick test” / “Clear results”, persisted in `localStorage` with a key like `ai_fabrik_note_<timestamp>`.
       - No backend, no API calls, no idea-specific behaviour.
     - `apps/<id>/marketing.txt` – generic “Unlock the power of …” copy.
     - `deploy/<id>/index.html` – landing with idea title + marketing bullets + link to “Open interactive prototype” (`./app.html`).
     - `deploy/<id>/app.html` – same HTML as in `apps/<id>/app.html`.
- **No LLM or dynamic generation of UI or logic:** every app is the same template; only the idea title and marketing text change. The “Duolingo/Hemnet/Monkey Island” quality bar in docs is aspirational; the current implementation is a single deterministic template.

---

## 3. How the Pipeline Works

There are **two main pipelines**.

### 3.1 Trend Scout → Full Product Pipeline (main “Kompakt Diktator” flow)

1. **trend_scout.js** (`npm run trend`):
   - **Collect:** Fetches trends from YouTube API, GitHub API, Google Trends (pytrends script), TikTok/Etsy/Kickstarter (web scraping), Product Hunt (GraphQL). Builds list of `{ plattform, trend, trend_score, market_saturation }`.
   - **Filter:** `market_saturation ≤ 70%`.
   - **Ideas:** If `OPENAI_API_KEY` is set, calls OpenAI to generate 3–5 ideas per trend with `verklig_lönsamhet`, `juridisk_risk`, `blockerad`, `förväntad_månatlig_intäkt`. Otherwise uses placeholder ideas.
   - **Filter ideas:** `filterIdeasForFactory` (saturation, juridisk_risk ≥ 70, no physical-product keywords), `filterByVerkligLönsamhet` (e.g. ≥ 20), `filterByJuridiskRisk` (≥ 70).
   - **Score:** `total_score = (trend_score×(100−market_saturation)/100) × (verklig_lönsamhet/100) × (juridisk_risk/100)`. Sorts by `total_score`.
   - **Output:** Writes `trend_ideas.json` (all ideas + total_score) and `daily_top3.json` (top 3). Logs TOP 5 to console.
   - **Auto-build:** If top idea is not blocked (`blockerad !== "ja"`, `juridisk_risk ≥ 70`), writes **only top 1** to `ideas/approved_trend_ideas.json` and calls `runFullProductPipeline()`.

2. **full_product_pipeline.js** (invoked by trend_scout or run directly):
   - Reads `ideas/approved_trend_ideas.json` (array of idea strings).
   - Calls **workers** `createApps(approvedIdeas)` → creates `apps/<id>/` and `deploy/<id>/` per idea.
   - For each app: writes **marketing** copy (Google Ads, TikTok, YouTube, LinkedIn, Pinterest, Product Hunt) to `apps/<id>/marketing/*.txt` and `deploy/<id>/marketing/*.txt`; writes **payment_config.json** (Stripe, PayPal, Apple Pay, Google Pay placeholders) and `PAYMENT_README.txt`.
   - **QA loop:** For each app: **quality_inspector** (HTML), **test_runner** (file + DOCTYPE/body/content/script errors), **quality_tester** (structure + viewport + CTA). Only if all PASS → app is added to `passedIds`.
   - **Deploy index:** `buildDeployIndex(passedIds)` → updates `deploy/index.html` with links to `./<appId>/`.
   - **Post-PASS:** Calls `runMarketing()`, `suggestPricing()`, `runGrowth()` (stubs).
   - Logs to console and `superchief_report.log`; returns `{ ok, createdIds, passedIds, failedReports, ... }`.

So: **Trend Scout** = trend data + OpenAI ideas + scoring + filters → writes approved list → **Full Product Pipeline** = build (workers) + marketing/payment scaffolding + QA → deploy index.

### 3.2 Superchief pipeline (alternative)

- **Entry:** `npm start` → `agents/superchief.js`.
- **Flow:** Generate ideas (OpenAI) → trend analyst → evolution filter → Market/Money/Legal inspectors → workers → Quality + test_runner + quality_tester → buildDeployIndex → marketing/pricing/growth stubs.
- **Difference from trend_scout flow:** No trend_scout data; ideas come from `ideas/ideas.js` (generic SaaS idea prompt). Inspectors (market, money, legal) run **before** build; in trend_scout flow, idea filtering is by saturation/juridisk/verklig_lönsamhet and no pre-build market/money/legal inspectors.

---

## 4. How Deployment Works

- **Deploy artefact:** The `deploy/` folder. It contains:
  - `deploy/index.html` – index of PASS apps: links to `./<appId>/` (each app’s folder).
  - `deploy/<appId>/index.html` – landing page for that app.
  - `deploy/<appId>/app.html` – the actual “app” (single-page template).
  - `deploy/<appId>/marketing/*.txt` – per-channel copy.
- **Who builds it:** `buildDeployIndex(passedIds)` in `deploy_index.js` (used by full_product_pipeline and Superchief). It writes `deploy/index.html` with links to `./${appId}/` (so each app is a folder with its own index/app).
- **deploy.js** (`npm run deploy`): **Separate script.** It reads **`apps/`** (not `deploy/`), builds a single `deploy/index.html` that links to `./apps/${app}/app.html`. So it assumes deploy root contains a flat list of app links pointing into **apps/** subfolders, which does **not** match the structure produced by the pipeline (which puts each app under `deploy/<appId>/`). So:
  - **Pipeline deployment:** Use the `deploy/` folder as-is; serve it (e.g. static host or gh-pages from `deploy/`).
  - **npm run deploy:** Rebuilds a different index that links into `apps/`; inconsistent with pipeline output and with `buildDeployIndex`.
- **GitHub Pages:** `gh-pages` is a devDependency but **no npm script** uses it. To publish, you would need to add e.g. `gh-pages -d deploy` and run it manually or in CI; the repo does not do that by default.

**Summary:** Deployment is “whatever serves the `deploy/` folder.” The pipeline fills `deploy/` and `deploy_index.js` keeps `deploy/index.html` in sync with PASS apps. Actual publish (e.g. to GitHub Pages) is not wired in; `deploy.js` is an older/different convention and doesn’t match the pipeline layout.

---

## 5. Weaknesses in the System

1. **Apps are not idea-specific.** Workers use one HTML template for every idea. There is no generation of custom UI, flows, or features per idea; only title and marketing text change. The “full product” / “Duolingo-level” claim is not implemented.

2. **Marketing, pricing, and growth are stubs.** `runMarketing`, `suggestPricing`, and `runGrowth` do nothing. No real campaigns, pricing logic, or growth hooks.

3. **Payment is scaffold-only.** `payment_config.json` is created with placeholders (`SET_STRIPE_SECRET_KEY`, etc.). No integration with Stripe/PayPal/Apple/Google; no checkout or test flows.

4. **Two deploy conventions.** `deploy_index.js` + full pipeline use `deploy/<appId>/` and links `./<appId>/`. `deploy.js` builds an index that links to `./apps/<app>/app.html`. They are incompatible; `npm run deploy` does not match the pipeline output.

5. **No real deployment to the web.** `deploy/` is only a local folder. No script pushes to GitHub Pages or any host; gh-pages is installed but not used.

6. **Trend data quality.** TikTok, Etsy, Kickstarter rely on web scraping (often 403 or HTML fallbacks). Product Hunt may need a token. So trend inputs can be empty or fallback data.

7. **QA is structural only.** Quality inspector and test_runner/quality_tester check DOCTYPE, tags, viewport, CTA. They do not test behaviour, accessibility, or real payment flows; `full_qa_top_idea.js` checks payment config presence/placeholders, not live payments.

8. **Superchief vs trend_scout.** Two separate entry points (Superchief vs trend_scout → full_product_pipeline) with different idea sources and different inspector usage (market/money/legal only in Superchief). Risk of confusion and duplicated logic.

9. **Boss is unused in the main flow.** `agents/boss.js` is only a thin wrapper over `createApps` and is not used by trend_scout or full_product_pipeline; those call `createApps` directly.

10. **Ideas.js API.** `ideas/ideas.js` uses `openai.responses.create` and `res.output_text` (Responses API); if the API shape changes or the model is unavailable, idea generation in Superchief breaks.

11. **No persistence of run state.** Which ideas were already built, which failed, and why is only in logs and in `trend_ideas.json` / `last_mvp_launched`. There is no structured “pipeline state” or idempotency (e.g. “skip if this idea already has an app”).

12. **Single top idea per run.** When trend_scout triggers the pipeline, it passes only the **top 1** idea to `approved_trend_ideas.json`. Rank 2 and 3 are only in daily_top3; they are not built unless the user manually approves them or runs again with a different selection.

---

## Quick reference

| Component | Purpose |
|-----------|---------|
| **trend_scout.js** | Collect trends → OpenAI ideas → score/filter → write approved list → optionally call full_product_pipeline |
| **full_product_pipeline.js** | Read approved ideas → workers → marketing/payment scaffolding → QA → buildDeployIndex |
| **agents/workers.js** | createApps(ideas) → deterministic app + deploy HTML per idea |
| **agents/superchief.js** | Alternative flow: ideas.js → trend analyst → evolution → inspectors → workers → QA → buildDeployIndex |
| **deploy_index.js** | buildDeployIndex(passedIds) → deploy/index.html with links to PASS apps |
| **deploy.js** | Standalone script: list apps from apps/ → deploy/index.html linking to ./apps/<id>/app.html (different layout) |
| **Inspectors** | Market, Money, Legal (idea-level); Quality (HTML-level). All heuristic. |
| **full_qa_top_idea.js** | QA report for “top” app (from trend_ideas.json): UI/UX, function, payment config. |
