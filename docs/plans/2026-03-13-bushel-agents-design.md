# Bushel Agents — Evolutionary Grain Selling Simulator

**Date:** 2026-03-13
**Status:** Draft
**Goal:** Deploy autonomous AI agents that simulate daily grain selling decisions using live PDQ regional prices and CGC supply data, competing on a farmer-facing leaderboard within Bushel Board. Agents improve over time via Hermes-style procedural memory and weekly lessons-learned feedback loops.

**Inspiration:** Varun Mathur's AutoQuant (distributed evolutionary quant research) + Karpathy's autoresearch loop + NousResearch Hermes Agent self-improving skill system.

---

## Problem Statement

Prairie farmers face the same question every day: "Should I sell my grain today, or wait?" This decision is influenced by cash prices, basis levels, export pace, weather, road bans, cash flow needs, and dozens of other factors. Most farmers rely on gut instinct or a single advisor's opinion.

Bushel Agents creates a transparent, gamified simulation where AI agents compete to answer this question better than the market average — giving farmers a decision-support tool they can watch, learn from, and eventually follow.

---

## Architecture Overview

```
                     PDQ (daily ~2PM CST)
                           │
                           ▼
                    pdq_daily_prices
                     (Supabase table)
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
     ▼                     ▼                     ▼
 CGC weekly data    AAFC supply data    Bushel Intelligence
 (cgc_observations) (supply_disposition) (grain_intelligence,
                                         market_analysis,
                                         x_market_signals)
     │                     │                     │
     └─────────────────────┼─────────────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
               Agent A       Agent B
           "Fundamentalist" "Sentiment"
               (Hermes)      (Hermes)
                    │             │
                    ▼             ▼
              agent_trades (Supabase table)
                           │
                           ▼
              Bushel Board — Commodity Board page
              (leaderboard, trade feed, positions)
```

### Weekly Cycle

```
Thursday:
  1. CGC import runs (existing pipeline)
  2. Bin inventory recalculated from CGC + AAFC data
  3. Both agents reset to estimated remaining prairie bin stocks
  4. Weekly lessons-learned generated from prior week's performance
  5. Disruption briefing compiled for upcoming week

Daily (Mon-Fri, ~2:15 PM CST):
  1. PDQ scraper fetches fresh regional prices
  2. Both agents evaluate: sell or hold, for each grain, in each region
  3. Trades logged to agent_trades table
  4. Commodity board updates in real-time

Sunday:
  1. Weekly scorecard generated
  2. Agent skills refined based on outcomes
  3. Performance compared to market-average benchmark
```

---

## Data Sources

### PDQ — Daily Cash Grain Prices

**Source:** https://www.pdqinfo.ca/ (Alberta Grains, free service)
**Update frequency:** Daily ~2:00 PM CST
**Endpoint:** `/widget/regional` returns structured JSON
**Coverage:** 9 Western Canadian regions (Peace, Northern AB, Southern AB, NW SK, SW SK, NE SK, SE SK, Western MB, Eastern MB)

**Grains available:**
| PDQ Code | Grain | Bushel Rate |
|----------|-------|------------|
| CWRS | Red Spring Wheat | 36.7440 |
| CWAD | Amber Durum | 36.7440 |
| CPSRM | Prairie Spring Red | 36.7440 |
| CAN | Canola | 44.0920 |
| YPEA | Yellow Peas | 36.7440 |

**Note:** PDQ covers 5 of our target 6 grains. Barley is not available via PDQ. Options:
- Drop Barley from initial agent scope (recommended for MVP)
- Source Barley prices separately (MarketsFarm or Alberta Canola daily prices page)

**Data use terms:** Contact Alberta Grains (info@albertagrains.com) to confirm automated scraping is permitted. Since Bushel Board benefits their farmer audience, partnership potential is high.

### CGC — Weekly Supply/Demand (Existing)

Already integrated via `import-cgc-weekly` Edge Function. Provides:
- Producer deliveries by grain, region, week
- Terminal receipts and exports
- Cumulative crop-year volumes

Used to estimate remaining bin inventory:
```
Estimated Bins = AAFC Production + Carry-In - CY Deliveries
```

### Bushel Intelligence Pipeline (Existing)

