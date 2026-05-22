# Bushel Board handoff — 2026-05-22

## Session status

Branch: `codex/data-layer-foundation-v1`

Latest pushed code commit:
- `e385008 feat: add guarded export sales projection drivers`

Latest production slice completed, verified, committed, and pushed:
- Guarded Export Sales + WASDE projection compound drivers in the thesis board app layer.
- The driver is code/test/docs complete, but live visibility is intentionally blocked until `usda_export_sales.export_pace_pct` / `usda_projection_mt` are populated through a trusted WASDE-aligned source path.

Working tree at handoff should remain clean for committed thesis-board files. Unrelated local WIP remains and must not be included in the Export Sales projection slice unless explicitly redirected:
- modified: `scripts/import-canada-crop-progress.py`
- untracked: `scripts/generate-canada-crop-progress-infographic.py`
- untracked: `scripts/generate-usda-crop-progress-infographic.ts`

Do not accidentally include those Canada crop progress / infographic files in a production slice unless explicitly working that separate crop-progress infographic task.

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


### US WASDE revision-analysis slice

Complete and pushed as:
- `31c6dc6 feat: add WASDE revision thesis drivers`
- `d594e95 docs: record live WASDE revision rollout`

Supabase MCP was reconnected through the configured `supabase_bushel` token path; the local migration was applied as live migration `20260522183715_add_wasde_revision_context_to_us_thesis_packet`, then `thesis_packet_cache` was force-refreshed.

Files changed:
- `supabase/migrations/20260522151000_add_wasde_revision_context_to_us_thesis_packet.sql`
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/reference/us-thesis-data-spine.md`

What changed:
- `get_us_thesis_packet()` migration now computes month-over-month WASDE deltas from the latest row to the previous report for the same market/country/market year.
- New packet fields include `previous_report_month`, `ending_stocks_change_kt`, `stocks_to_use_change_pct`, `exports_change_kt`, `domestic_consumption_change_kt`, `crush_change_kt`, and `production_change_kt`.
- The same WASDE payload is exposed under both `supply.wasde` and `demand.wasde`, matching the existing packet shape.
- `buildUsThesisBoardItem()` now creates deterministic drivers for material WASDE revisions:
  - ending-stocks cuts => bull driver
  - ending-stocks raises => bear driver
  - export projection raises => bull driver
  - export projection cuts => bear driver
  - domestic/crush demand raises/cuts => bull/bear drivers
- Materiality threshold is currently 500 kt for these revision deltas.

Verification:
- `npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --reporter=dot` passed: 21/21 tests.
- `npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts` passed.
- `npm run build` passed.
- `npm run refresh-thesis-cache -- --force` succeeded after live migration: 12 requested source-backed rows refreshed, 0 failures, 21 total cache rows.
- Live cache SQL verification confirmed US Corn/Soybeans/Wheat 2025 cached packets include `previous_report_month`, `ending_stocks_change_kt`, `exports_change_kt`, and demand/crush revision fields where available.
- Browser audit of `http://127.0.0.1:3000/thesis?audit=1` confirmed the route loads, shows fresh cached-board status, shows all 9 V1 quick-scan rows, surfaces WASDE revision copy such as soybean crush raised/export cut drivers, and has a clean console.
- Note: `get_us_thesis_packet('Corn'|'Soybeans'|'Wheat', 2026)` still returns null WASDE payloads because current live mapped WASDE rows for these markets are keyed to market year 2025, which is the cache refresh script's current US market-year default.

Pending live follow-up:
1. Move into Export Sales pace vs WASDE export projection compound scoring.

### Export Sales + WASDE projection compound scoring

App-side scoring is implemented and verified, but live visibility needs the next data-admission slice.

