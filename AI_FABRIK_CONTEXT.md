AI_FABRIK_CONTEXT.md
PROJECT: AI_FABRIK

AI_FABRIK is an autonomous AI startup studio designed to build, improve, and operate digital products with minimal human intervention.

The goal is not to produce spam tools.

The goal is to build an ultra-efficient AI product factory capable of producing high-quality niche products comparable in category to:

Duolingo

The Secret of Monkey Island

Hemnet

These are quality benchmarks, not scale targets.

AI_FABRIK should build smaller but excellent digital products that can become popular and profitable.

The factory must continuously:

discover opportunities

build products

improve them

distribute them

learn from users

grow a portfolio of successful products

CORE MISSION

AI_FABRIK exists to build a self-improving AI product factory capable of creating and operating profitable digital products.

Primary mission goals:

Build an ultra-efficient AI-driven product factory.

Produce real high-quality digital products, not spam tools.

Operate as an AI startup studio discovering opportunities and launching products.

Automate nearly all work (development, marketing, analysis).

Create a portfolio of profitable products.

Continuously improve products using data and feedback.

CORE PHILOSOPHY

AI_FABRIK follows:

Strategy C — AI Quality Studio

NOT:

A) Spam factory generating thousands of trivial tools.

NOT:

B) Attempting massive projects beyond solo capability.

INSTEAD:

AI_FABRIK identifies market opportunities, builds focused niche products, improves them continuously, and captures valuable market niches.

PRODUCT TARGET CATEGORY

Products can include:

Web applications

Micro-SaaS products

Interactive tools

Browser games

Educational apps

Data services

Niche platforms

Target complexity range:

Comparable to products such as:

Duolingo

The Secret of Monkey Island

Hemnet

NOT extremely large infrastructure systems like:

Amazon

Microsoft Windows

SYSTEM OVERVIEW

AI_FABRIK is structured as a continuous autonomous factory loop.

Core cycle:

ideas
→ trend analysis
→ product specification
→ capability filtering
→ AI product generation
→ QA testing
→ deployment
→ marketing & distribution
→ metrics & revenue tracking
→ product evolution
→ portfolio analysis
→ strategic resource allocation
→ growth experimentation
→ feedback learning
→ repeat

The factory runs continuously using an orchestration daemon.

MAIN ARCHITECTURE

Primary workflow:

ideas/ideas.json
↓
trend_analyst
↓
ideas/approved_trend_ideas.json
↓
product_architect
↓
capability_filter
↓
workers
↓
ai_code_engine
↓
apps/<app_id>
↓
tester_agent (QA)
↓
deploy/<app_id>
↓
marketing / pricing / growth
↓
revenue_tracker
↓
metrics/<app_id>.json
↓
evolution_engine
↓
portfolio_brain
↓
strategic_brain
↓
resource_allocator

Execution loop:

superchief_daemon.js

Runs every 7 minutes and orchestrates the entire factory.

MAIN FOLDERS

The factory is organized using modular directories.

agents/

Core AI agents.

Examples:

workers
product_architect
capability_filter
ai_code_engine
tester_agent
revenue_tracker
trend_scanner
idea_explosion_engine
distribution_agent
user_feedback_agent
evolution_engine
portfolio_brain
strategic_brain
resource_allocator
growth_experiment_engine
growth_execution_agent
inspectors
boss
superchief

builders/

Responsible for building applications from product specs.

ideas/

Idea storage and trend-filtered ideas.

ideas.json
approved_trend_ideas.json
apps/

Generated applications.

apps/<app_id>

Contains:

source code
product specs
evolution plans

deploy/

Deployment outputs.

deploy/<app_id>
testers/

QA and testing agents.

metrics/

Application metrics.

metrics/<app_id>.json

Tracks:

usage
performance
revenue signals

data/

Global data storage.

Example:

data/revenue_metrics.json
feedback/

User feedback collection.

feedback/<app_id>.json

Includes:

bug reports
feature requests
user sentiment

portfolio/

Portfolio management data.

Tracks:

product status
performance ranking
portfolio allocation

strategy/

Strategic decision outputs.

resources/

Resource allocation planning.

