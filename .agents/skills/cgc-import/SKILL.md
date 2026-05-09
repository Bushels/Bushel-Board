---
name: cgc-import
description: >
  Trigger, monitor, and validate the weekly CGC grain data import for Bushel Board.
  Use when the user says: 'run the import', 'trigger the CGC import', 'check import status',
  'import this week's data', 'backfill grain data', 'the import failed', 'check data freshness',
  'validate the import', or references grain week data being missing or stale.
  Do NOT use for: general Supabase queries (use Supabase directly), deploying Edge Functions
  (use supabase-deploy skill), or generating intelligence narratives.
---

# CGC Import Skill - Bushel Board

Manage the Canadian Grain Commission weekly source-data import end-to-end.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Canonical import:** `npm run import-cgc` / `scripts/import-cgc-weekly-codex.mjs`
- **Source:** `https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/`
- **Import path:** Local Codex fetches the CGC CSV, posts `csv_data` to `import-cgc-weekly`, verifies `cgc_imports` + `cgc_observations`, then writes collector heartbeats.
- **Schedule:** Codex automation `cgc-weekly-grain-stats-import`, Thursday 1:35 PM MT.
- **Not valid:** `/api/pipeline/run` is tombstoned as `grok_workflow_deprecated`; `/api/cron/import-cgc` is paused/non-active.
- **Grok analysis:** Retired. Do not call `search-x-intelligence`, `analyze-market-data`, `analyze-grain-market`, `generate-intelligence`, or `generate-farm-summary`.
- **Local backfill script:** `npm run backfill -- --csv "data/CGC Weekly/gsw-shg-en.csv"`

## Monitoring Queries

Run these via Supabase:

```sql
SELECT MAX(grain_week) AS latest_week
FROM cgc_observations
WHERE crop_year = '2025-2026';

SELECT imported_at, grain_week, status, rows_inserted, error_message
FROM cgc_imports
ORDER BY imported_at DESC
LIMIT 5;

SELECT grain, grain_week, scan_type, model_source, created_at
FROM score_trajectory
WHERE scan_type = 'collector_cgc'
ORDER BY created_at DESC
LIMIT 20;
```

## Trigger a Manual Import

```bash
npm run import-cgc
```

Dry run:

```bash
npm run import-cgc:dry
```

Historical local backfill:

```bash
npm run backfill -- --csv "data/CGC Weekly/gsw-shg-en.csv"
```

## Workflow

1. Check `cgc_imports` and `MAX(grain_week)` in `cgc_observations`.
2. Run `npm run import-cgc`.
3. Confirm the latest `cgc_imports` row is `success` or explain `failed` / `partial`.
4. Confirm `MAX(grain_week)` moved forward when a new CGC week was published.
5. Confirm `collector_cgc` heartbeats were written for CAD grains.

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `secret_missing` | Local env lacks the internal secret | Load `.env.local`; do not use anon JWTs |
| `rows_inserted: 0` | CSV not yet published or already current | Report as already-current; do not retry in the same run |
| HTTP 410 from `/api/pipeline/run` | Old Grok orchestrator was called | Stop and use `npm run import-cgc` |
| Internal calls return 401 | Missing or wrong `BUSHEL_INTERNAL_FUNCTION_SECRET` | Use the local Codex importer; it handles the internal auth path |
| Canola deliveries undercounted | Formula omitted BC Primary or Producer Cars | Use the canonical country-delivery path: `Primary (AB/SK/MB/BC) + Process + Producer Cars`, with `grade=''` on aggregate rows |
| Duplicate week import | Already imported | Safe to ignore - upsert handles it |
| `validate-import` flagged anomaly | YoY variance >50% or missing grains | Review validation reports; may be normal for new crop year |
