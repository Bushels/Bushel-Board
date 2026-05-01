# USDA Crop Progress Import Fix Handoff

## TL;DR

Fix the Monday USDA Crop Progress collector so it becomes a **deterministic NASS API importer** that writes **canonical weekly rows** into `usda_crop_progress`.

Do **not** use Firecrawl for this.

This task primarily feeds the **US bull/bear thesis lane**. It only affects the Canadian thesis **indirectly**, and any Canada proxy logic should live in the **query / consumer layer**, not in the source table.

---

## Why This Matters

Right now the repo has a contract mismatch:

- the task prompt and docs describe `usda_crop_progress` as **one weekly row per commodity**
- the current importer writes **raw QuickStats metric rows**
- the reader RPC and downstream prompt code expect the **canonical weekly row shape**
- `cgc_grain` is expected downstream, but the live importer does not populate it

This means the table, importer, and readers are not all talking about the same object.

---

## Hard Decisions

1. **Use the USDA NASS QuickStats API, not Firecrawl**
   - This source is structured and official.
   - Firecrawl here is token burn and adds avoidable parsing risk.

2. **`usda_crop_progress` should be the canonical weekly table**
   - One row per `(commodity, state, week_ending)`.
   - Populate the denormalized market-facing columns:
     - `planted_pct`
     - `emerged_pct`
     - `headed_pct`
     - `blooming_pct`
     - `setting_pods_pct`
     - `turning_color_pct`
     - `mature_pct`
     - `harvested_pct`
     - `condition_very_poor_pct`
     - `condition_poor_pct`
     - `condition_fair_pct`
     - `condition_good_pct`
     - `condition_excellent_pct`
     - `good_excellent_pct`
     - `condition_index`
     - `ge_pct_yoy_change`
     - `planted_pct_vs_avg`

3. **`cgc_grain` must be populated on write**
   - This is non-negotiable because the canonical RPC uses it.

4. **Do not overload the source table for Canadian proxies**
   - Example: US soybean conditions may be useful for Canadian canola context.
   - That proxy should be handled in the **reader / mapping layer**, not by writing `cgc_grain='Canola'` into this source table.

---

## Current Repo Mismatches

### 1. Current importer writes raw metric rows

Current importer:

- `scripts/import-usda-crop-progress.py`

It writes fields like:

- `market_name`
- `statisticcat_desc`
- `unit_desc`
- `value_pct`
- `location_desc`

instead of building the canonical weekly row.

### 2. Canonical schema and RPC expect denormalized weekly rows

Canonical migration:

- `supabase/migrations/20260412100200_create_usda_crop_progress.sql`

It expects:

- `cgc_grain`
- `good_excellent_pct`
- `condition_index`
- `ge_pct_yoy_change`
- `planted_pct_vs_avg`

and `get_usda_crop_conditions()` filters on:

- `WHERE c.cgc_grain = p_cgc_grain`

### 3. Later migrations reshaped the table toward raw QuickStats storage

Raw-row migration:

- `supabase/migrations/20260413225500_create_usda_crop_progress.sql`
- `supabase/migrations/20260413231500_fix_usda_crop_progress_unique_constraint.sql`

These added a unique index on:

- `(market_name, commodity, class_desc, week_ending, statisticcat_desc, unit_desc, location_desc)`

That matches the current raw importer, not the canonical weekly-row model.

### 4. Docs already admit the data is broken

US desk prompt:

- `docs/reference/us-desk-swarm-prompt.md`

It explicitly warns:

- `cgc_grain` may be NULL

That is a downstream symptom, not a behavior to preserve.

---

## Target Behavior

### Schedule

- Monday
- 4:32 PM ET
- April through November only

### Runtime flow

```text
season check
  -> latest imported week check
  -> fetch NASS API
  -> build canonical weekly rows
  -> map USDA commodity -> cgc_grain
  -> compute derived fields
  -> upsert canonical rows
  -> verify
```

### Commodity mapping

Use these canonical mappings for the source table:

| USDA source commodity/class | `commodity` to store | `cgc_grain` |
| --- | --- | --- |
| `WHEAT` + `WINTER` | `WHEAT` | `Wheat` |
| `WHEAT` + `SPRING, (EXCL DURUM)` | `WHEAT` | `Wheat` |
| `CORN` | `CORN` | `Corn` |
| `SOYBEANS` | `SOYBEANS` | `Soybeans` |
| `BARLEY` | `BARLEY` | `Barley` |
| `OATS` | `OATS` | `Oats` |

Notes:

- Do **not** write `Wheat (spring)` or any non-canonical variant.
- Do **not** write `Canola` for soybean crop conditions.
- If Canadian canola should consume US soybean conditions later, handle that in query logic.

### Derived field rules

- `good_excellent_pct = condition_good_pct + condition_excellent_pct`
- `condition_index = (VP*1 + P*2 + F*3 + G*4 + E*5) / 100`
- `ge_pct_yoy_change = current good_excellent_pct - same week prior year`
- `planted_pct_vs_avg = current planted_pct - 5-year average planted pace`

If 5-year average planting pace is not published for that week:

- leave `planted_pct_vs_avg = NULL`
- log it in the run summary

---

## Implementation Scope

### In scope

