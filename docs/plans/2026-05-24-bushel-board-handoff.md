# Bushel Board handoff — 2026-05-24

> Superseded for next-session startup by `docs/plans/2026-05-25-bushel-board-handoff.md`. Use this file only for historical context on the 2026-05-24 source-sufficiency audit.

## Fast resume

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Latest implementation commit before this handoff: `831332a feat: admit canada crop progress to thesis packets`
Working tree before handoff-doc edits: clean and synced with origin.

Start a new session by reading these files first:

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`
4. This handoff: `docs/plans/2026-05-24-bushel-board-handoff.md`

## Active product lane

Continue the Bullish/Bearish Major-Grains Board V1 only.

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

## What was completed today

### 1. Source-sufficiency audit

Created and updated:

- `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`

Audit conclusion:

- Public source spine is strong enough for scouting-quality V1 thesis work.
- It is not yet final production-grade authorization because Spring/Winter Wheat mapping and guarded projection expansion still need decisions.

### 2. May 2026 WASDE refreshed

Ran:

```bash
npm run collect:wasde -- --report-month 2026-05
```

Fixed importer bug:

- `scripts/import-usda-wasde.py` now uses `sys.executable` instead of hard-coded `python` for heartbeat writes.
- Reason: WSL had `python3`, not necessarily `python`.

Live source state after refresh:

- `usda_wasde_raw`
- latest period: `2026-05-01`
- rows: `2,112`
- freshness: `strong`
- action: `No immediate action.`

US cached packets expose May-vs-April WASDE revision fields for Corn, Soybeans, Wheat, and Barley. Oats 2025 remains on April because USDA PSD returned no May 2026 old-crop Oats rows; 2026 Oats rows are present.

Commit:

- `fc41ea9 fix: refresh wasde with active python`

### 3. Canada crop progress admitted into Canada thesis packets

Added migration:

- `supabase/migrations/20260524123000_wire_canada_crop_progress_into_thesis_packet.sql`

Live DB changes applied through Supabase MCP:

- `get_canada_thesis_packet().supply.canada_crop_progress` now emits mapped Canada crop-progress rows.
- `get_thesis_data_freshness()` now reports `canada_crop_progress`.

App changes:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`

Behavior:

- Canada crop-progress source gets weekly freshness cadence.
- Deterministic `/thesis` drivers can show farmer-readable Canada seeding delay/progress signals where mapped and fresh.
- Generic Canada Wheat intentionally gets no crop-progress payload until Spring/Winter Wheat mapping is decided. Do not silently alias generic Wheat to class-specific crop-progress rows.

Live source state:

- `canada_crop_progress`
- latest period: `2026-05-20`
- rows: `491`
- freshness: `strong`
- action: `No immediate action.`

Cache state after force refresh:

- Canada cache rows: `16`
- US cache rows: `5`
- latest cache refresh: about `2026-05-24 18:28 UTC`
- source-run watermark: about `2026-05-24 18:02 UTC`

Cached Canada crop-progress payloads verified:

- Amber Durum: 2 rows
- Barley: 2 rows
- Canola: 2 rows
- Corn: 1 row
- Oats: 2 rows
- Soybeans: 1 row
- Wheat: 0 rows intentionally, pending mapping decision

Commit:

- `831332a feat: admit canada crop progress to thesis packets`

## Verification already run

After Canada crop-progress admission:

```bash
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx
npm run validate-data-layer
npm run build
git diff --check
```

Results:

- focused `thesis-board` Vitest: 23 passed
- focused ESLint: passed
- `npm run validate-data-layer`: passed
- `npm run build`: passed
- `git diff --check`: passed

No browser audit was run after the Canada crop-progress slice. Run `/thesis?audit=1` next before calling the public board visually checked.

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

Choose one of these two paths:

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

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`, and `docs/plans/2026-05-24-bushel-board-handoff.md`; keep `/thesis` scoped to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats only; preserve unrelated stashes; next best patch is the Spring/Winter Wheat mapping decision with no fake generic-Wheat aliasing.
