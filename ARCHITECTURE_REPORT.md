# AI_FABRIK – Architecture Report

---

## SECTION 1 — PROJECT STRUCTURE

```
AI_FABRIK/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── PAYMENT_AND_MARKETING.md
├── REPOSITORY_OVERVIEW.md
├── ARCHITECTURE_REPORT.md          (this file)
│
├── agents/
│   ├── boss.js                     # Delegates to workers (rarely used)
│   ├── capability_filter.js        # Reject ideas too complex for factory
│   ├── product_architect.js        # Idea → product spec
│   ├── revenue_tracker.js          # Track metrics, evaluate performance
│   ├── superchief.js               # Alternative pipeline: ideas → inspectors → build → QA
│   ├── tester_agent.js             # App tests before deployment (HTML, JS, UI, placeholders)
│   ├── workers.js                  # idea → spec → filter → build (index.html, app.js, styles.css)
│   └── inspectors/
│       ├── legal_inspector.js      # Legal/sensitive-idea check
│       ├── market_inspector.js     # Market potential check
│       ├── money_inspector.js      # Monetization check
│       └── quality_inspector.js    # HTML structure quality
│
├── builders/
│   ├── app_builder.js              # Legacy/alternate app builder
│   ├── designer.js                 # OpenAI UI improvement (improveUI)
│   ├── evolution.js                # Idea ranking/filter (keyword + length)
│   ├── full_product_pipeline.js    # Main build pipeline: approved ideas → workers → QA → deploy index
│   ├── update_app_html.js           # Update app HTML
│   └── update_apps_run.js          # Update apps run script
│
├── ideas/
│   ├── approved_trend_ideas.json   # Input for full_product_pipeline (from trend_scout)
│   ├── ideaFilter.js               # OpenAI idea filter
│   ├── ideas.js                    # OpenAI idea generation (generateIdeas)
│   └── ideas.json                  # Cached/generated ideas
│
├── marketing/
│   ├── growth_hacker.js            # Stub: runGrowth(appId)
│   ├── live_sources.js             # collectLiveSignals (trend data)
│   ├── marketing_agent.js          # Stub: runMarketing(appId, idea)
│   ├── pricing_monetization_agent.js  # Stub: suggestPricing(idea)
│   ├── trend_analyst.js            # filterByTrends, analyzeTrends (OpenAI)
│   └── user_feedback_agent.js      # collectFeedback (stub)
│
├── scripts/
│   ├── google_trends_pytrends.py   # Google Trends via pytrends
│   └── requirements.txt            # pytrends
│
├── testers/
│   ├── quality_tester.js           # HTML structure + viewport + CTA check
│   └── test_runner.js              # File exists, DOCTYPE, body, content, no throw
│
├── deploy_index.js                 # buildDeployIndex(passedAppIds) → deploy/index.html
├── trend_scout.js                  # Trend collection, OpenAI ideas, scoring, auto-call pipeline
├── daily_trend_scout.js            # Wrapper: run trend_scout every 24h
├── daily_top3.json                 # Output: top 3 ideas to produce
├── trend_ideas.json                # Output: all ideas + total_score
│
├── deploy.js                       # Builds deploy/index.html linking to ./apps/<id>/app.html (different layout)
├── full_qa_top_idea.js             # QA report for “top” app (UI/UX, function, payment)
├── superchief_daemon.js            # Daemon: trend analyst + full_product_pipeline
├── superchief_from_trend_json.js   # Run pipeline from trend JSON + evolution + inspectors
├── automation_monitor.js           # reportAction, getStatus (loop detection)
│
├── add_app_function.js             # Utility: add app
├── check_all_keys.js               # Test API keys (OpenAI, YouTube, etc.)
├── copy_apps_to_deploy.js          # Copy apps → deploy
├── generate_index.js               # Generate index
├── long_version.js                 # Long version / check script
├── publisher.js                    # Publish utility
├── trend_analyst_test_run.js       # Test trend analyst
├── trend_scanner.js                # Trend scanning (legacy?)
├── test_openai_key.js              # Test OpenAI key
├── test_etsy_api.js                # Test Etsy API
│
├── data/                           # Created at runtime
│   └── revenue_metrics.json        # revenue_tracker storage
│
├── apps/                           # Built app artifacts (many app_<id>/)
│   └── app_<id>/
│       ├── idea.txt
│       ├── spec.json               # If built via spec-driven workers
│       ├── marketing.txt
│       ├── index.html | app.html
│       ├── app.js                  # If spec-driven
│       ├── styles.css              # If spec-driven
│       ├── marketing/              # Per-channel copy
│       ├── payment_config.json
│       └── PAYMENT_README.txt
│
├── deploy/                         # Deployable artifacts (PASS only in index)
│   ├── index.html                  # List of PASS app links (./<appId>/)
│   └── app_<id>/
│       ├── index.html
│       ├── app.html
│       ├── app.js
│       ├── styles.css
│       └── marketing/
│
├── projects/                       # Legacy/alternate app output (older structure)
│   └── app_<id>/ | app1/ ...
│
├── qa_top_idea_report.json         # full_qa_top_idea.js output
├── superchief_report.log           # Pipeline/agent logs
└── errors.log                      # Error log
```

