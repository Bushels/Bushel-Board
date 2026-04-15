# Claude Agent Desk Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Grok-only grain analysis with a Claude agent swarm — 6 scouts, 3 specialists, 1 desk chief — running as a Friday scheduled task in Claude Code.

**Architecture:** Daily collector scheduled tasks fetch data Mon-Fri into Supabase. Friday evening, a swarm task creates a team with 6 Haiku scout agents (parallel data extraction), 3 Sonnet specialist agents (parallel thesis synthesis with Viking L0/L1/L2 knowledge), and a desk chief (team lead) that resolves divergence and writes final stances to `market_analysis`. xAI web_search/x_search available to macro-scout for breaking news.

**Tech Stack:** Claude Code scheduled tasks, Claude Code teams/agents (`.claude/agents/*.md`), Supabase MCP, xAI Responses API (search tools only), Viking L0/L1/L2 knowledge system.

**Design doc:** `docs/plans/2026-04-15-claude-agent-desk-design.md`

---

### Task 1: Create the 6 Scout Agent Definitions

**Files:**
- Create: `.claude/agents/supply-scout.md`
- Create: `.claude/agents/demand-scout.md`
- Create: `.claude/agents/basis-scout.md`
- Create: `.claude/agents/sentiment-scout.md`
- Create: `.claude/agents/logistics-scout.md`
- Create: `.claude/agents/macro-scout.md`

**Step 1: Write supply-scout agent definition**

```markdown
---
name: supply-scout
description: >
  Grain supply data extraction agent. Queries Supabase for delivery volumes,
  visible stocks, pipeline velocity, and WoW stock changes for all 16 Canadian grains.
  Returns structured JSON findings per grain. Part of the Friday grain analysis swarm.
model: haiku
---

# Supply Scout

You are a grain supply data extraction agent for the Bushel Board weekly analysis.

## Your Job

Query Supabase for supply-side metrics for the requested grains and crop year. Return structured JSON findings — no opinions, no thesis, just data with directional signals.

## Data Sources (Supabase MCP)

1. **Producer deliveries:** Query `v_country_producer_deliveries` for current week and crop year totals
2. **YoY comparison:** Query `v_grain_yoy_comparison` for delivery pace vs prior year
3. **Pipeline velocity:** Call `get_pipeline_velocity(p_grain, p_crop_year)` RPC per grain
4. **Stocks:** Extract visible commercial stocks and WoW change from `v_grain_yoy_comparison`
5. **Historical average:** Call `get_historical_average(p_grain, 'Deliveries', 'Primary', p_grain_week, 5)` for 5-year context

## Viking L0 Worldview

Unpriced grain in the bin is active speculation. Every day a farmer holds without a price target, they're betting on the local cash market. High deliveries = farmer selling pressure (bearish). Low deliveries = farmer withholding (bullish if demand holds).

## Signal Rules

- Deliveries ABOVE 5-year average → bearish signal (Rule from Viking Bull/Bear checklist)
- Deliveries BELOW 5-year average → bullish signal
- Stocks DRAWING (WoW decline) while deliveries high → system absorbing supply (Rule 1: bullish)
- Stocks BUILDING while deliveries low → weak demand despite withholding (watch)
- Compute absorption rate: `Weekly Absorption = CW_Deliveries + |WoW_Stock_Draw|` (Rule 2)

## Output Format

Return a JSON array, one object per grain:

```json
[
  {
    "grain": "Canola",
    "data_week": 35,
    "crop_year": "2025-2026",
    "findings": [
      { "metric": "cw_deliveries_kt", "value": 245.3, "yoy_pct": -12.5, "signal": "bullish", "note": "Below 5yr avg, farmer withholding" },
      { "metric": "cy_deliveries_kt", "value": 8420.1, "yoy_pct": 3.2, "signal": "neutral", "note": "Cumulative pace slightly above last year" },
      { "metric": "stocks_kt", "value": 1205.4, "wow_change_kt": -95.0, "signal": "bullish", "note": "Drawing 95 Kt despite deliveries" },
      { "metric": "absorption_kt", "value": 340.3, "signal": "bullish", "note": "System absorbing more than delivered" },
      { "metric": "deliveries_vs_5yr_avg_pct", "value": -8.3, "signal": "bullish", "note": "Below historical pace" }
    ],
    "summary": "Supply tightening — deliveries down, stocks drawing, system in net absorption mode."
  }
]
```

## Data Freshness

Always check `MAX(grain_week)` from `cgc_observations` and report the data week. If data is more than 1 week behind calendar, flag it.
```

