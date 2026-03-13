# Bushel Board - Feature Status Tracker

Last updated: 2026-03-13

## Feature Tracks

| # | Feature | Status | Date | Key Files |
|---|---------|--------|------|-----------|
| 1 | CGC Data Pipeline (import, backfill, Vercel cron ingress) | Complete | 2026-03-04 | `supabase/functions/import-cgc-weekly/`, `app/api/cron/import-cgc/route.ts`, `scripts/backfill.ts` |
| 2 | Database Schema & Migrations | Complete | 2026-03-04 | `supabase/migrations/` |
| 3 | Grain Dashboard (overview, detail, all grains) | Complete | 2026-03-05 | `app/(dashboard)/overview/`, `app/(dashboard)/grain/[slug]/` |
| 4 | Email/Password Auth + Middleware | Complete | 2026-03-11 | `app/(auth)/`, `components/auth/`, `lib/auth/auth-scene.ts`, `lib/supabase/`, `proxy.ts` |
| 5 | Supply/Disposition Balance Sheets | Complete | 2026-03-06 | `scripts/seed-supply-disposition.ts`, `lib/queries/intelligence.ts`, `lib/queries/supply-disposition.ts` |
| 6 | AI Grain Intelligence (Grok + x_search) | Complete | 2026-03-07 | `supabase/functions/generate-intelligence/`, `components/dashboard/thesis-banner.tsx` |
| 7 | Week-over-Week Comparison (composite metrics) | Complete | 2026-03-08 | `components/dashboard/wow-comparison.tsx`, `lib/queries/observations.ts` |
| 8 | X/Twitter Signal Feed + Relevance Voting | Complete | 2026-03-09 | `supabase/functions/search-x-intelligence/`, `components/dashboard/x-signal-feed.tsx` |
| 9 | Farm Summary (per-user AI narratives + percentiles) | Complete | 2026-03-11 | `supabase/functions/generate-farm-summary/`, `components/dashboard/farm-summary-card.tsx` |
| 10 | My Farm (crop plans, delivery tracking, inventory percentages) | Complete | 2026-03-11 | `app/(dashboard)/my-farm/`, `lib/queries/crop-plans.ts`, `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql` |
| 11 | Pipeline Velocity Chart (RPC-based) | Complete | 2026-03-10 | `components/dashboard/gamified-grain-chart.tsx`, `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` |
| 12 | Import Validation (post-import anomaly detection) | Complete | 2026-03-07 | `supabase/functions/validate-import/` |
| 13 | Prairie Landing Page | Complete | 2026-03-11 | `app/page.tsx`, `components/landing/landing-page.tsx`, `components/layout/logo.tsx` |
| 14 | Farmer Engagement & Input System | Complete | 2026-03-11 | `lib/auth/role-guard.ts`, `components/dashboard/sentiment-banner.tsx`, `components/dashboard/delivery-pace-card.tsx` |
| 15 | Farmer-First Onboarding, Unlock UX, and Nav Polish | Complete | 2026-03-11 | `lib/auth/post-auth-destination.ts`, `app/(dashboard)/my-farm/`, `components/layout/`, `components/auth/`, `components/dashboard/x-signal-feed.tsx` |
| 16 | UX Layout & Hierarchy Redesign (P1) | Complete | 2026-03-11 | `components/dashboard/section-header.tsx`, `components/dashboard/compact-signal-strip.tsx`, `components/dashboard/supply-pipeline.tsx`, `app/(dashboard)/overview/page.tsx`, `app/(dashboard)/grain/[slug]/page.tsx` |
| 17 | Dual-LLM Intelligence Pipeline (Step 3.5 Flash + Grok debate) | Complete | 2026-03-12 | `supabase/functions/analyze-market-data/`, `supabase/functions/_shared/commodity-knowledge.ts`, `components/dashboard/bull-bear-cards.tsx`, `lib/queries/intelligence.ts` |
| 18 | Supplementary Data Pipeline (Grain Monitor & Producer Cars) | Complete | 2026-03-13 | `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql`, `supabase/functions/analyze-market-data/`, `supabase/functions/generate-intelligence/`, `docs/reference/agent-debate-rules.md` |
| 19 | AI Thesis Debate Moderation & Agent Improvement | Complete | 2026-03-13 | `docs/lessons-learned/canola-week31-debate-moderation.md`, `docs/reference/agent-debate-rules.md` |
| 20 | CFTC COT Positioning Integration | Complete | 2026-03-13 | `supabase/migrations/20260313140000_create_cftc_cot_positions.sql`, `supabase/functions/import-cftc-cot/`, `app/api/cron/import-cftc-cot/route.ts`, `.claude/skills/cftc-cot/SKILL.md`, `docs/plans/2026-03-13-cftc-cot-integration-design.md` |