---

## SECTION 2 — AGENTS / MODULES

| File | Responsibility |
|------|----------------|
| **agents/boss.js** | Delegates build to workers (`runFactory` → `createApps`). Not used by main pipelines. |
| **agents/capability_filter.js** | `evaluateBuildability(spec)`: reject high complexity, >40h, disallowed categories; return `allowed`, `reason`, `adjusted_scope`. |
| **agents/product_architect.js** | `createProductSpec(idea)`: idea → structured spec (product_type, features, pages, tech_stack, build_complexity, etc.). Uses OpenAI or heuristic. |
| **agents/revenue_tracker.js** | `recordMetrics(product_name, metrics)`, `evaluatePerformance(product_name)`: store visitors/signups/revenue; mark for review (<100 visitors after 30d), scale candidate (>5% conversion). Not wired into pipeline. |
| **agents/superchief.js** | Alternative pipeline: generate ideas → trend analyst → evolution → market/money/legal inspectors → workers → quality + test_runner + quality_tester → buildDeployIndex → marketing stubs. |
| **agents/tester_agent.js** | `runAppTests(app_path, product_spec)`: HTML load, JS syntax, main feature output, UI per feature, no placeholder text. Returns `passed`, `issues`. Not called by full_product_pipeline. |
| **agents/workers.js** | `createApps(ideas)`: for each idea → createProductSpec → evaluateBuildability; if allowed, build from spec (index.html, app.js, styles.css) into apps/ and deploy/. |
| **agents/inspectors/market_inspector.js** | `inspectMarket(idea)`: keyword-based market/saturation check. |
| **agents/inspectors/money_inspector.js** | `inspectMoney(idea)`: monetization keyword check. |
| **agents/inspectors/legal_inspector.js** | `inspectLegal(idea)`: high-risk keyword blocklist. |
| **agents/inspectors/quality_inspector.js** | `inspectQuality(artifact, productType)`: DOCTYPE, html/head/body, title, h1, CTA. |
| **builders/evolution.js** | `filterIdeas(ideas)`: rank by length + keywords; read from approved_trend_ideas.json if no ideas passed. |
| **builders/full_product_pipeline.js** | Read approved ideas → createApps → marketing/payment scaffolding → QA (quality_inspector, test_runner, quality_tester) → buildDeployIndex → marketing/pricing/growth stubs. |
| **builders/designer.js** | `improveUI(html)`: OpenAI-based UI improvement. Optional, not in main pipeline. |
| **builders/app_builder.js** | Legacy app builder. |
| **ideas/ideas.js** | `generateIdeas(count)`: OpenAI SaaS idea generation. Used by Superchief. |
| **ideas/ideaFilter.js** | `filterIdea(idea)`: OpenAI filter. |
| **marketing/trend_analyst.js** | `filterByTrends(ideas)`, `analyzeTrends(idea)`: trend/market filter using live_sources + OpenAI. |
| **marketing/live_sources.js** | `collectLiveSignals(idea)`: external trend/signal collection. |
| **marketing/marketing_agent.js** | Stub: `runMarketing(appId, idea)`. |
| **marketing/pricing_monetization_agent.js** | Stub: `suggestPricing(idea)`. |
| **marketing/growth_hacker.js** | Stub: `runGrowth(appId)`. |
| **marketing/user_feedback_agent.js** | Stub: `collectFeedback(appId)`. |
| **testers/test_runner.js** | `runTests(artifactPath)`: file exists, DOCTYPE, body, content, no critical script error. |
| **testers/quality_tester.js** | `testQuality(artifact)`: structure + viewport + CTA. |
| **deploy_index.js** | `buildDeployIndex(passedAppIds)`: write deploy/index.html with links to ./<appId>/. |
| **trend_scout.js** | Collect trends (YouTube, GitHub, Google Trends, TikTok, Etsy, Product Hunt, Kickstarter) → OpenAI ideas → score/filter → trend_ideas.json, daily_top3.json → optionally write top 1 to approved_trend_ideas.json and call runFullProductPipeline. |
| **automation_monitor.js** | `reportAction(agentId, action)`, `getStatus()`, `reset()`: loop detection for automation. |