Files changed:
- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`

What changed:
- `buildUsThesisBoardItem()` now computes export-sales pace from either `export_pace_pct` or `total_commitments_mt / usda_projection_mt`.
- The board can emit compound drivers when export sales outrun or lag WASDE export projection:
  - `Export sales confirm raised WASDE projection`
  - `Export sales challenge WASDE export cut`
  - `Export sales execution risk against WASDE raise`
  - `Export sales confirm WASDE export cut`
  - `Export sales outrunning WASDE projection`
  - `Export sales lag WASDE projection`
- These drivers include WASDE export-revision context when `exports_change_kt` is present.

Verification:
- `npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --reporter=dot` passed: 22/22 tests.
- `npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts` passed.
- `npm run build` passed.

Live-data caveat:
- Direct live inspection showed current `usda_export_sales.export_pace_pct` and `usda_projection_mt` are null.
- I intentionally did not derive production-visible projection pace from raw WASDE fields inside the app because live FAS/WASDE year/unit alignment produced obvious bad comparisons for some commodities.
- Next slice should populate/backfill `usda_export_sales.export_pace_pct` / `usda_projection_mt` through a trusted WASDE-aligned source path, refresh thesis cache, then verify the compound drivers visibly appear in `/thesis`.

Commit/push checkpoint:
- Committed and pushed as `e385008 feat: add guarded export sales projection drivers`.
- Verification rerun at handoff: focused `thesis-board` Vitest passed 22/22; scoped ESLint passed; `npm run build` passed after rerun with a longer timeout.
- Direct Supabase MCP fallback live check: `thesis_packet_cache` has 21 rows; `usda_export_sales` has 247 rows; latest `week_ending` is `2026-05-07`; rows with projection or pace populated = 0.

### Project truth docs updated

Updated:
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

Recommendation: finish the Export Sales projection-field admission/backfill slice.

Why:
- Quarterly stocks, acreage, and WASDE revision fields are admitted.
- App-side compound Export Sales + WASDE projection driver logic is implemented, tested, committed, and pushed.
- Live `usda_export_sales.export_pace_pct` / `usda_projection_mt` are still null, so the driver cannot visibly affect `/thesis` until projection/pace fields are admitted safely.

Suggested implementation shape:
1. Inspect the trusted WASDE-aligned source path for export projections, market year, units, and commodity mappings.
2. Backfill/populate `usda_export_sales.usda_projection_mt` and/or `export_pace_pct` without using the unsafe naive live join.
3. Refresh `thesis_packet_cache`.
4. Verify cached packets and `/thesis?audit=1` show compound export-sales drivers where warranted.
5. Keep all work hard-gated to the V1 major-grain scope.

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

Expected status at this handoff:

```text
## codex/data-layer-foundation-v1...origin/codex/data-layer-foundation-v1
 M scripts/import-canada-crop-progress.py
?? scripts/generate-canada-crop-progress-infographic.py
?? scripts/generate-usda-crop-progress-infographic.ts
```

Those three files are unrelated local WIP and were intentionally left untouched.

## Key files to open first next session

- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/reference/us-thesis-data-spine.md`
- `lib/queries/thesis-board.ts`
- `lib/queries/us-acreage.ts`
- `scripts/import-usda-export-sales.py`
- `supabase/migrations/20260412171107_create_usda_export_sales.sql`
- `supabase/migrations/20260522151000_add_wasde_revision_context_to_us_thesis_packet.sql`
- `docs/reference/us-thesis-data-spine.md`

## One-line handoff prompt for new session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `docs/plans/2026-05-22-bushel-board-handoff.md`, `PROJECT_STATE.md`, and `docs/plans/STATUS.md`; preserve unrelated local WIP in `scripts/import-canada-crop-progress.py`, `scripts/generate-canada-crop-progress-infographic.py`, and `scripts/generate-usda-crop-progress-infographic.ts`; then finish Export Sales projection-field admission/backfill by safely populating `usda_export_sales.export_pace_pct` / `usda_projection_mt`, refreshing thesis cache, and verifying compound export-sales drivers on `/thesis`.
