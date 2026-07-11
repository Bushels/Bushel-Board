---
name: grain-report
description: >
  Query and display Bushel Board market analysis, farm summaries, X signals, and source data.
  Use when the user says: 'show me the grain report', 'what's the latest intelligence',
  'grain summary', 'farm summary', 'what does the AI say about wheat', 'show intelligence for canola',
  'market signals', 'weekly report', 'what grains have data', 'check the intelligence tables',
  'X signals', 'sentiment data', 'supply pipeline', 'YoY comparison'.
  Do NOT use for: triggering a new import (use cgc-import skill), deploying functions
  (use supabase-deploy skill), or restarting retired Grok writers.
---

# Grain Report Skill - Bushel Board

Query published market analysis and source data for Bushel Board grains.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Published thesis table:** `market_analysis`
- **Legacy table:** `grain_intelligence` is a retired Grok archive; do not use for live reports.
- **Other key tables:** `farm_summaries`, `cgc_observations`, `x_market_signals`, `grain_sentiment_votes`
- **Key views/RPCs:** `v_grain_overview`, `v_supply_pipeline`, `v_latest_import`, `get_pipeline_velocity()`

## Core Queries

### Latest published market analysis
```sql
SELECT grain, grain_week, crop_year, initial_thesis, stance_score,
       data_confidence, confidence_score, model_used, generated_at
FROM market_analysis
ORDER BY generated_at DESC
LIMIT 16;
```

### Analysis for a specific grain
```sql
SELECT grain, grain_week, initial_thesis, bull_case, bear_case,
       final_assessment, stance_score, generated_at
FROM market_analysis
WHERE grain ILIKE '%canola%'
ORDER BY generated_at DESC
LIMIT 3;
```

### Farm summaries
```sql
SELECT user_id, grain_week, crop_year, summary_text, percentiles, generated_at
FROM farm_summaries
ORDER BY generated_at DESC
LIMIT 10;
```

### CGC freshness
```sql
SELECT MAX(grain_week) AS latest_week
FROM cgc_observations
WHERE crop_year = '2025-2026';

SELECT imported_at, grain_week, status, rows_inserted, error_message
FROM cgc_imports
ORDER BY imported_at DESC
LIMIT 5;
```

### X/Twitter market signals
```sql
SELECT grain, grain_week, post_summary, sentiment, category,
       relevance_score, source, searched_at
FROM x_market_signals
ORDER BY searched_at DESC
LIMIT 20;
```

## Workflow

1. Check CGC freshness with `cgc_imports` / `MAX(grain_week)`.
2. Pull `market_analysis` for the latest published thesis.
3. Pull `x_market_signals` only as supporting signal evidence.
4. Treat `grain_intelligence` as historical archive only.
5. Present the report as a compact markdown table or narrative.

## Wheat Bull/Bear Relationship Loop

When the task is the Wheat thesis board or a Wheat bullish/bearish rating, use the current loop contract instead of a generic grain report:

```text
official data rows -> lane score -> price confirmation -> watch leads -> one Wheat read
```

Use `docs/plans/2026-06-23-wheat-metric-relationship-loop.md` as the active handoff. Current loop findings:

- Official rows and price context support a lean bear / balanced-to-bear read until U.S. crop stress is confirmed by price, demand, or a fresher supply shock.
- Wheat price scoring now uses a three-contract basket across Spring Wheat, HRW, and SRW when the packet carries multiple Wheat-class futures. Basket agreement sets direction; contract disagreement lowers confidence. Focused proof: `npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node`.
- Wheat weekly-packet headline scores now come from the deterministic rating scorecard when a Wheat scorecard is populated; driver counts remain explanation copy, not the Wheat headline score. Daily overlays remain the only current-day override.
- `/thesis` now has a first reconciliation judge, relationship-spiderweb ring view, and Spring Wheat / HRW / SRW price-basket proof strip. These are visual/explanation layers over the existing scorecard, not new score authority.
- Positioning is a timing/crowding modifier, not a primary direction creator.
- Grok/Hermes X pulse is watch-only unless an accepted signal is tied back to official or admitted market data.
- The farmer-facing board should show one Wheat read; Canada and the U.S. are evidence geography, not separate product lanes.

Recommended v1 weights for the next scoring repair:

| Lane | Weight | Role |
| --- | ---: | --- |
| Supply/weather | 30% | Production and balance-sheet driver |
| Demand/export flow | 25% | Disappearance confirmation |
| Movement/logistics | 15% | Execution and basis pressure |
| Price/FX/basis | 15% | Market confirmation |
| Positioning/timing | 10% | Crowding and liquidation context |
| Watch leads | 0% | Review priority only |

Relationship visual status: the first Wheat pressure map model/panel exists on `/thesis`; the next visual pass should make the distance/weight metaphor more obvious, with the Wheat read in the center, high-authority score lanes close, and watch/context lanes farther away.

## Crop Progress And Wheat Thesis Overlay

When the user asks how Prairie crop progress changes the Wheat bull/bear thesis:

1. Inspect or run the weekly package with `npm run report:prairie-crop-progress` and read `output/prairie-crop-progress/latest/summary.json`.
2. Compare the crop-progress facts against the latest Wheat `market_analysis`; do not overwrite, publish, or refresh thesis rows from this skill.
3. Treat crop-progress data as a bounded weather/supply/quality pressure overlay:
   - Manitoba crop reports may provide seeding, flooding, disease, and field-access evidence, but the current report format does not provide structured Excellent/Good/Fair/Poor crop-quality buckets.
   - Saskatchewan provides full Excellent/Good/Fair/Poor/Very Poor regional crop-condition tables; if averaged, label it as a simple regional average unless acreage weighting is implemented.
   - Alberta currently publishes Good-to-Excellent condition only; do not split it into Excellent/Good/Fair/Poor without a source table.
4. For Wheat specifically, classify prairie crop-progress pressure before changing the read:
   - Bullish risk: Manitoba flooding/unseeded exposure, Saskatchewan development lag or surplus moisture, weak Alberta/North West crop condition.
   - Bearish/neutral offset: Saskatchewan spring wheat mostly seeded and mostly Good/Excellent.
5. Use "acre-equivalent exposure" for derived estimates. Do not write "lost acres", "damaged acres", or "affected acres" unless the province publishes that number.

## Hard Stop

Do not manually trigger `generate-intelligence`, `analyze-grain-market`, or
`generate-farm-summary`. Those Grok/xAI writers are retired.

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `market_analysis` is stale | Claude/Codex desk has not published | Report stale analysis; do not call Grok |
| CGC week is stale | Import did not run or CGC had not published | Use cgc-import skill |
| `farm_summaries` empty | Summary writer not yet configured for current workflow | Report gap; do not call `generate-farm-summary` |
| X signals not populating | Direct X API v2 lane not enabled/current | Report gap; do not use Grok `x_search` |
| YoY view shows nulls | Prior crop year data not imported | Backfill with `npm run backfill` |
