# Bushel Board source-quality handoff — 2026-05-31

Created: 2026-05-31 17:36 MT
Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
HEAD at handoff creation: `b264b2d feat: surface canada crop progress freshness`
Previous same-day handoff superseded for task selection: `docs/plans/2026-05-31-bushel-board-fresh-session-handoff.md`

## Read first

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. This handoff
4. `docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md` if continuing the rating-model lane
5. `docs/reference/thesis-rating-model-v1.md` for scorecard/rating-model rules

Older handoffs are historical. Use them for source-admission history, not for current task selection.

## Current verified product scope

Public V1 board scope is source-backed rows only:

- Corn
- Soybeans
- Wheat
- Durum / Amber Durum
- Canola
- Barley
- Oats

Explicit exclusions unless Kyle redirects:

- Spring Wheat and Winter Wheat are parked off public board surfaces until class-safe source mapping is admitted.
- Do not use generic Canada/US Wheat as a proxy for Spring Wheat or Winter Wheat.
- Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans, smaller CGC labels, US rice/cotton, global commodity boards, and Kalshi are out of this V1 pass.
- Do not add UI-side Export Sales/WASDE projection inference for Barley/Oats. Projection pace must remain importer-admitted and guardrailed.

## Latest shipped checkpoint

### 1. Prairie crop-progress parser hardening

Commit:

- `6bc37ac fix: harden prairie crop progress parsing`

Files:

- `scripts/import-canada-crop-progress.py`
- `tests/scripts/test_import_canada_crop_progress.py`
- `supabase/functions/_shared/push-triggers.ts`

Result:

- Saskatchewan parsing uses non-layout narrative text and handles newer seeding-progress wording.
- Saskatchewan current-report excerpts are dynamic instead of stale hardcoded text.
- Alberta parsing skips historical dated rows embedded in the current table.
- Regression tests cover Saskatchewan narrative/period extraction and Alberta historical-row exclusion.
- A stale unrelated lint blocker in `push-triggers.ts` was removed.

Verification:

- `python3 -m unittest tests/scripts/test_import_canada_crop_progress.py` passed: 8 tests.
- `npm run lint` passed, warnings only.
- `npm run build` passed.

### 2. Canada crop-progress freshness visibility

Commit:

- `b264b2d feat: surface canada crop progress freshness`

File:

- `supabase/migrations/20260531213401_add_canada_crop_progress_freshness.sql`

Live Supabase migration applied:

- `add_canada_crop_progress_freshness`

Result:

- `public.v_source_freshness` now includes `canada_crop_progress`.
- Freshness contract:
  - source lane: `canada`
  - cadence: weekly provincial crop reports during growing season
  - thesis use: supply / weather proxy
  - `strong` threshold: <= 10 days
  - `stale-risk` threshold: <= 17 days
- `public.grain_market_mappings` has active official primary mappings only for admitted V1 Canada crop-progress lanes:
  - Barley
  - Canola
  - Corn
  - Durum
  - Oats
  - Soybeans
- No Spring Wheat, Winter Wheat, or generic Wheat proxy mapping was added.

Live DB verification at handoff:

- `v_source_freshness` row for `canada_crop_progress`:
  - latest period: `2026 / AB / 2026-05-26`
  - latest period end: `2026-05-26`
  - rows available: `627`
  - freshness status: `strong`
  - last run status: `success`
  - action hint: `No immediate action.`
- `grain_market_mappings` rows for `canada_crop_progress`:
  - Barley / canada / official / primary / 1.0 / active
  - Canola / canada / official / primary / 1.0 / active
  - Corn / canada / official / primary / 1.0 / active
  - Durum / canada / official / primary / 1.0 / active
  - Oats / canada / official / primary / 1.0 / active
  - Soybeans / canada / official / primary / 1.0 / active

Verification:

- `python3 -m unittest tests/scripts/test_import_canada_crop_progress.py` passed: 8 tests.
- Focused thesis tests passed:
  - `lib/__tests__/thesis-board.test.ts`
  - `app/(dashboard)/thesis/page.test.tsx`
  - 33 tests.
- `npm run lint` passed: 0 errors / 71 warnings.
- `npm run build` passed.
- `git diff --check` passed.

## Working-tree caution

At handoff creation, tracked files were clean after the source-quality commits. Known untracked local files were intentionally preserved:

- `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md`
- `scratch/`

Do not stage those unless Kyle explicitly reopens that valuation/guardrail framework or scratch work.

## Known blockers and boundaries

- Full Vitest all-files run still hangs/not-exits as a test-runner/open-handle issue. Treat it as test infrastructure debt, not as product regression when focused tests pass.
- Lint warnings remain cleanup debt; latest relevant pass had 71 warnings and 0 errors.
- `prediction_scorecard` is fixed live: RLS enabled, public read-only, service-role writes retained. Do not loosen policy casually.
- Kalshi remains parked. Closed/finalized markets may be wiring proof only and must not feed live thesis/probability copy.
- No new public source lanes should be admitted before the transparent rating scorecard can explain the current admitted data.
- Canada crop progress is a supply/weather proxy lane. Do not turn it into direct weather evidence unless/ until a real weather source is admitted.

## Recommended next move

Continue the transparent thesis rating model from:

- `docs/plans/2026-05-28-transparent-thesis-rating-model-v1.md`
- `docs/reference/thesis-rating-model-v1.md`

Recommended implementation posture:

1. Inspect the current code before assuming which rating-model task is next.
2. Keep scorecard/audit outputs additive.
3. Do not replace visible farmer-facing stance behavior without an explicit migration plan.
4. Keep V1 public scope locked to source-backed rows only.
5. If touching source gates, add tests before widening behavior.
6. If spending time on full-suite Vitest, isolate that as its own test-infrastructure task.

## Useful commands for the fresh session

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git status --short
git branch --show-current
git log --oneline -8
```

Focused verification commands used in this checkpoint:

```bash
python3 -m unittest tests/scripts/test_import_canada_crop_progress.py
npm test -- --run lib/__tests__/thesis-board.test.ts 'app/(dashboard)/thesis/page.test.tsx' --pool=threads --testTimeout=60000
npm run lint
npm run build
git diff --check
```

Live DB sanity checks, if needed:

```sql
select source_name, source_lane, latest_period, latest_period_end, rows_available, freshness_status, last_run_status, action_hint
from public.v_source_freshness
where source_name = 'canada_crop_progress';

select canonical_grain, market_lane, source_commodity, source_class, mapping_type, mapping_confidence, active
from public.grain_market_mappings
where source_name = 'canada_crop_progress'
order by canonical_grain, market_lane;
```

## Pasteable continuation prompt

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, and `docs/plans/2026-05-31-bushel-board-source-quality-handoff.md` first. Preserve unrelated untracked files and inspect `git status --short` plus `git diff --stat` before staging. Current verified V1 public board scope is source-backed rows only: Corn, Soybeans, Wheat, Durum/Amber Durum, Canola, Barley, and Oats. Spring/Winter Wheat and smaller Canada crops are parked/excluded unless Kyle redirects. Latest shipped commits are `6bc37ac` (prairie crop-progress parser hardening) and `b264b2d` (Canada crop-progress freshness visibility). Live Supabase has `canada_crop_progress` in `v_source_freshness` as strong with latest AB period `2026-05-26` / 627 rows and mappings only for Barley, Canola, Corn, Durum, Oats, Soybeans. Do not map generic Wheat or promote Spring/Winter Wheat. Next best implementation lane is the transparent thesis rating model plan, not source-scope expansion. Use focused tests, lint, build, and browser/DB checks as needed; full Vitest all-files hang is separate test-runner debt.
