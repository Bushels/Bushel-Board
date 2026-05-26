# Bushel Board handoff — 2026-05-26

## Fast resume

Repo: `/mnt/c/Users/kyle/Agriculture/bushel-board-app`
Branch: `codex/data-layer-foundation-v1`
Current HEAD at handoff creation: `be78981 docs: verify Canada crop progress schedule`
Working tree at handoff creation: docs-only changes for this handoff; preserve unrelated stashes.

Start a new session by reading these files first:

1. `PROJECT_STATE.md`
2. `docs/plans/STATUS.md`
3. `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`
4. `docs/reference/canada-crop-progress-release-schedule.md`
5. This handoff: `docs/plans/2026-05-26-bushel-board-handoff.md`

## Fixed V1 scope

Continue Bullish/Bearish Major-Grains Board V1 only.

The `/thesis` V1 row list is exactly:

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

Do not broaden scope. Do not let importer automation or Codex-generated grain lists silently add rows outside the nine approved V1 lanes.

## Current deployment reality

Use the branch preview for current board work:

- Preview URL: `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1`
- Vercel target: preview
- Branch: `codex/data-layer-foundation-v1`

Production is still old `master` and should not be treated as the current board:

- Production URL: `https://bushel-board-app.vercel.app/thesis`
- Production branch: `master`
- Known old production commit from prior handoff: `4398413`
- Production does not include the current Spring/Winter Wheat placeholder behavior.

If the preview needs verification and the browser session hits Vercel auth, verify locally against a production build or use an authenticated Vercel preview session. Do not infer production behavior from old `master`.

## Current source and admission state

### Export Sales + WASDE projection pace

Importer/admission state:

- USDA ESR commodity codes were corrected in `scripts/import-usda-export-sales.py`.
- Live re-import refreshed Corn/Soybeans/Barley/Oats through `2026-05-14`.
- Cached US Wheat, Corn, and Soybeans have importer-admitted guarded projection pace.
- Barley and Oats intentionally remain null-guarded because the safe public FAS/WASDE comparison still does not pass admission guardrails.

Hard rule:

- UI/query code must not compute projection pace from raw `total_commitments_mt` and `usda_projection_mt`.
- Any expansion belongs in the importer/admission layer where commodity mapping, market-year alignment, report-month alignment, units, and 60–140% implied pace bounds can be checked.

### Spring/Winter Wheat class mapping

V1 decision is locked unless Kyle redirects:

- Spring Wheat and Winter Wheat stay visible as explicit `Mapping needed` / `Mapping pending` rows.
- Generic Canada/US Wheat packets are not aliases for Spring Wheat or Winter Wheat.
- Copy should continue to make this plain: `Generic Wheat is not used as a proxy for this row.`

Do not “helpfully” fill these rows from generic Wheat.

### Canada crop progress schedule

Verified schedule doc: `docs/reference/canada-crop-progress-release-schedule.md`.

Operating rule:

- Manitoba: Tuesday check, Wednesday retry.
- Saskatchewan: Thursday check, Friday retry if needed.
- Alberta: Friday after the official ~1:30 PM MT release target, with later Friday retry.
- Treat the Canada/Prairie crop-progress week as `partial_prairie_week` until Alberta lands or is explicitly stale/missing after retry.

Hard rule:

- Earlier Manitoba/Saskatchewan imports can write source rows and soft evidence.
- Do not let Tuesday/Thursday partial Prairie data drive a full-week Canada thesis interpretation.
- Spring/Winter Wheat remain no-proxy placeholders even if provincial crop-progress text mentions broad wheat classes.

## Recommended next steps

### Primary next patch: Canada crop-progress scheduler/live cadence wiring

Export Sales/WASDE Barley-Oats admission is resolved for current V1, and the Canada crop-progress importer now discovers province sources dynamically with `prairie_week_status`. The next best code patch is scheduler/live cadence wiring so collection follows the verified province release sequence without treating partial weeks as complete Prairie thesis evidence.

Recommended task order:

1. Review, commit, and push the current Export Sales diagnostics plus Canada crop-progress discovery/status patch.
2. Wire scheduled Canada crop-progress runs to the verified cadence:
   - Manitoba Tuesday check plus Wednesday retry.
   - Saskatchewan Thursday check plus Friday retry if needed.
   - Alberta Friday after the official ~1:30 PM MT target plus later Friday retry.
