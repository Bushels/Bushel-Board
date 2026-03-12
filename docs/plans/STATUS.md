# Bushel Board - Feature Status Tracker

Last updated: 2026-03-12

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

## Intelligence Pipeline

```text
import-cgc-weekly -> validate-import -> search-x-intelligence -> analyze-market-data -> generate-intelligence -> generate-farm-summary
```

- Trigger: Vercel cron -> `/api/cron/import-cgc`
- Schedule: Thursday afternoon after the CGC weekly release window
- Round 1: `analyze-market-data` — Step 3.5 Flash (free via OpenRouter) produces data-driven thesis, bull/bear cases, historical context
- Round 2: `generate-intelligence` — Grok reviews/challenges Step 3.5 Flash's thesis with X signals and farmer sentiment
- Models: `stepfun/step-3.5-flash:free` (OpenRouter) + `grok-4-1-fast-reasoning` (xAI)
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
