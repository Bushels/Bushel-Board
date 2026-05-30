# Bushel Board fresh-session handoff — 2026-05-26

Created: 2026-05-26 17:08 MT
Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Base HEAD before docs-only handoff commit: `e6a6891 Add source freshness watchdog`
Docs handoff commit: this docs-only handoff commit (`git log -1 --oneline` after pull).
Remote: branch is pushed to `origin/codex/data-layer-foundation-v1`
Working tree at handoff: tracked files clean before this docs-only handoff; one unrelated untracked file remains intentionally preserved: `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md`.

## Start here in the new session

Read these first, in order:

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. `docs/plans/2026-05-26-bushel-board-fresh-session-handoff.md`
4. `docs/plans/2026-05-26-bushel-board-handoff.md`
5. `docs/reference/collector-task-configs.md`
6. `docs/reference/canada-crop-progress-release-schedule.md`
7. `docs/reference/usda-export-sales-wasde-projection-admission.md`
8. `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`

## One-line prompt to paste into a new Hermes session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-26-bushel-board-fresh-session-handoff.md`, `docs/plans/2026-05-26-bushel-board-handoff.md`, `docs/reference/collector-task-configs.md`, `docs/reference/canada-crop-progress-release-schedule.md`, and `docs/reference/usda-export-sales-wasde-projection-admission.md`; keep `/thesis` scoped exactly to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats; preserve unrelated stashes and the untracked X signal valuation proposal unless Kyle explicitly redirects; use preview URL `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1` because production is still old `master`; Spring/Winter Wheat are intentional `Mapping needed` placeholders with no generic-Wheat proxy; Barley/Oats Export Sales + WASDE projection claims remain null-guarded unless importer-layer evidence passes the admission guardrail; Canada crop-progress collection is province-staggered with `prairie_week_status`; Hermes owns 13 no-agent collector jobs plus 2 no-agent source-freshness watchdog jobs; next step is to monitor first live collector/watchdog runs and only add reasoning/soft-review after the mechanical data layer proves boring.

## Fixed V1 product scope

`/thesis` V1 rows are exactly:

- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

Do not broaden scope. Explicitly keep out Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans, US rice/cotton, global commodity boards, and Kalshi unless Kyle explicitly redirects.

## Current product/deployment reality

- Current branch/preview work lives on `codex/data-layer-foundation-v1`.
- Preview URL for board checks: `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1`.
- Production is still old `master`; do not infer current behavior from production.
- Base pushed commit before this docs-only handoff: `e6a6891 Add source freshness watchdog`.

## Current completed layer

Mechanical data plumbing is now the active layer:

- 13 Hermes collector cron jobs are active.
- 2 Hermes source-freshness watchdog jobs are active.
- All are `no_agent=true`, `deliver=local`, script-only jobs.
- All run from `/mnt/c/Users/kyle/Agriculture/bushel-board-app`.
- Wrapper scripts live in `/home/kyle/.hermes/scripts/`.
- Logs live in `/home/kyle/.hermes/logs/bushel-board-collectors/`.
- Success should be silent.
- Failure should print collector/watchdog name, exit code, log path, and log tail.

The code/docs commit that added the watchdog is pushed:

- `scripts/check-bushel-source-freshness.ts`
- `package.json` script `check:source-freshness`
- `PROJECT_STATE.md`
- `docs/plans/STATUS.md`
- `docs/plans/2026-05-26-bushel-board-handoff.md`
- `docs/reference/collector-task-configs.md`

## Hermes cron state at handoff

Active jobs: 15 total.

Collector jobs:

- `bushel-collect-usda-crop-progress`: Mon 4:32 PM MT, next `2026-06-01T16:32:00-06:00`
- `bushel-collect-canada-crop-progress-mb-tue`: Tue 12:45 PM MT, next `2026-06-02T12:45:00-06:00`
- `bushel-collect-canada-crop-progress-mb-wed-retry`: Wed 10:30 AM MT, next `2026-05-27T10:30:00-06:00`
- `bushel-collect-grain-monitor`: Wed 2:17 PM MT, next `2026-05-27T14:17:00-06:00`
- `bushel-collect-export-sales`: Thu 9:03 AM MT, next `2026-05-28T09:03:00-06:00`
- `bushel-collect-canada-crop-progress-mb-sk`: Thu 11:15 AM MT, next `2026-05-28T11:15:00-06:00`
- `bushel-collect-cgc`: Thu 1:35 PM MT, next `2026-05-28T13:35:00-06:00`
- `bushel-collect-producer-cars`: Thu 4:00 PM MT, next `2026-05-28T16:00:00-06:00`
- `bushel-collect-canada-crop-progress-all-fri`: Fri 1:45 PM MT, next `2026-05-29T13:45:00-06:00`
- `bushel-collect-cftc-cot`: Fri 2:00 PM MT, next `2026-05-29T14:00:00-06:00`
- `bushel-collect-canada-crop-progress-all-fri-retry`: Fri 3:30 PM MT, next `2026-05-29T15:30:00-06:00`
- `bushel-collect-wasde-window`: monthly 10th-14th at 12:33 PM MT, next `2026-06-10T12:33:00-06:00`
- `bushel-collect-wasde-archive`: monthly 13th at 1:00 PM MT, next `2026-06-13T13:00:00-06:00`