3. Use `--province` for province-specific collection and reserve `--missing-province` only for explicit stale/missing post-retry outcomes.
4. Keep `prairie_week_status` partial (`partial_mb_only`, `partial_mb_sk`, or `partial_prairie_week`) until Alberta lands or a province is explicitly marked stale/missing after its retry window.
5. Only refresh or authorize a full Canada crop-progress thesis package after `complete_mb_sk_ab` or a justified `complete_with_missing_province` status.

### Export Sales/WASDE admission state — resolved for current V1

2026-05-26 audit result:

- Code now records row-level diagnostics in `source_runs.metadata.projection_admission.latest_by_commodity`.
- Live Barley/Oats re-import source run: `7dfecb68-b415-4462-9662-9fb2f6bfce49`.
- Rows upserted: 61 through ESR week `2026-05-14`.
- Barley latest diagnostic: ESR code `301`, FAS `2025-2026`, WASDE market year `2025`, report month `2026-05-01`, commitments `74,836 mt`, projection `196,000 mt`, implied pace `38.182%`.
- Oats latest diagnostic: ESR code `601`, FAS `2025-2026`, WASDE market year `2025`, report month `2026-04-01`, commitments `864 mt`, projection `44,000 mt`, implied pace `1.964%`.
- Decision: genuine guardrail miss / thin-source mismatch. Keep Barley/Oats null-guarded; do not weaken guardrails or add UI inference.
- Reference: `docs/reference/usda-export-sales-wasde-projection-admission.md`.

Suggested focused commands:

```bash
cd /mnt/c/Users/kyle/Agriculture/bushel-board-app
python3 -m unittest tests/scripts/test_import_usda_export_sales.py
python3 -m py_compile scripts/import-usda-export-sales.py tests/scripts/test_import_usda_export_sales.py
npx vitest run lib/__tests__/thesis-board.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
npx eslint lib/queries/thesis-board.ts lib/__tests__/thesis-board.test.ts app/'(dashboard)'/thesis/page.tsx --max-warnings=0
npm run validate-data-layer
npm run build
```

## Verification expectations for the next code patch

For the Canada crop-progress automation patch, do not stop at parser tests. Verify all of this:

- `git status --short --branch` shows expected files only.
- Existing stashes remain untouched.
- Focused Canada crop-progress importer tests pass.
- Province-specific dry-runs show MB/SK/AB source discovery evidence without writing live rows.
- `source_runs.metadata` shape records `prairie_week_status` in tests/fixtures.
- Partial-week status cannot authorize a full Canada crop-progress thesis package before Alberta lands or is explicitly stale/missing after retry.
- `npm run validate-data-layer` passes.
- `npm run build` passes.
- `/thesis?audit=1` still renders exactly the nine V1 rows.
- Barley/Oats still do not show projection-pace copy unless importer-admitted fields are non-null.
- Spring/Winter Wheat remain mapping-needed placeholders with no generic-Wheat proxy.

## Known unrelated state

Preserve these stashes unless Kyle explicitly asks to restore them:

```text
stash@{0}: On codex/data-layer-foundation-v1: wip crop-progress infographic scripts
stash@{1}: WIP on master: ca4459a refactor: expanded chat-architect agent with detailed tool schemas (Track 36)
```

Known unrelated technical debt still applies:

- `npx tsc --noEmit --pretty false` has existing non-harness test type debt.
- Supabase advisors still flag `public.prediction_scorecard` with RLS disabled. Do not blindly enable RLS without policies.
- Kalshi remains parked until open grain commodity markets return.
- Barchart OnDemand intraday Canola remains paused until `BARCHART_ONDEMAND_API_KEY` is available.

---

## 2026-05-26 - Export Sales projection diagnostics for Barley/Oats

**Driver:** The handoff asked for a guarded importer-layer decision on whether Barley/Oats could safely admit Export Sales pace versus WASDE export projections. The risk was weakening guardrails or adding UI-side inference just to make more rows look complete.

**Change:** Added `projection_admission.latest_by_commodity` diagnostics to `scripts/import-usda-export-sales.py` and focused tests in `tests/scripts/test_import_usda_export_sales.py`. The diagnostics record commodity code/name, FAS market year, ESR week, WASDE market/year/report month, commitments, converted projection, implied pace, status, and reason. Added `docs/reference/usda-export-sales-wasde-projection-admission.md` as the operating reference.

