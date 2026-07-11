# Daily Data Collector — Scheduled Task Configurations

> **Purpose:** Reference copy of the 8 daily/weekly/monthly data collector scheduled tasks for Track 41 (Claude Agent Desk).
> These tasks feed Supabase with fresh data throughout the week so the Friday swarm reads current data.

## Task Summary

> **Timezone note (2026-04-24):** Claude Desktop Routine cron expressions fire in the scheduler's *local* time, which is America/Edmonton (MT) for this project. The `Time (MT)` column below is the authoritative fire time. The `Time (ET)` column is derived (+2h during DST, +2h during standard time) and shown for desk-operator convenience only. Historical revisions of this doc labelled the local cron as "ET" — that was drift. Cross-check every row against `list_scheduled_tasks` before trusting either column.
>
> The currently registered task set is the source of truth: if a cron here disagrees with the live task, the doc is wrong, not the task (unless a timing change has been deliberately deferred to a documented migration).

| Task ID | Cron (local / MT) | Day | Time (MT) | Time (ET, DST) | Source | Target Table |
|---------|-------------------|-----|-----------|----------------|--------|-------------|
| `collect-crop-progress` | `32 16 * * 1` | Mon | 4:32 PM | 6:32 PM | USDA NASS | `usda_crop_progress` |
| `collect-canada-crop-progress-mb` | `45 12 * * 2` / `30 10 * * 3` | Tue + Wed retry | 12:45 PM Tue / 10:30 AM Wed | 2:45 PM Tue / 12:30 PM Wed | Manitoba Agriculture Crop Report | `canada_crop_progress` |
| `collect-grain-monitor` | `17 14 * * 3` | Wed | 2:17 PM | 4:17 PM | grainmonitor.ca (weekly PDF) | `grain_monitor_snapshots` |
| `collect-canada-crop-progress-sk` | `15 11 * * 4` | Thu | 11:15 AM | 1:15 PM | Saskatchewan Crop Report / Publications Saskatchewan | `canada_crop_progress` |
| `collect-export-sales` | `3 9 * * 4` | Thu | 9:03 AM | 11:03 AM | USDA FAS | `usda_export_sales` |
| `collect-cgc` | `35 13 * * 4` | Thu | 1:35 PM | 3:35 PM | grainscanada.gc.ca (CSV fetch -> `import-cgc-weekly`) | `cgc_observations` + `score_trajectory` |
| `collect-producer-cars` | `0 16 * * 4` | Thu | 4:00 PM | 6:00 PM | grainscanada.gc.ca Producer Car CSV | `producer_car_allocations` |
| `collect-canada-crop-progress-ab` | `45 13 * * 5` / `30 15 * * 5` | Fri | 1:45 PM + 3:30 PM retry | 3:45 PM + 5:30 PM retry | Alberta Crop Reports / Open Alberta | `canada_crop_progress` |
| `collect-cftc-cot` | `0 14 * * 5` | Fri | 2:00 PM | 4:00 PM | cftc.gov | `cftc_cot_positions` |
| `collect-wasde` | `33 12 10-14 * *` | Monthly 10th–14th window | 12:33 PM | 2:33 PM | usda.gov | `usda_wasde_raw` / `usda_wasde_mapped` |
| `collect-wasde-archive` | `0 13 13 * *` (UTC: `0 19 13 * *`) | 13th of month | 1:00 PM | 3:00 PM | esmis.nal.usda.gov (.xls archive) | `usda_wasde_raw` (revision history) |
| `source-freshness-watchdog-tue` | `20 13 * * 2` | Tue | 1:20 PM | 3:20 PM | Hermes read-only watchdog | `source_runs` / `thesis_packet_cache` checks |
| `source-freshness-watchdog-mon-wed-fri` | `45 16 * * 1,3-5` | Mon/Wed/Thu/Fri | 4:45 PM | 6:45 PM | Hermes read-only watchdog | `source_runs` / `thesis_packet_cache` checks |
| `desk-output-watchdog` **(PROPOSED 2026-07-11 — not yet registered)** | `0 9 * * 6` | Sat | 9:00 AM | 11:00 AM | `npm run check:desk-freshness` | `market_analysis` / `us_market_analysis` recency |

## Weekly Timeline (MT local, ET parenthesised)

```
MON  4:32 PM MT (6:32 PM ET) — USDA Crop Progress (Apr-Nov only)
TUE 12:45 PM MT (2:45 PM ET) — Manitoba Crop Report normal-week check
WED 10:30 AM MT (12:30 PM ET) — Manitoba Crop Report holiday/late-week retry
WED  2:17 PM MT (4:17 PM ET) — Government Grain Monitor
THU  9:03 AM MT (11:03 AM ET) — USDA Export Sales
THU 11:15 AM MT (1:15 PM ET) — Saskatchewan Crop Report / Seeding Progress Table
THU  1:35 PM MT (3:35 PM ET) — CGC Weekly Grain Stats (CSV fetch → import-cgc-weekly EF)
THU  4:00 PM MT (6:00 PM ET) — CGC Producer Cars (direct CSV → producer_car_allocations)
FRI  1:45 PM MT (3:45 PM ET) — Alberta Crop Report after official ~1:30 PM release target
FRI  2:00 PM MT (4:00 PM ET)  — CFTC COT (triggers existing Edge Function)
FRI  3:30 PM MT (5:30 PM ET) — Alberta retry / full-Prairie crop-progress checkpoint
10th-14th 12:33 PM MT (2:33 PM ET) — USDA WASDE PSD API (monthly release window)
13th 1:00 PM MT (3:00 PM ET)  — USDA WASDE archive .xls (monthly, day after typical PSD release)
TUE  1:20 PM MT (3:20 PM ET) — source-freshness watchdog after Manitoba collector
MON/WED/THU/FRI 4:45 PM MT (6:45 PM ET) — source-freshness watchdog after daily mechanical collectors
FRI  us-desk-weekly SWARM first, then grain-desk-weekly SWARM ~1h later (ORDER SWAPPED 2026-07-11:
     the CAD FLAGSHIP Wheat read consumes the US desk Wheat stance as us_desk_cross_read, so the US
     desk must write first. See both swarm prompt headers for exact times; re-register both Routines.)
SAT  9:00 AM MT (11:00 AM ET) — desk-output-watchdog (PROPOSED): npm run check:desk-freshness
```

