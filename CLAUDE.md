# MakeSalesLegendary — Signal Engine

## What This Is

A signal-based lead generation engine that finds companies with active hiring pain, enriches them with business data, and scores them against a configurable ideal customer profile.

**Core hypothesis:** A company actively hiring for roles that a Freeday digital employee could replace is a warm lead. The harder they struggle to fill the role, the warmer the lead.

**Built for Freeday, designed to be generic.** The system is domain-agnostic — AP/crediteurenadministratie is the first "profile", but the architecture supports any digital employee type (HR, customer service, procurement, etc.) through configurable search profiles.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SIGNAL ENGINE                            │
│                                                                 │
│  ┌────────────────┐                                             │
│  │ Search Profiles │ ← Configurable per digital employee type   │
│  │ (YAML/JSON)     │                                            │
│  └───────┬────────┘                                             │
│          │                                                      │
│  ┌───────▼────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │   Harvester     │─▶│  Enrichment    │─▶│  Scoring &       │   │
│  │  (scheduled,    │  │  (KvK + LLM   │  │  Prioritization  │   │
│  │   per profile)  │  │   extraction)  │  │  (configurable)  │   │
│  └────────────────┘  └───────────────┘  └────────┬─────────┘   │
│                                                   │              │
│                                           ┌───────▼──────────┐  │
│                                           │   Lead Board      │  │
│                                           │   (Dashboard)     │  │
│                                           └───────┬──────────┘  │
│                                                   │              │
│                                  ┌────────────────▼───────────┐ │
│                                  │  Feedback Loop              │ │
│                                  │  (learns from conversions)  │ │
│                                  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Three Layers

1. **Harvesting** — Find job vacancies matching a search profile
2. **Enrichment** — Fetch and structure company data + LLM extraction from vacancy text
3. **Scoring** — Qualify against a configurable ideal customer profile

---

## Tech Stack

- **Language:** Python 3.12+
- **Framework:** FastAPI (API) + Next.js (dashboard)
- **Database:** PostgreSQL with pgvector (for future similarity search on vacancy texts)
- **Task queue:** Celery + Redis (scheduled scraping, enrichment jobs)
- **LLM:** Claude API (vacancy text extraction, scoring refinement)
- **Scraping:** SerpAPI (Google Jobs) as primary, LinkedIn Jobs (via RapidAPI) as secondary, httpx + BeautifulSoup as fallback scrapers
- **External APIs:** KvK Handelsregister, Company.info, Apollo.io (decision maker enrichment), LinkedIn (via Proxycurl when needed)

---

## Key Design Decisions

### 1. Search Profiles Are Config, Not Code

Every digital employee type is a **search profile** stored as config (database or YAML). A profile contains:

```yaml
# Example: profiles/accounts_payable.yaml
profile:
  name: "Accounts Payable"
  slug: "ap"
  description: "Crediteurenadministratie & factuurverwerking"

  # Search terms used by harvesters (Dutch + English)
  search_terms:
    primary:
      - "crediteurenadministratie"
      - "crediteurenadministrateur"
      - "accounts payable"
      - "AP medewerker"
    secondary:
      - "inkoopfacturen"
      - "factuurverwerking"
      - "purchase-to-pay"
      - "P2P medewerker"
      - "financieel administratief medewerker"
    seniority_signals:  # These indicate larger teams = bigger deal
      - "teamleider crediteuren"
      - "manager accounts payable"
      - "hoofd financiële administratie"

  # What the LLM should extract from vacancy texts
  extraction_schema:
    erp_systems: "Which ERP systems are mentioned? (SAP, Oracle, Exact, AFAS, etc.)"
    p2p_tools: "Which P2P/AP automation tools are mentioned? (Basware, Coupa, Tradeshift, etc.)"
    team_size: "Any indication of team size?"
    volume_indicators: "Any mention of invoice volumes, transaction counts?"
    complexity_signals: "International operations, multiple entities, languages?"
    automation_status: "Current level of automation mentioned?"

  # Scoring weights (must sum to 1.0) — ADJUSTABLE BY USERS
  scoring:
    fit_weight: 0.6
    timing_weight: 0.4

    fit_criteria:
      estimated_invoice_volume:
        weight: 0.25
        thresholds: { low: 1000, medium: 5000, high: 20000 }
      entity_count:
        weight: 0.20
        thresholds: { low: 2, medium: 5, high: 20 }
      employee_count:
        weight: 0.15
        thresholds: { low: 50, medium: 200, high: 1000 }
      erp_compatibility:
        weight: 0.15
        scores: { excel: 2, afas: 4, exact: 4, sap: 5, oracle: 5 }
      no_existing_p2p_tool:
        weight: 0.10
        scores: { has_tool: 1, unknown: 3, confirmed_none: 5 }
      sector_fit:
        weight: 0.10
        preferred_sbi_codes: ["4120", "4719", "6201"]  # example
      multi_language:
        weight: 0.05

    timing_signals:
      vacancy_age_over_60_days: 3
      multiple_vacancies_same_role: 4
      repeated_publication: 3
      related_vacancies: 2
      management_vacancy: 2

  # Competitor/negative signals — if found, deprioritize
  negative_signals:
    - "implementatie van Basware"
    - "migratie naar Coupa"
    - "Tradeshift implementatie"
    - "RPA developer"  # they're building their own automation
```