**Live verification:** Re-imported only Barley/Oats for market year 2026. Source run `7dfecb68-b415-4462-9662-9fb2f6bfce49` upserted 61 rows through `2026-05-14` and admitted 0 projection rows. Latest Barley pace was `38.182%` of a `196,000 mt` WASDE export projection; latest Oats pace was `1.964%` of a `44,000 mt` projection. Both remain null-guarded. Forced thesis cache refresh to 21 rows with source-run watermark `2026-05-26T17:17:12.201648+00:00`.

**Verification:** Focused Python importer tests and py_compile passed; focused `thesis-board` Vitest passed; scoped ESLint passed; `npm run validate-data-layer` passed; `npm run build` passed. Local `/thesis?audit=1` returned 200, rendered all 9 V1 rows, preserved Spring/Winter Wheat no-proxy copy, and showed no Barley/Oats projection claims with a clean browser console.

**Next:** Canada crop-progress automation is now the primary code patch: province-specific source discovery plus `prairie_week_status`, keeping the Prairie week partial until Alberta lands Friday or is explicitly stale/missing.

---

## 2026-05-26 - Canada crop-progress source discovery + Prairie week status

**Driver:** The next code patch was Canada crop-progress automation discipline: stop treating MB/SK/AB as one guessed weekly release, surface source-discovery evidence, and record whether the Prairie week is partial or complete.

**Change:** Updated `scripts/import-canada-crop-progress.py` so province discovery returns structured evidence instead of only a URL. Manitoba records the latest index PDF link/date/candidate count, Saskatchewan records page-discovered report/table links separately, and Alberta records Open Alberta package/resource metadata including `resource_id`, `created`, `last_modified`, package `date_modified`, and report date. `source_runs.metadata` now includes `prairie_week_status`, `missing_provinces`, `province_release_sequence`, and discovery details inside each province summary. Added `--missing-province` for the explicit stale/missing retry-window case and validation so a collected province cannot also be marked missing; otherwise MB-only stays `partial_mb_only`, MB+SK stays `partial_mb_sk`, and MB+SK+AB is `complete_mb_sk_ab`.

**Verification:** Added `tests/scripts/test_import_canada_crop_progress.py` covering Prairie-week status, MB/SK/AB discovery parsing, and province summary metadata. Passed `python3 -m unittest tests/scripts/test_import_canada_crop_progress.py`, `python3 -m py_compile scripts/import-canada-crop-progress.py tests/scripts/test_import_canada_crop_progress.py`, province-specific dry-runs for MB/SK/AB, all-province dry-run, `npm run validate-data-layer`, and `npm run build`. Local `/thesis?audit=1` returned 200, browser console was clean, all nine V1 rows rendered, Barley/Oats still showed no projection-pace claim, and Spring/Winter Wheat retained no-proxy copy.

**Dry-run evidence:** MB dry-run parsed 1 row from discovered `crop-report-2026-05-20.pdf` and marked `partial_mb_only`; SK parsed 99 rows with discovered seeding-progress table format and marked `partial_prairie_week` for a standalone SK run; AB parsed 72 rows from Open Alberta resource `b068e0d5-e1ae-4cc1-8bf3-5ff31b6d8643` and marked `partial_prairie_week`; all-province dry-run parsed 172 rows and marked `complete_mb_sk_ab`.

**Scheduler wrapper wiring:** Added package scripts and collector docs for the external routine cadence. Use `npm run collect:canada-crop-progress:mb` for Tuesday/Wednesday Manitoba, `npm run collect:canada-crop-progress:mb-sk` for the Thursday MB+SK partial bundle, `npm run collect:canada-crop-progress:all` for the Friday all-province checkpoint after Alberta metadata advances, and `npm run collect:canada-crop-progress:missing-ab` only after the Friday retry verifies Alberta stale/missing. These use `scripts/run-collector-with-thesis-cache-refresh.ts` and do not add Vercel crons or revive the Grok pipeline.

---

## 2026-05-26 - Hermes mechanical collector cron suite registered

**Driver:** The next best step was not just Canada crop progress. Bushel Board needs the full weekly source spine refreshed throughout the week before Friday thesis/debate work.