Agents consume the full intelligence stack:
- `grain_intelligence` — per-grain thesis and insights
- `market_analysis` — Step 3.5 Flash bull/bear cases + historical context
- `x_market_signals` — X/Twitter sentiment signals
- `grain_sentiment_votes` — farmer Holding/Hauling polls
- `v_grain_yoy_comparison` — year-over-year metric comparisons
- `v_supply_pipeline` — AAFC supply balance sheet

---

## Distilled Knowledge Base

Three textbook distillations feed into agent system prompts and initial skill documents. These provide the domain expertise that makes agent decisions sound like a real grain marketer, not a generic AI.

### 1. Introduction to Grain Marketing (SK Ministry of Agriculture)
**Key frameworks for agents:**
- Top-Third Pricing Rule: sell in the top third of the annual range
- Incremental Forward Selling: 10-15% at seeding, 10-15% late summer
- Storage Cost Justification: store only when price rise > all costs
- Basis Signal Matrix: narrowing basis + rising futures = hold; widening basis + falling futures = sell
- Contract type awareness: deferred delivery, basis contracts, put options, pool contracts

### 2. Agricultural Marketing and Price Analysis (Norwood & Lusk)
**Key frameworks for agents:**
- Law of One Price and arbitrage: price differences create opportunities but are quickly eroded
- Incentive-driven behavior: agents must model how other market participants respond to signals
- Indifference Principle: understand when price signals stop being actionable

### 3. Agricultural Prices and Commodity Market Analysis (Ferris)
**Key frameworks for agents:**
- Multi-temporal analysis: different tools for daily, weekly, monthly, seasonal horizons
- Storage and speculation demand: driven by current vs. expected prices
- Export demand drivers: foreign production, purchasing power, trade policies, exchange rates
- Basis is local: reflects local supply/demand, transportation, and storage costs

### 4. Existing Commodity Knowledge (commodity-knowledge.ts)
Already distilled into ~4K tokens covering:
- Seasonal patterns and crop calendar triggers
- Basis analysis rules and signal matrix
- Bullish/bearish signal checklists (3/5 confirmation)
- Storage decision algorithm
- Export demand indicators
- Hedging mechanics for Canadian grains

---

## Agent Design

### Agent Architecture (Hermes-Based)

Each agent is a Hermes Agent instance with:
1. **System prompt** — defines the agent's thesis and personality
2. **Skill documents** — procedural memory that improves over time
3. **Tool access** — MCP tools or custom Hermes tools that query Supabase
4. **Memory** — persistent cross-session memory of past decisions and outcomes

### Agent A — "The Fundamentalist"

**Thesis:** Supply/demand data and export pace are the strongest predictors of optimal sell timing. Sentiment is noise.

**System prompt emphasis:**
- Weight CGC delivery pace vs. 5-year average heavily
- Watch export program (terminal exports + direct exports) for demand signals
- Use AAFC balance sheet to gauge tightness
- Apply the Basis Signal Matrix from commodity-knowledge.ts
- Prefer the Top-Third Pricing Rule: set targets, sell when hit, don't get greedy
- Conservative position sizing: never sell more than 25% in a single day

**Initial skill documents:**
- `grain-seasonal-patterns.md` — crop calendar triggers by grain
- `basis-analysis.md` — how to read regional PDQ basis changes
- `supply-demand-scoring.md` — how to weigh CGC metrics
- `prairie-farming-calendar.md` — constraint layer (see below)

### Agent B — "The Sentiment Trader"

**Thesis:** Market mood and real-time signals move prices before fundamentals show up in weekly data. Early movers win.

**System prompt emphasis:**
- Weight X market signals and farmer sentiment polls heavily
- Watch bull/bear narrative shifts from market_analysis
- Use momentum: if sentiment is shifting, act before the crowd
- Apply the Incremental Forward Selling heuristic but be more aggressive on timing
- Willing to sell larger portions (up to 40%) when conviction is high
- More responsive to disruption alerts (weather, policy, trade news)

**Initial skill documents:**
- `sentiment-signal-scoring.md` — how to interpret X signals and farmer polls
- `momentum-trading.md` — when to act on narrative shifts
- `disruption-response.md` — how weather, road bans, and policy changes affect sell timing
- `prairie-farming-calendar.md` — same constraint layer as Agent A

### Future Agents (Phase 2+)

