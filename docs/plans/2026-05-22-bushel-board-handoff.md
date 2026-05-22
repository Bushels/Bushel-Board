# Bushel Board handoff — 2026-05-22

## Session status

Branch: `codex/data-layer-foundation-v1`

Latest pushed code commit:
- `4287293 feat: add USDA acreage thesis context`

Latest local docs update to commit:
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/reference/us-thesis-data-spine.md`
- this handoff file

Working tree at handoff should remain clean except one intentionally unrelated untracked file:
- `scripts/generate-usda-crop-progress-infographic.ts`

Do not accidentally include that infographic script in a production slice unless explicitly working that separate crop-progress infographic task.

## What was completed

### USDA Quarterly Grain Stocks production slice

Complete and pushed.

Files added/changed:
- `supabase/migrations/20260521184630_create_usda_quarterly_stocks.sql`
- `scripts/import-usda-quarterly-stocks.ts`
- `lib/queries/us-quarterly-stocks.ts`
- `lib/__tests__/us-quarterly-stocks.test.ts`

Live Supabase state:
- Table exists: `public.usda_quarterly_stocks`
- 47 imported rows from NASS QuickStats, 2024+
- Commodities imported: BARLEY, CANOLA, CORN, OATS, SOYBEANS, WHEAT
- Latest regular quarterly stock report is `2026-03-01` for all imported commodities except CANOLA.
- CANOLA latest is `2025-06-01` because this NASS pull only returned June canola stock rows.
- `source_runs` ledger row exists with `source_name = usda_quarterly_stocks`, `rows_inserted = 47`, `source_period_start = 2024-03-01`, and `source_period_end = 2026-03-01`.

Importer fixes made from real NASS behavior:
- Handles reference-period labels like `FIRST OF MAR`, `FIRST OF JUN`, etc.
- Filters wheat subclass rows so aggregate WHEAT values are not overwritten by Durum/subclass rows.
- Supports canola stock rows reported in pounds (`LB`) as well as bushels (`BU`).
- Accepts both `--file path.csv` and `--file=path.csv` CLI forms.

Verification:
- Focused Vitest passed.
- Scoped ESLint passed.
- `npm run build` passed.

### Quarterly stocks wired into US thesis packets/source spine

Complete and pushed.

Files/functions changed:
- `supabase/migrations/20260522035638_wire_usda_quarterly_stocks_into_us_thesis.sql`
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `docs/reference/us-thesis-data-spine.md`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`

Live Supabase state:
- Migration `20260522035638_wire_usda_quarterly_stocks_into_us_thesis` applied.
- `get_us_thesis_packet()` includes `supply.quarterly_stocks`.
- `get_thesis_data_freshness()` includes `usda_quarterly_stocks` with lane `us` and use `measured stocks / supply surprise`.
- `thesis_packet_cache` was force-refreshed.
- Cache verification: 21 total cached thesis packets; US Barley, Corn, Oats, Soybeans, and Wheat contain quarterly-stocks payload/freshness rows.

Board logic:
- `buildUsThesisBoardItem()` now turns measured stocks into drivers:
  - tight stocks => bull driver
  - heavy stocks => bear driver

### `/thesis` visual/product polish after quarterly-stocks landing

Complete and pushed.

Changed:
- Added source-health/provisional-use banner above the farmer read.
- Moved `Top takeaway` before `All Grains at a Glance` so the page leads with farmer-readable interpretation.
- Added quick-scan legend: aligned bull, aligned bear, country split, mapping needed.
- Corrected missing-market copy:
  - Durum US: `US: not modeled in V1`
  - Canola US: `US: Canada-first lane`
  - Spring/Winter Wheat still show source mapping needed.

Verification:
- Browser visual audit on `/thesis?audit=1`: no obvious layout breaks.
- Browser console clean.
- Focused `thesis-board` Vitest passed.
- Scoped ESLint passed.
- `npm run build` passed.

### USDA acreage thesis context

Complete and pushed as:
- `4287293 feat: add USDA acreage thesis context`

Files changed:
- `supabase/migrations/20260522123500_add_crop_acreage_to_thesis_freshness.sql`
- `lib/queries/us-acreage.ts`
- `lib/__tests__/us-acreage.test.ts`
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