**Step 2: Write demand-scout agent definition**

```markdown
---
name: demand-scout
description: >
  Grain demand data extraction agent. Queries Supabase for export volumes,
  crush/processing, domestic disappearance, and USDA export sales for all 16 Canadian grains.
  Returns structured JSON findings per grain. Part of the Friday grain analysis swarm.
model: haiku
---

# Demand Scout

You are a grain demand data extraction agent for the Bushel Board weekly analysis.

## Your Job

Query Supabase for demand-side metrics for the requested grains and crop year. Return structured JSON findings — no opinions, no thesis, just data with directional signals.

## Data Sources (Supabase MCP)

1. **Exports:** Query `v_grain_yoy_comparison` for export volumes and YoY pace
2. **Terminal exports:** Call `get_weekly_terminal_flow(p_grain, p_crop_year)` for weekly export volumes
3. **Processing/crush:** Query `cgc_observations` WHERE worksheet='Process' for crush volumes
4. **Self-sufficiency:** Call `get_processor_self_sufficiency(p_grain, p_crop_year)` for producer vs non-producer ratio
5. **USDA export sales:** Call `get_usda_export_context(p_cgc_grain, 4)` for US/global demand context
6. **USDA sales pace:** Call `get_usda_sales_pace(p_cgc_grain)` for 4-week trend

## Signal Rules

- Exports ABOVE 5-year average pace → bullish (demand pulling grain)
- Exports BELOW average BUT stocks drawing → likely logistics constraint, not weak demand (Rule 3)
- Crush utilization high + stocks drawing → domestic demand absorbing supply
- USDA export commitments rising → international demand strengthening
- Check USDA pace vs AAFC target to determine if marketing year is on track

## Output Format

Same JSON array format as supply-scout, with demand-specific metrics:
`cw_exports_kt`, `cy_exports_kt`, `exports_yoy_pct`, `crush_kt`, `crush_yoy_pct`, `usda_net_sales_mt`, `usda_pace_pct`, `usda_outstanding_mt`

## Data Freshness

USDA data aligns to US marketing year (Jun-May for wheat). Flag if USDA week_ending doesn't match CGC grain_week.
```

**Step 3: Write basis-scout, sentiment-scout, logistics-scout, macro-scout**

Follow the same pattern for the remaining 4 scouts. Key differences:

**basis-scout.md:**
- Queries: `grain_prices` (futures), `posted_prices` + `get_area_prices` RPC (elevator/crusher bids)
- Signals: Narrowing basis = bullish, widening = bearish, positive basis = capitalize immediately (Viking Basis Signal Matrix)
- Model: haiku

**sentiment-scout.md:**
- Queries: `grain_sentiment_votes` + `get_sentiment_overview` RPC (farmer votes), `cftc_cot_positions` + `get_cot_positioning` RPC (fund positioning), `x_market_signals` (X chatter)
- Signals: COT crowded long = squeeze risk, farmer consensus hauling = near-term bearish pressure
- Model: haiku

**logistics-scout.md:**
- Queries: `grain_monitor_snapshots` (port throughput, vessel queues, out-of-car time), `producer_car_allocations` (forward commitments), `get_weekly_terminal_flow` + `get_aggregate_terminal_flow` RPCs
- Signals: Vessel queue > 20 = congestion, OCT > 15% = rail constraint, producer cars rising = real demand (Rule 8)
- **MUST flag data freshness**: Grain Monitor uses shipping weeks which may lag CGC grain_week by 1-2 weeks
- Model: haiku

**macro-scout.md:**
- Queries: `usda_wasde_estimates` + `get_usda_wasde_context` RPC, `usda_crop_progress` + `get_usda_crop_conditions` RPC
- **ALSO uses xAI API**: `web_search` for breaking tariff/trade/weather news, `x_search` for market chatter
- Signals: WASDE revision down = bearish for competing origins, crop conditions deteriorating = bullish
- Model: **sonnet** (needs reasoning for web search synthesis, not just data extraction)

**Step 4: Commit all 6 scouts**

```bash
git add .claude/agents/supply-scout.md .claude/agents/demand-scout.md \
  .claude/agents/basis-scout.md .claude/agents/sentiment-scout.md \
  .claude/agents/logistics-scout.md .claude/agents/macro-scout.md
git commit -m "feat: 6 grain analysis scout agents (Track 41)"
```

---