- **Agent C — "The Hedger"** — focuses on basis contract timing, simulates forward contracts
- **Agent D — "The Contrarian"** — deliberately takes the opposite position when consensus is strong
- **Agent E — "The Local"** — specializes in a single region, learns its specific elevator dynamics

### Evolutionary Improvement

When a new agent is created:
1. Review leaderboard — which agent has the best 4-week rolling performance?
2. Clone the winning agent's skill documents as a starting point
3. Mutate one aspect: change position sizing, swap signal weights, add a new factor
4. Run in parallel for 4 weeks
5. If the new agent outperforms, promote its skill innovations back to the parent
6. If it underperforms, analyze why and document in lessons-learned

This is manual evolution to start (you decide when to spawn and mutate). Hermes GEPA can automate this later.

---

## Farmer Constraint Layer — Prairie Calendar

All agents share this constraint layer. It modifies sell decisions based on real-world farmer constraints.

```typescript
interface PrairieCalendarConstraint {
  name: string;
  dateRange: { start: string; end: string }; // MM-DD format
  effect: 'block_selling' | 'pressure_to_sell' | 'increase_urgency' | 'reduce_volume';
  modifier: number; // multiplier on sell volume (0.0 = blocked, 1.5 = pressure to sell more)
  description: string;
}

const PRAIRIE_CALENDAR: PrairieCalendarConstraint[] = [
  {
    name: 'Road Bans',
    dateRange: { start: '03-15', end: '05-15' },
    effect: 'block_selling',
    modifier: 0.0,
    description: 'Spring road weight restrictions prevent grain hauling in most rural municipalities'
  },
  {
    name: 'Pre-Road-Ban Selling Pressure',
    dateRange: { start: '02-15', end: '03-14' },
    effect: 'pressure_to_sell',
    modifier: 1.5,
    description: 'Farmers push to deliver before road bans; agents should consider accelerating sales'
  },
  {
    name: 'Seeding Cash Flow',
    dateRange: { start: '03-01', end: '04-30' },
    effect: 'pressure_to_sell',
    modifier: 1.3,
    description: 'Seed, fertilizer, and chemical purchases require cash; selling pressure increases'
  },
  {
    name: 'Harvest Bin Pressure',
    dateRange: { start: '08-15', end: '10-31' },
    effect: 'increase_urgency',
    modifier: 1.4,
    description: 'New crop needs bin space; old crop must move. Especially acute for canola.'
  },
  {
    name: 'Crop Year End Liquidation',
    dateRange: { start: '06-01', end: '07-31' },
    effect: 'increase_urgency',
    modifier: 1.8,
    description: 'Must be fully sold by July 31 crop year end. Urgency increases through June/July.'
  },
  {
    name: 'Holiday Slowdown',
    dateRange: { start: '12-20', end: '01-05' },
    effect: 'reduce_volume',
    modifier: 0.5,
    description: 'Elevator hours reduced, trucking limited. Agents should front-load December sales.'
  },
  {
    name: 'Export Peak Season',
    dateRange: { start: '09-01', end: '03-31' },
    effect: 'pressure_to_sell',
    modifier: 1.1,
    description: 'Strong export demand period. Basis tends to narrow. Good selling window.'
  }
];
```

### Disruption Briefings (Weekly)

Before each trading week, agents receive a "disruption briefing" compiled from:
- Weather forecasts (pulled from Environment Canada or X signals)
- Road ban status updates by region
- Known elevator outages or capacity issues
- Upcoming policy changes (tariffs, trade agreements)
- Global competitor harvest updates (Australia, Argentina, EU)

Initially these briefings are manually curated from intelligence pipeline output. Phase 2: automated extraction from X signal scans.

---

## Data Model

### New Tables

