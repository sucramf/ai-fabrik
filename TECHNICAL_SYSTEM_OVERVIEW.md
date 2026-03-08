# AI_FABRIK – Technical System Overview

This document describes how the AI factory works **based on the actual code** in the repository. It covers architecture, data flow, agent interactions, and pipeline logic.

---

## 1. Real System Architecture

### Entry point and orchestration

- **`superchief_daemon.js`** is the only long-running process. It:
  - Loads `.env` once per cycle.
  - Runs one full cycle immediately, then repeats every **7 minutes** via `setInterval`.
  - Does not spawn subprocesses; all work is in-process via imported functions.

### Main directories (as used in code)

| Directory     | Written by (code) | Read by (code) |
|--------------|-------------------|----------------|
| **ideas/**   | trend_scanner (trend_opportunities.json), daemon (approved_trend_ideas.json) | daemon (ideas.json, approved_trend_ideas.json), full_product_pipeline (approved_trend_ideas.json) |
| **apps/**    | workers (product_architect, capability_filter, ai_code_engine or template) | pipeline QA, evolution_engine, distribution_agent, growth_*, portfolio_brain |
| **deploy/**  | workers (copy of app), buildDeployIndex (index.html) | pipeline QA (app.html), test_runner, quality_tester |
| **metrics/** | *(nothing in codebase writes here)* | portfolio_brain, evolution_engine |
| **data/**    | revenue_tracker (revenue_metrics.json) | revenue_tracker |
| **portfolio/** | portfolio_brain (portfolio_status.json) | strategic_brain, evolution_engine |
| **strategy/**  | strategic_brain (factory_strategy.json) | resource_allocator |
| **resources/** | resource_allocator (resource_allocation.json) | *(documented for “future agents”)* |
| **feedback/**  | user_feedback_agent (per appId .json) | evolution_engine |
| **growth/**    | growth_experiment_engine, growth_execution_agent | growth_execution_agent |
| **marketing/** | full_product_pipeline (per-app channels), growth_execution_agent (per appId) | — |
| **distribution/** | distribution_agent (per appId .md) | — |
| **testers/**  | — | full_product_pipeline (test_runner, quality_tester) |

Important gap: **`metrics/<app_id>.json`** is read by portfolio_brain and evolution_engine but **no agent in the codebase writes it**. Revenue data is stored in **`data/revenue_metrics.json`** keyed by **product_name** (revenue_tracker). So portfolio/evolution currently operate on empty or externally supplied metrics unless another process or integration fills `metrics/`.

---

## 2. How Agents Interact

Agents do **not** call each other directly except along the build path. The daemon calls them in a fixed sequence; data flows via **files**.

### Build path (synchronous chain)

1. **workers.createApps(ideas)**  
   For each idea:
   - **product_architect.createProductSpec(idea)** → spec (product_name, product_type, features, build_complexity, etc.).
   - **capability_filter.evaluateBuildability(spec)** → allowed / rejected + adjusted_scope.
   - If allowed: **ai_code_engine.generate(spec)** (or template in workers) → writes `apps/<id>/` and `deploy/<id>/` (index.html, app.html, app.js, styles.css, logic.js, spec.json, idea.txt, marketing.txt, etc.).

2. **full_product_pipeline** (after workers):
   - **quality_inspector.inspectQuality(html)**
   - **test_runner.runTests(deployPath)**
   - **quality_tester.testQuality(deployPath)**
   - **tester_agent.runAppTests(app_path, spec)**  
   If any fail → capability_filter for adjusted_scope → **workers.createApps([revisedIdea])** once (single rebuild), then QA again.

### Post-build (same cycle, after pipeline)

- **revenue_tracker.recordMetrics(productName, {...})** – initial metrics for each passed app (writes `data/revenue_metrics.json`).
- **marketing_agent.runMarketing**, **pricing_monetization_agent.suggestPricing**, **growth_hacker.runGrowth** – currently **stubs** (no real logic).
- **buildDeployIndex(passedIds)** – updates `deploy/index.html` with links to passed apps.

### Later in cycle (daemon, after pipeline)

- **runEvolutionEngine()** – reads portfolio status (portfolio_status.json or product_status.json), metrics, feedback; writes `apps/<app_id>/evolution_plan.json` (allocation-aware).
- **runPortfolioAnalysis()** – scans apps, reads `metrics/<app_id>.json`, scores products, writes **portfolio/portfolio_status.json** (status: weak | experiment | promising | winner).
- **runStrategicBrain()** – reads portfolio_status.json, maps status → action, writes **strategy/factory_strategy.json** (action: scale | invest | continue_testing | consider_shutdown).
- **runResourceAllocator()** – reads factory_strategy.json, maps action → allocation, writes **resources/resource_allocation.json** (allocation: high | medium | low | minimal).
- **runGrowthExperiments()** – scans apps, appends planned experiments to **growth/growth_experiments.json** (no duplicate appId+type).
- **runGrowthExecution()** – reads growth_experiments.json, for each "planned" writes **marketing/<appId>/<experiment_type>.md**, sets status to "prepared".
- For each app dir in apps: **collectUserFeedback(appId)** (ensures feedback file exists; no entry if none provided), **runDistribution(appId)** (writes **distribution/<appId>.md**).

No agent invokes another agent except the build chain (workers → product_architect → capability_filter → ai_code_engine) and the pipeline calling testers/inspectors. Everything else is daemon → single agent → files.

---

## 3. Data Flow Through the Factory

### Ideas → Build

- **Input:** `ideas/ideas.json` – array of strings (candidate ideas).  
  **Source in code:** only read by daemon; nothing in the repo writes `ideas/ideas.json`. Trend scanner writes **ideas/trend_opportunities.json** (different file); no code merges opportunities into ideas.json.
- Daemon reads ideas → **marketing/trend_analyst.filterByTrends(candidates)** (OpenAI) → each idea gets trend_score, market_saturation, pass, uncertain.  
  Approved list → **ideas/approved_trend_ideas.json** `{ approvedIdeas, uncertainIdeas }`.
- **builders/full_product_pipeline.js** reads **approved_trend_ideas.json** (approvedIdeas or approved) → **agents/workers.createApps(approvedIdeas)**.

### Build pipeline data

- **workers:** idea string → product_architect → spec → capability_filter → if allowed, ai_code_engine (or template) → **apps/<app_id>/** and **deploy/<app_id>/** (HTML, JS, CSS, spec.json, idea.txt, etc.).
- Pipeline also writes per-app **apps/<app_id>/marketing/** and **deploy/<app_id>/marketing/** (channel .txt files), **apps/<app_id>/payment_config.json** and PAYMENT_README.txt.
- **revenue_tracker.recordMetrics(productName, {...})** writes/updates **data/revenue_metrics.json** (product_name, deploy_date, visitors, signups, revenue, conversion_rate). No code writes **metrics/<app_id>.json**.

### Portfolio → Strategy → Resources

- **portfolio_brain:** apps/ + **metrics/<app_id>.json** (users, session_time, bounce_rate) → score → status (weak | experiment | promising | winner) → **portfolio/portfolio_status.json**.
- **strategic_brain:** **portfolio/portfolio_status.json** → status → action (winner→scale, promising→invest, experiment→continue_testing, weak→consider_shutdown) → **strategy/factory_strategy.json**.
- **resource_allocator:** **strategy/factory_strategy.json** → action → allocation (scale→high, invest→medium, continue_testing→low, consider_shutdown→minimal) → **resources/resource_allocation.json**.

### Evolution

- **evolution_engine:** For each app in apps/:
  - Reads **portfolio/product_status.json** (if present) or **portfolio/portfolio_status.json** (maps winner→grow, promising→maintain, experiment→experiment, weak→pause).
  - Reads **metrics/<app_id>.json**, **feedback/<app_id>.json**.
  - Generates allocation-aware plan (grow: aggressive; maintain: conservative; experiment: bold; pause: no evolution) and writes **apps/<app_id>/evolution_plan.json** (suggestions + reasoning; never modifies code).

### Growth and distribution

- **growth_experiment_engine:** Scans apps/, adds rows to **growth/growth_experiments.json** (appId, experiment_type, description, status: "planned") from fixed templates (SEO, Reddit, Product Hunt, blog, short-form video, directory).
- **growth_execution_agent:** Reads growth_experiments.json, for status "planned" generates markdown and writes **marketing/<appId>/<experiment_type>.md**, sets status to "prepared".
- **distribution_agent:** For one appId, loads **apps/<appId>/spec.json** and idea.txt, builds markdown, writes **distribution/<appId>.md**.

### Feedback

- **user_feedback_agent.collectUserFeedback(appId, entry?)** ensures **feedback/<appId>.json** exists (array of { timestamp, type: usage|bug|feature_request, message }). If entry provided, appends it. Daemon calls it per app without an entry (just ensure file exists).

---

## 4. How the Daemon Orchestrates the System

**File:** `superchief_daemon.js`

**Cycle order:**

1. **loadEnv()** – load .env into process.env.
2. **runTrendScanner()** – append to ideas/trend_opportunities.json (simulated opportunities); does not populate ideas/ideas.json.
3. **readCandidates()** – read ideas/ideas.json (array of strings). If empty → log "No ideas" and **return** (rest of cycle skipped, including pipeline).
4. **filterByTrends(candidates)** – trend_analyst (OpenAI); write ideas/approved_trend_ideas.json.
5. **runFullProductPipeline()** – build, QA, deploy index, marketing/pricing/growth stubs, revenue_tracker initial metrics.
6. **runEvolutionEngine()** – allocation-aware evolution plans to apps/<id>/evolution_plan.json.
7. **runPortfolioAnalysis()** – portfolio/portfolio_status.json.
8. **runStrategicBrain()** – strategy/factory_strategy.json.
9. **runResourceAllocator()** – resources/resource_allocation.json.
10. **runGrowthExperiments()** – growth/growth_experiments.json.
11. **runGrowthExecution()** – marketing/<appId>/*.md from "planned" experiments.
12. For each app_* in apps: **collectUserFeedback(appId)**, **runDistribution(appId)**.

Errors in steps 2 and 7–11 are caught and logged (e.g. portfolio/growth return safe defaults); pipeline (5) is not wrapped in try/catch, so pipeline failures can throw. Interval is 7 minutes; first cycle runs immediately on start.

---

## 5. Build Pipeline Logic

**File:** `builders/full_product_pipeline.js`

- **Input:** ideas/approved_trend_ideas.json (approvedIdeas or approved array).
- **Build:** `createApps(approvedIdeas)` (workers) → for each idea: product_architect → capability_filter; if allowed, ai_code_engine (or template) → apps/<id> + deploy/<id>. BUILD_MODE env: "ai_generated" (default) or "template".
- **Per created app:** write marketing channel .txt files and payment_config.json + PAYMENT_README in apps and deploy.
- **QA (per app):**  
  - quality_inspector on deploy HTML  
  - test_runner (DOCTYPE, body, content length, no critical script error)  
  - quality_tester (structure, viewport, CTA)  
  - tester_agent (HTML/JS structure, output element, UI for product_type, no placeholders)  
  If fail → **evaluateBuildability(spec)** for adjusted_scope → **createApps([revisedIdea])** once → re-run QA for the new app; if still fail, record in failedReports and do not add to passedIds.
- **Deploy:** buildDeployIndex(passedIds) → deploy/index.html lists only passed apps.
- **Post-deploy for passed only:** runMarketing, suggestPricing, runGrowth (stubs), recordMetrics(productName, initial metrics) into data/revenue_metrics.json.
- **Output:** createdIds, passedIds, failedReports, filesCreated, allFilePaths; and report to superchief_report.log.

---

## 6. Evolution System Logic

**File:** `agents/evolution_engine/product_evolution_engine.js`

- **Inputs:** metrics/<app_id>.json, portfolio/product_status.json (optional) or portfolio/portfolio_status.json, feedback/<app_id>.json. Missing files are not fatal.
- **Allocation:** Prefer product_status.json (grow|maintain|experiment|pause). If absent, use portfolio_status.json with mapping: winner→grow, promising→maintain, experiment→experiment, weak→pause. Default for unknown app: maintain.
- **Plan by status:**  
  - **grow:** metrics + feedback + major features, UX, performance, monetization.  
  - **maintain:** feedback + bug fixes, small UX, stability.  
  - **experiment:** metrics + feedback + bold experiments, alternative directions.  
  - **pause:** minimal plan (no actionable suggestions).
- **Output:** apps/<app_id>/evolution_plan.json (appId, allocation_status, reasoning, suggestions, generated_at, metrics_used, feedback_used, note that plans never auto-modify code).
- **Rule:** Evolution plans are proposals only; they never modify application code automatically.

---

## 7. Portfolio / Strategy / Resource Systems

- **portfolio_brain:** Scans apps/ (app_* dirs), reads metrics/<app_id>.json (users, session_time, bounce_rate). Scores by thresholds (e.g. users >1000, session_time >60, bounce_rate <0.5) → status weak|experiment|promising|winner. Writes **portfolio/portfolio_status.json** (products array with appId, metrics, score, status, evaluated_at).
- **strategic_brain:** Reads portfolio_status.json; maps status → action (winner→scale, promising→invest, experiment→continue_testing, weak→consider_shutdown). Writes **strategy/factory_strategy.json** (products with appId, status, action, evaluated_at). Safe if file missing (returns ok, products: 0).
- **resource_allocator:** Reads factory_strategy.json; maps action → allocation (scale→high, invest→medium, continue_testing→low, consider_shutdown→minimal). Writes **resources/resource_allocation.json** (products with appId, allocation, decided_at). Safe if strategy file missing.

Evolution engine uses portfolio status (or product_status) to choose plan type; resource_allocation.json is documented for “future agents” (e.g. prioritization) but no current code reads it.

---

## 8. Growth and Distribution Logic

**Trend scanner (**`agents/trend_scanner.js`**):** Adds simulated digital opportunities to **ideas/trend_opportunities.json** (title, description, source, potential). Does not write ideas/ideas.json or approved_trend_ideas.json.

**Growth experiment engine (**`agents/growth_experiment_engine.js`**):** Scans apps/, for each app and each template (SEO landing, Reddit, Product Hunt, blog, short-form video, directory) appends an experiment to **growth/growth_experiments.json** if not already present (key: appId + experiment_type). Status "planned".

**Growth execution agent (**`agents/growth_execution_agent.js`**):** Reads growth_experiments.json; for each "planned" experiment generates markdown by type (templates for SEO, Reddit, Product Hunt, blog, video, directory), writes **marketing/<appId>/<slug(experiment_type)>.md**, sets experiment status to "prepared", saves file.

**Distribution agent (**`agents/distribution_agent.js`**):** For one appId, loads apps/<appId>/spec.json and idea.txt, builds a single markdown (product name, description, value prop, features, target user, “Try it”) and writes **distribution/<appId>.md**. Invoked by daemon once per app per cycle.

**Marketing / pricing / growth in pipeline:** marketing_agent.runMarketing, pricing_monetization_agent.suggestPricing, growth_hacker.runGrowth are stubs; they return ok/reason but do not implement logic. Pipeline also writes its own marketing channel .txt files (google_ads, tiktok, youtube, linkedin, pinterest, product_hunt) under apps/<id>/marketing and deploy/<id>/marketing.

---

## Summary Diagram (Data Flow)

```
ideas/ideas.json (manual or external)
       ↓
trend_analyst.filterByTrends → ideas/approved_trend_ideas.json
       ↓
full_product_pipeline
  → workers (product_architect → capability_filter → ai_code_engine/template)
  → apps/<id> + deploy/<id>
  → QA (quality_inspector, test_runner, quality_tester, tester_agent) [1 rebuild on fail]
  → buildDeployIndex(passedIds)
  → revenue_tracker → data/revenue_metrics.json
  → marketing/pricing/growth (stubs)
       ↓
evolution_engine ← portfolio_status.json (or product_status), metrics/<id>.json, feedback/<id>.json
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

**Not connected in code:** ideas/trend_opportunities.json is never read by the daemon; ideas/ideas.json is never written by the repo. metrics/<app_id>.json is read but not written by any current agent (revenue is in data/revenue_metrics.json by product_name).