**Change:** Registered 13 Hermes `no_agent=true` script-only cron jobs for the mechanical collector layer. The jobs run from `/mnt/c/Users/kyle/Agriculture/bushel-board-app`, execute wrapper scripts under `/home/kyle/.hermes/scripts/`, and log to `/home/kyle/.hermes/logs/bushel-board-collectors/`. Success is silent; failures print the failed collector, exit code, log path, and tail.

**Registered jobs:** USDA Crop Progress Monday; Manitoba crop progress Tuesday plus Wednesday retry; Grain Monitor Wednesday; Export Sales Thursday; Manitoba+Saskatchewan crop progress Thursday; CGC weekly Thursday; Producer Cars Thursday; Alberta/all-Prairie crop progress Friday plus retry; CFTC COT Friday; WASDE during the monthly 10th-14th window; WASDE archive on the 13th.

**Guardrail:** `collect:canada-crop-progress:missing-ab` was not scheduled automatically. It remains manual-only because marking Alberta missing creates a thesis-semantic `complete_with_missing_province` state and should only happen after the Friday retry proves the official Alberta source is stale/missing.

**Verification:** `hermes cron status` reports the gateway running with 13 active jobs and next run `2026-05-27T10:30:00-06:00`.

## 2026-05-26 - Source freshness watchdog registered

**Driver:** After registering mechanical collectors, the next layer should verify plumbing and cache freshness before adding reasoning/Opus-style interpretation.

**Change:** Added `scripts/check-bushel-source-freshness.ts` and package script `npm run check:source-freshness`. The script is read-only and checks latest `source_runs`, expected thesis cache item count (`21`), cache lag behind source imports, Friday Prairie completeness, and V1 mechanical freshness rows while ignoring optional local/retired analysis sources by default. `--summary` prints an operator summary; default cron mode stays silent on OK; `--routine-due` additionally alerts when a collector due for the current MT weekday did not write a same-day source run.

**Hermes cron:** Registered two no-agent watchdog jobs using `/home/kyle/.hermes/scripts/bushel-source-freshness-watchdog.sh`: Tuesday 1:20 PM MT after Manitoba and Monday/Wednesday/Thursday/Friday 4:45 PM MT after the day's mechanical collectors. Success is silent; failures print the alert and log tail. The Tuesday watchdog intentionally starts next Tuesday so it does not alert on the already-passed 2026-05-26 Manitoba slot.

**Verification:** `npm run check:source-freshness -- --summary` passes against the current live state with `cache_items=21`; `npm run check:source-freshness -- --summary --routine-due` correctly flags the already-passed Tuesday Manitoba run as missing; wrapper failure propagation was verified with the same intentional Tuesday alert.

## One-line prompt for the next session

Continue Bushel Board from `/mnt/c/Users/kyle/Agriculture/bushel-board-app` on branch `codex/data-layer-foundation-v1`. Read `PROJECT_STATE.md`, `docs/plans/STATUS.md`, `docs/plans/2026-05-24-v1-source-sufficiency-audit.md`, `docs/reference/canada-crop-progress-release-schedule.md`, `docs/reference/collector-task-configs.md`, `docs/reference/usda-export-sales-wasde-projection-admission.md`, and `docs/plans/2026-05-26-bushel-board-handoff.md`; keep `/thesis` scoped exactly to Corn, Soybeans, Wheat, Spring Wheat, Winter Wheat, Durum, Canola, Barley, and Oats; preserve unrelated stashes and the untracked X signal valuation proposal unless Kyle explicitly redirects; use preview URL `https://bushel-board-9b5onjzpr-kyles-projects-d3ab6818.vercel.app/thesis?audit=1` because production is still old `master`; Spring/Winter Wheat are intentionally `Mapping needed` placeholders with no generic-Wheat proxy; Export Sales + WASDE projection admission is resolved for current V1 with Wheat/Corn/Soybeans admitted and Barley/Oats null-guarded by diagnostics; Canada crop-progress importer now has province-specific discovery evidence plus `prairie_week_status`, and package scripts are wired for the province-staggered cadence (`collect:canada-crop-progress:mb`, `:mb-sk`, `:all`, `:missing-ab`). Hermes now owns the mechanical collector cron suite with 13 `no_agent=true` jobs for the weekly/monthly source spine plus two no-agent source-freshness watchdog jobs; next best step is monitoring the first live watchdog/collector outputs, then adding reasoning/soft-review only after the data plumbing proves boring.
