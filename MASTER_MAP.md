# AI_FABRIK — Master Architecture Map

**This document is the authoritative architecture map of the AI_FABRIK system.** A new AI agent should be able to read only this file to understand how the entire factory works.

AI_FABRIK is an autonomous AI product factory (startup studio) that discovers opportunities, builds digital products, improves them continuously, and manages a portfolio with minimal human involvement. The goal is **high-quality niche products** (quality tier: Duolingo, The Secret of Monkey Island, Hemnet), not spam tools or massive platforms. Strategy: **AI Quality Studio** — focused, excellent products, not volume.

---

## 1. Complete System Architecture

### Execution model

- **Single long-running process:** `superchief_daemon.js` (root of repo).
- **No subprocesses:** all work is in-process via imported functions.
- **Cycle:** runs one full cycle immediately, then every **7 minutes** via `setInterval`.
- **Coordination:** agents do not call each other (except the build chain). The daemon calls one agent at a time; data flows through **files**.

### High-level loop

```
ideas → trend filter → product spec → capability check → AI build → QA → deploy
  → marketing/distribution → metrics → evolution → portfolio → strategy → resources
  → growth experiments → feedback/distribution → repeat
```

### Key principle

**Missing files must not crash the system.** Agents fail safely when data is missing. If `ideas/ideas.json` is empty, the daemon skips the build cycle and continues with evolution/portfolio/growth for existing apps.

---

## 2. All Agents and Their Responsibilities

| Agent | Location | Responsibility |
|-------|----------|----------------|
| **workers** | agents/workers.js | Orchestrates build per idea: calls product_architect → capability_filter → ai_code_engine (or template). Writes apps/<id> and deploy/<id>. |
| **product_architect** | agents/product_architect.js | Converts raw idea into structured product spec (product_name, product_type, features, build_complexity, etc.). Uses OpenAI or heuristic fallback. |
| **capability_filter** | agents/capability_filter.js | Evaluates spec: allowed / rejected. Rejects high complexity, disallowed types, social/games/legal-medical/marketplace. Returns adjusted_scope for rebuild. |
| **ai_code_engine** | agents/ai_code_engine.js | Generates full app code from spec (indexHtml, appJs, stylesCss, logicJs, readme). Uses OpenAI; vanilla HTML/JS/CSS, no build step. |
| **tester_agent** | agents/tester_agent.js | QA: HTML structure, JS syntax, output element, UI for product_type, no placeholders. Returns passed + issues. |
| **quality_inspector** | agents/inspectors/quality_inspector.js | Heuristic quality bar on HTML (DOCTYPE, body, title, h1, CTA). Pass/uncertain/fail + reason. |
| **revenue_tracker** | agents/revenue_tracker.js | Records/updates product metrics (deploy_date, visitors, signups, revenue, conversion_rate) in data/revenue_metrics.json. Keyed by product_name. |
| **trend_scanner** | agents/trend_scanner.js | Appends simulated trend opportunities to ideas/trend_opportunities.json. Does not write ideas.json. |
| **trend_analyst** | marketing/trend_analyst.js | Filters ideas by trend/market (OpenAI). Writes ideas/approved_trend_ideas.json. Used by daemon before pipeline. |
| **evolution_engine** | agents/evolution_engine/product_evolution_engine.js | Allocation-aware improvement plans. Reads portfolio status, metrics, feedback; writes apps/<id>/evolution_plan.json. Never modifies code. |
| **portfolio_brain** | agents/portfolio_brain.js | Scans apps/, reads metrics/<id>.json, scores products, writes portfolio/portfolio_status.json (status: weak \| experiment \| promising \| winner). |
| **strategic_brain** | agents/strategic_brain.js | Reads portfolio_status.json, maps status → action (scale, invest, continue_testing, consider_shutdown), writes strategy/factory_strategy.json. |
| **resource_allocator** | agents/resource_allocator.js | Reads factory_strategy.json, maps action → allocation (high, medium, low, minimal), writes resources/resource_allocation.json. |
| **growth_experiment_engine** | agents/growth_experiment_engine.js | Scans apps/, adds planned experiments to growth/growth_experiments.json (SEO, Reddit, Product Hunt, blog, video, directory). |
| **growth_execution_agent** | agents/growth_execution_agent.js | Reads growth_experiments.json, for "planned" generates marketing/<appId>/<type>.md, sets status to "prepared". |
| **distribution_agent** | agents/distribution_agent.js | For one appId: loads spec + idea.txt, builds markdown, writes distribution/<appId>.md. |
| **user_feedback_agent** | agents/user_feedback_agent.js | Ensures feedback/<appId>.json exists (array of { timestamp, type, message }); optionally appends entry. |
| **marketing_agent** | marketing/marketing_agent.js | **Stub.** Called by pipeline; no logic. |
| **pricing_monetization_agent** | marketing/pricing_monetization_agent.js | **Stub.** Called by pipeline; no logic. |
| **growth_hacker** | marketing/growth_hacker.js | **Stub.** Called by pipeline; no logic. |
| **test_runner** | testers/test_runner.js | Structural checks on deploy HTML (DOCTYPE, body, content length, no critical script error). |
| **quality_tester** | testers/quality_tester.js | Heuristic QA (structure, viewport, CTA). Used by full_product_pipeline. |
| **buildDeployIndex** | deploy_index.js | Writes deploy/index.html listing only passed app IDs. |
| **full_product_pipeline** | builders/full_product_pipeline.js | Top-level build: read approved ideas → workers → QA (with one rebuild on fail) → deploy index → marketing/payment scaffolding → revenue_tracker. |