### Desk Output Watchdog Rationale (added 2026-07-11)

The April–June 2026 outage proved source-side watchdogs are not enough: every collector kept running while the Friday **desks** silently stopped writing for 6 weeks (`market_analysis` parked at week 36). The source watchdogs watch inputs; nothing watched the output. The proposed `desk-output-watchdog` closes the loop: Saturday morning it runs `npm run check:desk-freshness` (exit 1 when `market_analysis`/`us_market_analysis` is older than 9 days) and must NOTIFY THE OPERATOR on failure — a watchdog that only writes a log row recreates the silent-death mode. Register it as a Claude Desktop Routine alongside the Saturday meta-reviewer runs.

### CGC Timing Rationale

CGC publishes the weekly CSV Thursday ~1:00 PM MT. The `collect-cgc` slot now runs as Hermes script-only cron `bushel-collect-cgc` at 1:35 PM MT. It fetches the current CGC page/CSV from the local runtime, forwards the raw CSV to `import-cgc-weekly` with `csv_data`, verifies `cgc_observations`, and writes `collector_cgc` heartbeats. If the live CSV is not ahead of Supabase, the script reports `ALREADY_CURRENT` and does not retry in the same run.

2026-05-02 correction: `/api/pipeline/run` is permanently tombstoned with `grok_workflow_deprecated`; it is not a CGC ingress and should not be refactored back into service. `/api/cron/import-cgc` is also not the active routine path. Use `npm run collect:cgc` so the CGC importer is followed by the thesis packet cache refresh.

### Producer Cars Timing Rationale

`scripts/import-producer-cars.mjs` builds the source URL from the current long-form crop year (`YYYY-YYYY`) and fetches `https://www.grainscanada.gc.ca/en/grain-research/statistics/producer-car/{cropYear}/pca-hwp-en.csv`. That CGC source follows the same weekly Thursday publishing cadence as the main grain statistics release. The `collect-producer-cars` slot sits at 4:00 PM MT — 27 minutes after `collect-cgc` — so the main CGC import lands first and Producer Cars refreshes before the Friday CAD swarm.

### Canada Crop Progress Timing Rationale

Canada crop progress is not a single weekly release. The Prairie sources are province-staggered: Manitoba normally posts Tuesday reports with Wednesday holiday/late-week exceptions, Saskatchewan publishes the Tuesday-to-Monday report/table on Thursday, and Alberta's official 2026 crop reporting calendar says Tuesday survey conditions are released publicly Friday by approximately 1:30 PM MT. See `docs/reference/canada-crop-progress-release-schedule.md` for source URLs and verification notes.

The Friday Alberta checkpoint is the first safe point to treat the Prairie crop-progress package as complete. Earlier Manitoba/Saskatchewan imports may refresh partial source rows, but thesis automation should label the week partial until Alberta lands or the Friday retry explicitly records Alberta stale/missing. Do not let a Tuesday or Thursday Canada crop-progress run write a full-week thesis interpretation.

Use these scheduler commands:

- Tuesday 12:45 PM MT and Wednesday 10:30 AM MT retry: `npm run collect:canada-crop-progress:mb` (`partial_mb_only`).
- Thursday 11:15 AM MT: `npm run collect:canada-crop-progress:mb-sk` (`partial_mb_sk`; re-collects Manitoba for a same-run MB+SK metadata bundle).
- Friday 1:45 PM MT and 3:30 PM MT retry after verifying Alberta metadata has advanced: `npm run collect:canada-crop-progress:all` (`complete_mb_sk_ab`).
- Friday final stale/missing fallback only after Alberta has not advanced by the retry checkpoint: `npm run collect:canada-crop-progress:missing-ab` (`complete_with_missing_province`; re-collects MB+SK and explicitly records AB missing).

## Track 54 Proposed Routines - Prices, X Pulse, Daily Review

