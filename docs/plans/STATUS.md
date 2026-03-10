# Bushel Board — Feature Status Tracker

Last updated: 2026-03-10

## Feature Tracks

| # | Feature | Status | Date | Key Files |
|---|---------|--------|------|-----------|
| 1 | CGC Data Pipeline (import, backfill, pg_cron) | ✅ Complete | 2026-03-04 | `supabase/functions/import-cgc-weekly/`, `scripts/backfill.ts` |
| 2 | Database Schema & Migrations | ✅ Complete | 2026-03-04 | `supabase/migrations/` |
| 3 | Grain Dashboard (overview, detail, all grains) | ✅ Complete | 2026-03-05 | `app/(dashboard)/overview/`, `app/(dashboard)/grain/[slug]/` |
| 4 | Email/Password Auth + Middleware | ✅ Complete | 2026-03-05 | `app/(auth)/`, `lib/supabase/`, `middleware.ts` |
| 5 | Supply/Disposition Balance Sheets | ✅ Complete | 2026-03-06 | `scripts/seed-supply-disposition.ts`, `lib/queries/intelligence.ts` |
| 6 | AI Grain Intelligence (Grok + x_search) | ✅ Complete | 2026-03-07 | `supabase/functions/generate-intelligence/`, `components/dashboard/thesis-banner.tsx` |
| 7 | Week-over-Week Comparison (composite metrics) | ✅ Complete | 2026-03-08 | `components/dashboard/wow-comparison.tsx`, `lib/queries/observations.ts` |
| 8 | X/Twitter Signal Feed + Relevance Voting | ✅ Complete | 2026-03-09 | `supabase/functions/search-x-intelligence/`, `components/dashboard/x-signal-feed.tsx` |
| 9 | Farm Summary (per-user AI narratives + percentiles) | ✅ Complete | 2026-03-09 | `supabase/functions/generate-farm-summary/`, `components/dashboard/farm-summary-card.tsx` |
| 10 | My Farm (crop plans, delivery tracking) | ✅ Complete | 2026-03-08 | `app/(dashboard)/my-farm/`, `lib/queries/intelligence.ts` |
| 11 | Pipeline Velocity Chart (RPC-based) | ✅ Complete | 2026-03-10 | `components/dashboard/gamified-grain-chart.tsx`, `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` |
| 12 | Import Validation (post-import anomaly detection) | ✅ Complete | 2026-03-07 | `supabase/functions/validate-import/` |
| 13 | Prairie Landing Page | 🔧 In Progress | 2026-03-10 | `app/page.tsx` |

## Intelligence Pipeline

```
import-cgc-weekly → validate-import → search-x-intelligence → generate-intelligence → generate-farm-summary
```

- **Trigger:** pg_cron every Thursday 1:30pm MST
- **Model:** grok-4-1-fast-reasoning (xAI)
- **Cost:** ~$0.04/weekly run
- **Batch sizes:** 4 grains/invocation (search + intelligence), 50 users/invocation (farm summary)

## Database Tables

| Table | Rows (approx) | Purpose |
|-------|---------------|---------|
| `cgc_observations` | 122k+ | Weekly grain statistics (long format) |
| `grains` | 16 | Canadian grain types with slugs |
| `supply_disposition` | ~200 | AAFC balance sheet data per grain/year |
| `crop_plans` | varies | User crop plans with delivery logs |
| `profiles` | varies | User profiles (farm name, province) |
| `grain_intelligence` | ~16/week | AI-generated grain market narratives + KPIs |
| `farm_summaries` | ~users/week | Per-user weekly AI farm summaries |
| `x_market_signals` | ~80/week | X/Twitter posts scored per grain/week |
| `validation_reports` | 1/import | Post-import anomaly detection results |
| `signal_feedback` | varies | Farmer relevance votes on X signals |
| `cgc_imports` | 1/import | Audit log of data loads |

## Key Views & RPC Functions

| Name | Type | Purpose |
|------|------|---------|
| `v_grain_yoy_comparison` | View | YoY metrics with FULL OUTER JOIN of Primary + Process + Terminal |
| `v_supply_pipeline` | View | AAFC balance sheet for SupplyPipeline component |
| `v_signal_relevance_scores` | View | Blended relevance: 60% AI + 40% farmer consensus |
| `v_latest_import` | View | Data freshness check |
| `get_pipeline_velocity()` | RPC | 5 pipeline metrics server-side (bypasses PostgREST 1000-row limit) |
| `get_signals_with_feedback()` | RPC | X signal feed with user votes |
| `get_signals_for_intelligence()` | RPC | Edge Function intelligence generation |
| `calculate_delivery_percentiles()` | RPC | PERCENT_RANK over user deliveries by grain |
