# AI_FABRIK – Repository Overview

## 1. SYSTEM ARCHITECTURE

**Idea → App → Deploy**

1. **Ideas** come from one of:
   - `ideas/ideas.json` (candidate list, used by daemon)
   - `ideas/approved_trend_ideas.json` (approved list, written by trend_scout or daemon)
   - Optional: `idea_explosion_engine.generateTopIdeas()` (generates ~100 ideas, scores, returns top 5–10; not yet wired into pipeline)

2. **Build:** The pipeline reads approved ideas and calls **workers** (`createApps(ideas)`). For each idea:
   - **product_architect** turns it into a product spec (product_name, product_type, features, etc.).
   - **capability_filter** decides if the spec is buildable; if not, the idea is skipped.
   - If allowed: **BUILD_MODE** chooses **ai_code_engine** (AI-generated HTML/JS/CSS/logic) or **template** (deterministic spec-driven templates). Output is written to **apps/\<id\>** and **deploy/\<id\>**.

3. **Post-build (per app):** Marketing and payment scaffolding are written (e.g. `apps/<id>/marketing/*.txt`, `payment_config.json`).

4. **QA:** Each app is tested: **quality_inspector** (HTML), **test_runner**, **quality_tester**, **tester_agent** (runAppTests). On failure, **capability_filter.evaluateBuildability** can suggest an adjusted scope; the pipeline attempts **one rebuild** with that scope, then re-tests. If it still fails, the app is not deployed.

5. **Deploy:** Only apps that pass QA are listed in **deploy/index.html** via **buildDeployIndex(passedIds)**. Marketing/pricing/growth hooks run for passed apps; **revenue_tracker.recordMetrics** initializes metrics in **data/revenue_metrics.json**.

---

## 2. AGENTS

| File | Role |
|------|------|
| **agents/ai_code_engine.js** | Generates full app code (indexHtml, appJs, stylesCss, logicJs, readme) from a product spec using the AI; used by workers when BUILD_MODE=ai_generated. |
| **agents/boss.js** | Thin wrapper that delegates build jobs to workers (createApps). |
| **agents/capability_filter.js** | Evaluates whether a product spec is buildable; returns allowed/reason/adjusted_scope; used by workers and pipeline for rebuilds. |
| **agents/idea_explosion_engine.js** | Generates ~100 product ideas via AI, scores them (usefulness, clarity, monetization, simplicity), returns top 5–10; not yet integrated into the pipeline. |
| **agents/product_architect.js** | Converts a raw idea (idea_title, idea_description) into a structured product spec (product_name, product_type, features, etc.) via AI or heuristics. |
| **agents/revenue_tracker.js** | Records and updates product metrics (deploy_date, visitors, signups, revenue, conversion_rate) in data/revenue_metrics.json; used after deploy. |
| **agents/superchief.js** | Legacy “superchief” flow: generates ideas, runs trend analyst + evolution + inspectors + workers + tests + deploy + marketing; invoked by long_version.js. |
| **agents/tester_agent.js** | Runs app tests (HTML load, JS syntax, main feature output, UI vs spec, no placeholders) on a deploy folder; returns { passed, issues }. |
| **agents/workers.js** | Builds apps from ideas: idea → product_architect → capability_filter → build (ai_code_engine or template); writes to apps/\<id\> and deploy/\<id\>. |
| **agents/inspectors/quality_inspector.js** | Inspects HTML/artifact quality and returns { pass, uncertain, reason }. |
| **agents/inspectors/legal_inspector.js** | Inspects an idea for legal concerns; returns { pass, uncertain, reason }. |
| **agents/inspectors/market_inspector.js** | Inspects an idea for market fit; returns { pass, uncertain, reason }. |
| **agents/inspectors/money_inspector.js** | Inspects an idea for monetization/financial viability; returns { pass, uncertain, reason }. |

---

## 3. BUILD PIPELINE (builders/full_product_pipeline.js)

**Steps:**

1. **Load .env** (loadEnv).
2. **Read approved ideas** from `ideas/approved_trend_ideas.json` (approvedIdeas or approved). If empty, exit.
3. **Log IDEA_SELECTED** and **BUILD_STARTED**; call **createApps(approvedIdeas)** (workers). Build creates apps and writes marketing/payment scaffolding per app.
4. **Log BUILD_COMPLETED** and **PRODUCT_SPEC_CREATED**.
5. **For each created app:**
   - Load spec from `apps/<appId>/spec.json` (or fallback).
   - **Log TESTING**; run **runQaAndTester**: quality_inspector → test_runner → quality_tester → **runAppTests** (tester_agent).
   - If **TEST_FAILED:** get **evaluateBuildability(spec).adjusted_scope**, build one revised idea, call **createApps([revisedIdea])**, write marketing/payment for the new app, then run QA + runAppTests again. If retry passes → add new app to passedIds; if not → add to failedReports.
   - If **TEST_PASSED** → add app to passedIds.
