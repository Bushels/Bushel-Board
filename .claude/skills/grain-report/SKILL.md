---
name: grain-report
description: >
  Query and display Bushel Board grain intelligence, farm summaries, and market data.
  Use when the user says: 'show me the grain report', 'what's the latest intelligence',
  'grain summary', 'farm summary', 'what does the AI say about wheat', 'show intelligence for canola',
  'market signals', 'weekly report', 'what grains have data', 'check the intelligence tables',
  'X signals', 'sentiment data', 'supply pipeline', 'YoY comparison'.
  Do NOT use for: triggering a new import (use cgc-import skill), deploying functions
  (use supabase-deploy skill), or editing grain components (use standard file editing).
---

# Grain Report Skill — Bushel Board

Query intelligence tables and surface market analysis for Bushel Board grains.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Key tables:** `grain_intelligence`, `farm_summaries`, `grain_observations`, `grain_sentiment`
- **Key views:** `v_grain_yoy_comparison`, `v_supply_pipeline`, `v_latest_import`
- **Intelligence chain:** runs weekly after each CGC import (Thursday ~8pm UTC)
- **Run these via Supabase MCP** (`execute_sql` with project_id `ibgsloyjxdopkvwqcqwh`)

## Core Queries

### Latest intelligence per grain
```sql
SELECT grain, grain_week, crop_year, thesis, market_sentiment, key_drivers,
       price_outlook, generated_at, model_used
FROM grain_intelligence
ORDER BY generated_at DESC
LIMIT 16;
```

### Intelligence for a specific grain
```sql
SELECT * FROM grain_intelligence
WHERE grain ILIKE '%canola%'
ORDER BY generated_at DESC
LIMIT 3;
```

### Farm summaries (all users, latest week)
```sql
SELECT user_id, grain_week, crop_year, narrative, percentile_badges,
       generated_at
FROM farm_summaries
ORDER BY generated_at DESC
LIMIT 10;
```

### Supply pipeline (AAFC balance sheet view)
```sql
SELECT * FROM v_supply_pipeline
ORDER BY grain, metric;
```

### YoY comparison
```sql
SELECT grain, metric, current_value, prior_year_value, yoy_change_pct
FROM v_grain_yoy_comparison
ORDER BY ABS(yoy_change_pct) DESC NULLS LAST
LIMIT 20;
```

### X/Twitter market signals
```sql
SELECT grain, signal_type, signal_text, confidence_score,
       x_post_count, sentiment_score, collected_at
FROM x_market_signals
ORDER BY collected_at DESC
LIMIT 20;
```

### Sentiment poll results
```sql
SELECT grain, grain_week, sentiment, vote_count, created_at
FROM grain_sentiment
ORDER BY created_at DESC
LIMIT 20;
```

### Community stats
```sql
SELECT * FROM community_stats
ORDER BY grain;
```

### Latest import freshness
```sql
SELECT * FROM v_latest_import;
```

## Workflow

### Generate a weekly summary report
1. Check data freshness with `v_latest_import`
2. Pull `grain_intelligence` for all grains (latest week)
3. Check `x_market_signals` for top sentiment signals
4. Pull `farm_summaries` count to confirm chain completed
5. Present as a markdown table or narrative

### Check if intelligence is stale
```sql
SELECT grain, grain_week, generated_at,
       NOW() - generated_at AS age
FROM grain_intelligence
ORDER BY generated_at DESC
LIMIT 5;
```
If `age > 7 days`, the intelligence chain likely didn't fire — use cgc-import skill to diagnose.

### Manually trigger intelligence regeneration
```bash
npx supabase functions invoke generate-intelligence \
  --project-ref ibgsloyjxdopkvwqcqwh \
  --body '{"grain_week": 30, "crop_year": "2025-26"}'
```

## Examples

- **User:** "What does the AI say about canola this week?"
  → Query `grain_intelligence WHERE grain ILIKE '%canola%'`, return thesis + key_drivers + price_outlook

- **User:** "Show me the weekly grain report"
  → Pull latest `grain_intelligence` for all grains, format as a markdown summary table

- **User:** "Are there any strong X signals this week?"
  → Query `x_market_signals ORDER BY confidence_score DESC LIMIT 10`

## Available Grains
CWRS (red spring wheat), CWAD (durum), CWES (extra strong), CPS (soft red), Canada Western Barley,
Canada Prairie Spring wheat, Oats, Flaxseed, Canola, Peas, Lentils, Mustard, Soybeans,
Sunflower, Corn, Mixed Grains

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `grain_intelligence` is empty | Import or chain hasn't run | Check `v_latest_import`; use cgc-import skill |
| Intelligence is 7+ days old | Chain failed silently | Check `net._http_response` for function errors |
| `farm_summaries` empty | No users with deliveries logged | Expected in early MVP; check `crop_plans_deliveries` |
| X signals not populating | `XAI_API_KEY` missing or quota hit | Check Supabase secrets; verify xAI billing |
| YoY view shows nulls | Prior crop year data not imported | Backfill with `npm run backfill` |
| Sentiment votes all zero | Sentiment poll feature is new | Normal for first week of rollout |