**Adding a new digital employee type = adding a new profile.** No code changes needed.

### 2. Enrichment Is Two-Pass

**Pass 1: LLM Extraction (cheap, fast)**
Mine the vacancy text itself for structured data. This is the richest, most underutilized source. A single vacancy often contains: ERP system, team size, volume hints, complexity, and automation status.

**Pass 2: External API Enrichment (slower, costs money)**
KvK for company basics, Company.info for financials, LinkedIn for decision makers. Only run this for companies that pass a minimum threshold from Pass 1.

### 3. Company-Level Aggregation, Not Vacancy-Level

The same company posts the same job on 5 platforms. We deduplicate on company (KvK number or normalized company name) and aggregate signals:
- Total open vacancies for this profile
- How long the oldest vacancy has been open
- Across how many platforms they're posting (desperation signal)
- What other roles they're hiring for (growth/reorg signal)

### 4. Feedback Loop That Actually Learns

The feedback loop has two mechanisms:

**A. Scoring weight adjustment:**
When sales marks leads as converted/rejected with reasons, we track which scoring criteria predicted success. Over time, surface recommendations like: "Companies with >5 entities convert 3x more — consider increasing entity_count weight."

**B. LLM prompt refinement:**
Store extraction results alongside human corrections. Periodically review mismatches and refine extraction prompts. Example: if the LLM keeps missing "Unit4" as an ERP system, add it to the extraction examples.

**C. Search term expansion:**
Track which search terms yield the highest-converting leads. Surface new terms found in converting companies' vacancies that aren't in the current profile.

---

## Data Model

### Core Tables

```
search_profiles        — Configurable profiles per digital employee type
├── search_terms       — Search terms per profile (with language, priority)
├── scoring_config     — Weights and thresholds (versioned for A/B testing)
└── extraction_prompts — LLM prompts per profile (versioned)

vacancies              — Raw scraped vacancies
├── source             — indeed, google_jobs, company_website, etc.
├── search_profile_id  — Which profile found this
├── raw_text           — Full vacancy text
├── extracted_data     — JSON from LLM extraction
├── first_seen_at      — When we first found it
├── last_seen_at       — Last time it appeared in a scrape
└── status             — active, disappeared, filled

companies              — Deduplicated company records
├── kvk_number
├── name, sbi_codes, employee_range, revenue_range
├── entity_count
├── enrichment_data    — JSON blob from external APIs
└── enriched_at        — When last enriched

leads                  — Scored company × profile combinations
├── company_id
├── search_profile_id
├── fit_score          — 0-100
├── timing_score       — 0-100
├── composite_score    — 0-100
├── scoring_breakdown  — JSON with per-criterion scores
├── status             — hot, warm, monitor, dismissed
├── vacancy_ids[]      — Which vacancies contribute to this lead
└── feedback           — converted, rejected, reason, notes

decision_makers        — People to contact at lead companies
├── company_id
├── name, title, linkedin_url
└── source

feedback_log           — All sales feedback for learning
├── lead_id
├── action             — contacted, meeting, converted, rejected
├── reason             — why rejected/converted
├── notes
└── scoring_snapshot   — What the scores were at time of feedback
```

---

## API Structure

```
POST   /api/profiles                    — Create new search profile
GET    /api/profiles                    — List all profiles
PUT    /api/profiles/:id               — Update profile (terms, scoring, prompts)
GET    /api/profiles/:id/scoring       — Get current scoring config
PUT    /api/profiles/:id/scoring       — Update scoring weights/thresholds

GET    /api/leads?profile=ap&status=hot — List leads with filters
GET    /api/leads/:id                   — Lead detail with full breakdown
PUT    /api/leads/:id/feedback          — Submit feedback on a lead
GET    /api/leads/:id/vacancies         — All vacancies linked to this lead

POST   /api/harvest/trigger             — Manually trigger a harvest run
GET    /api/harvest/runs                — List harvest runs with stats

GET    /api/analytics/conversion        — Conversion funnel per profile
GET    /api/analytics/scoring-accuracy  — How well scoring predicts conversions
GET    /api/analytics/term-performance  — Which search terms yield best leads
```