---

## SECTION 3 — CURRENT PIPELINE

### Main flow (idea discovery → deployment)

1. **Idea discovery**
   - **trend_scout.js** (or **daily_trend_scout.js**): Fetches trends from YouTube, GitHub, Google Trends (pytrends), TikTok, Etsy, Product Hunt, Kickstarter. Optionally generates 3–5 ideas per trend via OpenAI. Filters by market_saturation ≤70%, juridisk_risk ≥70%, verklig_lönsamhet, digital-only. Computes Total Score; sorts; writes **trend_ideas.json**, **daily_top3.json**. If top 1 is not blocked, writes **ideas/approved_trend_ideas.json** (single idea) and calls **runFullProductPipeline()**.

2. **Market / idea shaping (inside trend_scout)**
   - Scoring and filtering act as market/risk analysis (no separate market-analysis step after discovery in this path).  
   - **Alternative path (Superchief):** **ideas.js** (generate ideas) → **trend_analyst** (filterByTrends) → **evolution** (filterIdeas) → **market / money / legal inspectors** before build.

3. **Product building**
   - **full_product_pipeline.js** reads **ideas/approved_trend_ideas.json** and calls **agents/workers.js** `createApps(approvedIdeas)`.
   - **Workers:** For each idea → **product_architect** `createProductSpec(idea)` → **capability_filter** `evaluateBuildability(spec)`; if not allowed, skip; if allowed, generate **index.html**, **app.js**, **styles.css** from spec into **apps/<id>/** and **deploy/<id>/**.
   - Pipeline then writes marketing copy (Google Ads, TikTok, etc.) and **payment_config.json** per app.

4. **Testing**
   - **full_product_pipeline.js** runs for each built app (under deploy/<id>): **quality_inspector** (HTML), **test_runner** (file + structure), **quality_tester** (viewport, CTA). Only apps that pass all three are added to **passedIds**. **tester_agent** (runAppTests) and **full_qa_top_idea.js** exist but are **not** invoked by this pipeline.

5. **Deployment**
   - **buildDeployIndex(passedIds)** writes **deploy/index.html** with links to `./<appId>/`. The **deploy/** folder is the deployment artifact; there is **no** automated push to GitHub Pages or other host (gh-pages is a devDependency but not used in scripts). **deploy.js** builds a different index (links to ./apps/...) and is **not** aligned with this flow.

6. **Marketing**
   - After QA, pipeline calls **runMarketing**, **suggestPricing**, **runGrowth** for each passed app; these are **stubs** (no real campaigns or tracking).

7. **Post-deploy tracking**
   - **revenue_tracker** (recordMetrics, evaluatePerformance) is **not** called by any pipeline; it is a standalone module for manual or future integration.

---

## SECTION 4 — GAPS IN ARCHITECTURE

- **tester_agent not in pipeline:** Spec-driven tests (HTML load, JS syntax, main feature output, UI per feature, no placeholders) are implemented in **tester_agent** but **full_product_pipeline** does not call it; it only uses quality_inspector + test_runner + quality_tester. Failed apps are not sent back to workers for rebuild.

- **Two deploy conventions:** **deploy_index.js** and the pipeline write **deploy/<appId>/** and list links as `./<appId>/`. **deploy.js** builds an index that links to **./apps/<app>/app.html**. The two are inconsistent; **npm run deploy** does not match the pipeline output.

- **No automatic publish:** Nothing pushes **deploy/** to GitHub Pages or any host. **gh-pages** is installed but not used in scripts.

- **Revenue/performance not integrated:** **revenue_tracker** is never invoked by trend_scout, pipeline, or daemon; no automatic recording of deploy_date or metrics, and no feedback from “mark for review” / “scale candidate” into prioritization or rebuild.

- **Duplicate idea filtering:** Trend-scout path filters by saturation, juridisk_risk, verklig_lönsamhet, and physical-product rules. Superchief path uses trend_analyst + evolution + market/money/legal inspectors. Two different entry points and rule sets; possible divergence and maintenance cost.

- **Boss unused:** **agents/boss.js** is not used by trend_scout or full_product_pipeline; they call **createApps** directly.

- **Two app outputs (apps/ vs projects/):** **apps/** is used by the current pipeline; **projects/** contains older/legacy app structure. No clear single source of truth for “built apps” outside deploy.

- **Marketing/pricing/growth stubs:** No real implementation for runMarketing, suggestPricing, runGrowth, or collectFeedback; post-deploy marketing and growth are not implemented.

- **No rebuild loop:** When **tester_agent** or QA fails, there is no automatic “send back to workers for rebuild” or retry with adjusted scope.

---

## SECTION 5 — RECOMMENDED IMPROVEMENTS

1. **Integrate tester_agent into the pipeline**  
   After building each app (or before adding to passedIds), call **runAppTests(deployPath, spec)**. If `passed === false`, either: (a) add to failedReports and optionally trigger a single rebuild with **adjusted_scope**, or (b) skip deploy and log issues for manual fix.

2. **Single deploy story**  
   Either remove **deploy.js** or change it to build the same **deploy/index.html** as **buildDeployIndex** (links to **deploy/<appId>/**). Add an optional script (e.g. `npm run publish`) that runs **gh-pages -d deploy** (or equivalent) so deployment is one command.

3. **Wire revenue_tracker into deployment**  
   When an app is first added to **passedIds** (or when deploy index is updated), call **recordMetrics(product_name, { deploy_date: today, visitors: 0, signups: 0, revenue: 0 })**. Optionally, a separate job or manual step can update metrics; **evaluatePerformance** can then feed “mark for review” / “scale candidate” into reporting or prioritization.

4. **Unify or document the two pipelines**  
   Either: (a) make Superchief use the same idea source as trend_scout (e.g. read from trend_ideas.json or approved_trend_ideas.json) and align filters, or (b) clearly document “Trend path” vs “Superchief path” and when to use each. Consider deprecating **boss.js** if it remains unused.

5. **Implement or remove marketing stubs**  
   Either implement minimal versions of **runMarketing**, **suggestPricing**, and **runGrowth** (e.g. write channel-specific files or call external APIs), or remove them from the pipeline until needed to avoid the impression of “marketing done.”

6. **Single source for built apps**  
   Treat **apps/** as the canonical build output and **deploy/** as the publishable copy (PASS only). Avoid writing to **projects/** from the current pipeline; migrate or archive **projects/** and document the difference.

7. **Rebuild on test failure (optional)**  
   If **tester_agent** or QA fails, pass **capability_filter.adjusted_scope** (or a simplified idea) back into **createProductSpec** / workers for one retry before giving up and reporting failure.

---

*Generated as part of the AI_FABRIK architecture review.*