Status: review-week gate active. Local dry-run/write-run proof exists as of 2026-06-01, and the daily review retry guard skipped the already-applied pulse instead of duplicating it. The official price/cache automation is active. Grok write-mode routines remain disabled until the matching-mode manual artifact gate proves signal quality; active Grok Codex automations are dry-run only and write no Supabase rows. The gate now checks raw artifact `run_date`/`mode` identity, Friday-deep run day, and at least one decision-grade accepted signal (`tier1`, `tier2`, or `tier3`) before it can become a human-approval candidate. Same-day scout reruns keep timestamped raw/prompt/summary files, and the artifact-week reviewer selects the best valid no-write same-day artifact so a later quiet run cannot erase earlier useful evidence; any same-day write-mode evidence still holds the gate. Promotion briefs, readiness mode gates, and heartbeat summaries expose the selected artifact path plus SHA-256 hash for each reviewed day, so operator approval can identify the exact Grok run behind a clean artifact count. Heartbeat summaries also expose the local review date/type, review modes to inspect, write-mode proposal IDs, post-approval dry-run-to-write transition, `next_eligible_run_statuses`, and `next_safe_operator_action`, so the daily thread wakeup can name the correct review lane, due/not-yet-due artifact status, and handoff without enabling it. The heartbeat must now also run `npm run track54:automation-runs` and report `automation_run_checks`, latest run dates/outcomes, `automations_with_failed_or_blocked_latest_run`, `no_write_manifests_ready`, `write_automations_safe`, and `next_safe_operator_action`, so the thread review inspects any Codex automation runs since the previous check. The same thread heartbeat now also runs a morning auth branch at 9:30 AM MT: before noon it runs only `npm run track54:grok-preflight` and notifies this thread when credentials are missing or expired, giving the operator a same-day fix window before the 4:10 PM scout; after auth is fixed, `npm run track54:recover-after-grok-login` runs the no-write both-mode artifact-health recovery and readiness refresh path immediately. Promotion approval is mode-scoped: the default `daily_pulse` review can list only weekday daily commands, and the Friday-deep writer requires a separate Friday `friday_deep` review. The promotion brief now also emits proposed Codex write-mode automation specs for the exact daily scout, bounded daily-review, and Friday-deep routines; they remain proposed only until the matching gate is candidate-ready, Kyle approves, and the matching dry-run artifact collector is disabled. A future paused write-mode manifest is safe only when readiness confirms its expected schedule, Bushel Board workspace, approval phrase, dry-run-disable prerequisite, and no-retired-pipeline prompt guardrails. The registered automation prompts report those stricter fields directly, including identity mismatches, schedule mismatches, missing no-write proof, write-mode evidence, decision-grade accepted counts, selected artifact hash/path, post-approval transition, write-mode proposal IDs, and automation-run history when present. Use `npm run track54:readiness` as the top-level operator check; it now runs browser smoke, feeds the proof to the readiness builder, persists `scratch/track54-readiness/latest-readiness-report.json`, and combines daily-pulse, Friday-deep, promotion, local Codex automation-manifest status, artifact automation coverage, Grok CLI/auth preflight proof, morning Grok auth warning status, weekday and Friday artifact health-check status, weekday evidence/promotion heartbeat status, write-mode automation negative proof, live source-freshness proof, focused acceptance tests, browser-smoke completion proof, artifact-gate date projection, and plan acceptance criteria while keeping `production_writes_enabled` false. Use `npm run track54:automation-runs` to inspect Codex automation manifests plus run memory, `npm run track54:grok-preflight` for the lightweight no-write credential check, `npm run track54:artifact-health` for deterministic same-day artifact health and optional no-write retry checks, and `npm run track54:recover-after-grok-login` after a credential refresh when the operator wants the same deterministic recovery plus readiness refresh in one command. Use `npm run track54:readiness:build` only to rebuild with the default existing proof; call `npx tsx scripts/build-track54-readiness-report.ts --browser-smoke-proof <path> --out <path>` for custom proof paths. Both active Grok dry-run Codex automations now refresh readiness through `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json` after their mode-specific artifact review, and report `acceptance_audit.grok_runner_proof`, `acceptance_audit.browser_smoke_proof`, `browser_smoke_clean`, plus `persisted_report_path`; the manifest audit requires exact expected `rrule` schedules, the Bushel Board repo in `cwds` for workspace jobs, prompt reporting for `acceptance_audit.overall_status`, browser proof, `persisted_report_path`, `completion_blockers`, projected artifact dates covered by active dry-run automation, the Grok auth preflight cron, the morning auth branch on the thread heartbeat, both health-check crons' deterministic artifact-health commands plus persisted-readiness handoff, a thread-targeted no-write weekday evidence/promotion heartbeat that before noon runs only Grok preflight and after noon starts with `npm --silent run track54:heartbeat-summary` then `npm run track54:automation-runs`, selected artifact, due-status, automation-run history, and post-approval handoff reporting, no explicit write-mode command fragments inside dry-run or heartbeat prompts, and missing/inactive status for proposed write-mode Codex manifests until approval. Current completion status is blocked by missing Grok credential proof plus daily/Friday artifact gates; readiness reports the next eligible run dates needed to clear those gates after auth is refreshed.

2026-06-07 operator update: the latest no-write proof supersedes the earlier expired-auth wording. Current completion status is blocked by missing Grok credential proof (`credential_source = none`, `credential_issue = missing_credential`) plus daily/Friday artifact gates. Use the quiet aliases below after `grok login` or after adding `XAI_API_KEY` to `.env.local`.

Operator JSON note: the readiness report mirrors `acceptance_audit.browser_smoke_proof.ok` as top-level `browser_smoke_clean` and mirrors `acceptance_audit.completion_blockers` as top-level `completion_blockers`, so scheduled dry-run automation reports can read the fields directly.

NPM wrapper note: on Windows/npm 11, `npm run track54:readiness -- --out <path> --browser-smoke-proof-out <path> --base-url <url> --no-start-server` may arrive inside the wrapper as bare positional values plus `npm_config_* = true` entries. The readiness wrapper now recovers those stripped values, forwards the intended browser-smoke target options, and strips them from readiness-builder passthrough. Treat the saved browser-smoke proof URL as the final check that the intended local server was verified. For artifact-health checks, prefer the quiet fixed aliases `npm run track54:artifact-health:daily`, `npm run track54:artifact-health:both`, `npm run track54:artifact-health:daily-retry`, `npm run track54:artifact-health:both-retry`, or `npm run track54:recover-after-grok-login`; use the direct `npx tsx scripts/run-track54-artifact-health-check.ts ...` form for one-off custom diagnostics.

