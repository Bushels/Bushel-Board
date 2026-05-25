# Bushel Board handoff — 2026-05-25

## Fast resume

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Latest pushed commit: `ccbf32d docs: record wheat class mapping decision`
Working tree at handoff prep: clean and synced with `origin/codex/data-layer-foundation-v1`.

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

## Verification run this session

Commands run after the latest state:

```bash
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx --max-warnings=0
npm run validate-data-layer
npm run build
```

Results:

- focused `thesis-board` Vitest: 25 passed
- scoped ESLint: passed
- `npm run validate-data-layer`: passed
  - `source_runs_table`: 117 rows
  - `grain_market_mappings_seeded`: 68 rows
  - freshness RPC: 21 rows
  - Canada packet RPC shape: ok
  - US packet RPC shape: ok
- `npm run build`: passed

Browser / route verification:

Local `/thesis?audit=1` check returned HTTP 200 and contained:

- `Bull/Bear Thesis Board`
- `Spring Wheat`
- `Winter Wheat`
- `Mapping needed`
- `Mapping pending`
- `Generic Wheat is not used as a proxy`

Browser console was clean.

Vercel preview `/thesis?audit=1` check returned HTTP 200 and contained the same strings.

Production `/thesis` check returned HTTP 200 but did not contain the current Spring/Winter Wheat strings because production is still old `master` commit `4398413`.

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

### Recommended first patch: guarded Export Sales + WASDE projection admission expansion

Problem:

- Wheat has a guarded importer/admission-layer `export_pace_pct` and can show the compound Export Sales + WASDE projection driver.
- Corn, Soybeans, Barley, and Oats currently do not show projection-pace claims because their guarded fields remain null.
- UI-side inference is banned; do not compute projection pace in `lib/queries/thesis-board.ts` from raw commitments/projection fields.

Patch direction:

1. Inspect importer/admission logic for Export Sales + WASDE projection mapping.
2. Determine why Corn/Soybeans/Barley/Oats are null-guarded.
3. Fix only where commodity/year/report-month/unit sanity checks support it.
4. Backfill/refresh source packets/cache if the importer/admission fix changes admitted fields.
5. Keep missing/failed admissions silent in the board rather than inventing a driver.

Acceptance criteria:

- `/thesis` still renders exactly the 9 V1 rows.
- No UI-side projection-pace inference returns.
- If Corn/Soybeans/Barley/Oats get `export_pace_pct`, tests prove the admitted field is required before a driver renders.
- If some markets remain null, the UI stays silent and source-honest.
- Spring/Winter Wheat remain mapping-needed placeholders unless Kyle explicitly redirects to class-specific mapping.
- Focused thesis tests, scoped ESLint, `npm run validate-data-layer`, and `npm run build` pass.
- Browser or route smoke check of `/thesis?audit=1` confirms the board is readable and console-clean.

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

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`, and `docs/plans/2026-05-25-bushel-board-handoff.md`; keep `/thesis` scoped to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats only; preserve unrelated stashes; use preview URL `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1` for the current board because production is still old `master`; Spring/Winter Wheat are intentionally `Mapping needed` placeholders with no generic-Wheat proxy; next best patch is guarded Export Sales + WASDE projection admission expansion for non-wheat markets at the importer/admission layer, not UI inference.
