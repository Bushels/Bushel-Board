# Supabase Reconciliation

Date: 2026-03-12

## Goal

Bring the repository migration chain back into alignment with the live Supabase project after out-of-band database changes, and finish the remaining crop-year / community-stats cleanup so a fresh environment can reproduce production.

## Live Findings

Verified against project `ibgsloyjxdopkvwqcqwh`:

- Remote migration history had extra versions not present in Git:
  - `20260312070029`
  - `20260312070048`
  - `20260312143014`
- Remote migration history was missing local versions:
  - `20260312120000`
  - `20260312120100`
  - `20260312130000`
- Live data already showed most crop-year fixes were active:
  - no short-format rows remained in `grain_intelligence`, `x_market_signals`, `farm_summaries`, `crop_plans`, `grain_sentiment_votes`, `signal_feedback`, `supply_disposition`
  - `get_historical_average()`, `get_seasonal_pattern()`, and `get_week_percentile()` all executed successfully
- Remaining live drift:
  - `get_community_stats()` returned stale/broken output (`total_tonnes = 0`, `farmer_count = 1`)
  - `v_community_stats` still used old short-format crop year logic and the wrong data source
  - `macro_estimates` still held short-format crop years
  - `calculate_delivery_percentiles()` still had a stale short-format default in SQL

## Repository Changes

Added migration:

- `supabase/migrations/20260312153000_reconcile_crop_year_cleanup_and_community_stats.sql`

What it does:

1. Finishes long-format crop-year normalization for remaining tables:
   - `cgc_imports`
   - `validation_reports`
   - `macro_estimates`
   - re-applies idempotent normalization to the user-facing intelligence / farm tables
2. Replaces stale community stats SQL with live current-crop-year farmer plan totals.
3. Enforces the privacy threshold inside SQL (`farmer_count >= 10`) instead of only in app code.
4. Removes the stale short-format default from `calculate_delivery_percentiles()` by deriving the current crop year server-side when the argument is omitted.

App change:

- `lib/queries/community.ts`
  - switched `.single()` to `.maybeSingle()` so a privacy-threshold miss cleanly returns `null`

## Remote Repair Workflow

After the cleanup migration is committed:

1. Mark remote-only out-of-band versions as reverted in migration history.
2. Mark the missing local versions as applied, because the live schema already contains their effects.
3. Push the new cleanup migration.
4. Re-run:
   - `npx supabase migration list --linked`
   - live RPC checks for `get_community_stats()`, `get_historical_average()`, `get_seasonal_pattern()`, and `calculate_delivery_percentiles()`

## Warnings

- This repair assumes the remote-only versions were manual equivalents of the repo migrations, not unique schema changes that should remain independently represented.
- If another out-of-band change is made directly in Supabase, migration history will drift again. All future database changes should land through `supabase/migrations/` first.
- Community stats are now computed live from `crop_plans`, not CGC rows. That matches the original product intent: social proof about tracked farmer inventory, not national movement totals.