Artifact review-date note: default reviews use the last completed local automation run date, not just the current local date. Daily-pulse reviews before 4:10 PM MT keep the current weekday eligible; Friday-deep reviews before 4:50 PM MT keep the current Friday eligible.

Artifact health retry note: same-day health checks report `artifact_due`, `retry_needed`, and `retry_blocked_until_due`. A missing daily-pulse artifact before 4:10 PM MT, or a missing Friday-deep artifact before 4:50 PM MT, is not retried early; it is deferred until the scheduled dry-run window has actually passed.

Grok retry preflight note: dry-run scout automations and artifact-health retry automations must run `npm run track54:grok-preflight` before any Grok scout launch. Artifact health still reviews existing artifact state with expired credentials, but when a retry would be needed it reports `grok_preflight_ok = false` and `retry_blocked_by_grok_preflight = true` instead of launching another scout. Scheduled dry runs use `--runner auto`, which selects `xai_api` when `XAI_API_KEY` is present and otherwise uses the locked-down Grok CLI path. Readiness manifest-audits this preflight-first prompt boundary.

Structured auth diagnostic note: `npm run track54:grok-preflight` emits non-secret machine-readable fields in addition to the human `output` array: `credential_source`, `credential_issue`, `xai_api_key_present`, `cli_auth_file_present`, `cli_auth_expires_at`, and `cli_auth_expired`. The auth preflight, late recovery, and heartbeat prompts must inspect those fields so an expired Grok login can be reported as `credential_issue = expired_auth` without running the X scout or parsing prose logs.

Heartbeat auth summary note: `npm run track54:heartbeat-summary` exposes the persisted Grok preflight proof as `grok_runner`, including `credential_issue`, exposes Hermes terminal bridge proof as `hermes_terminal`, and emits `next_safe_operator_action`. Afternoon heartbeat reviews must report `grok_runner.credential_issue`, Hermes terminal readiness when present, `next_safe_operator_action`, artifact counts, and automation-run history.

| Task ID | Cron (local / MT) | Day | Time (MT) | Command | Registration status |
|---------|-------------------|-----|-----------|---------|---------------------|
| `collect-prices` | `45 15 * * 1-5` | Mon-Fri | 3:45 PM | `python scripts/import-fx-rates.py --days 21` then `npm run collect:prices` | Active Codex automation: `canola-price-and-fx-freshness-import` |
| `track-54-grok-auth-preflight` | `55 15 * * 1-5` | Mon-Fri | 3:55 PM | `npm run track54:grok-preflight` | Active Codex automation; no-write Grok CLI/API credential preflight; readiness manifest-audited |
| `grok-x-scout-artifact-week-review` | `10 16 * * 1-5` | Mon-Fri | 4:10 PM | `npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --dry-run` then `npx tsx scripts/review-grok-x-scout-artifact-week.ts --mode daily_pulse --required-days 5 --min-accepted-signals 1` then `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json` | Active Codex automation; dry-run/no-write/browser-proof/readiness gate |
| `track-54-hermes-x-scout-prompt-bridge` | `20 16 * * 1-5` | Mon-Fri | 4:20 PM | `npm run track54:hermes-preflight`, then review today's `daily_pulse` artifact, then run `npm --silent run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date>` only if today's no-write artifact is missing/invalid or lacks fresh price proof. | Active Codex automation; Hermes/Grok 4.3 terminal shadow recovery; readiness manifest-audited |
| `track-54-daily-artifact-health-check` | `45 16 * * 1-4` | Mon-Thu | 4:45 PM | `npx tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse --retry-missing --refresh-readiness=after-retry --fallback hermes_terminal`. Reviews existing artifact state, preflights Grok before any retry, retries only missing/invalid same-day no-write artifacts when credentials pass, or uses the Hermes terminal fallback after Hermes preflight when Grok preflight fails, then refreshes browser smoke and persisted readiness through `npm run track54:readiness` when a retry runs. | Active Codex automation; deterministic no-write daily artifact monitor; readiness manifest-audited |
| `grok-x-scout-friday-deep-artifact-review` | `50 16 * * 5` | Fri | 4:50 PM | `npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --dry-run` then `npx tsx scripts/review-grok-x-scout-artifact-week.ts --mode friday_deep --required-days 1 --min-accepted-signals 1` then `npm run track54:readiness -- --out scratch/track54-readiness/latest-readiness-report.json --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json` | Active Codex automation; dry-run/no-write/browser-proof/readiness Friday gate |
| `track-54-friday-artifact-health-check` | `15 17 * * 5` | Fri | 5:15 PM | `npx tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always --fallback hermes_terminal`. Reviews final-day `daily_pulse` and `friday_deep`, preflights Grok before any retry, retries only missing/invalid same-day no-write artifacts when credentials pass, or uses the Hermes terminal fallback after Hermes preflight when Grok preflight fails, then refreshes browser smoke and readiness through `npm run track54:readiness`. | Active Codex automation; deterministic no-write Friday final artifact monitor; readiness manifest-audited |
| `track-54-late-grok-auth-recovery` | `5 17 * * 1-5` | Mon-Fri | 5:05 PM | `npx tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always --fallback hermes_terminal` after `npm run track54:grok-preflight`. Gives one late same-day no-write recovery slot if Grok auth is fixed after the normal health window or Hermes terminal recovery is available. | Active Codex automation; late no-write recovery guard; readiness manifest-audited |
| `track-54-promotion-review` | `30 9,17 * * 1-5` | Mon-Fri | 9:30 AM + 5:30 PM | Before noon, run only `npm run track54:grok-preflight` and notify on bad credentials. After noon, run `npm --silent run track54:heartbeat-summary`, then `npm run track54:automation-runs`, then wake this thread after evidence jobs; use `local_review_kind` and `review_modes_to_inspect` to choose Mon-Thu daily_pulse review or Friday promotion review, and report selected artifact hash/path, post-approval transition, write-mode proposal IDs, `next_eligible_run_statuses`, `grok_runner.credential_issue`, browser-smoke proof freshness, automation-run latest dates/outcomes, failed/blocked automation IDs, no-write manifest readiness, write-mode safety, and next safe operator action before any human approval decision. | Active Codex heartbeat; morning auth warning plus no-write evidence/promotion review; readiness manifest-audited |
| `grok-x-scout-daily` | `5 16 * * 1-5` | Mon-Fri | 4:05 PM | Use the exact command emitted by `npm run grok:x-scout:promotion-brief -- daily_pulse` after it is `ready_for_human_approval`; it includes `--approval-phrase`, `--approval-review-from`, and `--approval-review-to`. | Proposed; disabled until one manual daily-pulse artifact week passes |
| `daily-thesis-review` | `25 16 * * 1-5` | Mon-Fri | 4:25 PM | Use the exact command emitted by `npm run grok:x-scout:promotion-brief -- daily_pulse` after it is `ready_for_human_approval`; it includes `--approval-phrase`, `--approval-review-from`, and `--approval-review-to`. | Proposed; requires accepted X scout rows plus migration |
| `grok-x-scout-friday-deep` | `50 16 * * 5` | Fri | 4:50 PM | After human approval, pause/replace `grok-x-scout-friday-deep-artifact-review` with the exact command emitted by `npm run grok:x-scout:promotion-brief -- friday_deep`; it includes `--approval-phrase`, `--approval-review-from`, and `--approval-review-to`. | Proposed; disabled until a Friday-deep quality gate passes |

