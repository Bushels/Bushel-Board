---
name: cgc-import
description: >
  Trigger, monitor, and validate the weekly CGC grain data import pipeline for Bushel Board.
  Use when the user says: 'run the import', 'trigger the CGC import', 'check import status',
  'import this week's data', 'backfill grain data', 'the import failed', 'check data freshness',
  'validate the import', or references grain week data being missing or stale.
  Do NOT use for: general Supabase queries (use supabase plugin directly), deploying Edge Functions
  (use supabase-deploy skill), or generating intelligence narratives (those chain automatically).
---

# CGC Import Skill — Bushel Board

Manage the Canadian Grain Commission weekly data import pipeline end-to-end.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Canonical production pipeline:** Vercel cron `GET /api/cron/import-cgc` → `validate-import` → `search-x-intelligence` → `analyze-market-data` → `generate-intelligence` → `generate-farm-summary` → `validate-site-health`
- **Legacy fallback:** `import-cgc-weekly` still exists, but it is internal-only and not the public ingress
- **Cron:** Vercel cron every Thursday at 20:00 UTC (1pm MST)
- **Source:** `https://www.grainscanada.gc.ca/en/grain-statistics/grain-statistics-weekly/` (week CSV files)
- **Local backfill script:** `npm run backfill -- --csv "../Bushel Board/data/gsw-shg-en.csv"`

## Monitoring Queries

Run these via the Supabase MCP (`execute_sql` with project_id `ibgsloyjxdopkvwqcqwh`):

```sql
-- Latest import status
SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;

-- Data freshness
SELECT * FROM v_latest_import;

-- Cron job health
SELECT jobname, schedule, active, jobid FROM cron.job WHERE jobname = 'cgc-weekly-import';

-- Validation reports
SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 5;

-- X market signals
SELECT grain, grain_week, COUNT(*) FROM x_market_signals GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 20;

-- pg_net trigger responses
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
```

## Trigger a Manual Import

### Via Vercel cron proxy (preferred — handles CGC firewall)
```bash
curl https://bushel-board-app.vercel.app/api/cron/import-cgc \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Via local Next.js route
```bash
curl http://localhost:3000/api/cron/import-cgc \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Via legacy internal fallback (only if the route is unavailable)
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/import-cgc-weekly" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"week": 30, "crop_year": "2025-26"}'
```

### Local backfill (historical data)
```bash
npm run backfill -- --csv "../Bushel Board/data/gsw-shg-en.csv"
```

## Workflow

### 1. Check current state
- Run `v_latest_import` to see the most recent successful import week
- Compare against current grain week (crop year starts Aug 1, week 1 = first week of August)
- Check `cgc_imports` for any `failed` or `partial` status entries

### 2. Diagnose failures
- `status: "failed"` → check `error_message` column; usually CGC HTTP error or network timeout
- `status: "partial"` → some rows skipped (duplicates); generally safe
- `rows_inserted: 0` → CSV may not be published yet (Thursday afternoon MST)
- Check `validation_reports` for post-import anomalies flagged by `validate-import`

### 3. Trigger / re-trigger
- Use the Vercel route for real imports in production or local dev
- Use `import-cgc-weekly` only as an internal fallback when the route is unavailable

### 4. Verify intelligence chain
After a successful import, check that the chain fired:
```sql
SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 10;
SELECT user_id, grain_week, generated_at FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;
```

## Manual Chain Invocation (shared-secret auth)

If the chain breaks mid-pipeline, invoke individual functions directly with the internal secret:
```bash
# Invoke any Edge Function manually (replace FUNCTION_NAME)
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/FUNCTION_NAME" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"crop_year": "2025-26", "grain_week": 30}'

# generate-intelligence with specific grains
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/generate-intelligence" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"crop_year": "2025-26", "grain_week": 30, "grains": ["Wheat","Canola","Barley","Oats"]}'
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| HTTP 403 from CGC | Supabase IP blocked by CGC | Use Vercel cron proxy instead |
| `rows_inserted: 0` | CSV not yet published | Wait until Thursday afternoon MST |
| Internal calls return 401 | Missing or wrong `BUSHEL_INTERNAL_FUNCTION_SECRET` | Use `x-bushel-internal-secret` for direct function calls; never use anon JWTs for internal chaining |
| Intelligence not generated | Chain trigger failed silently (401 was caught but not re-thrown) | Check `net._http_response` for errors; invoke each step manually via curl |
| Canola deliveries undercounted | Intelligence only used Primary Elevator data | Fixed: `v_grain_yoy_comparison` now uses FULL OUTER JOIN of Primary + Process. Grain detail page overrides AI KPIs with `v_grain_overview`. |
| Phantom migration | DDL tracked in `schema_migrations` but table never created | Verify table exists with `\dt tablename`; apply DDL manually if missing |
| Duplicate week import | Already imported | Safe to ignore — upsert handles it |
| `validate-import` flagged anomaly | YoY variance >50% or missing grains | Review validation_reports, may be normal for new crop year |