## Performance Fixes

### 2026-03-12 — v_grain_overview 945x Query Speedup

- The Overview page silently timed out because `v_grain_overview`'s `latest_week` CTE did a `GROUP BY` + `MAX()` full-table scan on 1M+ rows in `cgc_observations` (5.2s, exceeding PostgREST statement timeout).
- Added composite index `idx_cgc_obs_crop_year_grain_week (crop_year DESC, grain_week DESC)` and rewrote the CTE to `ORDER BY ... LIMIT 1`, enabling an Index Only Scan with 0 heap fetches.
- Query time: 5,200ms -> 5.5ms.

**Migration:** `supabase/migrations/20260312180000_optimize_v_grain_overview.sql`

## Recent UI Polish

### 2026-03-12 — Overview Community Pulse Rail Refresh

- Reworked the overview X/community preview from a plain horizontal strip into a designed signal rail with larger cards, stronger metadata hierarchy, edge fades, left/right controls, and a custom draggable scrubber.
- Replaced reliance on an undefined `scrollbar-hide` utility with an explicit cross-browser scrollbar-hiding utility in `app/globals.css`, then gave the overview rail its own visible scroll affordance.
- Verified the redesigned rail visually in-browser after implementation.

**Files modified:** `components/dashboard/compact-signal-strip.tsx`, `app/globals.css`

### 2026-03-12 — Chart Upgrades: Dual-Axis Deliveries (#1) & Storage WoW (#8)

- **#1 — Dual-axis delivery chart:** Added separate Y-axes for pipeline metrics (kt, left) and farmer deliveries (tonnes, right) so farmer-scale data is no longer invisible against pipeline volumes. Applied to `gamified-grain-chart.tsx` and `pace-chart.tsx`.
- **#8 — Storage chart total + WoW:** Added a total summary line with WoW badge and per-bar delta badges using prairie green/amber color coding.

**Files modified:** `components/dashboard/gamified-grain-chart.tsx`, `components/dashboard/pace-chart.tsx`, storage chart component

### 2026-03-12 — Data Enrichment: Backlog Items #5, #6, #9

- **#5 — % left in bin vs market:** Dual progress bars on My Farm crop cards comparing farmer remaining vs AAFC carry-out, using existing supply disposition query.
- **#6 — Net deliveries vs disappearance KPI:** New NetBalanceKpi component on grain detail showing producer deliveries vs domestic disappearance with bullish/bearish signal, reusing existing WoW data.
- **#9 — Customize X feed grain selection:** Grain filter pill toggles on CompactSignalStrip on Overview, pre-selects unlocked grains, client-side filtering.

### 2026-03-12 — X Thread Backlog Items #10, #11, #12, #13 (Analytics Foundation)

- **#11 — Sentiment shipping week fix:** Sentiment poll now uses `getCurrentGrainWeek()` (shipping week N+1) instead of `latestGrainWeek` (CGC data week N). Added clarifying subtitle.
- **#13 — AI temporal awareness:** All Edge Function intelligence prompts now include `TEMPORAL_AWARENESS` preamble distinguishing CGC data week N from farmer shipping week N+1. Prompt versions bumped to v3.
- **#10 — Save Community Pulse history:** New `sentiment_history` table + `snapshot_weekly_sentiment()` RPC. Archives weekly per-grain sentiment aggregates. RLS + SECURITY DEFINER hardened.
- **#12 — Daily sentiment rollups:** New `sentiment_daily_rollup` table + `snapshot_daily_sentiment()` RPC. Tracks intra-week sentiment trajectory with delta tracking.

**All 13 X Thread backlog items now complete.**

**Files created:** `supabase/migrations/20260312190000_sentiment_history.sql`, `20260312190100_sentiment_daily_rollup.sql`, `20260312190200_harden_sentiment_rpcs.sql`, `lib/queries/sentiment-history.ts`, `lib/queries/sentiment-daily.ts`
**Files modified:** `app/(dashboard)/grain/[slug]/page.tsx`, `components/dashboard/sentiment-poll.tsx`, `supabase/functions/_shared/market-intelligence-config.ts`, `supabase/functions/analyze-market-data/index.ts`, `supabase/functions/generate-intelligence/prompt-template.ts`, `supabase/functions/generate-farm-summary/index.ts`

### 2026-03-12 — X Thread Backlog Items #4 & #7

- **#4 — Overview section reorder:** Moved Market Intelligence above the Community Pulse X feed on the Overview page. Section order is now Snapshot → Intelligence → Community Pulse.
- **#7 — Province map labels:** Province map labels now show both metric tons and percentage of total (e.g., "AB\n4,200.0 kt (38.2%)").