Other referenced agents (boss, superchief, idea_explosion_engine, inspectors beyond quality) may exist in codebase but are not in the daemon’s execution path described here.

---

## 3. All Important Folders

| Folder | Purpose | Main files |
|--------|---------|------------|
| **ideas/** | Idea storage and trend filtering | ideas.json (candidates), approved_trend_ideas.json (after trend filter), trend_opportunities.json (from trend scanner) |
| **apps/** | Generated applications | \<app_id\>/: spec.json, idea.txt, app.html, app.js, styles.css, logic.js, evolution_plan.json, marketing/, payment_config.json |
| **deploy/** | Deployment output | index.html (list of passed apps), \<app_id\>/: app.html, app.js, styles.css, marketing/ |
| **metrics/** | Per-app performance metrics | \<app_id\>.json (users, session_time, bounce_rate, etc.) — **see gaps: not written by current code** |
| **data/** | Global system data | revenue_metrics.json (product_name, visitors, signups, revenue, conversion_rate) |
| **portfolio/** | Portfolio state | portfolio_status.json (products with appId, score, status) |
| **strategy/** | Strategic decisions | factory_strategy.json (products with appId, status, action) |
| **resources/** | Resource allocation | resource_allocation.json (products with appId, allocation) |
| **feedback/** | User feedback per app | \<app_id\>.json (array of { timestamp, type, message }) |
| **growth/** | Growth experiments | growth_experiments.json (appId, experiment_type, status) |
| **marketing/** | Marketing assets | \<app_id\>/*.md (from growth execution), channel .txt files from pipeline |
| **distribution/** | Distribution content | \<app_id\>.md (SEO, directories, community posts, etc.) |
| **agents/** | Core AI agents | See §2 |
| **builders/** | Build/assembly scripts | full_product_pipeline.js, app_builder.js, evolution.js, etc. |
| **testers/** | QA | test_runner.js, quality_tester.js |
| **marketing/** | Trend analyst + stubs | trend_analyst.js, marketing_agent.js, pricing_monetization_agent.js, growth_hacker.js |

---

## 4. Data Flow Between Modules

### Ideas → Build

- **ideas/ideas.json** (array of strings) → read by daemon. **Nothing in repo writes this file** (see gaps).
- Daemon → **trend_analyst.filterByTrends(candidates)** → **ideas/approved_trend_ideas.json** { approvedIdeas, uncertainIdeas }.
- **full_product_pipeline** reads **approved_trend_ideas.json** → **workers.createApps(approvedIdeas)**.

### Build chain (inside workers)

- Idea string → **product_architect** → spec.
- Spec → **capability_filter** → allowed / rejected + adjusted_scope.
- If allowed: spec → **ai_code_engine** (or template in workers) → **apps/\<id\>/** and **deploy/\<id\>/** (HTML, JS, CSS, spec.json, idea.txt, etc.).

### Pipeline → QA → Deploy

- Pipeline runs **quality_inspector**, **test_runner**, **quality_tester**, **tester_agent** on deploy/\<id\>. On fail: **capability_filter** for adjusted_scope → **workers.createApps([revisedIdea])** once → re-QA. If still fail, app not deployed.
- **buildDeployIndex(passedIds)** → **deploy/index.html**.
- **revenue_tracker.recordMetrics(productName, {...})** → **data/revenue_metrics.json** (by product_name). Pipeline also writes **apps/\<id\>/marketing/** and **payment_config.json**; marketing/pricing/growth agents are stubs.

### Portfolio → Strategy → Resources

- **portfolio_brain:** **metrics/\<app_id\>.json** + apps/ → score → **portfolio/portfolio_status.json** (status: weak \| experiment \| promising \| winner).
- **strategic_brain:** **portfolio/portfolio_status.json** → action → **strategy/factory_strategy.json** (scale \| invest \| continue_testing \| consider_shutdown).
- **resource_allocator:** **strategy/factory_strategy.json** → allocation → **resources/resource_allocation.json** (high \| medium \| low \| minimal).

### Evolution

- **evolution_engine:** For each app: reads **portfolio/product_status.json** (or **portfolio/portfolio_status.json** with mapping), **metrics/\<id\>.json**, **feedback/\<id\>.json** → allocation-aware plan → **apps/\<id\>/evolution_plan.json**. Plans are proposals only; they never modify code.

### Growth and distribution

- **growth_experiment_engine:** apps/ → appends to **growth/growth_experiments.json** (status "planned").
- **growth_execution_agent:** **growth/growth_experiments.json** "planned" → **marketing/\<appId\>/\<type\>.md**, status → "prepared".
- **distribution_agent:** **apps/\<appId\>/spec.json** + idea.txt → **distribution/\<appId\>.md**.
- **user_feedback_agent:** Ensures **feedback/\<appId\>.json** exists; optionally appends entry.

---

## 5. Daemon Execution Order

**File:** `superchief_daemon.js`. Each cycle runs in this order:

| Step | Action | Notes |
|------|--------|------|
| 1 | loadEnv() | Load .env into process.env |
| 2 | runTrendScanner() | Append to ideas/trend_opportunities.json (does not populate ideas.json) |
| 3 | readCandidates() | Read ideas/ideas.json. **If empty → skip rest of cycle** (no build, no pipeline) |
| 4 | filterByTrends(candidates) | Trend analyst → write ideas/approved_trend_ideas.json |
| 5 | runFullProductPipeline() | Build, QA, deploy index, marketing/payment scaffolding, revenue_tracker. **Not wrapped in try/catch** — can throw |
| 6 | runEvolutionEngine() | apps/\<id\>/evolution_plan.json (allocation-aware) |
| 7 | runPortfolioAnalysis() | portfolio/portfolio_status.json |
| 8 | runStrategicBrain() | strategy/factory_strategy.json |
| 9 | runResourceAllocator() | resources/resource_allocation.json |
| 10 | runGrowthExperiments() | growth/growth_experiments.json |
| 11 | runGrowthExecution() | marketing/\<appId\>/*.md from "planned" experiments |
| 12 | For each app_* in apps | collectUserFeedback(appId), runDistribution(appId) |

Steps 2 and 7–11 are wrapped in catch; failures log and return safe defaults. Interval: 7 minutes; first cycle runs immediately on start.

---

## 6. Product Generation Pipeline

**Entry:** ideas/approved_trend_ideas.json (approvedIdeas or approved array).

**Sequence:**

1. **Create apps:** workers.createApps(approvedIdeas). For each idea:
   - product_architect.createProductSpec(idea) → spec
   - capability_filter.evaluateBuildability(spec) → allowed or rejected
   - If allowed: ai_code_engine.generate(spec) (or template if BUILD_MODE=template or AI fails) → apps/\<id\> + deploy/\<id\>
2. **Scaffolding:** For each created app, pipeline writes marketing channel .txt files and payment_config.json (apps + deploy).
3. **QA (per app):** quality_inspector(deploy HTML) → test_runner(deployPath) → quality_tester(deployPath) → tester_agent(app_path, spec). If any fail:
   - capability_filter for adjusted_scope → workers.createApps([revisedIdea]) **once**
   - Re-run QA for the new app; if still fail → record in failedReports, do not add to passedIds.
4. **Deploy:** buildDeployIndex(passedIds) → deploy/index.html lists only passed apps.
5. **Post-deploy (passed only):** runMarketing, suggestPricing, runGrowth (stubs), recordMetrics(productName, initial metrics) → data/revenue_metrics.json.

**Rule:** QA failure allows **one rebuild attempt** only. Evolution plans **never** overwrite code automatically.

---

## 7. Evolution System

**File:** agents/evolution_engine/product_evolution_engine.js

**Inputs (all optional; missing = no crash):**

- metrics/\<app_id\>.json
- portfolio/product_status.json (preferred) or portfolio/portfolio_status.json
- feedback/\<app_id\>.json

**Allocation (how plan type is chosen):**

- Prefer **portfolio/product_status.json** with status: grow \| maintain \| experiment \| pause.
- If absent: **portfolio/portfolio_status.json** with mapping — winner→grow, promising→maintain, experiment→experiment, weak→pause.
- Default for unknown app: maintain.

**Plan by status:**

| Status | Focus |
|--------|--------|
| **grow** | Major features, UX, performance, monetization; metrics + feedback |
| **maintain** | Bug fixes, small UX, stability; avoid large feature changes |
| **experiment** | Bold features, alternative directions, unusual growth; metrics + feedback |
| **pause** | No evolution; minimal plan (no actionable suggestions) |

**Output:** apps/\<app_id\>/evolution_plan.json (appId, allocation_status, reasoning, suggestions, generated_at, metrics_used, feedback_used, note that plans never auto-modify code).

**Rule:** Evolution plans are **proposals only**. They must **never** modify application code automatically.

---

## 8. Portfolio / Strategy / Resource Systems

**portfolio_brain**

- Scans apps/ (directories starting with `app_`).
- Reads **metrics/\<app_id\>.json** (users, session_time, bounce_rate).
- Scores by thresholds (e.g. users >1000, session_time >60, bounce_rate <0.5) → status: **weak \| experiment \| promising \| winner**.
- Writes **portfolio/portfolio_status.json** (products: appId, metrics, score, status, evaluated_at).

**strategic_brain**

- Reads **portfolio/portfolio_status.json**.
- Maps status → action: winner→**scale**, promising→**invest**, experiment→**continue_testing**, weak→**consider_shutdown**.
- Writes **strategy/factory_strategy.json** (products: appId, status, action, evaluated_at). Safe if file missing.

**resource_allocator**

- Reads **strategy/factory_strategy.json**.
- Maps action → allocation: scale→**high**, invest→**medium**, continue_testing→**low**, consider_shutdown→**minimal**.
- Writes **resources/resource_allocation.json** (products: appId, allocation, decided_at). Safe if strategy missing.

**Usage:** Evolution engine uses portfolio status (or product_status) to choose plan type. resource_allocation.json is for future agents (e.g. prioritization); no current code reads it.

---

## 9. Growth and Distribution Systems

**Trend scanner**

- Writes **ideas/trend_opportunities.json** (simulated opportunities: title, description, source, potential). Does **not** write ideas/ideas.json or approved_trend_ideas.json.

**Growth experiment engine**

- Scans apps/, for each app and each template (SEO landing, Reddit, Product Hunt, blog, short-form video, directory) appends one row to **growth/growth_experiments.json** if not already present (key: appId + experiment_type). Status: "planned".

**Growth execution agent**

- Reads **growth/growth_experiments.json**. For each experiment with status "planned": generates markdown by type, writes **marketing/\<appId\>/\<slug(type)\>.md**, sets status to "prepared", saves file.

**Distribution agent**

- For one appId: loads **apps/\<appId\>/spec.json** and idea.txt, builds markdown (product name, description, value prop, features, target user, “Try it”), writes **distribution/\<appId\>.md**. Invoked by daemon once per app per cycle.

**Pipeline marketing:** full_product_pipeline also writes channel .txt files (google_ads, tiktok, youtube, linkedin, pinterest, product_hunt) under apps/\<id\>/marketing and deploy/\<id\>/marketing. marketing_agent, pricing_monetization_agent, growth_hacker are stubs.

---

## 10. Known Architecture Gaps (from Technical Analysis)

These gaps exist in the current codebase. Fixing them would make the factory behave as intended end-to-end.

1. **ideas/ideas.json is never written by the repo.**  
   The daemon reads it; if empty, the whole build cycle is skipped. The trend scanner writes **ideas/trend_opportunities.json** but no code merges or copies opportunities into ideas.json. So either ideas.json must be populated manually/externally, or a step should be added to seed/merge from trend_opportunities.json.

2. **metrics/\<app_id\>.json is never written by any agent.**  
   **portfolio_brain** and **evolution_engine** read it (users, session_time, bounce_rate). Revenue and high-level metrics are stored in **data/revenue_metrics.json** by **product_name** (revenue_tracker). There is no bridge from product_name to app_id, and no writer for metrics/\<app_id\>.json. Portfolio and evolution therefore operate on empty or externally supplied per-app metrics unless another process or integration fills them.

3. **resource_allocation.json is not read by any current code.**  
   It is written by resource_allocator for “future agents” (e.g. evolution prioritization, marketing focus). Evolution already uses portfolio status; no agent currently uses allocation level from resources/.

4. **Marketing / pricing / growth agents in the pipeline are stubs.**  
   runMarketing, suggestPricing, runGrowth return success but implement no logic. Real marketing and growth execution happen via growth_experiment_engine + growth_execution_agent and distribution_agent, and via pipeline-written channel .txt files.

5. **Product identity: app_id vs product_name.**  
   Apps are keyed by **app_id** (e.g. app_123); revenue_tracker and some pipeline steps use **product_name** from spec. There is no single canonical mapping in code from app_id to product_name for metrics aggregation, so linking data/revenue_metrics.json to metrics/\<app_id\>.json would require such a mapping or a shared identifier.

---

## Quick Reference: End-to-End Data Flow

```
ideas/ideas.json (manual/external)
       ↓
trend_analyst → ideas/approved_trend_ideas.json
       ↓
full_product_pipeline
  → workers (product_architect → capability_filter → ai_code_engine/template)
  → apps/<id> + deploy/<id>
  → QA (quality_inspector, test_runner, quality_tester, tester_agent) [1 rebuild on fail]
  → buildDeployIndex(passedIds) → deploy/index.html
  → revenue_tracker → data/revenue_metrics.json
  → marketing/pricing/growth (stubs)
       ↓
evolution_engine ← portfolio_status (or product_status), metrics/<id>.json, feedback/<id>.json
  → apps/<id>/evolution_plan.json
       ↓
portfolio_brain ← metrics/<id>.json → portfolio/portfolio_status.json
       ↓
strategic_brain → strategy/factory_strategy.json
       ↓
resource_allocator → resources/resource_allocation.json
       ↓
growth_experiment_engine → growth/growth_experiments.json
growth_execution_agent → marketing/<appId>/*.md
       ↓
per app: user_feedback_agent (feedback/<id>.json), distribution_agent (distribution/<id>.md)
```

---

*This document is the single source of truth for AI_FABRIK architecture. When in doubt, follow MASTER_MAP.md.*