Order of operations on weekdays:

```text
track-54-promotion-review morning auth branch -> collect-prices -> track54:grok-preflight -> grok-x-scout-artifact-week-review (dry-run) -> track-54-hermes-x-scout-prompt-bridge (only if same-day artifact is missing/invalid) -> track54:readiness wrapper with fresh browser proof -> track54:artifact-health daily guard -> late-grok-auth-recovery -> source-freshness-watchdog
thread heartbeat: track-54-promotion-review reviews daily_pulse evidence, automation-run history, and write-mode safety at 5:30 PM

After human approval:

collect-prices -> track54:grok-preflight -> grok-x-scout-daily -> daily-thesis-review -> source-freshness-watchdog
```

Order of operations on Friday:

```text
Before approval:
track-54-promotion-review morning auth branch -> collect-prices -> track54:grok-preflight -> grok-x-scout-artifact-week-review (daily dry-run) -> track-54-hermes-x-scout-prompt-bridge (daily shadow recovery only if needed) -> grok-x-scout-friday-deep-artifact-review (Friday dry-run) -> late-grok-auth-recovery -> track54:artifact-health Friday guard -> track-54-promotion-review

Operator readiness check:
npm run track54:readiness
npm run track54:automation-runs
npm --silent run track54:heartbeat-summary

After human approval:
collect-prices -> track54:grok-preflight -> grok-x-scout-friday-deep -> friday-x-signal-bundle -> grain-desk-weekly -> us-desk-weekly
```

Readiness must report `promotion_review_heartbeat` as proven. That means the Mon-Fri thread heartbeat is active, thread-targeted, scheduled for the expected time, uses `local_review_kind` and `review_modes_to_inspect`, reviews weekday daily_pulse evidence, reports selected artifact hash/path plus post-approval transition, write-mode proposal IDs, and browser-smoke proof freshness when present, runs the Friday promotion review, and still requires explicit Kyle approval before any production Grok write routine can be enabled.

Readiness must report `grok_runner_preflight` as proven. That means `grok --version` succeeds and either `XAI_API_KEY` is present or the local Grok CLI `auth.json` has an unexpired `expires_at` before scheduled X scout dry-runs depend on `--runner auto`.

Readiness must report `write_automation_checks` as safe for `grok-x-scout-daily`, `daily-thesis-review`, and `grok-x-scout-friday-deep`. Safe means the matching write-mode Codex manifest is missing or inactive until the matching artifact gate passes and human approval registers the exact emitted command.

`npm run track54:automation-runs` is the no-write operator run-history check. It reads local Codex automation manifests plus each automation's `memory.md`, reports latest run dates/outcomes, summarizes readiness mode gates, confirms write-mode automations are still missing or inactive, and gives the next safe operator action without launching Grok or writing Supabase rows.

Readiness must also report `forbidden_prompt_boundary_present = true` for active dry-run Codex automations. This prevents a prompt from passing just because it says "do not write" while also containing an explicit `--write` command.

Promotion briefs must also report `post_approval_automation_transition`: disable `grok-x-scout-artifact-week-review` before registering `grok-x-scout-daily` / `daily-thesis-review`, disable `grok-x-scout-friday-deep-artifact-review` before registering `grok-x-scout-friday-deep`, and keep `canola-price-and-fx-freshness-import` active.

Rollback / pause instructions:

- Pause Grok without pausing official collectors by disabling `grok-x-scout-daily` and `grok-x-scout-friday-deep` only.
- Keep `collect-prices` running; price freshness is official market context and is independent of X Pulse.
- If Grok quality fails, leave `x_scout_runs` and `x_market_signals` rows as audit history, but do not run `daily-thesis-review --write`.
- If daily review writes look noisy, pause only `daily-thesis-review`; Friday swarms can still read official packets and the accepted Friday X bundle manually.
- Never re-enable `/api/pipeline/run` or the retired Grok Edge Function chain as a rollback path.