**Files modified:** `app/(dashboard)/overview/page.tsx`, `components/dashboard/province-map.tsx`

### 2026-03-12 — Daylight Auth Contrast & Spacing Fix

- Fixed the top-third readability issue on the daylight auth shell by switching the hero copy from low-contrast white text to dark wheat text on the daytime variant.
- Strengthened the daylight badge, logo chip, and proof cards, added a subtle glass panel behind the hero copy, and increased top spacing so the badge no longer crowds the top-left brand chip on narrower viewports.
- Verified the updated `/signup` page visually in-browser after implementation.

**Files modified:** `components/auth/auth-shell.tsx`

### 2026-03-13 — Supplementary Data Pipeline: Grain Monitor & Producer Cars (Track 18)

**Status:** Complete for the production rollout — data layer, AI integration, Edge Function deployments, and debate moderation all done. UI display, automated scraping, and scripted repo seeding remain future work.

**What was implemented:**
- **New tables:**
  - `grain_monitor_snapshots` — Government Grain Monitor PDFs (port throughput, grain-in-storage, carryover trends). Week 30 sample data was inserted in production (lagged 1 week for Week 31 analysis).
  - `producer_car_allocations` — CGC Producer Car reports (forward-looking rail allocations). Week 33 sample data was inserted in production (2-week forward for Week 31 analysis).

- **New RPC:** `get_logistics_snapshot(crop_year, grain_week)` returns both tables as structured JSON.

- **AI integration:** Embedded logistics context into commodity knowledge (2 new sections: "Marketing Strategy & Contract Guidance" + "Logistics & Transport Awareness", ~1.5K tokens). Injected into Step 3.5 Flash + Grok prompts via updated `market-intelligence-config.ts` version bumps (v4 analyze/generate, v3 knowledge).

- **Data insertion:** Week 30 Grain Monitor + Week 33 Producer Car allocations for 2025-2026 were manually loaded in the live project. The repo currently ships schema plus source files, not an automated sample-data seed for those rows.

**Known issues (resolved):**
- ~~Grain name mismatch between `producer_car_allocations` ("Durum") and `grains` table ("Amber Durum").~~ Fixed via SQL UPDATE: "Durum" → "Amber Durum", "Chickpeas" → "Chick Peas". Buckwheat remains unmatched (minor grain, not in tracked 16).
- Producer car data is cumulative forward-looking, not weekly. RPC returns latest available week ≤ grain_week + 3 to prevent allocations from aging out mid-analysis.

**Edge Function deployments (2026-03-13):**
- `analyze-market-data` v10 — ACTIVE (logistics snapshot integration)
- `generate-intelligence` v31 — ACTIVE (logistics in Grok prompt)
- `generate-farm-summary` v21 — ACTIVE (updated shared config with v4 version bumps)

**What remains (future work):**
- Automated PDF scraping from Government Grain Monitor and CGC Producer Car reports
- Historical backfill of pre-2026 grain monitor and producer car data
- UI display: logistics tiles, supply-chain context cards, port/rail status summaries on Overview and Grain Detail pages
- Automated scheduler integration (daily/weekly pulls depending on source update cadence)

**Files modified:**
- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` (new)
- `supabase/functions/_shared/commodity-knowledge.ts`
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/analyze-market-data/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-intelligence/prompt-template.ts`

### 2026-03-13 — AI Thesis Debate Moderation & Agent Improvement Reference (Track 19)

**What:** Claude moderated the Canola Week 31 disagreement between Step 3.5 Flash (bearish) and Grok (bullish), identifying 3 specific logical errors in Step 3.5's analysis. Created reusable reference docs for continuous agent improvement.

**Key findings:**
- Step 3.5 conflated YTD exports (-28% YoY) with current-week flow — stocks drew -175.6 Kt while 455.6 Kt of deliveries arrived, meaning 631 Kt absorbed in one week
- The export lag reflects Vancouver port congestion (107% capacity, 26 vessels vs avg 20), not demand weakness
- Grok's bullish thesis was directionally correct but needed sharper specifics (timeline, triggers, risk)

**New reference docs:**
- `docs/lessons-learned/canola-week31-debate-moderation.md` — full evidence-based moderation with corrected thesis
- `docs/reference/agent-debate-rules.md` — 8 reusable rules (flow coherence, thesis quality) + grain-specific rules + validation checklist

## Intelligence Pipeline

```text
GET /api/cron/import-cgc -> validate-import -> search-x-intelligence -> analyze-market-data -> generate-intelligence -> generate-farm-summary -> validate-site-health
```