---

## Dashboard Pages

1. **Lead Board** — Kanban or table view of leads per profile, sorted by composite score. Filters: status, score range, sector, company size, profile.
2. **Lead Detail** — Full company view: enrichment data, all vacancies, timeline, scoring breakdown with explanations, feedback history.
3. **Profile Manager** — CRUD for search profiles. Edit search terms, scoring weights (with sliders), extraction prompts. Preview mode: "run this profile against last week's data."
4. **Scoring Tuner** — Visual tool to adjust weights and see how the lead board re-ranks in real-time. Compare current vs. proposed scoring side by side.
5. **Analytics** — Conversion funnel, scoring accuracy over time, search term performance, feedback summary.
6. **Harvest Monitor** — Status of scraping jobs, error rates, new vacancies found per run.

---

## Implementation Plan

### Phase 1: Harvesting MVP
- [ ] Project setup (Python + FastAPI + Postgres + Celery + Redis)
- [ ] Search profile data model and CRUD API
- [ ] SerpAPI Google Jobs harvester (primary source)
- [ ] Indeed.nl scraper (backup source)
- [ ] Vacancy deduplication engine (company-level)
- [ ] Scheduled harvesting (daily runs per profile)
- [ ] First profile: Accounts Payable (NL + EN terms)

### Phase 2: Enrichment Engine
- [ ] LLM extraction pipeline (Claude API + configurable prompts per profile)
- [ ] KvK API integration (company basics, SBI codes, entity structure)
- [ ] Company.info or Graydon integration (financials, employee count)
- [ ] Two-pass enrichment: LLM first, external APIs for qualifying leads
- [ ] Company record deduplication and merging

### Phase 3: Scoring & Dashboard
- [ ] Configurable scoring engine (reads weights from profile config)
- [ ] Composite score calculation (fit × weight + timing × weight)
- [ ] Next.js dashboard: Lead Board + Lead Detail
- [ ] Profile Manager UI (edit terms, weights, prompts)
- [ ] Scoring Tuner (adjust weights, see re-ranking live)

### Phase 4: Feedback & Learning
- [ ] Feedback API and UI (sales tags leads with outcomes + reasons)
- [ ] Scoring accuracy tracking (predicted score vs. actual outcome)
- [ ] Weight adjustment recommendations based on conversion data
- [ ] Search term performance analysis
- [ ] LLM prompt refinement pipeline (extraction corrections → prompt updates)

### Phase 5: Scale & Polish
- [ ] Additional scraping sources (LinkedIn Jobs via RapidAPI, Nationale Vacaturebank, company career pages)
- [ ] CRM integration (HubSpot/Salesforce webhook push)
- [ ] Decision maker enrichment (Apollo.io for contacts + LinkedIn via Proxycurl for profiles)
- [ ] Second profile: launch another digital employee type
- [ ] Alerting: notify sales instantly when a hot lead appears

---

## Coding Standards

- Python: use `ruff` for linting, type hints everywhere, `pydantic` for all data models
- API: FastAPI with proper OpenAPI docs, versioned endpoints
- Database: Alembic for migrations, never raw SQL in application code (use SQLAlchemy)
- Frontend: Next.js 14+ App Router, TypeScript strict, Tailwind CSS
- LLM calls: always use structured output (tool_use / JSON mode), log all prompts and responses for debugging
- Config: search profiles stored in database, seed defaults from YAML files
- Testing: pytest for backend, meaningful integration tests for scraping and enrichment pipelines
- Environment: all secrets and API keys in `.env`, never committed

## Commands

```bash
# Backend
cd backend && pip install -e ".[dev]"     # Install backend dependencies
cd backend && uvicorn app.main:app --reload  # Run FastAPI dev server
cd backend && celery -A app.worker worker --loglevel=info  # Run Celery worker
cd backend && celery -A app.worker beat --loglevel=info     # Run Celery beat scheduler
cd backend && pytest                       # Run backend tests
cd backend && ruff check .                 # Lint Python
cd backend && ruff format .                # Format Python
cd backend && alembic upgrade head         # Run database migrations

# Frontend
cd frontend && npm install                 # Install frontend dependencies
cd frontend && npm run dev                 # Run Next.js dev server
cd frontend && npm run build               # Build for production
cd frontend && npm run lint                # Lint TypeScript/React

# Infrastructure
docker compose up -d                       # Start Postgres + Redis
docker compose down                        # Stop services
```

