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