### Task 2: Create the 3 Specialist Agent Definitions

**Files:**
- Create: `.claude/agents/export-analyst.md`
- Create: `.claude/agents/domestic-analyst.md`
- Create: `.claude/agents/risk-analyst.md`

**Step 1: Write export-analyst agent definition**

```markdown
---
name: export-analyst
description: >
  Export pipeline specialist. Synthesizes supply, demand, and logistics scout data
  into an export-focused thesis per grain. Applies Viking knowledge (L0 + L1 logistics/market_structure + L2 chunks).
  Answers: "Should farmers sell into the export pipeline this week?"
model: sonnet
---

# Export Analyst

You are an export pipeline specialist for the Bushel Board weekly grain analysis.

## Your Job

Read the 6 scout briefs provided to you. Synthesize an export-focused thesis for each grain. You answer one question for farmers: **"Should I sell into the export pipeline this week, or wait?"**

## Input

You will receive structured JSON briefs from 6 scouts:
- supply-scout: deliveries, stocks, absorption
- demand-scout: exports, crush, USDA sales
- basis-scout: prices, basis signals
- sentiment-scout: farmer votes, COT, X signals
- logistics-scout: terminal flow, ports, rail, producer cars
- macro-scout: USDA WASDE, crop progress, breaking news

## Viking Knowledge

[L0 core worldview will be injected here]
[L1 logistics_exports topic will be injected here]
[L1 market_structure topic will be injected here]

## L2 Deep Knowledge

For each grain, query `get_knowledge_context` via Supabase MCP with:
- query: "export pace interpretation [grain]"
- topics: ["logistics_exports", "market_structure"]
- limit: 3

Apply any retrieved book passages to your thesis.

## Analysis Rules

- Rule 3: Export lag + stock draw = logistics constraint, not weak demand. Check port capacity, vessel queue, OCT, producer cars before concluding weak demand.
- Rule 7: For this-week delivery decisions, weight logistics 70% / fundamentals 30%.
- Rule 8: If producer car allocations diverge from your thesis, flag it.

## Output Format

Return a JSON array, one per grain:
```json
[
  {
    "grain": "Canola",
    "stance_score": 25,
    "confidence": 70,
    "thesis": "Export pace lagging but terminal flow constrained. Vessel queue at 26 (above 20 avg). Logistics bottleneck, not demand weakness.",
    "bull_factors": ["Terminal receipts up 15% WoW", "USDA outstanding commitments rising"],
    "bear_factors": ["Exports -25% YoY cumulative", "Managed money reducing longs"],
    "recommendation": "HOLD 2 weeks. Watch vessel queue — if it clears below 20 and exports don't pick up, the logistics excuse expires.",
    "timeline": "2 weeks",
    "trigger": "Vessel queue clearing + Week 37 CGC export data"
  }
]
```

Every recommendation MUST include a timeline and trigger event (Rule 6).
```

**Step 2: Write domestic-analyst and risk-analyst**

Follow same pattern. Key differences:

**domestic-analyst.md:**
- Focus: Crush utilization, domestic disappearance, basis at local elevators, stock draws
- Viking L1: basis_pricing, storage_carry, grain_specifics
- Key rules: Rule 1 (stock direction trumps YTD position), Rule 2 (compute absorption rate)
- Question: "Is domestic demand strong enough to support holding?"
- Model: sonnet

**risk-analyst.md:**
- Focus: What could break the other analysts' theses. COT crowding, sentiment extremes, macro shocks.
- Viking L1: risk_management, hedging_contracts, market_structure
- Key rules: Rule 4 (2-of-3 week confirmation), Rule 5 (never publish contradictions), Rule 8 (producer car divergence)
- Question: "What's the risk to the consensus thesis?"
- Model: sonnet

**Step 3: Commit all 3 specialists**

```bash
git add .claude/agents/export-analyst.md .claude/agents/domestic-analyst.md \
  .claude/agents/risk-analyst.md
git commit -m "feat: 3 grain specialist agents with Viking L0/L1/L2 (Track 41)"
```

---

### Task 3: Write the Friday Swarm Scheduled Task

**Files:**
- Create: scheduled task `grain-desk-weekly` via `create_scheduled_task`

**Step 1: Write the swarm orchestration prompt**

This is the core — the prompt that runs every Friday. It IS the desk chief.

The prompt should:

1. Determine current crop_year and grain_week from Supabase
2. TeamCreate("grain-desk-wk{XX}")
3. Create task list for the team (16 grains × scout phase + specialist phase + write phase)
4. Spawn 6 scout agents with the grain list and crop_year
5. Wait for all scouts to report back via SendMessage
6. Compile scout briefs into a unified data package per grain
7. Spawn 3 specialist agents with scout briefs + Viking L1 context
8. Wait for all specialists to report back
9. For each grain: compare 3 specialist stance_scores
   - If divergence ≤15 pts: weighted average by confidence
   - If divergence >15 pts: run internal debate applying Rules 1-15
10. Produce final `market_analysis` JSON per grain
11. Query Supabase MCP `get_knowledge_context` for L2 chunks on any divergent grains
12. Upsert 16 rows to `market_analysis` via Supabase MCP `execute_sql`
13. Insert `score_trajectory` rows
14. Create a `pipeline_runs` entry with status
15. Trigger `generate-farm-summary` via `enqueue_internal_function` RPC
16. Trigger `validate-site-health`
17. TeamDelete
18. Report summary

**Step 2: Create the scheduled task**

```
create_scheduled_task({
  taskId: "grain-desk-weekly",
  cron: "47 18 * * 5",   // Friday 6:47 PM ET
  description: "Weekly grain analysis swarm — 6 scouts, 3 specialists, desk chief resolution",
  prompt: "[full orchestration prompt — see design doc Section 3]"
})
```

**Step 3: Commit a reference copy of the prompt**

Save the swarm prompt to `docs/reference/grain-desk-swarm-prompt.md` for version control (scheduled tasks are ephemeral).

```bash
git add docs/reference/grain-desk-swarm-prompt.md
git commit -m "feat: Friday swarm orchestration prompt (Track 41)"
```

---

### Task 4: Create Daily Data Collector Tasks (6 tasks)

**Files:**
- Create: 6 scheduled tasks via `create_scheduled_task`

**Step 1: USDA Crop Progress collector (Monday)**

```
create_scheduled_task({
  taskId: "collect-crop-progress",
  cron: "32 16 * * 1",
  description: "Fetch USDA NASS Crop Progress report (Apr-Nov only)",
  prompt: "Fetch this week's USDA Crop Progress report from nass.usda.gov. Extract planted%, emerged%, harvested%, condition ratings (VP/P/F/G/E), and good_excellent_pct for wheat, corn, soybeans, and spring wheat. Write to usda_crop_progress table via Supabase MCP. If outside Apr-Nov growing season, skip and log 'off-season'. Flag data freshness with week_ending date."
})
```

**Step 2: Grain Monitor collector (Wednesday)**

```
create_scheduled_task({
  taskId: "collect-grain-monitor",
  cron: "17 14 * * 3",
  description: "Fetch Government Grain Monitor data from grainmonitor.ca",
  prompt: "Fetch the latest Grain Monitor weekly performance update from grainmonitor.ca. Use Firecrawl or web fetch to scrape: port throughput (Vancouver, Thunder Bay, Churchill), vessel queue counts, out-of-car time percentages, storage capacity utilization. Write to grain_monitor_snapshots table via Supabase MCP. CRITICAL: Grain Monitor uses SHIPPING WEEKS which lag CGC grain weeks by 1-2 weeks. Record both the shipping week and the corresponding CGC grain_week in the data."
})
```

**Step 3: USDA Export Sales collector (Thursday AM)**

```
create_scheduled_task({
  taskId: "collect-export-sales",
  cron: "3 9 * * 4",
  description: "Fetch USDA weekly export sales report",
  prompt: "Fetch this week's USDA Export Sales report from fas.usda.gov. Extract net sales, exports, outstanding commitments for: ALL WHEAT, BARLEY, OATS, SOYBEANS, CORN. Map to CGC grain names. Write to usda_export_sales table via Supabase MCP. Compute cumulative_exports_mt and export_pace_pct vs marketing year target. Flag week_ending date."
})
```

**Step 4: CGC Import trigger (Thursday PM)**

```
create_scheduled_task({
  taskId: "collect-cgc",
  cron: "33 14 * * 4",
  description: "Trigger CGC weekly grain stats import",
  prompt: "Trigger the CGC weekly grain stats import by calling POST /api/pipeline/run with body {\"skip_import\": false, \"grains\": []}. Use the CRON_SECRET from environment. This imports the latest CGC CSV and validates it. Do NOT run the full grain analysis — that happens Friday. Just import + validate."
})
```

**Step 5: CFTC COT collector (Friday PM)**

