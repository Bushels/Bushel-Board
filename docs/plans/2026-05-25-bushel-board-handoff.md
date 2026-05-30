# Bushel Board handoff — 2026-05-25

> Superseded by `docs/plans/2026-05-26-bushel-board-handoff.md` for new sessions. Keep this file as history for the Export Sales commodity-code repair and Spring/Winter Wheat mapping decision.

## Fast resume

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Latest pushed commit before this session: `0c19fca docs: refresh thesis board handoff`
Working tree after this session: Export Sales commodity-code fix, focused Python unittest, docs updates; not clean until committed/pushed.

Start a new session by reading these files first:

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`
4. This handoff: `docs/plans/2026-05-25-bushel-board-handoff.md`

## Active product lane

Continue Bullish/Bearish Major-Grains Board V1 only.

V1 grain scope is exactly:

- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

Explicitly excluded unless Kyle redirects:

- Peas
- Lentils
- Flaxseed
- Rye
- Mustard Seed
- Canaryseed
- Chick Peas
- Sunflower
- Beans
- US rice/cotton
- global commodity boards
- Kalshi expansion
- predictive harness production wiring

Do not broaden scope. The current job is to keep the nine-lane `/thesis` board source-honest, farmer-readable, and stable.

## Current deployment reality

Current branch preview is the latest thesis board:

- Preview URL: `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1`
- Vercel target: preview
- Branch: `codex/data-layer-foundation-v1`
- Commit: `ccbf32d`
- Status: Ready

Production is not current:

- Production URL: `https://bushel-board-app.vercel.app/thesis`
- Vercel target: production
- Branch: `master`
- Commit: `4398413`
- Created: 2026-05-09
- It does not show the current Spring/Winter Wheat placeholder rows.

If Kyle wants the public production URL to show the current board, the branch must be merged/deployed to production. Do not assume the production URL is current.

## What changed in the latest slices

### 1. Projection-pace guardrail tightened in the UI

Files changed in prior slice:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`

Behavior locked:

- `/thesis` no longer computes export projection pace from `total_commitments_mt / usda_projection_mt` in UI/query code.
- Projection-pace drivers only render when importer/admission logic has populated explicit `export_pace_pct`.
- This prevents bypassing importer guardrails: commodity mapping, market year alignment, report month alignment, units, and 60–140% implied pace bounds.
- Wheat still keeps its admitted guarded projection driver because live cache has `export_pace_pct = 102.315` and `usda_projection_mt = 24,494,000`.
- Corn, Soybeans, Barley, and Oats remain silent on projection-pace claims while their importer-admitted `export_pace_pct` fields are null.

### 2. Spring/Winter Wheat mapping decision resolved for V1

Files changed in latest docs slice:

- `PROJECT_STATE.md`

Behavior already present and verified in code/UI:

- Spring Wheat and Winter Wheat stay visible in V1.
- Both rows are explicit `Mapping needed` / `Mapping pending` placeholders.
- Generic Canada/US Wheat packets are not aliased into Spring Wheat or Winter Wheat rows.
- Copy says: `Generic Wheat is not used as a proxy for this row.`
- The row cells show `CA: class mapping pending` and `US: class mapping pending`.

Rationale:

- This is the safest V1 decision.
- It ships source-honest scouting value without inventing class-specific precision.
- Class-specific Spring/Winter packet mapping can be a future deliberate patch if Kyle asks for it.

### 3. Export Sales importer commodity-code fix (this session)

Files changed in this slice:

- `scripts/import-usda-export-sales.py`
- `tests/scripts/test_import_usda_export_sales.py`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`
- `docs/plans/2026-05-25-bushel-board-handoff.md`

Root cause:

- Non-wheat ESR imports were using wheat-class-era commodity codes: Corn `104`, Soybeans `201`, Barley `101`, Oats `105`, Sorghum `108`.
- The public USDA ESR commodity catalog says the correct codes are Corn `401`, Soybeans `801`, Soybean Oil `902`, Soybean Meal `901`, Barley `301`, Oats `601`, Sorghum `701`.
- The wrong codes produced implausibly low non-wheat commitments and kept Corn/Soybeans projection pace null-guarded.

Behavior now:

- A focused Python unittest locks the USDA ESR code map.
- Live re-import for Corn/Soybeans/Barley/Oats market year 2026 upserted 135 rows through `2026-05-14`.
- Thesis cache was force-refreshed to 21 rows with source-run watermark `2026-05-25T17:06:49.103632+00:00`.
- Cached US Corn now has `export_pace_pct = 95.287`, `usda_projection_mt = 83,824,000`.
- Cached US Soybeans now has `export_pace_pct = 94.551`, `usda_projection_mt = 41,640,000`.
- Cached US Wheat remains admitted at `export_pace_pct = 102.315`, `usda_projection_mt = 24,494,000`.
- Barley and Oats remain null-guarded; do not infer projection pace in UI.