- Trigger: Vercel cron -> `/api/cron/import-cgc`
- Schedule: Thursday afternoon after the CGC weekly release window
- Round 1: `analyze-market-data` — Step 3.5 Flash (free via OpenRouter) produces data-driven thesis, bull/bear cases, historical context
- Round 2: `generate-intelligence` — Grok reviews/challenges Step 3.5 Flash's thesis with X signals and farmer sentiment
- Models: `stepfun/step-3.5-flash:free` (OpenRouter) + `grok-4-20` (xAI)
- Cost: about `$0.04` per weekly run (Step 3.5 Flash is free, only Grok costs)
- Batch sizes: 4 grains per invocation for analysis/intelligence, 50 users per invocation for farm summaries

## Database Tables

| Table | Rows (approx) | Purpose |
|-------|---------------|---------|
| `cgc_observations` | ~1.1M | Weekly grain statistics in long format (6 crop years: 2020-2026) |
| `grains` | 16 | Canadian grain types with slugs |
| `supply_disposition` | ~200 | AAFC balance sheet data per grain/year/source |
| `crop_plans` | varies | User crop plans with starting grain, live remaining inventory, and contract splits |
| `crop_plan_deliveries` | varies | Append-only farmer delivery ledger with idempotency keys and sale classification |
| `profiles` | varies | User profiles with farm metadata and role |
| `market_analysis` | ~16/week | Step 3.5 Flash data-driven thesis, bull/bear, historical context |
| `grain_intelligence` | ~16/week | AI-generated grain narratives and KPIs (Grok round 2) |
| `farm_summaries` | ~users/week | Per-user weekly AI farm summaries |
| `x_market_signals` | ~80/week | X/Twitter posts scored per grain/week |
| `validation_reports` | 1/import | Post-import anomaly detection results |
| `signal_feedback` | varies | Farmer relevance votes on X signals |
| `grain_sentiment_votes` | varies | Weekly haul/hold/neutral votes by grain |
| `cgc_imports` | 1/import | Audit log of data loads |
| `grain_monitor_snapshots` | 1/week | Government Grain Monitor: port throughput, vessel queues, OCT, storage capacity |
| `producer_car_allocations` | ~11/week | CGC Producer Cars: forward-looking rail allocations by grain/province/destination |
| `signal_scan_log` | ~3/day | Scan observability: mode, grains scanned, signals found, duration |
| `sentiment_history` | ~16/week | Archived weekly per-grain sentiment aggregates |
| `sentiment_daily_rollup` | ~16/day | Intra-week daily sentiment trajectory with delta tracking |
| `health_checks` | 1/pipeline | Post-pipeline site health validation results |
| `cftc_cot_positions` | ~9/week | CFTC Disaggregated COT: trader positioning per commodity per week, mapped to CGC grains |

## Key Views & RPC Functions

| Name | Type | Purpose |
|------|------|---------|
| `v_grain_yoy_comparison` | View | YoY metrics with FULL OUTER JOIN of Primary + Process + Terminal |
| `v_supply_pipeline` | View | Canonical AAFC balance sheet for the supply pipeline component |
| `v_supply_disposition_current` | View | Canonical latest supply-disposition row per grain/year |
| `v_signal_relevance_scores` | View | Blended relevance: 50% recency-adjusted AI + 40% farmer + 10% bonuses |
| `v_latest_import` | View | Data freshness check |
| `get_pipeline_velocity()` | RPC | Five pipeline metrics server-side, bypassing PostgREST row limits |
| `get_signals_with_feedback()` | RPC | X signal feed with current-user vote state |
| `get_signals_for_intelligence()` | RPC | Service-only X signals for intelligence generation |
| `calculate_delivery_percentiles()` | RPC | Percentile ranking over priced-progress pace by grain |
| `get_sentiment_overview()` | RPC | Per-grain sentiment aggregates for the overview banner |
| `get_delivery_analytics()` | RPC | Anonymized delivery + marketing-position stats with privacy threshold (>=5 farmers) |
| `get_historical_average()` | RPC | 5-year historical average/min/max/stddev for any grain/metric/worksheet |
| `get_seasonal_pattern()` | RPC | Weekly seasonal aggregates across multiple crop years |
| `get_week_percentile()` | RPC | Where current value sits in 5-year historical range |
| `get_logistics_snapshot()` | RPC | Grain Monitor + Producer Car data as structured JSON for Edge Functions |
| `snapshot_weekly_sentiment()` | RPC | Archives weekly per-grain sentiment aggregates to `sentiment_history` |
| `snapshot_daily_sentiment()` | RPC | Snapshots daily sentiment with delta tracking to `sentiment_daily_rollup` |
| `get_cot_positioning()` | RPC | Managed money and commercial net positions with spec/commercial divergence flag |
