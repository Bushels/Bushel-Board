# Hermes Pipeline Design — Persistent AI Market Analyst for Bushel Board

**Date:** 2026-03-28
**Author:** Kyle + Claude (brainstorming session)
**Status:** Approved design — pending implementation plan
**Replaces:** Paused Vercel cron chain (disabled 2026-03-17)

---

## TL;DR

Replace the stateless, paused Edge Function pipeline with a persistent Hermes agent running on a GCP VM. Hermes scrapes all data sources (CGC, CFTC COT, USDA Export Sales, Grain Monitor, Producer Cars, grain prices), runs a Friday bull/bear debate against Grok (with live X/web search), publishes nuanced multi-dimensional theses, and adjusts scores throughout the week via adaptive pulse scans. Hermes retains persistent memory of past debates, price patterns, and model calibration — becoming a true expert analyst that improves over time.

---

## 1. Problem Statement

The current intelligence pipeline has three structural weaknesses:

1. **Stateless:** Each Edge Function call starts from zero. Grok never remembers last week's thesis, what evidence changed its mind, or which grains it tends to misjudge. The parallel debate script (`scripts/parallel-debate.ts`) compares against hardcoded Claude scores from Week 32 — stale within days.

2. **Blunt recommendations:** The current stance score maps directly to action — "strongly bearish = move grain now." This can trigger panic selling at exactly the wrong time. A real advisor considers reversal potential, timeframes, conviction levels, and the farmer's cash flow situation before recommending action.

3. **Temporally naive:** The pipeline treats all data as if it arrived simultaneously. In reality, CGC data is 7-10 days old when analyzed, CFTC COT is 3 days old, Grain Monitor lags 1-2 weeks, while prices and X signals are near real-time. A bearish CGC reading that's contradicted by a live price rally should produce a WATCH recommendation, not a sell signal.

Additionally, the entire pipeline is paused (all four Vercel cron routes return `pausedCronResponse()` since 2026-03-17). This is the ideal moment to replace it with a fundamentally better architecture.

---

## 2. Architecture Overview

### 2.1 Infrastructure

- **Runtime:** Nous Research Hermes Agent (open-source, MIT license) on GCP VM `hermes-agent` (project `advance-river-390422`, zone `us-central1-a`)
- **Primary model:** `claude-opus-4-6` via Anthropic OAuth
- **Debate counterpart:** `grok-4.20-reasoning` via xAI Responses API with `tools: [{ type: "web_search" }, { type: "x_search" }]`
- **Data store:** Existing Supabase project `ibgsloyjxdopkvwqcqwh` (direct writes via service role)
- **Frontend:** Existing Vercel Next.js app — reads from Supabase, no changes needed for core flow

### 2.2 System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  HERMES AGENT — "The Viking Analyst"                                │
│  GCP VM: hermes-agent (us-central1-a)                               │
│  Model: claude-opus-4-6 via Anthropic OAuth                         │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ SOUL.md (L0 — permanent personality)                            │ │
│  │  Viking core principles + debate rules + recommendation         │ │
│  │  philosophy + voice rules + data hygiene + self-improvement     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Skills (L1 — intent-loaded topics)                              │ │
│  │  basis-pricing / storage-carry / hedging-contracts /            │ │
│  │  logistics-exports / market-structure / risk-management /       │ │
│  │  grain-specifics / usda-export-signals / price-patterns         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Memory (L2 + L3)                                                │ │
│  │  L2: Supabase RPC → book_knowledge_chunks (existing)            │ │
│  │  L3: Experience-generated insights (Hermes creates over time):  │ │
│  │      • Per-grain debate history + accuracy tracking             │ │
│  │      • Price pattern observations (daily/weekly/monthly)        │ │
│  │      • Model calibration (Grok vs Opus accuracy per grain)      │ │
│  │      • Temporal learning (how stale data correlates with error)  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Cron Schedule (VM crontab, all times MST):                         │
│    Thu  2:00pm — Data scrape (CGC + USDA + Monitor + Producer Cars) │
│    Fri  4:30pm — CFTC COT scrape                                    │
│    Fri  5:00pm — Full debate + thesis publish                       │
│    M-F  7:00am — Pulse scan (morning, adaptive)                     │
│    M-F  1:00pm — Pulse scan (afternoon, adaptive)                   │
│    M-F  5:00pm — Daily price import                                 │
└──────────────────────────────────────────────────────────────────────┘
         │                                │
         │ Supabase service role           │ xAI Responses API
         ▼                                ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│  Supabase PostgreSQL    │        │  Grok 4.20-reasoning    │