```sql
-- Daily PDQ regional grain prices
CREATE TABLE pdq_daily_prices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  price_date date NOT NULL,
  grain_code text NOT NULL,        -- CWRS, CWAD, CPSRM, CAN, YPEA
  grain text NOT NULL,             -- mapped: Wheat, Durum, Prairie Spring Red, Canola, Yellow Peas
  region text NOT NULL,            -- 9 PDQ regions
  price_per_tonne numeric,         -- regional average $/tonne
  price_per_bushel numeric,        -- converted using bushel_rate
  change_pct numeric,              -- day-over-day change %
  bushel_rate numeric,             -- conversion factor
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(price_date, grain_code, region)
);

-- Agent definitions
CREATE TABLE agents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,       -- 'fundamentalist', 'sentiment-trader'
  display_name text NOT NULL,      -- 'The Fundamentalist', 'The Sentiment Trader'
  thesis text NOT NULL,            -- one-line thesis description
  status text DEFAULT 'active',    -- active, paused, retired
  created_at timestamptz DEFAULT now(),
  config jsonb DEFAULT '{}'        -- agent-specific config overrides
);

-- Weekly agent inventory (reset each Thursday)
CREATE TABLE agent_inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid REFERENCES agents(id),
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  grain text NOT NULL,
  starting_kt numeric NOT NULL,    -- estimated remaining bin stocks (ktonnes)
  remaining_kt numeric NOT NULL,   -- after trades this week
  reset_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, crop_year, grain_week, grain)
);

-- Individual agent trade decisions
CREATE TABLE agent_trades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid REFERENCES agents(id),
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  trade_date date NOT NULL,
  grain text NOT NULL,
  region text NOT NULL,            -- PDQ region where trade executed
  action text NOT NULL,            -- 'sell' or 'hold'
  quantity_kt numeric,             -- ktonnes sold (null if hold)
  price_per_tonne numeric,         -- PDQ price at time of trade
  pct_of_remaining numeric,        -- what % of remaining inventory was sold
  reasoning text,                  -- agent's explanation for the decision
  confidence numeric,              -- 0.0 to 1.0
  signals_used jsonb DEFAULT '[]', -- which data points influenced the decision
  constraint_applied text,         -- which prairie calendar constraint was active, if any
  created_at timestamptz DEFAULT now()
);

-- Weekly agent scorecards
CREATE TABLE agent_scorecards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid REFERENCES agents(id),
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  grain text NOT NULL,
  weighted_avg_price numeric,      -- agent's volume-weighted avg sell price
  market_avg_price numeric,        -- benchmark: equal daily portions avg price
  alpha_pct numeric,               -- (agent - market) / market * 100
  total_sold_kt numeric,
  trades_count int,
  lessons_learned text,            -- auto-generated weekly reflection
  scored_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, crop_year, grain_week, grain)
);

-- Weekly disruption briefings
CREATE TABLE disruption_briefings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  briefing_text text NOT NULL,     -- markdown-formatted disruption summary
  disruptions jsonb DEFAULT '[]',  -- structured: [{type, region, severity, description}]
  created_at timestamptz DEFAULT now(),
  UNIQUE(crop_year, grain_week)
);

-- RLS policies
ALTER TABLE pdq_daily_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PDQ prices are publicly readable" ON pdq_daily_prices FOR SELECT USING (true);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents are publicly readable" ON agents FOR SELECT USING (true);

ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trades are publicly readable" ON agent_trades FOR SELECT USING (true);

ALTER TABLE agent_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scorecards are publicly readable" ON agent_scorecards FOR SELECT USING (true);

ALTER TABLE agent_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventory is publicly readable" ON agent_inventory FOR SELECT USING (true);

ALTER TABLE disruption_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Briefings are publicly readable" ON disruption_briefings FOR SELECT USING (true);
```

### New RPC Functions

```sql
-- Get agent leaderboard for current crop year
CREATE OR REPLACE FUNCTION get_agent_leaderboard(p_crop_year text)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  display_name text,
  thesis text,
  total_alpha_pct numeric,
  avg_weekly_alpha numeric,
  best_grain text,
  worst_grain text,
  total_trades int,
  weeks_active int
) AS $$ ... $$;

-- Get agent's current positions across all grains
CREATE OR REPLACE FUNCTION get_agent_positions(p_agent_id uuid, p_crop_year text, p_grain_week int)
RETURNS TABLE (
  grain text,
  starting_kt numeric,
  remaining_kt numeric,
  pct_sold numeric,
  weighted_avg_price numeric,
  latest_market_price numeric,
  unrealized_value numeric
) AS $$ ... $$;
```

---

## Infrastructure

### Hermes Agent Hosting — Google Cloud

**Compute:** Compute Engine `e2-small` VM (~$15/month from GCP Ultra credits)
**Region:** `us-central1` (low latency to Supabase)
**OS:** Ubuntu 22.04 LTS
**Runtime:** Hermes Agent daemon (always-on)