What changed:
- Reused the existing production `crop_acreage_estimates` table and `scripts/import-usda-acreage.py` instead of creating a duplicate `usda_acreage` table.
- Added `crop_acreage_estimates` to `get_thesis_data_freshness()` for the US lane with thesis use `planted acreage / supply base`.
- Confirmed `get_us_thesis_packet()` emits `supply.acreage` from `crop_acreage_estimates`.
- Added `lib/queries/us-acreage.ts` helper for latest national acreage context.
- Updated deterministic US thesis-board driver logic so planting-progress reads include the actual planted-acre base.
- Refreshed live thesis cache.

Live verification:
- `get_thesis_data_freshness('Corn','us')` reports `crop_acreage_estimates` as `strong`, latest period end `2026-03-31`, rows available `157`.
- `get_us_thesis_packet('Corn', 2026)` includes `supply.acreage`.
- US Corn `thesis_packet_cache` row contains both `supply.acreage` and `supply.quarterly_stocks`.

Verification:
- `npx vitest run lib/__tests__/us-acreage.test.ts lib/__tests__/thesis-board.test.ts --pool=threads --reporter=dot` passed: 23/23.
- `npx eslint lib/queries/us-acreage.ts lib/queries/thesis-board.ts lib/__tests__/us-acreage.test.ts lib/__tests__/thesis-board.test.ts` passed.
- `npm run build` passed.

### Project truth docs updated

Updated locally and ready to commit:
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/reference/us-thesis-data-spine.md`
- `docs/plans/2026-05-22-bushel-board-handoff.md`

## Current product scope

Bullish/Bearish V1 major-grain scope remains exactly:
- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

Excluded until explicitly redirected:
- pulses
- flax
- smaller CGC labels
- US rice/cotton
- global lanes
- Kalshi expansion

## Important constraints for next session

- Preserve focused commits.
- Do not commit `scripts/generate-usda-crop-progress-infographic.ts` unless explicitly switching to that infographic slice.
- Keep credentials/secrets out of commits and responses.
- Keep `PROJECT_STATE.md` and `docs/plans/STATUS.md` updated after completed production slices.
- Validate importers against real USDA/NASS data, not just mocked shapes.
- Be careful with Supabase RLS. MCP/advisors have flagged `public.prediction_scorecard` with RLS disabled, but do not blindly run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` without policies because it could break production reads/writes.

## Recommended next move

Recommendation: do a focused US WASDE revision-analysis slice next.

Why:
- Quarterly stocks and acreage are now admitted.
- WASDE exists but remains weak/under-used.
- The next quality jump is compound signal scoring: acreage + crop progress + WASDE ending-stock/export revision + CFTC/exports.

Suggested implementation shape:
1. Inspect current `usda_wasde_mapped` schema, importer, and packet usage.
2. Add a query/helper that computes month-over-month revisions for ending stocks, production, exports, feed/residual, crush where available.
3. Add focused tests for revision classification and stale/missing WASDE behavior.
4. Wire revision payload into `get_us_thesis_packet()` and `get_thesis_data_freshness()` if freshness is missing/incomplete.
5. Add deterministic board drivers only where the revision is material and source freshness is strong.
6. Refresh thesis cache and verify live packets.
7. Update docs/state and commit/push focused slices.

## Alternative next move

If security hardening outranks more data work:
- Do a focused `prediction_scorecard` RLS safety pass.
- First inspect all code paths that read/write `public.prediction_scorecard`.
- Design SELECT/INSERT/UPDATE policies intentionally.
- Apply policies and enable RLS in one safe migration.
- Verify app behavior and Supabase advisors after migration.

## Fast resume commands

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git status --short --branch
git log --oneline -5
```

Expected status after committing docs:

```text
## codex/data-layer-foundation-v1...origin/codex/data-layer-foundation-v1
?? scripts/generate-usda-crop-progress-infographic.ts
```

## Key files to open first next session

- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/reference/us-thesis-data-spine.md`
- `lib/queries/thesis-board.ts`
- `lib/queries/us-acreage.ts`
- `supabase/migrations/20260522123500_add_crop_acreage_to_thesis_freshness.sql`
- `scripts/import-usda-acreage.py`
- `supabase/migrations/20260428000300_crop_acreage_estimates.sql`

## One-line handoff prompt for new session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `docs/plans/2026-05-22-bushel-board-handoff.md`, `PROJECT_STATE.md`, and `docs/plans/STATUS.md`; preserve the untracked `scripts/generate-usda-crop-progress-infographic.ts`; then start the US WASDE revision-analysis slice unless I redirect to the `prediction_scorecard` RLS safety pass.