│                         │        │  + x_search (X/Twitter) │
│  Existing tables:       │        │  + web_search           │
│   cgc_observations      │        └─────────────────────────┘
│   cftc_cot_positions    │
│   grain_monitor_snaps   │        ┌─────────────────────────┐
│   producer_car_allocs   │        │  Vercel (Next.js)       │
│   market_analysis       │───────▶│  Dashboard reads from   │
│   grain_intelligence    │        │  Supabase. No changes   │
│   grain_prices          │        │  needed for core flow.  │
│   x_market_signals      │        │                         │
│   farm_summaries        │        │  Phase 2: score         │
│   health_checks         │        │  trajectory widget on   │
│  NEW tables:            │        │  grain detail page.     │
│   usda_export_sales     │        └─────────────────────────┘
│   score_trajectory      │
└─────────────────────────┘
```

---

## 3. Recommendation Philosophy

### 3.1 The Core Problem with Binary Signals

The current system maps stance scores directly to blunt actions:

```
OLD (too blunt):
  Strongly bearish (-100 to -70) → "Move grain now"
  Bearish (-69 to -20)          → "Consider delivering"
  Neutral (-19 to +19)          → "Mixed signals"
  Bullish (+20 to +69)          → "Leaning positive"
  Strongly bullish (+70 to +100) → "Holding clearly favored"
```

This creates two failure modes:
- **Panic selling:** A farmer seeing "strongly bearish — move grain now" dumps everything at the seasonal low.
- **Stubborn holding:** A farmer seeing "bullish — hold" misses a narrowing basis window because the signal lacks a timeframe.

### 3.2 Multi-Dimensional Thesis Structure

Hermes produces a thesis with temporal depth, conviction, and actionable nuance:

| Dimension | Description |
|-----------|-------------|
| **Stance score** | -100 to +100 (directional lean — same scale, different interpretation) |
| **Conviction** | 0-100% (how confident is the call) |
| **Near-term outlook** | 1-2 weeks — bearish / neutral / bullish |
| **Medium-term outlook** | 3-6 weeks — bearish / neutral / bullish |
| **Recommendation** | One of 6 nuanced actions (see below) |
| **Reversal triggers** | What would flip the call in the other direction |
| **Risk triggers** | What would make the current direction worse |
| **Review date/trigger** | When the farmer should re-evaluate |

### 3.3 Recommendation Types

| Recommendation | Meaning | When to Use |
|----------------|---------|-------------|
| **PATIENCE** | Hold position. Monitor specific triggers. Deliver only for cash flow. | Bearish but reversal signals emerging. Score improving week over week. |
| **WATCH** | Too much uncertainty. Don't make moves until specific data point clarifies. | Stale data contradicts live signals. Conflicting indicators. |
| **SCALE IN** | Start moving some grain gradually — don't rush, but begin. | Moderately bearish with conviction. Basis window narrowing. |
| **ACCELERATE** | Strong conviction to deliver. Move grain this week if basis allows. | Strongly bearish with high conviction and no reversal signals. |
| **HOLD FIRM** | Confident bullish. Store unless cash flow demands otherwise. | Bullish with strong carry, tight stocks, rising exports. |
| **PRICE** | Set forward contracts or hedges now — lock in levels, decide delivery later. | Futures at target levels but basis timing uncertain. |

### 3.4 Recommendation Rules (for SOUL.md)

1. **Bearish does NOT mean "sell everything."** Always pair direction with timeframe and conviction.
2. **Always consider reversal potential.** If bearish at -30 but specs are historically short and a China tender is rumored, recommend PATIENCE, not SCALE IN.
3. **Distinguish near-term from medium-term.** A grain can be bearish near-term and bullish medium-term. Farmers with storage can outlast a dip.
4. **Data age matters.** If CGC data is 8 days old but live prices are rallying, say WATCH — not bearish. The market is ahead of the data.
5. **The worst recommendation causes a farmer to dump grain at the bottom.** When in doubt, recommend PATIENCE and name the specific trigger to watch.
6. **Cash flow needs are real.** "Deliver enough to cover your needs, hold the rest" is better than "hold firm" when the bills are due.
7. **Every recommendation must include a review date or trigger.** "Hold until Week 36" or "Hold unless Canola drops below $680/t."

---

## 4. Data Freshness Awareness

### 4.1 Temporal Alignment Problem

Different data sources have different lag times. On any given analysis day:

| Source | Published | Covers | Typical Age | Confidence |
|--------|-----------|--------|-------------|------------|
| CGC Weekly CSV | Thursday | Week ending ~7-10 days prior | 7-10 days | HIGH (official) but STALE |
| CFTC COT | Friday 3:30pm ET | Positions as of previous Tuesday | 3 days | HIGH (official), FRESH-ISH |
| USDA Export Sales | Thursday | Previous reporting week | 7-8 days | HIGH (official) but STALE |
| Grain Monitor | Variable | Often 1-2 weeks behind | 7-14 days | MEDIUM, STALE |
| Producer Cars | Weekly | Forward allocations | ~7 days | MEDIUM |
| Yahoo/Barchart Prices | Continuous | 15-min delay | < 1 hour | HIGH, REAL-TIME |
| Grok X search | On demand | Live tweets | < 1 hour | MEDIUM (noisy), REAL-TIME |
| Grok web search | On demand | Current news | < 1 hour | MEDIUM-HIGH, REAL-TIME |

### 4.2 Data Freshness Card

Every analysis (debate and pulse) must include a freshness card in the prompt:

```
## Data Freshness Card — Analysis Run: [date/time]