**LLM Provider:** OpenRouter (existing `OPENROUTER_API_KEY`)
**Model:** `stepfun/step-3.5-flash:free` for routine daily decisions (cost: $0)
**Fallback model:** Grok via xAI for complex reasoning when confidence is low

**Estimated monthly cost:**
| Item | Cost |
|------|------|
| e2-small VM (24/7) | ~$15 |
| Cloud Storage (skills, memory, logs) | ~$1 |
| LLM API (Step 3.5 Flash free tier) | $0 |
| Grok fallback (~20 calls/week) | ~$2 |
| **Total** | **~$18/month** |

Leaves ~$82/month of GCP credits for backtesting bursts, scaling to more agents, or other experiments.

### PDQ Scraper — Vercel Cron or Edge Function

**Option A (recommended):** New Vercel API route `app/api/cron/fetch-pdq/route.ts`
- Runs daily at 2:15 PM CST (after PDQ updates)
- Fetches `/widget/regional` JSON
- Maps grain codes to canonical grain names
- Upserts into `pdq_daily_prices`
- Triggers agent evaluation via internal Edge Function chain

**Option B:** Hermes cron task on GCP VM
- More self-contained but adds complexity

### Agent Execution Flow

```
Vercel Cron (2:15 PM CST)
  → fetch-pdq-prices (API route)
    → upserts pdq_daily_prices
    → triggers evaluate-agents Edge Function
      → reads: pdq_daily_prices, agent_inventory, grain_intelligence,
               market_analysis, x_market_signals, prairie_calendar
      → for each agent:
        → builds data package (prices, inventory, signals, constraints)
        → sends to Hermes agent on GCP VM via HTTP
        → Hermes agent reasons through data, returns trade decisions
      → logs decisions to agent_trades
      → updates agent_inventory remaining_kt
```

---

## UI — Commodity Board Page

### Route: `/agents` (new dashboard page)

### Components

**AgentLeaderboard** — Top-level scoreboard
- Agent cards ranked by cumulative alpha (% over market average)
- Rolling 4-week performance sparkline
- Current week's P&L

**AgentPositionGrid** — Per-agent grain positions
- Stacked bar per grain showing sold vs. remaining inventory
- Color-coded by performance (green = beating market, red = trailing)

**TradeFeed** — Real-time trade stream
- Chronological list of agent trades across all grains
- Each trade shows: agent name, grain, region, qty, price, reasoning snippet
- Filterable by agent, grain, region

**WeeklyScorecard** — Expandable weekly breakdown
- Side-by-side: Agent A vs. Agent B vs. Market Average
- Per-grain weighted average price comparison
- Lessons-learned summary from each agent

**PrairieCalendarStrip** — Visual timeline
- Shows current position in the farming year
- Highlights active constraints (road bans, seeding, harvest pressure)
- Upcoming disruptions flagged

**AgentDetailPage** — `/agents/[name]`
- Full trade history for one agent
- Skill evolution timeline (how its strategy has changed)
- Per-grain performance charts
- Current thesis and reasoning style

---

## Implementation Plan

### Phase 1 — Data Foundation (Week 1)

| # | Task | Owner |
|---|------|-------|
| 1 | Build PDQ scraper (Vercel cron route) | frontend-dev |
| 2 | Create `pdq_daily_prices` table + RLS | db-architect |
| 3 | Create `agents`, `agent_trades`, `agent_inventory`, `agent_scorecards` tables | db-architect |
| 4 | Build bin inventory calculator (CGC + AAFC → estimated remaining stocks) | db-architect |
| 5 | Verify PDQ data quality: spot-check prices against pdqinfo.ca for 5 days | data-audit |

### Phase 2 — Agent Engine (Week 2)

| # | Task | Owner |
|---|------|-------|
| 6 | Set up GCP Compute Engine VM with Hermes Agent | infra |
| 7 | Write Agent A system prompt + initial skill documents | innovation-agent |
| 8 | Write Agent B system prompt + initial skill documents | innovation-agent |
| 9 | Build Hermes MCP tools for Supabase data access (prices, inventory, intelligence) | db-architect |
| 10 | Build prairie calendar constraint module | frontend-dev |
| 11 | Build `evaluate-agents` Edge Function (orchestrates daily agent runs) | db-architect |
| 12 | Inject distilled knowledge bases into agent skill documents | innovation-agent |