## Routine → Model Matrix (added 2026-07-11)

Which model tier each Routine should run on. Rule of thumb: **the model does the judgment, the script does the work** — mechanical script-wrapper collectors get the cheapest tier; anything that parses prose/PDFs or builds SQL from parsed data gets Sonnet; anything that reconciles conflicting evidence or authors farmer-facing prose gets Opus-class or higher. Never pin a dated model id in a Routine config — use the current alias/tier so a model refresh can't kill the Routine.

| Routine | Model tier | Why |
|---|---|---|
| `collect-cgc`, `collect-producer-cars`, `collect-export-sales`, `collect-cftc-cot`, `collect-sk-prices`, `collect-statcan` | **Haiku** (current: Haiku 4.5) | Mechanical script wrappers — fetch, run importer, verify counts, heartbeat. No judgment. |
| `collect-crop-progress`, `collect-canada-crop-progress-{mb,sk,ab}`, `collect-grain-monitor` | **Sonnet** | Narrative crop-report / PDF parsing with Tier-2 auto-fix judgment (see the grain-monitor charter). |
| `collect-wasde`, `collect-wasde-archive` | **Sonnet** | .xls parsing + batched SQL construction. ⚠️ The live CCR trigger `Bushel Board — collect-wasde-archive` is pinned to **`claude-sonnet-4-6` (outdated dated id)** — re-pin to the current Sonnet alias before the next monthly fire (13th). |
| `grain-desk-weekly`, `us-desk-weekly` (Friday desk chiefs) | **Opus-class OR HIGHER** (Opus 4.8+, or Claude-5-family / Mythos-class) | Divergence resolution, anomaly investigation, farmer-facing prose. Step 0.0 aborts below the floor — and (fixed 2026-07-11) must NOT abort above it. NEVER Sonnet/Haiku. |
| Saturday meta-reviewers (`desk-meta-reviewer`, `us-desk-meta-reviewer`) | **Opus-class or higher** | Calibration judgment + authoring prompt-level improvement recommendations (agent frontmatter: `opus`). |
| `desk-output-watchdog`, `source-freshness-watchdog-*` | **Haiku** | Runs a script, reads an exit code, notifies. |
| Swarm subagents (dispatched BY the chiefs) | Per agent frontmatter | Already correct and alias-pinned: CAD scouts haiku (sentiment + macro sonnet), 4 CAD specialists sonnet; US scouts haiku (us-macro sonnet), US specialists sonnet. Do not override in the Routine. |

**Verified 2026-07-11 (agent frontmatter grep):** supply/demand/basis/logistics-scout=haiku · sentiment/macro-scout=sonnet · export/domestic/risk/price-analyst=sonnet · desk-meta-reviewer=opus · us-*-scouts=haiku (us-macro-scout=sonnet) · us-*-analysts=sonnet · us-desk-meta-reviewer=opus. All tier aliases, no dated pins — the only dated pin found anywhere is the `collect-wasde-archive` CCR trigger above.

## Design Notes

- Times deliberately off-round to avoid API congestion
- Each collector is standalone — not a team, not a swarm
- `collect-cgc` runs `npm run collect:cgc`; it does not trigger the V1 Grok pipeline or Friday swarm
- `collect-crop-progress` uses the USDA NASS QuickStats API directly (not Firecrawl)
- `collect-grain-monitor`, `collect-export-sales`, `collect-producer-cars`, `collect-wasde` use their source-specific fetch paths
- All collectors write data freshness metadata (source dates, grain weeks)
- Scheduled thesis-relevant collectors should use the `npm run collect:*` wrapper commands. The wrapper runs the mechanical importer first, then force-refreshes the thesis cache only after success. If the refresh fails, the wrapper exits non-zero so stale thesis cache is visible; collectors must remain idempotent because an external runner may retry the full command. For dry runs, keep using importer-specific dry-run commands or call the wrapper directly with the child `--dry-run` flag; npm argument forwarding was not reliable in the Windows runner.
- 2026-05-17 patch: collector-triggered thesis-cache refresh now passes `--force`, so a stale cached `source_run_watermark` cannot cause a successful source import to leave `thesis_packet_cache` unchanged. Direct `npm run refresh-thesis-cache` still keeps the normal skip behavior unless `-- --force` is provided.
- If a collector fails, the Friday swarm runs with stale data and flags it
- Hermes source-freshness watchdogs run after the daily mechanical collector windows. They are read-only, no-agent script jobs using `npm run check:source-freshness`; success is silent, and alerts cover missing same-day due runs, failed/latest non-success source runs, thesis-cache lag/count drift, and Friday Prairie partial-week status. They do not write source data, mark Alberta missing, or run reasoning.

## Two-Phase Collector Architecture

Weekday collector routines generally run in two phases plus the mechanical thesis-cache refresh:

| Phase | Actor | Writes | scan_type |
|-------|-------|--------|-----------|
| 1. Mechanical | Python / TS importer | Source table + trajectory heartbeat | `collector_*` |
| 1b. Thesis cache | `refresh-thesis-packet-cache.ts` | `thesis_packet_cache` + `source_runs` system row | `thesis-packet-cache` |
| 2. Reasoning | Opus routine agent (soft review) | Trajectory soft-update row | `opus_review_*` |

Phase 1b rebuilds the cached facts-only Bull/Bear Thesis packets from the current packet RPC spine; it does not write thesis prose.