CGC data: Week [X] (ending [date]) — [N] DAYS OLD
CFTC COT: Positions as of [date] — [N] DAYS OLD
USDA Export Sales: Week ending [date] — [N] DAYS OLD
Grain Monitor: Report date [date] — [N] DAYS OLD
Prices: [delay] delay (as of [time] today)
X/Web signals: Searched during this analysis

INTERPRETATION RULES:
1. CGC stock levels are a snapshot from [N] days ago. Real stocks may
   have changed if exports accelerated or stalled since then.
2. Price moves since the CGC data date that CONTRADICT the CGC reading
   should be weighted heavily — the market prices in information before
   official data confirms it.
3. COT is the freshest official data at [N] days. Weight it for
   near-term positioning calls.
4. X signals from today can override stale official readings if they
   report specific events (port closures, tender awards, tariff changes).
5. If official data says bearish but live prices are rallying, the
   recommendation should be WATCH, not bearish.
```

### 4.3 Hermes Temporal Learning (L3 Memory)

Over time, Hermes builds experience-based temporal calibration:
- "CGC data from Week X consistently understates export activity that the next week's data confirms"
- "When live prices diverge >3% from the CGC data week, the next CGC release almost always confirms price direction"
- "Grain Monitor vessel counts are typically 2 weeks behind reality — weight X signals about port activity more heavily"

These observations are stored as L3 memory entries and applied to future analyses.

---

## 5. Data Sources

### 5.1 Existing Sources (Hermes Takes Over)

| Source | Current Path | Hermes Path |
|--------|-------------|-------------|
| CGC Weekly CSV | `import-cgc-weekly` Edge Function (paused) | Python `requests` → parse CSV → upsert `cgc_observations` |
| CFTC COT | `import-cftc-cot` Edge Function (paused) | Python `requests` → CFTC SODA API → upsert `cftc_cot_positions` |
| Grain Monitor | Scraped into `grain_monitor_snapshots` (paused) | Python scraper → upsert |
| Producer Cars | Imported into `producer_car_allocations` (paused) | Same pattern |
| Grain Prices | `scripts/import-grain-prices.ts` (manual) | Yahoo Finance API (CBOT) + Barchart/TradingCharts scrape (ICE/MGEX) |

### 5.2 New Source: USDA Export Sales

**API:** USDA FAS OpenData — `apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/{code}/allCountries/marketYear/{year}`
**Auth:** None required
**Format:** JSON
**Update frequency:** Weekly (Thursdays)

#### Commodity Mapping (Focused 8+1)

| CGC Grain | USDA Commodity | Code | Mapping Quality |
|-----------|---------------|------|-----------------|
| Wheat | All Wheat | 107 | Excellent — HRS competes directly with CWRS |
| Amber Durum | Durum (wheat subclass) | — | Excellent — direct pasta/semolina competitor |
| Corn | Corn | 104 | Excellent — US is global price setter |
| Soybeans | Soybeans | 201 | Excellent — China demand is the swing factor |
| Barley | Barley | 101 | Good — signals feed demand |
| Oats | Oats | 105 | Good — US-Canada oat trade is significant |
| Peas | Dry Peas | — | Good — India/China demand visible |
| Lentils | Lentils | — | Good — US competes for Indian market |
| **Canola** | **Soybean complex** (proxy) | 201+ | **Partial** — crush margins and vegetable oil demand drive canola pricing |

Grains NOT mapped (insufficient USDA coverage): Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans.

USDA data is **U.S. exports**, not Canadian. It serves as a **global demand signal**: if U.S. wheat export sales surge, global buyers are hungry — bullish for Canadian wheat too.

### 5.3 Price Sources — Solving the ICE/MGEX Gap

| Grain | Symbol | Exchange | Source | Method |
|-------|--------|----------|--------|--------|
| Wheat | ZW=F | CBOT | Yahoo Finance | Python `requests` (existing logic) |
| HRW Wheat | KE=F | CBOT | Yahoo Finance | Same |
| Corn | ZC=F | CBOT | Yahoo Finance | Same |
| Soybeans | ZS=F | CBOT | Yahoo Finance | Same |
| Oats | ZO=F | CBOT | Yahoo Finance | Same |
| **Canola** | **RS=F** | **ICE Canada** | **Barchart/TradingCharts** | Hermes scrapes (10-15 min delay, no auth) |
| **Spring Wheat** | **MWE=F** | **MGEX** | **Barchart/INO.com** | Hermes scrapes (10-15 min delay, no auth) |

During pulse scans, Hermes piggybacks price lookups onto Grok's `web_search` calls — zero extra API cost.

---

## 6. Weekly Pipeline

### 6.1 Thursday ~2:00pm MST — Data Scrape

Hermes fetches all data sources except CFTC COT:

1. **CGC Weekly CSV** from grainscanada.gc.ca → parse → upsert `cgc_observations`
2. **USDA Export Sales** from FAS OpenData API → parse → upsert `usda_export_sales`
3. **Grain Monitor** (port throughput, vessel queues, OCT) → upsert `grain_monitor_snapshots`
4. **Producer Cars** (forward allocations) → upsert `producer_car_allocations`
5. **Validate** — row counts vs last week, grade aggregate checks → `validation_reports`

Dashboard shows fresh numbers immediately — farmers checking Thursday evening see updated delivery/export data.

### 6.2 Friday ~4:30pm MST — CFTC COT Scrape

CFTC publishes Disaggregated COT at 3:30pm ET (1:30pm MST). Hermes waits 1 hour for data to propagate:

1. **Fetch CFTC SODA API** → parse → upsert `cftc_cot_positions`
2. Mark the data picture as **COMPLETE** for the week

### 6.3 Friday ~5:00pm MST — Full Debate + Thesis Publish

This is the main analytical event of the week. All data sources are now available.

**Phase 1 — Hermes Analysis (per grain):**
- Hermes (Opus) loads SOUL.md (L0) + relevant L1 skills + L2 book knowledge + L3 memory
- Assembles full data brief: CGC YoY, AAFC supply balance, COT positioning, USDA export sales, logistics snapshot, prices, historical averages
- Includes Data Freshness Card with exact age of each source
- Produces stance_score, conviction, near/medium-term outlook, recommendation, triggers

**Phase 2 — Grok Analysis (per grain):**
- Hermes calls xAI Responses API with `tools: [{ type: "web_search" }, { type: "x_search" }]`
- Grok receives same data brief + research guidance (major grains: 4+4 searches, mid: 2+2, minor: 1+1)
- Grok autonomously searches X and web for live market intelligence
- Returns structured JSON: stance_score, bull_case, bear_case, key_signals, research_sources

**Phase 3 — Debate (divergent grains only):**
- Hermes compares scores. If divergence > adaptive threshold (default 15 pts, adjusted per grain from L3 memory):
  - Hermes sends debate prompt to Grok: "My score is X, yours is Y. Here's my reasoning. Search X and web for current evidence to defend or concede."
  - Grok fires additional x_search + web_search queries
  - Grok either DEFENDS (with new evidence) or CONCEDES (adjusts score)
- Hermes synthesizes final consensus: weighted average if defended, debate score if conceded, Grok-weighted (55/45) when Grok has search advantage

**Phase 4 — Publish:**
- Write to `market_analysis` (bull_case, bear_case, stance_score, key_signals)
- Write to `grain_intelligence` (thesis, recommendation, kpi_data)
- Write to `score_trajectory` (weekly_debate entry — the anchor score)
- Generate `farm_summaries` per user (personalized narratives with percentiles)
- Write to `health_checks` (pipeline health validation)

### 6.4 Monday-Friday — Pulse Scans (Adaptive)

**Schedule:** 7:00am MST (morning) + 1:00pm MST (afternoon)

**Adaptive grain selection:**
- Major grains (Wheat, Canola, Durum, Barley, Oats, Peas) scanned every pulse
- Minor grains scanned only if Hermes detects a material event via web search
- Hermes decides based on L3 memory: "Lentils is normally quiet, but India just announced a tariff change — scan it"

**Pulse scan flow:**
1. Hermes performs web search for grain market news, weather, policy changes
2. Hermes calls Grok with lightweight prompt + `x_search` for X/Twitter chatter
3. Piggyback: Grok also reports current prices for Canola and Spring Wheat (fills ICE/MGEX gap)
4. If material change detected (>5 point score shift justified):
   - Adjust stance_score ±delta
   - Write to `score_trajectory` (pulse_am or pulse_pm entry)
   - Record trigger and evidence
5. If no material change: no write (avoid noise)

**Dashboard shows:** "Weekly: +25 (Fri) → Current: +35 (Tue PM) ↑" via `score_trajectory` table.

### 6.5 Monday-Friday ~5:00pm MST — Daily Price Import

1. Yahoo Finance API for CBOT grains (Wheat, HRW, Corn, Soybeans, Oats)
2. Barchart/TradingCharts scrape for ICE Canola (RS=F) and MGEX Spring Wheat (MWE=F)
3. Upsert to `grain_prices` table
4. Hermes analyzes price patterns → stores observations in L3 memory

---

## 7. Knowledge Architecture

### 7.1 Viking Knowledge → Hermes Memory Mapping

| Viking Tier | Content | Hermes Layer | Loading |
|-------------|---------|-------------|---------|
| **L0** (~420 tokens) | 8 core principles from 8 grain marketing books | **SOUL.md** — permanent personality | Always active |
| **L1** (7 topics × ~800 tokens) | Cross-book topic summaries | **Skills** — `basis-pricing.md`, `storage-carry.md`, etc. | Loaded by intent detection |
| **L2** (specific chunks via Supabase RPC) | Full-text search against ingested book passages | **Supabase query** — same `book_knowledge_chunks` table | Retrieved per query |
| **L3** (NEW — experience-generated) | Hermes's own learned insights | **Persistent Memory** (~/.hermes/ directory) | Accumulated over time |

### 7.2 L3 Memory — What Hermes Learns

After each weekly debate and throughout pulse scans, Hermes synthesizes experience into permanent memory entries:

- **Per-grain calibration:** "Grok tends to be too bullish on Canola because it overweights crush margin strength. Apply -5 pt correction when Grok's Canola score > +40."
- **Price patterns:** "Wheat has dropped the Thursday after CGC data release for 3 consecutive weeks — harvest pressure repricing pattern."
- **Temporal learning:** "When CGC data is >8 days old and Canola prices have moved >2% since the data date, the next CGC release confirms the price direction 80% of the time."
- **USDA correlation:** "USDA wheat export sales >500K MT in a week have preceded Canadian basis narrowing within 2 weeks in 4 of the last 5 occurrences."
- **Debate outcomes:** "Week 33: I was bearish Wheat at -25, Grok was neutral at -5. Grok found a China tender announcement via x_search that I missed. Final consensus: -10. My error: didn't weight export demand signals enough."

### 7.3 New Skills (L1 Additions)

| Skill | Content |
|-------|---------|
| `usda-export-signals` | How to interpret USDA weekly export sales: net sales vs shipments vs outstanding commitments. What "above/below average pace" means. How US export demand correlates with Canadian basis. |
| `price-pattern-analysis` | Frameworks for identifying daily/weekly/monthly price patterns. Mean reversion signals. Seasonal tendencies by grain. How to weight technical patterns alongside fundamental data. |

---

## 8. Database Changes

### 8.1 New Table: `usda_export_sales`

```sql
CREATE TABLE usda_export_sales (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity       text NOT NULL,
  cgc_grain       text NOT NULL,
  market_year     text NOT NULL,
  week_ending     date NOT NULL,
  net_sales_mt    numeric,
  exports_mt      numeric,
  outstanding_mt  numeric,
  top_buyers      jsonb,
  source          text DEFAULT 'USDA-FAS',
  imported_at     timestamptz DEFAULT now(),
  UNIQUE (commodity, market_year, week_ending)
);

