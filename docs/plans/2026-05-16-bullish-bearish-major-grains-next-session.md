# Bullish/Bearish Major-Grains Board Next Session

> **For Hermes:** This is the active next-session handoff. Use the existing `/thesis` board and data spine. Do not resume Kalshi or expand minor grains unless Kyle explicitly redirects.

**Created:** 2026-05-16 MT
**Branch:** `codex/data-layer-foundation-v1`
**Status:** active next product lane

## Direct Answer

Build and polish the Bullish/Bearish board only for this first major-grain lane set:

- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

This is not a broad all-grains dashboard pass. The board should feel like a tight grain-marketing decision board: clear bull thesis, clear bear thesis, current source freshness, and class-aware wheat handling.

## Fixed Scope

### Product lanes for V1

These are the only board lanes for the next pass:

| Lane | Notes |
|---|---|
| Corn | US + Canada where source packets exist. |
| Soybeans | US + Canada where source packets exist. |
| Wheat | Generic/all-wheat lane for top-level wheat read. |
| Spring Wheat | Class-specific wheat lane; likely maps to CWRS/HRS where data supports it. |
| Winter Wheat | Class-specific wheat lane; likely maps to HRW/SRW where data supports it. |
| Durum | Use Canadian `Amber Durum` as the current Canada-side source name; label the product lane as Durum. |
| Canola | Canada-first lane; US soybean/soy oil context may be supporting evidence, not a separate canola market. |
| Barley | Canada + US where source packets exist. |
| Oats | Canada + US where source packets exist; milling grain, not crush. |

### Current code mismatch to patch

`lib/queries/thesis-board.ts` currently lists a broader temporary scope:

- Canada: Wheat, Canola, Barley, Oats, Corn, Soybeans, Peas, Lentils, Amber Durum, Flaxseed.
- US: Corn, Soybeans, Wheat, Oats, Barley.

Patch this before UI polish so the code-level scope matches Kyle's narrowed list. Keep Oats in the board scope. Remove Peas, Lentils, and Flaxseed from the board scope. Rename/display `Amber Durum` as Durum. Add Spring Wheat and Winter Wheat only if they can be backed by explicit source mappings; otherwise create clear placeholder lanes marked `source mapping needed`, not fake data.

### Explicit exclusions

Do not add these in the next pass:

- Pulses: Peas, Lentils, Chick Peas, Beans.
- Specialty/smaller CGC labels: Rye, Mustard Seed, Canaryseed, Sunflower, Flaxseed.
- US rice/cotton.
- Global commodity boards.
- Kalshi cards, implied-line work, or prediction-market copy.
- Private farmer/operator/chat data.
- Model-training or fine-tuning claims.

## Current Data State Verified 2026-05-16

USDA export sales was stale and has been repaired.

Live Supabase verification:

```sql
select
  max(week_ending) as latest_week,
  count(*) filter (where week_ending = (select max(week_ending) from public.usda_export_sales)) as latest_week_rows,
  count(distinct commodity) filter (where week_ending = (select max(week_ending) from public.usda_export_sales)) as latest_week_commodities
from public.usda_export_sales;
```

Result at handoff:

- latest week: `2026-05-07`
- latest-week rows: `5`
- latest-week commodities: `5`
- commodities imported: ALL WHEAT, CORN, SOYBEANS, BARLEY, OATS

Thesis cache verification:

```sql
select
  max(refreshed_at) as max_refreshed_at,
  max(source_run_watermark) as source_run_watermark,
  count(*) as cache_rows
from public.thesis_packet_cache;
```

Result at handoff:

- cache rows: `21`
- max refreshed at: `2026-05-16 18:19:28.233744+00`
- source run watermark: `2026-05-16 18:17:52.357752+00`

## Known Patch To Do First

`npm run collect:export-sales` successfully imported current USDA data, but the automatic wrapper-triggered thesis-cache refresh skipped because the cache freshness check trusted the existing cache watermark. The cache became current only after:

```bash
npm run refresh-thesis-cache -- --force
```

Patch next:

- Collector-triggered cache refresh should force by default, or
- `refresh-thesis-packet-cache.ts` should compare against latest relevant `source_runs` directly instead of trusting cached watermark.

Acceptance criteria:

- A successful `npm run collect:export-sales` updates `thesis_packet_cache` without needing a second manual force run.
- Dry runs still skip cache refresh.
- Existing wrapper tests continue to pass.
- Add or update a focused test for the stale-cache watermark case.

## Product Direction For The Board

Keep the existing facts-only packet spine, but make the UI/read more farmer-useful.

Desired board behavior:

1. Show a tight table/matrix of the major grains only.
2. For each grain, make the stance obvious: bullish, bearish, balanced/mixed.
3. Show the top bull driver and top bear driver without making the user open every card.
4. Show freshness/source warnings inline, not hidden in a dev-only panel.
5. Canada/US comparison rows should explain divergence in plain English.
6. No stale Grok prose should be treated as current analysis.
7. No trading/advice copy. Use marketing-decision framing, not prediction-market framing.

## Key Files

- `app/(dashboard)/thesis/page.tsx` - board route/UI.
- `lib/queries/thesis-board.ts` - major-grain scope, packet normalization, comparison rows.
- `lib/__tests__/thesis-board.test.ts` - focused tests for board behavior.
- `scripts/refresh-thesis-packet-cache.ts` - cache refresh logic.
- `scripts/run-collector-with-thesis-cache-refresh.ts` - collector wrapper logic.
- `docs/reference/collector-task-configs.md` - collector operating docs.
- `PROJECT_STATE.md` - current truth file.
- `docs/plans/STATUS.md` - feature ledger.

## Suggested Next-Session Task Order

### Task 1: Patch board scope constants and thesis-cache refresh

Objective: align code-level board scope to Kyle's narrowed major-lane list and remove the manual `--force` requirement found during export-sales repair.

Files likely touched:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `scripts/refresh-thesis-packet-cache.ts`
- `scripts/run-collector-with-thesis-cache-refresh.ts`
- `docs/reference/collector-task-configs.md`

Scope acceptance criteria:

- Board lanes are only: Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, Oats.
- Peas, Lentils, Flaxseed, and smaller grains are not rendered.
- `Amber Durum` source data displays as the Durum product lane.
- Spring Wheat and Winter Wheat either have explicit source mappings or are clearly marked as source-mapping placeholders; do not fabricate class-specific evidence from generic wheat rows.

Cache acceptance criteria:

- A successful `npm run collect:export-sales` updates `thesis_packet_cache` without needing a second manual force run.
- Dry runs still skip cache refresh.
- Existing wrapper tests continue to pass.
- Add or update a focused test for the stale-cache watermark case.

Verification:

```bash
npm run test -- thesis-board
npm run build
```

If feasible, run a safe dry-run path to prove dry runs still skip refresh.

### Task 2: Audit `/thesis` current UI against the fixed major-grain scope

Objective: ensure no smaller grains, US rice/cotton, Kalshi, or global lanes appear in the board.

Check:

- Visible lanes match exactly: Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, Oats.
- Peas, Lentils, Flaxseed, smaller grains, US rice/cotton, Kalshi, and global lanes do not appear.
- Wheat-class rows do not imply more precision than the source mappings support.
- Empty/stale sources surface as warnings, not hidden errors.

### Task 3: Improve the board read for farmer decision use

Objective: make the board useful at a glance.

Prioritize:

- Strongest bull driver.
- Strongest bear driver.
- Stance/confidence.
- Source freshness.
- Country divergence explanation.

Avoid:

- Another generic dashboard grid.
- Dense raw metric dumps without a conclusion.
- Expanding to additional sources before the current board is clean.

### Task 4: Verify with source freshness SQL and focused tests

Use these checks before handoff:

```sql
select max(week_ending) from public.usda_export_sales;
select count(*) from public.thesis_packet_cache;
select max(refreshed_at), max(source_run_watermark) from public.thesis_packet_cache;
```

Run:

```bash
npm run test -- thesis-board
npm run build
```

Note: `npx tsc --noEmit --pretty false` has known unrelated type debt in seeding/overview/Bushy tests; do not treat that as a board blocker unless the touched files add new failures.

## Boundaries

- Kalshi stays parked until open Corn/Soybeans/Wheat markets return.
- The no-write predictive harness remains background infrastructure.
- Do not add sidecar writers or production training paths.
- Do not use private farmer/operator/chat data.
- Keep board claims source-grounded and farmer-readable.
- First board release is restricted to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats.