### Phase 3 — Scoring & Feedback (Week 3)

| # | Task | Owner |
|---|------|-------|
| 13 | Build weekly scorecard generator (compare agent vs. market average) | db-architect |
| 14 | Build lessons-learned feedback loop (outcomes → skill refinement) | innovation-agent |
| 15 | Build disruption briefing compiler (from intelligence pipeline + manual input) | innovation-agent |
| 16 | Create `get_agent_leaderboard` and `get_agent_positions` RPCs | db-architect |

### Phase 4 — UI (Week 4)

| # | Task | Owner |
|---|------|-------|
| 17 | Build `/agents` page with AgentLeaderboard component | frontend-dev |
| 18 | Build AgentPositionGrid component | frontend-dev |
| 19 | Build TradeFeed component | frontend-dev |
| 20 | Build WeeklyScorecard component | frontend-dev |
| 21 | Build PrairieCalendarStrip component | frontend-dev |
| 22 | Build `/agents/[name]` detail page | frontend-dev |

### Phase 5 — Evolution (Week 5+)

| # | Task | Owner |
|---|------|-------|
| 23 | Run agents for 4 weeks, collect performance data | all |
| 24 | Analyze which agent characteristics drive alpha | innovation-agent |
| 25 | Spawn Agent C by cloning winner + mutating one dimension | innovation-agent |
| 26 | Implement Hermes GEPA for automated skill evolution | innovation-agent |
| 27 | Add local elevator-level pricing (Phase 2 of PDQ integration) | db-architect |

---

## Scoring Methodology

### Benchmark: Market Average

The "market" benchmark assumes a farmer sells equal portions of grain every trading day of the week. If PDQ shows 5 price updates in a week, the benchmark is the simple average of those 5 prices.

```
Market Avg Price = SUM(daily_price) / COUNT(trading_days)
```

### Agent Score: Volume-Weighted Average

```
Agent Avg Price = SUM(trade_qty * trade_price) / SUM(trade_qty)
```

### Alpha

```
Alpha % = (Agent Avg - Market Avg) / Market Avg * 100
```

Positive alpha = agent sold at better prices than equal-daily-portions strategy.

### Composite Score (for leaderboard ranking)

```
Composite = (0.5 * cumulative_alpha) + (0.3 * consistency_score) + (0.2 * constraint_adherence)
```

Where:
- `cumulative_alpha`: total % outperformance across all grains
- `consistency_score`: % of weeks where alpha was positive (rewards reliability)
- `constraint_adherence`: how well the agent respected prairie calendar constraints (penalize impossible trades)

---

## Risk & Limitations

1. **PDQ is daily, not intraday.** Agents make one decision per day. This matches farmer behavior but limits the granularity of simulation.
2. **PDQ provides regional averages, not specific elevator bids.** Real farmers negotiate individual contracts. Phase 2 adds elevator-level data.
3. **No futures/options simulation.** MVP simulates cash sales only. Adding hedge strategies requires futures price feeds.
4. **Bin estimates are approximations.** CGC deliveries + AAFC production gives a reasonable estimate, but farm-level inventory varies wildly.
5. **Agent hallucination risk.** LLM agents may generate plausible-sounding but wrong reasoning. The scoring system is the ground truth — performance, not explanation, determines the winner.
6. **Not financial advice.** The commodity board is educational and entertainment. Clear disclaimers required on the page.

---

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| At least one agent beats market average | >0% alpha | First 8 weeks |
| Agent trade reasoning rated "makes sense" by farmers | >70% | User survey at week 8 |
| Commodity board page engagement | >30% of active users visit weekly | First 12 weeks |
| Agent skill documents self-improve | Measurable change in 5+ skills | First 12 weeks |
| Farmers reference agent recommendations in sentiment polls | Qualitative signal | Ongoing |

---

## Disclaimers

The Bushel Agents commodity board is a simulation and educational tool. It does not constitute financial advice. Agent recommendations are generated by AI and should not be the sole basis for any grain marketing decision. Past simulation performance does not guarantee future results. Always consult with a qualified grain marketing advisor before making selling decisions.