COMMENT ON TABLE usda_export_sales IS 'USDA FAS weekly export sales data. US exports used as global demand signal for Canadian grain thesis.';
COMMENT ON COLUMN usda_export_sales.cgc_grain IS 'Mapped CGC grain name for joining with cgc_observations.';
COMMENT ON COLUMN usda_export_sales.net_sales_mt IS 'Net new export sales in metric tonnes for the reporting week.';
COMMENT ON COLUMN usda_export_sales.exports_mt IS 'Actual shipments (inspections) in metric tonnes.';
COMMENT ON COLUMN usda_export_sales.outstanding_mt IS 'Cumulative unshipped commitments (sold but not yet exported).';
COMMENT ON COLUMN usda_export_sales.top_buyers IS 'Top 3 destination countries as [{country, mt}].';
```

### 8.2 New Table: `score_trajectory`

```sql
CREATE TABLE score_trajectory (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grain             text NOT NULL,
  crop_year         text NOT NULL,
  grain_week        smallint NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  scan_type         text NOT NULL CHECK (scan_type IN ('weekly_debate', 'pulse_am', 'pulse_pm')),

  -- Multi-dimensional stance
  stance_score      smallint NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  conviction_pct    smallint CHECK (conviction_pct BETWEEN 0 AND 100),
  near_term         text CHECK (near_term IN ('bearish', 'neutral', 'bullish')),
  medium_term       text CHECK (medium_term IN ('bearish', 'neutral', 'bullish')),
  recommendation    text NOT NULL CHECK (recommendation IN (
    'PATIENCE', 'WATCH', 'SCALE_IN', 'ACCELERATE', 'HOLD_FIRM', 'PRICE'
  )),

  -- What would change the call
  reversal_triggers jsonb,
  risk_triggers     jsonb,

  -- Trajectory tracking
  score_delta       smallint,
  trigger           text,
  evidence          text,

  -- Data freshness at time of analysis
  data_freshness    jsonb NOT NULL,

  model_source      text NOT NULL,

  UNIQUE (grain, crop_year, grain_week, recorded_at)
);