Phase 1 proves the data arrived and stamps a trajectory "heartbeat" with stance unchanged — Track 45-B contract. Phase 2 is the Opus soft-reviewer: it reads the fresh data + current `us_market_analysis` thesis + recent trajectory ticks, decides on a bounded stance/confidence delta, and appends a `opus_review_*` row to the trajectory. Phase 2 never mutates `us_market_analysis` — Friday's swarm (`weekly_debate`) is the only writer of the thesis-of-record.

`collect-producer-cars` is mechanical-only for v1 scheduling. It is lower complexity than Grain Monitor (single CGC CSV, deterministic aggregation, idempotent upsert) and its market impact overlaps the broader Thursday `collect-cgc` and Wednesday `collect-grain-monitor` logistics reads. Do not add a Phase 2 Opus soft-review until the `score_trajectory.scan_type` CHECK constraint and writer allow `collector_producer_cars` / `opus_review_producer_cars`.

**Why two phases:** If Opus errors or the routine times out, phase 1 still preserves the data and a clean audit trail. The UI sparkline / Friday swarm can always distinguish "data arrived" (mechanical) from "Opus interpreted it" (reasoning).

**Bounds per soft review** (enforced by `scripts/write-collector-soft-update.py`):

- `stance_delta`: `-5 … +5` per run
- `confidence_delta`: `-10 … +10` per run

Larger moves must wait for Friday. If Opus sees a regime shift, it emits `stance_delta=0` with the concern stashed in `--new-bullet-suggested` for Friday to weigh.

Full Opus prompt + decision framework: `docs/reference/collector-soft-update-prompt.md`.

**CAD migration applied (2026-04-21):** `score_trajectory.scan_type` CHECK constraint widened to accept both `collector_cftc_cot` and the 6 `opus_review_*` values. CAD-side weekday soft reviews are now enabled for all three CAD collectors (`collect-grain-monitor`, `collect-cgc`, `collect-cftc-cot`). `scripts/write-collector-soft-update.py --side cad` is live.

## Canonical Scripts (invoked by each collector)

| Collector | Phase 1 Script / Endpoint | Phase 2 Soft Review | Notes |
|---|---|---|---|
| `collect-crop-progress` | `npm run collect:crop-progress` -> `scripts/import-usda-crop-progress.py` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_crop_progress` | USDA NASS QuickStats API |
| `collect-canada-crop-progress-mb` | `npm run collect:canada-crop-progress:mb` -> `scripts/import-canada-crop-progress.py --province MB` -> `npm run refresh-thesis-cache` | Not scheduled for v1 soft review | Manitoba-only partial package; records `prairie_week_status=partial_mb_only`. |
| `collect-canada-crop-progress-sk` | `npm run collect:canada-crop-progress:mb-sk` -> `scripts/import-canada-crop-progress.py --province MB --province SK` -> `npm run refresh-thesis-cache` | Not scheduled for v1 soft review | Thursday MB+SK bundle; records `prairie_week_status=partial_mb_sk` and remains partial. |
| `collect-canada-crop-progress-ab` | `npm run collect:canada-crop-progress:all` -> `scripts/import-canada-crop-progress.py --province all` -> `npm run refresh-thesis-cache` | Not scheduled for v1 soft review | Friday full Prairie checkpoint after Alberta metadata advances; fallback is `npm run collect:canada-crop-progress:missing-ab` only after the Alberta retry window fails. |
| `collect-grain-monitor` | `npm run collect:grain-monitor` -> `scripts/import-grain-monitor-weekly.ts` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side cad --scan-type opus_review_grain_monitor` | **Weekly Quorum PDF, deterministic parse.** `scripts/import-grain-monitor.mjs` is monthly-Excel fallback / backfill only - never schedule it. |
| `collect-export-sales` | `npm run collect:export-sales` -> `scripts/import-usda-export-sales.py` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_export_sales` | USDA FAS ESR API |
| `collect-cgc` | `npm run collect:cgc` -> `scripts/import-cgc-weekly-codex.mjs` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side cad --scan-type opus_review_cgc` | Does not call `/api/pipeline/run` or `/api/cron/import-cgc`; `/api/pipeline/run` is now a Grok-workflow tombstone. Dry-run command: `npm run import-cgc:dry`. |
| `collect-producer-cars` | `npm run collect:producer-cars` -> `scripts/import-producer-cars.mjs` -> `npm run refresh-thesis-cache` | Not scheduled for v1 | CGC Producer Car CSV. Mechanical-only because it is deterministic and lower complexity; Friday logistics-scout reads the refreshed table. |
| `collect-cftc-cot` | `npm run collect:cftc-cot` -> `scripts/collect-cftc-cot.py` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side {us\|cad} --scan-type opus_review_cftc_cot` (one pass per side) | US/CAD mapped markets from `grain_market_mappings`; COT rows feed the cached thesis board after refresh. |
| `collect-wasde` | `npm run collect:wasde` -> `scripts/import-usda-wasde.py` -> `npm run refresh-thesis-cache` | `scripts/write-collector-soft-update.py --side us --scan-type opus_review_wasde` | Monthly only (10th-14th). USDA PSD API - latest snapshot per (market, attr, MY) only. Since 2026-06-09 also imports the world veg-oil complex (Rapeseed 2226000, Rapeseed Oil 4239100, Palm Oil 4243000, Soybean Oil 4232000; `/world/` endpoint, `country_code '00'`) for the bounded Canola demand-context lane — these markets write NO US desk heartbeats (`desk_heartbeat=False`). |
| `collect-wasde-archive` | `python scripts/import-usda-wasde-archive.py --last-n-months 2` *(remote routine uses Supabase MCP for upserts)* | Not scheduled for v1 | Monthly (13th of month). USDA ESMIS .xls archive — provides revision history (prev-month + current-month projection columns) that PSD API drops. Coexists with `collect-wasde`: same `usda_wasde_raw` table, same unique constraint, last-write-wins per (market, attr, MY, calendar_year, month, unit). One-shot historical backfill: run `--last-n-months 12` from a local shell with `.env.local` populated. Does NOT cover the world veg-oil commodities (US-page XLS parser only; their history accrues forward from monthly live PSD runs). |

### Phase 1 Heartbeat Primitive

All trajectory-enabled collectors share a single mechanical writer: `scripts/write-collector-heartbeat.py`. It reads the latest trajectory row (drift-aware) for each market, carries the prior `stance_score` + `recommendation` forward unchanged, stamps `scan_type='collector_*'`, and attaches the severity + signal note passed by the calling collector. Python collectors invoke it directly; the TypeScript grain-monitor importer calls it via `child_process.spawnSync`.

**Deprecated workflows removed:**
- Claude parsing the Grain Monitor PDF with Firecrawl and hand-writing INSERT SQL at runtime — replaced by the deterministic `import-grain-monitor-weekly.ts` script (2026-04-20).
- Treating `data/grain-monitor-data-tables.xlsx` as a weekly source — it only carries a partial subset of the 38-column weekly schema. Monthly workbook is fallback / backfill only.

## Data Freshness Cross-Reference

| Data Source | Dating System | Potential Lag |
|-------------|---------------|---------------|
| CGC | grain_week (Aug 1 = week 1) | ~1 day (Thursday release) |
| Grain Monitor | shipping weeks | 1-2 weeks behind CGC grain_week |
| Canada crop progress | province report_date, staggered Tue/Thu/Fri release | Partial until Alberta Friday checkpoint or explicit stale/missing retry |
| USDA weekly | week_ending date | Aligns to US marketing year |
| CFTC COT | Tuesday report_date, released Friday | 3 days inherent lag |
| USDA WASDE | monthly report_date | Released ~10th-12th of month |

## Collector → Swarm Data Flow

```
collect-crop-progress  → usda_crop_progress     → macro-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-canada-crop-progress-* → canada_crop_progress → supply/macro scouts read with prairie_week_status guardrail
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board; complete only after Friday all-province or explicit missing fallback
collect-grain-monitor  → grain_monitor_snapshots → logistics-scout reads
                      ↘ score_trajectory       → grain-desk-weekly reads (mech tick; opus_review blocked)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-export-sales   → usda_export_sales       → demand-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-cgc            → cgc_observations        → supply-scout, demand-scout, logistics-scout read
                      ↘ score_trajectory       → grain-desk-weekly reads (collector_cgc mech tick + opus_review tick)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-producer-cars  → producer_car_allocations → logistics-scout reads
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-cftc-cot       → cftc_cot_positions      → sentiment-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
collect-wasde-archive  → usda_wasde_raw (revision history) → macro-scout reads via get_usda_wasde_context
collect-wasde          → usda_wasde_raw/mapped    → macro-scout reads
                      ↘ us_score_trajectory    → us-desk-weekly reads (mech + opus_review ticks)
                      ↘ thesis_packet_cache    → /thesis cached Bull/Bear board