growth/

Growth experimentation system.

marketing/

Generated marketing content.

Examples:

landing pages
copy
campaign drafts

distribution/

Distribution actions.

Examples:

SEO content
directory submissions
community posts

PRODUCT GENERATION PIPELINE

Product creation process:

Approved ideas selected

product_architect creates product spec

capability_filter verifies feasibility

Workers prepare build tasks

ai_code_engine generates application

QA agents test application

If QA fails → rebuild once

Application deployed

Marketing and pricing generated

Metrics tracking begins

PRODUCT EVOLUTION LOOP

High-quality products emerge through continuous improvement.

Loop:

build
→ collect metrics
→ analyze performance
→ generate improvement plan
→ redeploy improved version

Evolution system:

evolution_engine

Reads:

metrics/<app_id>.json

Writes:

apps/<app_id>/evolution_plan.json

The plan contains suggested improvements.

USER FEEDBACK SYSTEM

User feedback improves product evolution.

The system collects:

bug reports

feature requests

user behavior signals

Stored in:

feedback/<app_id>.json

Used by:

evolution engine

strategy system

GROWTH SYSTEM

Growth consists of three subsystems.

Trend Scanner

Detects new opportunities.

Output:

trend_opportunities.json
Growth Experiment Engine

Generates marketing experiments.

Output:

growth_experiments.json
Growth Execution Agent

Produces:

marketing assets

landing pages

campaigns

DISTRIBUTION SYSTEM

Products must be actively distributed.

Distribution channels include:

SEO pages

product directories

online communities

content marketing

launch platforms

Output examples:

distribution/*.md

Without distribution, products remain invisible.

PORTFOLIO MANAGEMENT

AI_FABRIK manages a portfolio of products.

Portfolio system evaluates:

product performance

growth potential

revenue signals

Key agents:

portfolio_brain
strategic_brain
resource_allocator

These decide:

which products grow

which products receive resources

which products are paused

AUTOMATION RULES

Factory behavior rules:

The daemon controls execution order.

Missing files must not crash the system.

If no ideas exist → skip build cycle.

QA failures trigger one rebuild attempt.

Evolution plans never overwrite code automatically.

HUMAN WORK MODEL

The human operator interacts 1-5 times per week.

AI performs most work:

product development

improvements

marketing drafts

analysis

support reply drafts

Human tasks:

approve important decisions

approve communication

occasionally publish content

CURRENT TECH LIMITATION

Current AI code engine:

model: gpt-4o-mini

This limits complexity.

Recommended upgrade:

gpt-4.1
or
gpt-4o

This significantly improves generated applications.

DESIGN PRINCIPLE

The factory must never reject a strong idea due to technical limitations.

Instead:

If complexity increases
→ the factory architecture must evolve.

AI_FABRIK must always remain capable of building the best products possible within its scale.

CURRENT PRIORITY

Upgrade AI_FABRIK into an:

Ultra-Efficient Superfactory

Key improvements:

stronger product evolution

better distribution

improved AI code generation

user feedback learning

portfolio-driven growth

LONG TERM VISION

AI_FABRIK evolves into a fully autonomous AI startup studio.

Capabilities:

continuous idea discovery
market gap detection
product creation
product iteration
growth experimentation
portfolio management

Final goal:

A portfolio of high-quality profitable digital products created and improved by AI.

Om du vill kan jag också visa en liten men väldigt viktig uppgradering av denna fil (ca 15 rader extra) som gör att nya AI-agenter förstår fabriken mycket bättre och gör färre misstag.

du måste göra om allt då och allt du kommer på måste vara i den version du skickar nu, du kan inte fråga mig om uppdateringar, hur ska det gå. jag ska bara klistra in en sak ju

Här är en komplett ersättningsfil.
Den är skriven så att en ny AI-agent direkt kan förstå och fortsätta utveckla fabriken utan historik.
Allt viktigt är inkluderat: mål, arkitektur, agenter, loopar, regler, prioriteringar.

Du kan ersätta hela gamla filen med denna.

AI_FABRIK_CONTEXT.md
AI_FABRIK — Autonomous AI Startup Studio

AI_FABRIK is an autonomous AI product factory designed to discover opportunities, build digital products, improve them continuously, and manage a portfolio of successful applications with minimal human involvement.

The system acts as an AI-driven startup studio capable of launching and operating real products.

The objective is not mass production of trivial tools, but the creation of high-quality niche products that can become widely used and profitable.

Quality benchmarks include products comparable in category to:

Duolingo

The Secret of Monkey Island

Hemnet

These represent the quality tier and product depth, not scale targets.

AI_FABRIK should produce focused, well-designed, high-quality digital products.

CORE MISSION

AI_FABRIK exists to create a self-improving digital product factory capable of:

discovering market opportunities

building digital products automatically

deploying and distributing them

learning from usage and feedback

improving products continuously

building a portfolio of profitable applications

The system should eventually operate as a fully autonomous AI startup studio.

CORE PHILOSOPHY

AI_FABRIK follows:

Strategy C — AI Quality Studio

This means:

NOT a spam factory producing thousands of trivial tools.

NOT an attempt to build massive global infrastructure platforms.

Instead the system focuses on:

• identifying real opportunities
• building focused niche products
• improving them continuously
• capturing valuable market niches

The system is designed to produce a small number of high-quality successful products, not large numbers of low-quality ones.

PRODUCT CATEGORY TARGET

Products produced by AI_FABRIK may include:

Web applications
Micro-SaaS products
Interactive tools
Browser games
Educational software
Data services
Niche platforms

Target complexity:

Comparable to products such as:

Duolingo

The Secret of Monkey Island

Hemnet

NOT massive platforms such as:

Amazon

Microsoft Windows

The system aims for excellent niche products.

FACTORY OVERVIEW

AI_FABRIK operates as a continuous autonomous production loop.

High-level pipeline:

ideas
→ trend analysis
→ opportunity filtering
→ product specification
→ capability validation
→ AI product generation
→ QA testing
→ deployment
→ marketing generation
→ distribution
→ metrics collection
→ product evolution
→ portfolio analysis
→ strategic planning
→ resource allocation
→ growth experiments
→ feedback analysis
→ repeat

This loop is orchestrated by a central daemon.

CORE EXECUTION ENGINE

Main orchestrator:

superchief_daemon.js

Execution frequency:

Every ~7 minutes

Responsibilities:

• trigger idea processing
• coordinate product creation
• run QA agents
• deploy applications
• update metrics
• trigger product evolution
• run strategy modules
• execute growth systems

The daemon is the central brain of the factory.

PRODUCT CREATION PIPELINE

The factory builds products using a structured pipeline.

Pipeline:

ideas/ideas.json
↓
trend_analyst
↓
ideas/approved_trend_ideas.json
↓
product_architect
↓
capability_filter
↓
workers
↓
ai_code_engine
↓
apps/<app_id>
↓
tester_agent (QA)
↓
deploy/<app_id>
↓
marketing / pricing / growth
↓
revenue_tracker
↓
metrics/<app_id>.json

Steps explained:

Idea generation → ideas.json
Trend filtering → approved_trend_ideas.json
Product specification → product_architect
Feasibility check → capability_filter
Task preparation → workers
Code generation → ai_code_engine
Application build → apps/<id>
Testing → QA agents
Deployment → deploy/<id>
Marketing creation → marketing/growth
Revenue & usage metrics → metrics system

If QA fails, one rebuild attempt is allowed.

PRODUCT EVOLUTION SYSTEM

AI_FABRIK improves products through continuous iteration.

Evolution loop:

build
→ collect metrics
→ analyze performance
→ generate improvements
→ redeploy improved version

Evolution engine:

evolution_engine

Reads:

metrics/<app_id>.json

Writes:

apps/<app_id>/evolution_plan.json

Important rule:

Evolution plans do not directly modify code automatically.
They generate improvement proposals that guide future builds.

USER FEEDBACK SYSTEM

User feedback is collected and analyzed.

Data stored in:

feedback/<app_id>.json

Possible inputs:

• bug reports
• feature requests
• usage behavior signals
• user sentiment

Feedback influences:

• product evolution
• portfolio decisions
• strategic planning

GROWTH SYSTEM

AI_FABRIK contains a growth experimentation system.

Main components:

Trend Scanner
Growth Experiment Engine
Growth Execution Agent

Trend Scanner

Detects new opportunities and emerging trends.

Output:

trend_opportunities.json
Growth Experiment Engine

Designs experiments to increase product traction.

Output:

growth_experiments.json
Growth Execution Agent

Creates:

• landing pages
• marketing copy
• campaign ideas
• launch materials

DISTRIBUTION SYSTEM

Distribution ensures products reach users.

Distribution agent generates:

• SEO content
• product directory submissions
• community posts
• launch platform submissions
• content marketing ideas

Outputs stored in:

distribution/

Without distribution, products will not gain users.

PORTFOLIO MANAGEMENT

AI_FABRIK manages a portfolio of products.

Three strategic agents control this system:

portfolio_brain
strategic_brain
resource_allocator

Responsibilities:

Portfolio Brain
→ evaluates product performance

Strategic Brain
→ decides strategic actions

Resource Allocator
→ distributes development focus

Portfolio evaluation uses:

• metrics
• growth signals
• revenue indicators
• engagement data

Products can receive statuses such as:

grow
maintain
experiment
pause

MAIN SYSTEM FOLDERS

The factory is organized into modular directories.

agents/

Core AI agents controlling the system.

Examples include:

workers
product_architect
capability_filter
ai_code_engine
tester_agent
revenue_tracker
trend_scanner
idea_explosion_engine
distribution_agent
user_feedback_agent
evolution_engine
portfolio_brain
strategic_brain
resource_allocator
growth_experiment_engine
growth_execution_agent
inspectors
boss
superchief

builders/

Scripts responsible for assembling generated applications.

ideas/

Idea storage and filtering.

ideas.json
approved_trend_ideas.json
apps/

Generated applications.

apps/<app_id>

Contains:

source code
product specification
evolution plan

deploy/

Deployment outputs.

deploy/<app_id>
testers/

Quality assurance agents.

metrics/

Product performance metrics.

metrics/<app_id>.json

Metrics may include:

usage
engagement
revenue signals
performance indicators

data/

Global system data.

Example:

data/revenue_metrics.json
feedback/

User feedback storage.

feedback/<app_id>.json
portfolio/

Portfolio tracking and product ranking.

strategy/

Strategic planning outputs.

resources/

Resource allocation planning.

growth/

Growth experiments and marketing strategies.

marketing/

Generated marketing assets.

distribution/

Distribution tasks and publication plans.

AUTOMATION RULES

To ensure stability the factory follows strict rules:

The daemon controls execution order.

Missing files must never crash the system.

If no new ideas exist the build stage is skipped.

QA failure allows one rebuild attempt only.

Evolution plans must never overwrite application code automatically.

Agents must fail safely if data is missing.

HUMAN OPERATOR MODEL

The system is designed for minimal human involvement.

The operator interacts only 1-5 times per week.

AI handles:

• product development
• improvements
• marketing creation
• analytics
• support reply drafts
• roadmap suggestions

Human responsibilities:

• approve messages
• approve strategy changes
• occasionally publish content

CURRENT TECH LIMITATION

Current AI code generation model:

gpt-4o-mini

This limits:

• code quality
• architecture depth
• product complexity

Recommended upgrade:

gpt-4.1
or
gpt-4o

Higher capability models significantly improve generated products.

DESIGN PRINCIPLE

AI_FABRIK must never reject strong product ideas due to technical limitations.

If idea complexity increases:

→ the factory architecture must evolve

The system should continuously improve its own capabilities.

CURRENT PRIORITY

Transform AI_FABRIK into an:

Ultra-Efficient AI Superfactory

Immediate priorities:

stronger product evolution loops

improved distribution system

higher-quality AI code generation

deeper user feedback analysis

portfolio-driven growth decisions

LONG-TERM VISION

AI_FABRIK becomes a fully autonomous AI startup studio capable of:

continuous idea discovery
market gap detection
product creation
product iteration
growth experimentation
portfolio management

The final outcome is a portfolio of high-quality profitable digital products created and improved by AI.