Watchdog jobs:

- `bushel-source-freshness-watchdog-tue`: Tue 1:20 PM MT, next `2026-06-02T13:20:00-06:00`
- `bushel-source-freshness-watchdog-mon-wed-fri`: Mon/Wed/Thu/Fri 4:45 PM MT, next `2026-05-27T16:45:00-06:00`

## Watchdog behavior

Manual summary:

```bash
npm run check:source-freshness -- --summary
```

Cron/routine due mode:

```bash
npx tsx scripts/check-bushel-source-freshness.ts --routine-due
```

JSON smoke check:

```bash
npx tsx scripts/check-bushel-source-freshness.ts --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(j.ok, j.cache?.item_count, j.freshness_watch_count)})'
```

Default alerting:

- Missing core source-run rows in the lookback window.
- Latest core source run status not `success` or `skipped`.
- Missing same-day due collector run only when `--routine-due` is present.
- Thesis cache count drift from expected `21`.
- Thesis cache lag behind latest successful core source run beyond grace.
- Friday checkpoint still showing partial Prairie crop-progress status.
- `empty` mechanical freshness rows by default.

Default non-alert context:

- `stale-risk` rows are counted/reported but do not fail unless `--strict-freshness` is used.
- Optional local and retired/analysis sources are ignored by default: `market_analysis`, `us_market_analysis`, `x_market_signals`, and optional local-only lanes.

Expected historical test alert:

- Running `--routine-due` after the already-passed Tuesday 2026-05-26 Manitoba slot correctly produced a missing Manitoba alert. That was expected because the job was created after that day’s collection slot. The Tuesday watchdog starts live on 2026-06-02.

## Critical data/source rules

### Spring/Winter Wheat

- Spring Wheat and Winter Wheat remain visible as explicit `Mapping needed` / `Mapping pending` rows.
- Do not proxy them with generic Wheat.
- Keep copy like: `Generic Wheat is not used as a proxy for this row.`

### Export Sales + WASDE projection admission

- Wheat, Corn, and Soybeans have importer-admitted guarded projection pace.
- Barley and Oats remain null-guarded because diagnostics show implied paces outside the 60-140% admission guardrail.
- Do not compute projection pace in UI/query code from raw `total_commitments_mt` and `usda_projection_mt`.
- Any expansion must happen in the importer/admission layer with commodity/year/month/unit/projection checks.

### Canada crop progress

- Manitoba: Tuesday collector plus Wednesday retry.
- Saskatchewan: Thursday collector.
- Alberta: Friday after official release target plus later Friday retry.
- Treat Prairie week as partial until Alberta lands or is explicitly stale/missing after retry.
- `collect:canada-crop-progress:missing-ab` remains manual-only. Do not schedule it automatically.

## What to do next

Primary next action:

1. Let Wednesday 2026-05-27 jobs run:
   - Manitoba retry at 10:30 AM MT.
   - Grain Monitor at 2:17 PM MT.
   - Watchdog at 4:45 PM MT.
2. Inspect Hermes cron status and logs after the watchdog window:
   - `hermes cron status`
   - `/home/kyle/.hermes/logs/bushel-board-collectors/`
3. Run manual summary if needed:
   - `npm run check:source-freshness -- --summary`
4. If alerting occurs, classify it before changing code:
   - real collector failure,
   - official-source publication lag,
   - schedule/grace tuning issue,
   - parser/importer issue,
   - cache refresh lag.
5. Only after collectors/watchdogs prove stable should reasoning/soft-review/Opus-style interpretation automation be added.

Do not add reasoning automation in the fresh session unless the first live mechanical runs are boring.

## Verification already completed before this handoff

- `npm run check:source-freshness -- --summary`: passed.
- `npx eslint scripts/check-bushel-source-freshness.ts --max-warnings=0`: passed.
- `git diff --check`: passed.
- JSON output from watchdog parsed successfully.
- Wrapper failure mode was verified with expected Tuesday Manitoba missing-run alert.
- Branch was pushed at commit `e6a6891`.

## Known unrelated state

Preserve unless Kyle redirects:

- Untracked: `docs/plans/2026-05-27-x-signal-valuation-guardrail-framework.md`
- Existing stashes from prior handoff:
  - `stash@{0}: On codex/data-layer-foundation-v1: wip crop-progress infographic scripts`
  - `stash@{1}: WIP on master: ca4459a refactor: expanded chat-architect agent with detailed tool schemas (Track 36)`

Known technical debt still applies:

- `npx tsc --noEmit --pretty false` has existing non-harness test type debt.
- Supabase advisors still flag `public.prediction_scorecard` with RLS disabled; do not blindly enable RLS without policies.
- Kalshi remains parked until open grain commodity markets return.
- Barchart OnDemand intraday Canola remains paused until `BARCHART_ONDEMAND_API_KEY` is available.
