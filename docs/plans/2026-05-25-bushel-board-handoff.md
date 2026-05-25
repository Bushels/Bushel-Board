# Bushel Board handoff — 2026-05-25

## Fast resume

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Latest implementation commit before this handoff session: `831332a feat: admit canada crop progress to thesis packets`
Working tree at handoff prep: local edits ready to commit for UI projection-pace guardrail + docs.

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

Do not broaden scope. The current job is to make the nine-lane `/thesis` board source-honest, farmer-readable, and stable.

## What changed in this session

### Projection-pace guardrail tightened in the UI

Files changed:

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

Test coverage added:

- Existing positive/negative projection driver tests now include explicit admitted `export_pace_pct`.
- New regression test: `does not infer export-sales projection pace from unadmitted projection fields`.
- That test failed red before the code change and passed after removing UI-side inference.

## Verification run this session

Commands run:

```bash
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx
npm run validate-data-layer
npm run build
git diff --check
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
- `git diff --check`: passed

No browser audit was run in this 2026-05-25 slice. Next session should browser-check `/thesis?audit=1` before calling the latest board visually checked.

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

### Recommended first patch: Spring/Winter Wheat mapping decision

Problem:

- `/thesis` intentionally displays Spring Wheat and Winter Wheat as V1 rows.
- Current source-backed cache has generic Wheat, plus class-specific crop-progress source rows in Canada.
- Canada generic Wheat packet does not receive `canada_crop_progress` because silently aliasing class data into generic Wheat would create fake precision.

Decision needed:

1. Keep Spring Wheat and Winter Wheat as explicit `Mapping needed` placeholders for V1.
   - Fastest and safest.
   - Public copy must clearly say class-specific source mapping is pending.
   - Do not use generic Wheat as a hidden proxy.

2. Build class-specific packet mapping.
   - Add explicit packet/source mapping for Spring Wheat and Winter Wheat.
   - Label any proxy fields honestly.
   - Preserve generic Wheat as generic Wheat, not as a catch-all for class claims.

Recommendation:

- Pick option 1 for V1 unless Kyle specifically wants class-specific mapping now.
- Reason: ship source-honest V1 before inventing class precision.

Acceptance criteria for next patch:

- `/thesis` still renders all 9 V1 rows.
- Spring Wheat and Winter Wheat labels make mapping status explicit.
- No hidden generic-Wheat alias creates class-specific precision.
- Source-health/banner copy does not imply broken data for intentionally unmapped rows.
- Focused `thesis-board` tests pass.
- Browser audit of `/thesis?audit=1` has clean console and farmer-readable mapping copy.

Suggested commands:

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git status --short --branch
git log --oneline -8
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx
npm run validate-data-layer
npm run build
```

For browser audit:

```bash
npm run dev
# open http://127.0.0.1:3000/thesis?audit=1
```

## One-line prompt for the next session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`, and `docs/plans/2026-05-25-bushel-board-handoff.md`; keep `/thesis` scoped to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats only; preserve unrelated stashes; do not infer export projection pace in UI from `usda_projection_mt`; next best patch is the Spring/Winter Wheat mapping decision with no fake generic-Wheat aliasing.