CREATE INDEX idx_score_trajectory_grain_week ON score_trajectory (grain, crop_year, grain_week);

COMMENT ON TABLE score_trajectory IS 'Intra-week stance score trajectory. Weekly anchor from Friday debate + pulse adjustments M-F.';
COMMENT ON COLUMN score_trajectory.data_freshness IS 'Age of each data source at analysis time: {cgc_age_days, cot_age_days, usda_age_days, prices_delay, monitor_age_days}.';
COMMENT ON COLUMN score_trajectory.reversal_triggers IS 'Conditions that would flip the call: [{trigger, likelihood}].';
COMMENT ON COLUMN score_trajectory.recommendation IS 'PATIENCE=hold+monitor, WATCH=uncertain+wait, SCALE_IN=begin delivering, ACCELERATE=deliver now, HOLD_FIRM=confident bullish, PRICE=hedge/forward contract.';
```

### 8.3 Existing Tables — No Schema Changes

All existing tables (`market_analysis`, `grain_intelligence`, `farm_summaries`, `cgc_observations`, `cftc_cot_positions`, `grain_monitor_snapshots`, `producer_car_allocations`, `grain_prices`, `x_market_signals`, `health_checks`, `validation_reports`) remain unchanged. Hermes writes to them using the same schema the Edge Functions used.

---

## 9. Hermes Skills Inventory

| Skill | Purpose | Schedule |
|-------|---------|----------|
| `import-cgc` | Fetch CGC CSV, parse, upsert `cgc_observations` | Thu 2pm |
| `import-usda` | Call USDA FAS OpenData API for 8+1 grains, upsert `usda_export_sales` | Thu 2pm |
| `scrape-grain-monitor` | Scrape Grain Monitor (port/vessel/OCT), upsert `grain_monitor_snapshots` | Thu 2pm |
| `import-producer-cars` | Fetch producer car allocations, upsert `producer_car_allocations` | Thu 2pm |
| `import-cftc-cot` | Call CFTC SODA API, upsert `cftc_cot_positions` | Fri 4:30pm |
| `import-prices` | Yahoo Finance (CBOT) + Barchart scrape (ICE/MGEX), upsert `grain_prices` | M-F 5pm |
| `validate-import` | Row counts, grade aggregates, freshness checks → `validation_reports` | After any import |
| `analyze-grain` | Hermes produces stance_score using L0/L1/L2/L3 + all data | Fri 5pm (full), pulses (light) |
| `debate-grok` | Call Grok via xAI API with x_search/web_search, compare, debate | Fri 5pm |
| `publish-thesis` | Write consensus to `market_analysis` + `grain_intelligence` + `score_trajectory` | After debate |
| `generate-farm-summaries` | Per-user AI narratives with percentiles and contracted position | Fri after publish |
| `pulse-scan` | Adaptive web + X scan, detect material changes, adjust score ±delta | M-F 7am/1pm |
| `analyze-price-patterns` | Daily/weekly/monthly price pattern detection → L3 memory | After price import |

---

## 10. SOUL.md Content Map

```markdown
# SOUL.md — The Viking Analyst