## Verification run this session

Commands run after the latest state:

```bash
python3 -m unittest tests/scripts/test_import_usda_export_sales.py
python3 -m py_compile scripts/import-usda-export-sales.py tests/scripts/test_import_usda_export_sales.py
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx --max-warnings=0
npm run validate-data-layer
npm run build
```

Results:

- focused Python unittest: 2 passed
- Python compile check: passed
- focused `thesis-board` Vitest: 25 passed (`--pool=threads`; default fork worker timed out once under WSL)
- scoped ESLint: passed
- `npm run validate-data-layer`: passed
  - `source_runs_table`: 119 rows
  - `grain_market_mappings_seeded`: 68 rows
  - freshness RPC: 21 rows
  - Canada packet RPC shape: ok
  - US packet RPC shape: ok
- `npm run build`: passed

Browser / route verification:

Local `/thesis?audit=1` check returned HTTP 200 and contained:

- `Bull/Bear Thesis Board`
- `Corn`
- `Soybeans`
- `Spring Wheat`
- `Winter Wheat`
- `Mapping needed`
- `Mapping pending`
- `Generic Wheat is not used as a proxy`
- `Export sales`

Local browser audit of `/thesis?audit=1` was console-clean. The supplied Vercel preview URL currently redirects this unauthenticated tool session to Vercel login / returns 401, so the post-patch route smoke was done locally against the production build. Production `/thesis` is still old `master` until this branch is promoted/deployed.

## Known unrelated state

Stashes exist; do not restore unless Kyle explicitly asks:

```text
stash@{0}: On codex/data-layer-foundation-v1: wip crop-progress infographic scripts
stash@{1}: WIP on master: ca4459a refactor: expanded chat-architect agent with detailed tool schemas (Track 36)
```

Known unrelated technical debt from `PROJECT_STATE.md` still applies:

- `npx tsc --noEmit --pretty false` has existing non-harness test type debt.
- Supabase advisors still flag `public.prediction_scorecard` with RLS disabled. Do not blindly enable RLS without policies.
- Kalshi remains parked; no open grain commodity markets were available at last check.

## Next best step

### Recommended first patch: deploy/preview verify the Export Sales commodity-code repair

Resolved in this session:

- The root cause for Corn/Soybeans being null-guarded was wrong USDA ESR commodity codes in the importer, not missing UI inference.
- Corn and Soybeans now have importer-admitted guarded `export_pace_pct` in cached US packets.
- Barley and Oats remain null-guarded because the safe public FAS/WASDE comparison still does not pass the admission guardrails.
- UI-side inference remains banned; do not compute projection pace in `lib/queries/thesis-board.ts` from raw commitments/projection fields.

Recommended next action:

1. Commit/push this branch if not already done.
2. Use the new Vercel preview URL generated for the pushed commit, or an authenticated Vercel preview session, to browser-check `/thesis?audit=1`.
3. Confirm `/thesis` still renders exactly the 9 V1 rows.
4. Confirm Corn/Soybeans remain source-backed after the cache refresh, and Barley/Oats stay silent on projection pace.
5. Keep Spring/Winter Wheat as mapping-needed placeholders unless Kyle explicitly redirects to class-specific mapping.
6. Decide whether to promote this branch to production once the preview is clean, because production is still old `master`.

Suggested commands:

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git status --short --branch
git log --oneline -8
git stash list
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx --max-warnings=0
npm run validate-data-layer
npm run build
```

For Vercel preview verification after a push:

```bash
vercel ls bushel-board-app
vercel inspect <preview-url> --logs
vercel curl /thesis?audit=1 --deployment <preview-url> -- --location --max-time 90 --silent --output /tmp/vercel-thesis.html --write-out "%{http_code} %{time_total} %{url_effective}\n"
```

## One-line prompt for the next session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`, and `docs/plans/2026-05-25-bushel-board-handoff.md`; keep `/thesis` scoped to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats only; preserve unrelated stashes; production is still old `master`; Spring/Winter Wheat are intentionally `Mapping needed` placeholders with no generic-Wheat proxy; Export Sales importer commodity codes were corrected and live cache now admits guarded projection pace for Corn/Soybeans while Barley/Oats remain null-guarded; next best step is commit/push plus authenticated Vercel preview verification, not UI inference.
