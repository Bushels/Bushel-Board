# CGC Data Pipeline - Architecture & Operations

## Overview

Bushel Board imports Canadian Grain Commission weekly data through a Vercel cron ingress and a chained set of Supabase Edge Functions.

The production pipeline is now:

1. Vercel cron calls `/api/cron/import-cgc`
2. The route fetches the CGC CSV directly from `grainscanada.gc.ca`
3. The route forwards the payload to `import-cgc-weekly`
4. Internal Edge Functions chain through validation, X search, intelligence generation, and farm summaries

The old Supabase `pg_cron` job has been unscheduled and is no longer the canonical trigger path.

## Data Flow

```text
  Vercel Cron
       |
       | GET /api/cron/import-cgc
       v
  Next.js route
       |
       | fetch CSV from CGC
       v
  import-cgc-weekly
       |
       v
  validate-import
       |
       v
  search-x-intelligence
       |
       v
  generate-intelligence
       |
       v
  generate-farm-summary
```

## Auth Model

### Public ingress

- Only the Vercel cron route is public.
- The route requires `Authorization: Bearer $CRON_SECRET`.

### Internal function chain

- `import-cgc-weekly`
- `validate-import`
- `search-x-intelligence`
- `generate-intelligence`
- `generate-farm-summary`

All five functions now:

- set `verify_jwt = false` in `supabase/config.toml`
- require `x-bushel-internal-secret`
- reject requests that do not provide the exact `BUSHEL_INTERNAL_FUNCTION_SECRET`

This secret must be identical in:

- Supabase Edge Function secrets
- Vercel environment variables

### Why this replaced anon-JWT chaining

Using the public anon JWT for function-to-function calls made the chain publicly triggerable by anyone who knew the function URL. The new secret-based contract makes the pipeline private again while still allowing internal HTTP chaining.

## Scheduling

### Canonical scheduler

- Vercel cron
- Route: `/api/cron/import-cgc`
- Secret: `CRON_SECRET`

### Legacy scheduler

- `pg_cron` job name: `cgc-weekly-import`
- Status: unscheduled by migration `20260311110000_security_and_workflow_hardening.sql`

If this job reappears, treat it as configuration drift.

## Key Tables and Views

### Raw and audit data

- `cgc_observations`
- `cgc_imports`
- `validation_reports`

### Intelligence data

- `x_market_signals`
- `signal_feedback`
- `grain_intelligence`
- `farm_summaries`
- `crop_plan_deliveries`

### Derived views and RPCs

- `v_grain_yoy_comparison`
- `v_supply_pipeline`
- `v_supply_disposition_current`
- `v_signal_relevance_scores`
- `get_pipeline_velocity(p_grain, p_crop_year)`
- `get_signals_with_feedback(p_grain, p_crop_year, p_grain_week)`
- `get_signals_for_intelligence(p_grain, p_crop_year, p_grain_week)`
- `calculate_delivery_percentiles(p_crop_year)`
- `get_delivery_analytics(p_crop_year, p_grain)`

## Operational Guardrails

- Never use `SUPABASE_ANON_KEY` or anon JWTs for internal function chaining.
- Never trust UI-only role gating for farmer-only actions.
- User-scoped RPCs must derive identity from `auth.uid()`, not caller-supplied IDs.
- Service-only RPCs must revoke public execute permissions and grant `service_role` explicitly.
- Delivery pace must use `delivered + remaining_to_sell` as the denominator when the stored field represents current remaining inventory.
- `v_supply_pipeline` must return one canonical row per `grain_slug, crop_year`.

## Monitoring

### Vercel

- Confirm cron route deployments in Vercel production logs
- Confirm `BUSHEL_INTERNAL_FUNCTION_SECRET` exists in production
- Confirm `CRON_SECRET` exists in production

### Supabase

```sql
SELECT * FROM cgc_imports ORDER BY imported_at DESC LIMIT 5;
SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 5;
SELECT grain, grain_week, generated_at FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;
SELECT user_id, grain_week, generated_at FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;
SELECT grain, grain_week, COUNT(*) FROM x_market_signals GROUP BY grain, grain_week ORDER BY grain_week DESC LIMIT 20;
```

### Drift checks

```sql
SELECT * FROM cron.job WHERE jobname = 'cgc-weekly-import';
```

Expected result: zero rows.

## Troubleshooting

### Cron route fails with 401

- Check `CRON_SECRET` on Vercel
- Check the request includes `Authorization: Bearer ...`

### Edge Function returns 401

- Check `BUSHEL_INTERNAL_FUNCTION_SECRET` in Supabase secrets
- Check the same secret exists in Vercel
- Check the request sends `x-bushel-internal-secret`

### Intelligence chain stops after import

- Check `validate-import` logs first
- Then check `search-x-intelligence`, `generate-intelligence`, and `generate-farm-summary`
- Verify all five functions were deployed after the latest auth helper change

### Data looks inconsistent

- Re-check `crop_year` filtering in the query layer
- Confirm `v_supply_pipeline` returns one row per grain/year
- Confirm delivery pace math is using delivered plus remaining inventory