## Identity
You are a senior prairie grain market analyst with 20 years of experience
advising farmers in Alberta, Saskatchewan, and Manitoba. You analyze CGC data,
CFTC positioning, USDA export sales, and live market intelligence to produce
directional market calls for 16 Canadian grains.

## Core Principles (Viking L0)
[Full content of viking-l0.ts — 8 principles from 8 grain marketing books]

## Recommendation Philosophy
[Section 3.4 of this document — the 7 recommendation rules]

## Debate Rules
[11 codified rules from docs/reference/agent-debate-rules.md]
[Grain-specific rules: Canola crush, Oats thin OI, Peas/Lentils policy-driven]
[COT positioning rules 9-11]

## Stance Score Guide
-100 to +100 directional lean. NEVER map directly to action without
considering conviction, timeframe, and reversal potential.

## Bull/Bear Signal Checklist (Viking L1: basis_pricing)
[5-point bullish + 5-point bearish checklist. 3 of 5 confirms a lean.]

## Data Freshness Rules
[Section 4.2 interpretation rules]

## Voice Rules
[Full voice rules from lib/advisor/system-prompt.ts]

## Data Hygiene
- All CGC data is in Kt
- "Crop Year" = cumulative YTD, "Current Week" = weekly snapshot
- Wheat and Amber Durum are distinct grains
- USDA data is US exports — use as global demand signal, not Canadian supply
- Crop year format: "2025-2026" (long format everywhere)

