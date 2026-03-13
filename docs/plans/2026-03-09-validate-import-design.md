# Validate-Import Edge Function Design

**Date:** 2026-03-09
**Status:** Approved
**Scope:** Automated post-import data validation that gates the intelligence pipeline

## Problem

The CGC import pipeline can silently ingest bad data (zero-row imports, incomplete CSVs, wrong grain weeks) which then triggers the intelligence chain, producing stale or misleading narratives. We need a deterministic validation gate between import and intelligence generation.

## Architecture

### Chain Position
```
import-cgc-weekly → validate-import → search-x-intelligence → generate-intelligence → generate-farm-summary
```

`import-cgc-weekly` chains to `validate-import` (instead of `search-x-intelligence` directly).
`validate-import` only chains to `search-x-intelligence` if all checks pass.

### Validation Checks

| # | Check | Pass Criteria | Rationale |
|---|-------|--------------|-----------|
| 1 | Row count | 3,500–5,500 rows for the imported week | Typical weeks have ~4,200 rows. Outside this = bad data or format change |
| 2 | Grain coverage | All 16 expected grains present in the week | Missing grains = incomplete CSV parse |
| 3 | Week continuity | Imported week ≤ previous max + 1 | Gaps indicate missed weeks; same week = safe re-import |
| 4 | Delivery sanity | Sum of prairie deliveries (Current Week) > 0 kt | Zero total = parsing or data failure |
| 5 | Week-over-week delta | Total weekly deliveries within 70% of prior week | Massive unexplained drops flag data issues |

### New Table: `validation_reports`
```sql
CREATE TABLE validation_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'warn')),
  checks jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS: publicly readable, only service_role can write
ALTER TABLE validation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON validation_reports FOR SELECT USING (true);
```

### `checks` JSONB Schema
```json
{
  "row_count": { "passed": true, "value": 4190, "detail": "Within 3500-5500 range" },
  "grain_coverage": { "passed": true, "value": 16, "detail": "All 16 grains present" },
  "week_continuity": { "passed": true, "value": 30, "detail": "Previous max was 29" },
  "delivery_sanity": { "passed": true, "value": 597.2, "detail": "Total prairie deliveries > 0" },
  "wow_delta": { "passed": true, "value": -3.2, "detail": "Within 70% threshold (prev: 617.1)" }
}
```

### Failure Behavior
- **All pass** → log `status: 'pass'`, trigger `search-x-intelligence`
- **Any fail** → log `status: 'fail'`, do NOT trigger downstream chain
- Intelligence pipeline is best-effort — validation failures are logged, not retried

### Expected Grains (16)
Wheat, Durum, Oats, Barley, Rye, Flaxseed, Canola, Mustard Seed, Sunflower Seed, Peas, Lentils, Beans, Chickpeas, Corn, Soybeans, Canaryseed

### Edge Function Input
Receives the same body as downstream functions:
```json
{ "crop_year": "2025-2026", "grain_week": 30 }
```

Queries `cgc_observations` and `cgc_imports` directly to perform checks.

## Files to Create/Modify
1. **New:** `supabase/functions/validate-import/index.ts`
2. **New:** Migration for `validation_reports` table
3. **Modify:** `supabase/functions/import-cgc-weekly/index.ts` — change chain target from `search-x-intelligence` to `validate-import`

## Cost
- Zero API cost (all SQL queries)
- ~1-2 seconds execution time
- No new env vars needed (uses existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