```

The phase-2 `opus_review_*` rows feed the Friday swarm as "weekday signal accumulator" — the desk chief checks cumulative stance drift vs the Friday anchor and prioritizes markets where drift is largest.

## Daily automation v3 - Hermes-first X pulse (decided 2026-06-10, flip pending)

**Why:** Grok CLI OAuth is the daily loop's only flaky link: access tokens last ~6 hours and the refresh chain has lapsed within days (2026-06-03 incident), forcing interactive `grok login`. The Hermes terminal bridge (`hermes --model grok-4.3 --provider xai-oauth`) holds its own long-lived xAI OAuth that stays authenticated, and it already produces accepted daily_pulse artifacts (e.g. 2026-06-09 collected by `hermes-terminal` at 10:24 AM MT). Grok stays exactly what it is: a quarantined X-pulse evidence scout. Claude remains the only daily thesis writer.

**Target flow (weekdays, MT):**
1. 3:45 PM - prices + cache refresh (existing, unchanged).
2. 4:10 PM - X pulse artifact via Hermes terminal as PRIMARY: `npm --silent run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date>` (no Grok CLI preflight dependency; Grok CLI becomes the fallback, reversing today's order).
3. 4:45 PM - artifact health check (existing, unchanged semantics).
4. ~5:30 PM - Claude daily interpretation: `npm run daily-thesis-review:packet` then the review-gated `npm run daily-thesis-review` writes bounded `opus_review_daily_pulse` trajectory rows; a farmer-readable "analysis of the day" narrative (with grower-sentiment input from the accepted X bundle) is the planned extension.

**Flip checklist (one move, not piecemeal):** update the `track-54-grok-x-scout-daily` / `track-54-hermes-x-scout-prompt-bridge` Codex automation prompts to run Hermes first, AND update the readiness manifest-audit expectations in `scripts/build-track54-readiness-report.ts` + its tests in the same change - the manifest audit requires exact prompt fragments and will report drift if either side moves alone.

**Trusted handles:** the scout's allowed-handle batches live in `lib/x-api/trusted-accounts.ts` (Kyle's X follows reconciled 2026-06-10; GrainStats tier1, GRAINSOILSEEDS tier2, IGCgrains tier3 added).