6. **Log DEPLOYED**; call **buildDeployIndex(passedIds)** to update deploy/index.html.
7. For each passed app: **runMarketing**, **suggestPricing**, **runGrowth**.
8. For each passed app: **recordMetrics(productName, { deploy_date, visitors: 0, signups: 0, revenue: 0, conversion_rate: 0 })**; **log METRICS_INITIALIZED**.
9. Log confirmation and file list to console and superchief_report.log; return { ok, createdIds, passedIds, failedReports, ... }.

**Entry when run as script:** `node builders/full_product_pipeline.js` runs `runFullProductPipeline()`.

---

## 4. DATA FLOW

- **Idea generation:** Ideas come from `ideas/ideas.json` (daemon) or from trend_scout (writes `approved_trend_ideas.json`). idea_explosion_engine can produce scored ideas (not yet wired).
- **Product architecture:** Workers call **product_architect.createProductSpec(idea)** → spec (product_name, product_type, features, value_proposition, etc.).
- **Code generation:** Workers use **capability_filter.evaluateBuildability(spec)**; if allowed, **ai_code_engine.generate(spec)** (or template builder) produces files → written to **apps/\<id\>** and **deploy/\<id\>** (index.html, app.html, app.js, styles.css, logic.js, spec.json, idea.txt, marketing.txt, marketing/*.txt, payment_config.json, etc.).
- **Testing:** Pipeline reads **apps/\<id\>/spec.json**, runs quality_inspector on HTML, test_runner and quality_tester on deploy folder, **tester_agent.runAppTests(deploy/<id>, spec)**. Failures can trigger one rebuild using **capability_filter.evaluateBuildability(spec).adjusted_scope**.
- **Marketing:** Pipeline calls **writeMarketingMaterials(appId, idea)** (per-channel copy), **runMarketing**, **suggestPricing**, **runGrowth** for passed apps; outputs under apps/\<id\>/marketing and deploy/\<id\>/marketing.
- **Revenue tracking:** After **buildDeployIndex(passedIds)**, pipeline calls **revenue_tracker.recordMetrics(productName, metrics)** for each passed app; data is stored in **data/revenue_metrics.json**.

---

## 5. GENERATED APPS (apps/\<id\>/)

Each app folder (e.g. **apps/app_1772880978711_4909/**) typically contains:

| File / folder | Description |
|---------------|-------------|
| **idea.txt** | Product name or idea title. |
| **spec.json** | Full product spec from product_architect (product_name, product_type, features, value_proposition, etc.). |
| **marketing.txt** | Short marketing blurb. |
| **index.html** | Main app HTML (same as app.html for pipeline compatibility). |
| **app.html** | Copy of index.html (used by test_runner / quality_tester / tester_agent). |
| **app.js** | Main application script (connects UI to logic). |
| **styles.css** | Styles for the app. |
| **logic.js** | Present when BUILD_MODE=ai_generated; core logic, exported functions used by app.js. |
| **README.md** | Present when BUILD_MODE=ai_generated; short project readme. |
| **marketing/** | Per-channel copy (e.g. google_ads.txt, tiktok.txt, youtube.txt, linkedin.txt, pinterest.txt, product_hunt.txt). |
| **payment_config.json** | Payment scaffolding (Stripe, PayPal, etc.; keys to be filled per product). |
| **PAYMENT_README.txt** | Instructions for payment setup. |

The same app is mirrored under **deploy/\<id\>/** (HTML, JS, CSS, logic.js, marketing/) so that deploy is the served artifact; **deploy/index.html** lists only PASS app links.

---

## 6. ENTRY POINT

There is no single binary entry point; different scripts start different flows:

| Script | Role |
|--------|------|
| **long_version.js** | Full one-shot run: checks structure, .env, required modules, then **dynamically imports agents/superchief.js**, which calls **runFactory()** (ideas → trend analyst → evolution → inspectors → workers → tests → deploy → marketing). |
| **superchief_daemon.js** | Continuous loop (default 7 min): reads **ideas/ideas.json** → **filterByTrends** → writes **ideas/approved_trend_ideas.json** → **runFullProductPipeline()**. |
| **trend_scout.js** (when run as main) | Fetches/processes trends, picks top idea, writes **approved_trend_ideas.json** with one idea, then runs **runFullProductPipeline()** for that idea. |
| **builders/full_product_pipeline.js** (when run as main) | Reads **ideas/approved_trend_ideas.json**, runs **runFullProductPipeline()** (build → QA → deploy → marketing → revenue_tracker). |

So: **long_version.js** starts the legacy Superchief factory; **superchief_daemon.js** and **trend_scout.js** feed the **full_product_pipeline**, which is the main path from approved ideas to built and deployed apps.