## Project Structure

```
MakeSalesLegendary/
├── CLAUDE.md
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── worker.py            # Celery app
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── api/                 # API routes
│   │   │   ├── profiles.py
│   │   │   ├── leads.py
│   │   │   ├── harvest.py
│   │   │   └── analytics.py
│   │   ├── services/            # Business logic
│   │   │   ├── harvester.py     # Scraping orchestration
│   │   │   ├── enrichment.py    # LLM + external API enrichment
│   │   │   ├── scoring.py       # Score calculation engine
│   │   │   └── feedback.py      # Feedback loop & learning
│   │   ├── scrapers/            # Source-specific scrapers
│   │   │   ├── serpapi.py
│   │   │   └── indeed.py
│   │   └── integrations/        # External API clients
│   │       ├── kvk.py
│   │       ├── claude_llm.py
│   │       └── company_info.py
│   ├── migrations/              # Alembic migrations
│   ├── profiles/                # Default YAML search profiles
│   │   └── accounts_payable.yaml
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/app/                 # Next.js App Router
│   │   ├── leads/               # Lead Board + Lead Detail
│   │   ├── profiles/            # Profile Manager + Scoring Tuner
│   │   ├── analytics/           # Analytics dashboard
│   │   └── harvest/             # Harvest Monitor
│   ├── src/components/
│   ├── src/lib/
│   ├── package.json
│   └── tsconfig.json
└── .claude/
    ├── rules/
    ├── skills/
    └── settings.json
```

## Working Agreements

- **Profiles are king.** Every feature must work for any profile, not just AP. If you're hardcoding something AP-specific, make it configurable.
- **Log everything.** Every scrape run, enrichment call, scoring calculation, and feedback event gets logged with timestamps. We need this for the feedback loop.
- **Scores are never magic.** Every score must have a human-readable breakdown showing exactly why this company scored what it did.
- **Fail gracefully.** External APIs go down. Scrapers break. The system must continue working with partial data and flag what's missing.
- **Vacancy text is gold.** The LLM extraction from vacancy text is our competitive advantage. Invest in prompt quality and validation here.

---

## Change Log

### 2026-02-19

- Wired the frontend dashboard and lead board to live API data (leads, stats, funnel, harvest runs, profiles) and added loading/error states for UX validation.
- Integrated lead detail page with API-backed scoring breakdowns, vacancies, and feedback, plus feedback submission and dismiss actions.
- Added a shared frontend API client (`frontend/src/lib/api.ts`) to centralize all backend calls.
- Expanded harvest run API response to include `started_at`/`completed_at` for UI timestamps.
- Confirmed backend routers are mounted for leads, analytics, scoring, and harvest to support integration testing.
- Wired analytics, harvest monitor, profiles, profile detail, and scoring tuner pages to live API data with real loading/error states and derived metrics.
- Added analytics integrations for funnel, term performance, scoring accuracy, and harvest summaries, plus scoring config updates and on-demand scoring runs.
- Ran backend ruff and pytest; fixed Apollo enrichment behavior, default minimum filters, and import ordering to get a clean test run.
- Fixed frontend lint errors (unused imports and explicit any types) and re-ran eslint cleanly.
- Made dashboard and lead board explicitly profile-scoped with selectors and per-profile API queries.
- Added event logging for harvest/enrichment/scoring triggers and lead status/feedback actions.
- Exposed enrichment status and extraction quality in lead list/detail to handle partial data gracefully.
- Added Event Log API and UI page to browse audit events; wired sidebar navigation.
- Added Apollo client range helper wrappers for test compatibility and wrapped long log lines to satisfy ruff.
- Cleaned Claude LLM retry loop (removed unused state, shortened prompt construction) to pass ruff.
- Reordered external enrichment imports and removed an unused scoring page variable to keep lint clean.
- Re-ran backend tests (151 passing), backend ruff, and frontend eslint with no errors.
- Added a global backend exception handler to standardize JSON error responses.
- Added a frontend error mapper so API failures show user-friendly messages across major pages.
- Re-ran backend tests and frontend lint cleanly.
- Health check now includes a database connectivity probe and reports `status: degraded` when DB is unavailable.
- Health check now probes external APIs (KvK, Apollo, SerpAPI) and reports their reachability.
