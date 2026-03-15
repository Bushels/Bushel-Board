---
name: data-audit
description: >
  Audit Bushel Board data integrity end-to-end when dashboard values do not match
  CGC source data, especially for producer deliveries, derived views, or week-specific
  discrepancies. Use when the user says: 'this number is wrong', 'audit the data',
  'trace this value back to CGC', 'dashboard data mismatch', 'Excel vs Supabase',
  'why is Canola wrong', or asks to verify derived metrics before shipping.
  Do NOT use for: normal import triggering only (use cgc-import), unrelated UI bugs,
  or deploying all pending database work without review.
---

# Data Audit Skill — Bushel Board

Use this skill when a live dashboard number must be traced back to the CGC workbook and the remote database.

## Canonical docs to read first

1. `AGENTS.md`
2. `docs/reference/grain-market-intelligence-framework-v2.md`
3. `docs/reference/cgc-excel-map.md`
4. `docs/lessons-learned/issues.md`

## Canonical producer-delivery formula

Country producer deliveries are:

```text
Primary.Deliveries (AB/SK/MB/BC, grade='')
+ Process.Producer Deliveries (national, grade='')
+ Producer Cars.Shipments (AB/SK/MB, grade='')
```

Anything that uses only `Primary`, or only `Primary + Process`, is incomplete.

## Workflow

### 1. Confirm the source week

- Check the user’s claimed week against the live CGC CSV, not just the local cache.
- The local `data/CGC Weekly/gsw-shg-en.csv` file may lag the published source.
- If the local CSV is stale, use the live CGC CSV and the local workbook `gsw-shg-<week>-en.xlsx`.

### 2. Run the audit script

```bash
npm run audit-data -- --week <week>
```

What this must validate:
- Excel ↔ CSV spot checks
- CSV ↔ Supabase spot checks
- Excel Summary ↔ derived dashboard objects:
  - `v_grain_overview`
  - `v_grain_yoy_comparison`
  - `get_pipeline_velocity()`

If the audit returns zero checks or silently passes while the local CSV is stale, the audit path is incomplete and must be fixed before continuing.

### 3. Query the canonical delivery view

Use the remote database to compare the expected value against:

```sql
SELECT grain, total_kt
FROM v_country_producer_deliveries
WHERE crop_year = '2025-2026'
  AND grain_week = 31
  AND period = 'Current Week';
```

Then check:
- `v_grain_overview`
- `v_grain_yoy_comparison`
- `get_pipeline_velocity('<grain>', '<crop_year>')`

## Hotfix deployment rule

If `npx supabase migration list --linked` shows unrelated local migrations missing on remote:

- Do **not** run `npx supabase db push --linked` from the main repo blindly.
- Use an isolated hotfix workdir or a single-migration apply path.
- Record what was deployed and what remains pending.

## Common failure modes

- Missing `grade=''` filter on aggregate Primary/Process/Producer Cars queries
- Local CSV cache is stale, causing false negatives in audit scripts
- Derived views/RPCs fixed in one place but not all dependent SQL objects
- Repo AGENTS or skill docs still carry an older formula and reintroduce drift

## Required cleanup before closing the task

1. Update the canonical docs if the instructions were wrong.
2. Add a lessons-learned entry for any new data bug class.
3. Rerun the audit after the fix.
4. State whether the remote database was actually updated or only the local code/docs were patched.