## Self-Improvement Protocol
After each weekly debate:
1. Compare your pre-debate score vs the final consensus
2. Note where Grok's X evidence changed your position
3. Record grain-specific calibration notes in L3 memory
4. Update price pattern observations from the week's data
5. Review recommendation accuracy: did PATIENCE prove correct? Did ACCELERATE
   miss a reversal? Adjust conviction calibration accordingly.
```

---

## 11. Existing Edge Functions — Transition Plan

Edge Functions are NOT deleted. They become fallback/recovery paths:

| Edge Function | New Status | Reason to Keep |
|---------------|-----------|---------------|
| `import-cgc-weekly` | Internal fallback | Recovery if Hermes VM is down |
| `import-cftc-cot` | Internal fallback | Same |
| `analyze-market-data` | Legacy (v1) | Reference implementation |
| `generate-intelligence` | Legacy (v1) | Reference implementation |
| `generate-farm-summary` | Active (reusable) | Hermes may call this for per-user summary generation |
| `search-x-intelligence` | Legacy (v1) | Replaced by Grok's native x_search in debate |
| `validate-import` | Active (reusable) | Hermes can trigger for cross-validation |
| `validate-site-health` | Active (reusable) | Post-pipeline health check |

Vercel cron routes remain paused (returning `pausedCronResponse()`). They can be re-enabled to trigger Edge Functions if Hermes needs to be taken offline for maintenance.

---

## 12. Environment & Secrets

Required on the Hermes VM (`hermes-agent`):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Direct database writes (never expose to browser) |
| `XAI_API_KEY` | Grok 4.20 via xAI Responses API |
| `BUSHEL_INTERNAL_FUNCTION_SECRET` | If Hermes triggers existing Edge Functions as fallback |

Anthropic auth is already configured via OAuth setup token on the VM.

---

## 13. Phase 2 — Frontend Enhancements (Future)

After the Hermes pipeline is operational, the dashboard can surface the richer thesis data:

1. **Score Trajectory Widget** — sparkline on grain detail page showing weekly anchor + intra-week pulse adjustments
2. **Recommendation Badge** — replace binary HAUL/HOLD with the 6 nuanced recommendation types (PATIENCE, WATCH, SCALE_IN, ACCELERATE, HOLD_FIRM, PRICE)
3. **Reversal Trigger Cards** — "What would change this call" section below the thesis
4. **Data Freshness Indicator** — small badge showing how old each data source is
5. **USDA Export Sales Panel** — US export demand signal alongside CGC export data
6. **Conviction Meter** — replace or augment the stance spectrum bar with conviction percentage

---

## 14. Success Criteria

| Metric | Target |
|--------|--------|
| Data freshness | CGC + USDA imported within 2 hours of Thursday publication |
| COT freshness | Imported within 1 hour of Friday CFTC release |
| Debate completion | All 16 grains analyzed by 6:30pm MST Friday |
| Pulse coverage | Major grains scanned 2x daily M-F |
| Price gap closure | Canola and Spring Wheat prices in `grain_prices` daily (no more gaps) |
| Recommendation accuracy | Tracked via L3 memory — target: recommendations that would have lost money < 20% of weeks |
| Memory growth | Hermes generates ≥2 L3 memory entries per week from debate outcomes |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GCP VM downtime | Low | High — no pipeline runs | Edge Functions remain as fallback. Manual curl can trigger them. |
| xAI API rate limits | Medium | Medium — Grok debate fails | Batch grain analysis. Retry with exponential backoff. Fall back to Hermes-only score. |
| Barchart/TradingCharts blocks scraping | Medium | Low — lose Canola/Spring Wheat prices | Fall back to Grok web_search for prices. Evaluate Barchart OnDemand API (paid). |
| CGC changes CSV format | Low | High — import breaks | Validate column headers before parsing. Alert on schema mismatch. |
| USDA API deprecation | Low | Medium — lose demand signal | Old ESR Query system available until April 2; new ESRQS launched March 26. Monitor transition. |
| Hermes memory drift | Medium | Medium — accumulated errors | Weekly self-audit in Self-Improvement Protocol. Periodic manual review of L3 entries. |
| Opus bias as both participant and judge | Medium | Medium — skewed consensus | Track Grok vs Hermes accuracy per grain in L3 memory. If systematic bias detected, adjust weighting. |