1. Replace or rewrite `scripts/import-usda-crop-progress.py` so it builds canonical weekly rows.
2. Keep using the NASS API.
3. Populate `cgc_grain` on every inserted row.
4. Compute all denormalized market-facing columns.
5. Add / restore a canonical uniqueness guard for:
   - `(commodity, state, week_ending)`
6. Make `get_usda_crop_conditions()` reliably return non-null data for:
   - `Wheat`
   - `Corn`
   - `Soybeans`
   - `Oats`
   - `Barley` if the table/query path is intended to support it
7. Add season check and “no new data” skip behavior.
8. Update the docs that currently say `cgc_grain` may be NULL.

### Out of scope

1. Firecrawl integration for this source
2. Broad redesign of the US desk
3. Reworking WASDE in the same pass
4. Reworking Canada proxy logic beyond the minimum needed to avoid bad source data
5. Building a generalized `source_runs` ledger in this pass

---

## Recommended Implementation Path

### Step 1: Decide table strategy

Use this strategy for v1:

- keep `usda_crop_progress` as the canonical weekly table
- do **not** try to preserve raw QuickStats rows in this same table

If raw preservation is needed later, create:

- `usda_crop_progress_raw`

But that is **not required** for this fix.

### Step 2: Add the canonical unique index

Ensure the table supports canonical upsert on:

- `(commodity, state, week_ending)`

If the old raw unique indexes remain, that is acceptable for now as long as the canonical unique key exists and the importer uses it.

### Step 3: Rewrite the importer

The importer should:

1. check month is Apr-Nov
2. query latest `week_ending` already in the table
3. fetch current-year NASS weekly data via API
4. derive the latest published `week_ending`
5. skip if already present
6. pivot raw NASS metrics into one canonical row per commodity/week/state
7. compute derived fields
8. write rows with populated `cgc_grain`

### Step 4: Repair the reader path

Review:

- `get_usda_crop_conditions()` in `20260412100200_create_usda_crop_progress.sql`
- `lib/us-market-context.ts`
- `docs/reference/us-desk-swarm-prompt.md`
- `.claude/agents/macro-scout.md`

Target:

- source table stores canonical source truth
- reader path can use `cgc_grain` again
- if `Canola` needs soybean crop-condition proxy, handle it in the consumer mapping layer

### Step 5: Backfill / cleanup

Minimum acceptable repair:

- backfill at least current in-season data so the US desk works immediately

Preferred repair:

- backfill 2025 and 2026 season rows into canonical shape

If broken raw rows make verification confusing, a targeted cleanup migration for affected rows is acceptable.

---

## Validation Checklist

### Data write validation

Verify the latest week:

```sql
SELECT commodity, cgc_grain, week_ending, good_excellent_pct, ge_pct_yoy_change, planted_pct
FROM usda_crop_progress
WHERE week_ending = '{new_week_ending}'
  AND state = 'US TOTAL'
ORDER BY commodity;
```

### RPC validation

Verify the reader contract:

```sql
SELECT * FROM get_usda_crop_conditions('Wheat', 4);
SELECT * FROM get_usda_crop_conditions('Corn', 4);
SELECT * FROM get_usda_crop_conditions('Soybeans', 4);
SELECT * FROM get_usda_crop_conditions('Oats', 4);
```

If Barley is supported in the US desk lane:

```sql
SELECT * FROM get_usda_crop_conditions('Barley', 4);
```

### Sanity checks

1. `cgc_grain` is never NULL on new rows
2. VP + P + F + G + E is approximately 100 when condition data exists
3. `good_excellent_pct` matches G + E
4. `condition_index` is populated when condition data exists
5. `ge_pct_yoy_change` is populated when prior-year row exists
6. re-running the importer for the same week does not duplicate rows

---

## Canada Impact

Primary impact:

- **US thesis lane**

Possible secondary impact:

- Canadian thesis if it consumes US crop-condition context as a proxy

Important rule:

- if Canada wants US soybean conditions as a canola proxy, implement that in:
  - `get_usda_crop_conditions()` mapping logic, or
  - `lib/us-market-context.ts`

Do **not** falsify the source table to make that happen.

---

## Paste-Ready Prompt For New Session

```text
Fix the USDA Crop Progress importer so it becomes the canonical weekly source for the US thesis lane.

Context:
- Repo: C:\Users\kyle\Agriculture\bushel-board-app
- Read first: docs/plans/2026-04-20-usda-crop-progress-fix-handoff.md

Goal:
- Use the USDA NASS QuickStats API, not Firecrawl
- Rewrite scripts/import-usda-crop-progress.py to write canonical weekly rows into usda_crop_progress
- Populate cgc_grain on every inserted row
- Compute good_excellent_pct, condition_index, ge_pct_yoy_change, planted_pct_vs_avg
- Add/restore a canonical unique key on (commodity, state, week_ending)
- Make get_usda_crop_conditions() return usable data again for Wheat, Corn, Soybeans, and Oats

Important:
- Do not overload the source table for Canadian proxy logic
- If Canola needs soybean crop-condition proxy, handle that in the query/consumer layer
- Keep scope tight to this importer + required reader fixes + docs updates

Deliver:
1. code changes
2. migration changes if needed
3. validation queries run
4. short summary of what was fixed and any remaining risk
```