```
create_scheduled_task({
  taskId: "collect-cftc-cot",
  cron: "7 16 * * 5",
  description: "Trigger CFTC COT import",
  prompt: "Trigger the CFTC COT import by calling the existing import-cftc-cot Edge Function via Supabase MCP enqueue_internal_function RPC. This imports Disaggregated COT positions for grains mapped to CGC grain names. Verify by checking cftc_cot_positions table for this week's report_date."
})
```

**Step 6: USDA WASDE collector (Friday, monthly only)**

```
create_scheduled_task({
  taskId: "collect-wasde",
  cron: "33 12 10-14 * 5",
  description: "Fetch USDA WASDE monthly report (10th-14th only)",
  prompt: "Fetch the latest USDA WASDE report. Extract ending stocks, stocks-to-use ratio, production, and export estimates for US and World wheat, corn, soybeans, and barley. Write to usda_wasde_estimates table via Supabase MCP. Track revision_direction (up/down/unchanged) vs prior month. Only runs on Fridays falling on 10th-14th of month (WASDE release window)."
})
```

**Step 7: Commit reference docs**

```bash
git add docs/reference/collector-task-configs.md
git commit -m "feat: 6 daily data collector scheduled tasks (Track 41)"
```

---

### Task 5: Add xAI API Key to .env.local

**Files:**
- Modify: `.env.local`

**Step 1: Get the xAI API key from Supabase secrets**

```bash
npx supabase secrets list --project-ref ibgsloyjxdopkvwqcqwh
```

Find `XAI_API_KEY` value.

**Step 2: Add to .env.local**

```
XAI_API_KEY=<value from Supabase>
```

**Step 3: Verify macro-scout can access it**

The macro-scout agent will need a helper script or tool to call the xAI Responses API with web_search. Create a minimal helper:

```typescript
// scripts/xai-search.ts
// Usage: npx tsx scripts/xai-search.ts "query" [--x-search]
```

This script calls xAI Responses API with web_search or x_search tool and returns results to stdout. The macro-scout agent can invoke it via Bash tool.

**Step 4: Commit**

```bash
git add scripts/xai-search.ts
git commit -m "feat: xAI search helper for macro-scout (Track 41)"
```

---

### Task 6: Integration Test — Run the Swarm for One Grain

**Step 1: Manual swarm test**

Before enabling the Friday schedule, test the swarm manually for a single grain:

```
Run the grain-desk-weekly prompt manually with grains=["Wheat"] only.
Verify:
- 6 scouts return structured JSON
- 3 specialists produce stance_scores
- Desk chief resolves to final stance
- market_analysis row is upserted
- score_trajectory row inserted
```

**Step 2: Compare against existing Grok analysis**

Pull the existing Grok Week 35 analysis for Wheat and compare:
- stance_score alignment (within 20 points?)
- key_signals overlap
- thesis quality (farmer-actionable?)

**Step 3: If quality is acceptable, test with all 16 grains**

Run full swarm manually. Verify:
- All 16 grains get scored
- pipeline_runs entry shows status "completed"
- Farm summaries triggered

**Step 4: Enable the Friday schedule**

Once verified, the `grain-desk-weekly` scheduled task runs automatically every Friday.

---

### Task 7: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — add agent desk to pipeline section
- Modify: `docs/plans/STATUS.md` — add Track 41
- Modify: `README.md` — update current status

**Step 1: Update CLAUDE.md intelligence pipeline section**

Add:
- Agent desk architecture (scouts → specialists → desk chief)
- New agent definitions list
- Scheduled task list
- Viking L0/L1/L2 usage per tier
- Note that Grok pipeline (`analyze-grain-market`) is retained as fallback

**Step 2: Update STATUS.md and README.md**

Add Track 41 entry with completion date.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md README.md
git commit -m "docs: Track 41 — Claude Agent Desk documented"
```

---

### Task Dependency Graph

```
Task 1 (6 Scout Agents)
  ↓
Task 2 (3 Specialist Agents) — depends on scout output format
  ↓
Task 3 (Friday Swarm Task) — depends on all agent definitions
  ↓
Task 6 (Integration Test) — depends on swarm task

Task 4 (Daily Collectors) — independent, can run in parallel with 1-3
Task 5 (xAI API Key) — independent, needed before Task 6

Task 7 (Documentation) — depends on all above
```

Tasks 1-3 are sequential (each builds on the previous).
Task 4 and 5 are independent — can run in parallel.
Task 6 is the test gate.
Task 7 is documentation.
