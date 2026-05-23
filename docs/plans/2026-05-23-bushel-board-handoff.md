# Bushel Board handoff — 2026-05-23

## Session status

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Scope: Bullish/Bearish Major-Grains Board V1 only.

V1 grain scope remains exactly:

- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

Still excluded unless Kyle explicitly redirects: pulses, flax, smaller CGC labels, US rice/cotton, global lanes, and Kalshi expansion.

## What was completed in this slice

### `/thesis?audit=1` product verification after Export Sales projection admission

Verified locally that the live/cached board behaves correctly after the Export Sales + WASDE projection admission slice:

- `/thesis?audit=1` loads locally.
- Browser console is clean.
- All 9 V1 quick-scan rows render.
- Wheat visibly surfaces the guarded projection driver: `Export sales outrunning WASDE projection`.
- Wheat projection evidence is anchored to the admitted live row:
  - `total_commitments_mt = 25,061,015`
  - `usda_projection_mt = 24,494,000`
  - `export_pace_pct = 102.315`
- Corn, Soybeans, Barley, and Oats do not show fake projection-pace claims while their guarded projection fields remain null.
- WASDE/quarterly-stocks cached source rows with latest periods no longer display misleading `empty` / `Build or seed this source` warnings from stale row-count estimates.

### Code changes in this slice

Files touched:

- `lib/queries/thesis-board.ts`
- `lib/__tests__/thesis-board.test.ts`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/plans/2026-05-23-bushel-board-handoff.md`

Behavior change:

- Cached freshness rows whose status says `empty` but whose packet contains a valid `latest_period_end` are normalized by source cadence.
- Strong cached source rows get `No immediate action.` instead of a false seed/build instruction.
- Quality warnings are aligned to normalized freshness and filtered out when the source is strong.
- A focused regression test locks this behavior.

## Verification completed

Final local validation for this slice:

```bash
npx vitest run lib/__tests__/thesis-board.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx
npm run validate-data-layer
npm run build
git diff --check
```

All passed locally.

Browser verification:

- Local dev server at `http://127.0.0.1:3000/thesis?audit=1` loaded successfully.
- Console check was clean.
- The dev server was stopped after verification.

## Important constraints for the next session

- Preserve the nine-grain V1 scope.
- Do not expand into new grains, Kalshi, global boards, or a new source family before the current `/thesis` board is farmer-readable and stable.
- Treat sparse Export Sales projection fields as a quality guardrail, not missing work: Wheat passed; other commodities intentionally remain null until the join is safe.
- Keep credentials/secrets out of commits and responses.
- Be careful with Supabase RLS. MCP/advisors have previously flagged `public.prediction_scorecard` with RLS disabled, but do not blindly enable RLS without policies because it could break production reads/writes.

## Recommended next move

Pick one narrow next slice:

1. Farmer-facing `/thesis` interpretability polish: make the sparse/admitted projection logic clearer in the UI without adding new columns or model prose.
2. Or, if product polish is stable, admit the next trusted data-source field only with the same guardrail discipline used for Export Sales projection pace.

Avoid starting a broad V2 or minor-grain expansion.

## Fast resume commands

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
git status --short --branch
git log --oneline -8
git stash list --max-count=3
```

Known unrelated stash from before this slice:

```text
stash@{0}: On codex/data-layer-foundation-v1: wip crop-progress infographic scripts
```

Do not restore or commit that stash unless explicitly switching to the crop-progress parser/infographic slice.

## One-line handoff prompt for a new session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `docs/plans/2026-05-23-bushel-board-handoff.md`, `PROJECT_STATE.md`, and `docs/plans/STATUS.md`; preserve the unrelated crop-progress/infographic stash; keep Bullish/Bearish V1 to the nine approved grains; then choose one narrow next `/thesis` interpretability or guarded-source-admission slice.
