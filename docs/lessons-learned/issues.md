# Bushel Board - Lessons Learned

## 2026-07-11 - The outage fix's fail-loud rows still could not land: every pipeline_runs INSERT in both desk prompts violated NOT NULL constraints

**Symptom:** Wheat-desk audit re-checked the 2026-06-09 outage repair against migration `20260418100300_parallel_pipeline.sql` and found ALL 8 `pipeline_runs` INSERTs across both swarm prompts (4 CAD + 4 US) still could not execute: every one omitted `grains_requested text[] NOT NULL` (no default), all four US inserts passed `NULL` into NOT NULL `crop_year`/`grain_week`, one US insert had 6 VALUES for a 5-column list, and the CAD Step 5.4 success insert still used the nonexistent `source`/`metadata` columns the June fix had removed only from the US prompt.

**Root cause:** The June 9 repair fixed the constraint violations it had *observed* (the `triggered_by` CHECK) but never replayed each INSERT against the actual table definition. A "fail-loud" logging path that has never successfully written a row is untested monitoring — it fails exactly when needed, and its silence reads as "no run happened."

**Fix (this branch):** All 8 INSERTs rewritten schema-legal (full grain/market arrays, real columns, crop-year-filtered `MAX(grain_week)` subqueries safe across the Aug 1 rollover). CAD prompt now opens a `status='running'` ledger row in Phase 0.5 (`RETURNING id`) and UPDATEs it on completion/failure, so a chief that dies mid-run leaves a permanently-`running` tombstone. Wheat (FLAGSHIP) writes first in Step 5.2. Both meta-reviewers' SQL fixed (`market_analysis.metadata` → `llm_metadata`; `pipeline_runs.source` → `failure_details->>'routine'`). Freshness guardrail now degrades on stale COT/prices instead of aborting the whole desk (only stale CGC aborts). Proposed Saturday `desk-output-watchdog` running `npm run check:desk-freshness` documented in `collector-task-configs.md`.

**Prevention:** (1) Every SQL statement embedded in a prompt doc or agent def must be validated against the migration that defines the table — treat prompt-SQL as production code in review. (2) After writing a fail-loud path, force-fire it once (insert a synthetic failure row) and confirm the row lands; an unexercised failure logger is a liability, not a safety net. (3) When a repair claims "fixed," grep for the same defect class in EVERY sibling file (the US prompt was fixed; the CAD success path and both meta-reviewers were not).

**Tags:** #friday-desk #pipeline-runs #not-null #silent-failure #fail-loud #wheat-desk

---

## 2026-06-09 - "official_thesis_input" is not just a label: classifying a bounded lane official silently inflates its domain weight

**Symptom:** While admitting the world veg-oil balance as bounded Canola demand context (Track 55), classifying the new impact factor `official_thesis_input` made `lib/__tests__/grain-impact-domain-weights.test.ts` fail: Canola's normalized supply weight dropped below the lane baseline.

**Root cause:** `getImpactAdjustedDomainWeights()` converts every `official_thesis_input` factor into a +12% relative weight boost for its domain (price_context +10%), then renormalizes to sum 1. A second official demand factor pushed Canola's demand boost from 0.12 to 0.24, inflating demand's weight share and shrinking every other domain's — a structural promotion of a lane whose whole contract is "must never become a primary score driver." The mapper-side caps (+/-6 tilt, freshness gate, subordination) did nothing to stop the weight side channel, because weights are derived from the impact-map classification, not from mapper behavior.

**Fix:** New `ImpactSourceClass` value `bounded_context` — admitted + deterministic + weight-neutral. Coverage matrix treats it as `scored`, `grain-impact-domain-weights` gives it boost 0, the audit graph maps it to the existing `bounded_context` score role (authority 0.7), and both audit UIs render a "Bounded context" badge. The boundedness is now a type the compiler enforces (two exhaustive `Record<ImpactSourceClass, ...>` sites), not prose in a boundary string.

**Prevention:** When admitting a bounded/context lane, grep every consumer of the factor's `sourceClass` before picking a class — at minimum `grain-data-coverage.ts` (scored step), `grain-impact-domain-weights.ts` (weight boosts), `grain-impact-graph.ts` (score role + authority), and the `/thesis` audit badge maps. A classification is a contract with all of them at once, and the weights test is the tripwire that catches accidental structural promotion.

**Tags:** #thesis #impact-map #domain-weights #bounded-context #source-admission

---

## 2026-06-09 - The Friday desk died silently for 7 weeks because its failure logging itself could not land

**Symptom:** `market_analysis` (CAD desk) last wrote 2026-04-18 and `us_market_analysis` 2026-04-20, yet nothing on the board flagged it. Grain detail pages kept rendering the week-36 thesis under a "Week 44" hero with haul/hold recommendations derived from the 8-week-old stance.

**Root cause (three stacked failures):**
1. The desk's Friday runs failed on 2026-04-24/25 (phase 0.3 freshness guardrail: grain prices were stale before the Track 54 daily price collector existed), and after that the Claude Desktop Routines stopped firing entirely — zero `pipeline_runs` rows of any status after 2026-04-25.
2. The swarm prompts' failure-path INSERTs used `triggered_by` values (`grain-desk-weekly`, `us-desk-weekly`, `claude-agent-us-desk`) that violate the live `pipeline_runs` CHECK (`manual|cron|retry` only), and the US prompt referenced nonexistent `source`/`metadata` columns — so even when a run tried to log its own death, the log row itself failed. A monitoring path that cannot write is indistinguishable from "no run happened".
3. Step 0.0 hard-pinned `claude-opus-4-7`; any newer Opus-class model would have aborted the desk on sight, with the abort row also failing per (2).

**Fix status:** Both prompt docs now use `triggered_by='cron'` with the routine name inside the JSON payload, drop the nonexistent columns, accept any Opus-class model, and carry explicit schema-trap warnings. Grain detail + My Farm now stale-guard the desk thesis via `assessDeskThesisStaleness()` so a 2+-week-old read displays as history and cannot drive recommendations. Routine re-enablement is a Kyle action in Claude Desktop.

**Prevention:** (1) Any scheduled writer needs a freshness watchdog on its OUTPUT table, not just its inputs — the source-freshness watchdog checks collectors but nothing checked `market_analysis` recency. (2) Failure-logging SQL must be constraint-validated like product code; a CHECK-violating failure logger is worse than none. (3) Never pin scheduled-prompt model checks to an exact dated model id; pin to the model class.

**Tags:** #friday-desk #pipeline-runs #check-constraint #silent-failure #staleness

---

## 2026-06-09 - Intermittent React #418 on /thesis was a per-load hydration race, not a wall-clock render

**Symptom:** Two browser-smoke runs on 2026-06-09 each logged exactly one uncaught `Minified React error #418` (hydration mismatch, `args[]=HTML`) on plain `/thesis` - once at 16:55 UTC on the mobile check against a warm, already-running server, and once at 20:04 UTC on the desktop check as the first request after a cold `next start`. In both runs the sibling `/thesis` check on the same server and build was clean, the immediate rerun was clean, and the failing-run screenshots were byte-identical to the clean ones (the error is recoverable - React regenerates the tree client-side and the final UI is correct).

**Root cause:** Not the suspected "wall-clock string crosses a display boundary in a client component." That class was eliminated with evidence: (1) the route's `page_client-reference-manifest.js` lists every client module that hydrates on plain `/thesis` (nav links, theme toggle, mobile nav, error boundary, community stats, Google Analytics) and all render deterministically from props/pathname - the `new Date()` calls in `page.tsx` are server-only and serialize once into the RSC payload, so they cannot mismatch by construction; (2) two `/thesis` responses fetched 7 minutes apart were byte-identical, so the page renders no live clock text ("report age"/"Today update window" copy comes from stored snapshots). Symbolicating the archived failing stack (the react-dom chunk hash `1949bdd2d71d6b2f` is unchanged in the current build) shows the throw is react-dom's `throwOnHydrationMismatch` (HTML variant) from the host-element claim path inside time-sliced, scheduler-yielding hydration - a per-load race in the framework, consistent with both incidents being one-off and rerun-clean. The page is the app's largest streamed document (~1.78 MB, `force-dynamic`), and the nav's `CgcFreshness` Suspense boundary is its only streaming-variable region: under concurrent SSR load, 6/40-26/30 responses ship the skeleton fallback plus a late `$RC` completion script instead of inline content. However, 96 instrumented production loads against the committed build (cold server restarts, CPU/network throttling, concurrent-fetch contention; 35+ loads receiving the late-`$RC` document) produced zero hydration errors - React handles the late boundary fine here. Both real incidents ran against discarded pre-commit builds of the grain-relationship work during machine-wide load (parallel multi-agent review, rebuilds, Playwright runs); the failing tree state was never committed and cannot be fully reconstructed.

**Fix status:** No app-code fix is warranted: there is no hydration-sensitive render on `/thesis` to gate behind `useEffect`, and the error has not reproduced on the committed build (a31b740) in 96 amplified attempts plus all subsequent smoke runs. The reproduction harness is kept at `scratch/hydration-repro/repro-hydration.mjs` (arms: `--restart-server` cold starts, `--throttle` CPU/network, plus `hammer.mjs` for SSR contention; it records per-load whether the served document used the late-`$RC` path). If the error recurs on a committed build: rerun those arms, correlate hits with `lateBoundary:true`, consider awaiting `CgcFreshness` inline in `Nav` (removing the streamed boundary from the header sibling chain) as the targeted de-risking change, and check Next 16.2.x / React 19.2.4+ release notes for hydration-race fixes (we are on Next 16.1.6 / React 19.2.3).

**Prevention:** When a smoke run flakes with #418, archive `scratch/track54-browser-smoke/browser-smoke-proof.json` before rerunning - the fixed output path is overwritten by the next run, and the proof's stack frame plus chunk hash is what makes later symbolication possible (the 16:55 proof survived only because it was written to a custom `--out` path). Before hunting wall-clock renders, check the route's client-reference manifest for what actually hydrates, and diff two server responses fetched minutes apart: if they are byte-identical, no server-rendered string can be the mismatch. `args[]=HTML` (vs `text`) means an element-structure mismatch, which a drifting timestamp string cannot produce.

**Tags:** #thesis #hydration #react-418 #streaming #suspense #browser-smoke #track54

---

## 2026-06-09 - SVG colors need fill-*/stroke-* classes; adversarial review caught 24 var() attribute violations

**Symptom:** The new grain relationship audit SVGs used `fill="var(--background)"` / `stroke="var(--border)"` style attribute values in 24 places across `grain-impact-graph-panel.tsx` and `grain-relationship-explorer.tsx`, violating the documented CLAUDE.md rule that CSS variables do not resolve in SVG presentation attributes. The Playwright pixel proof did not catch it because the Three.js canvas checks measured the canvas, not the SVG text/scaffold colors.

**Root cause:** SVG presentation attributes (`fill=`, `stroke=`) are parsed outside the CSS cascade, so `var()` is invalid there. The repo convention (see `crush-utilization-gauge.tsx`, `percentile-graph.tsx`, `grain-chart.tsx`) is Tailwind `fill-*`/`stroke-*` utility classes, which set the CSS `fill`/`stroke` properties where `var()` does resolve - and which stay theme-aware in dark mode, unlike hardcoded hex.

**Fix status:** All 24 attributes replaced with `className="fill-background|fill-muted-foreground|fill-foreground|stroke-border"`. The same review pass also found two non-rendering hardening issues that were fixed: (1) the explorer's rank-proof strings hardcoded `authority 0.70` / `public scope 90` copies of the model's private constants, so the model now exports `sourceAuthorityWeight`, `scoreRoleForSourceClass`, `scopeRelevanceWeight`, `PUBLIC_SCOPE_RANK_MULTIPLIER`, and `EXTERNAL_SCOPE_RANK_MULTIPLIER` and the proof strings derive from them; (2) `GrainRelationshipConstellation` and `GrainRelationshipExplorer` used inline `boardReads = []` parameter defaults, which create a new array identity every render and would tear down and reboot the entire Three.js scene on each re-render when the prop is omitted - both now default to a module-level constant. New tests pin the ranking math end to end, the Three.js mount/unmount dispose contract (every created geometry/material/texture disposed, frame loop cancelled, ResizeObserver disconnected), the confidence-weighted vertical position formula, and the empty-grains null render.

**Prevention:** Visual pixel proof of a canvas is not proof of SVG color correctness; grep for `var(--` in any new SVG-rendering component before checkpoint. Display copies of model constants are drift bugs waiting to happen - export the constant and derive the copy.

**Tags:** #grain-impact-graph #audit-mode #svg #tailwind #threejs #review-gate

---

## 2026-06-09 - Rank proof helpers must receive the typed field, not the whole edge

**Symptom:** The new audit-only grain relationship proof panel showed `authority 0.12` for a price-context Canola/Soybeans link even though the link badge correctly said `price context` and the rank was 63.

**Root cause:** The UI helper expected `edge.sourceClass`, but the call passed the whole edge object. JavaScript treated the object as an unmatched source class and fell through to the parked/default authority value. The visual badge and the proof formula were therefore inconsistent.

**Fix status:** `rankProofLabel()` now passes `edge.sourceClass` into the authority helper. Focused component tests assert the rendered formula `authority 0.70 x public scope 90 = rank 63`, and the targeted browser proof verifies the formula after clicking the Canola-to-Soybeans relationship.

**Prevention:** For audit math displays, test the exact rendered equation, not only the final rank or badge label. Helper functions that map enum-like fields should receive the typed scalar field directly.

**Tags:** #grain-impact-graph #audit-mode #visualization #rank-proof #typescript

---

## 2026-06-09 - Artifact gates need rolling clean-day math, not raw artifact counts

**Symptom:** Track 54 operator summaries could read like `daily_pulse = 3/5 found` and make the gate feel closer than it really was, while only 2 artifact days were clean enough for promotion. The next-eligible projection also risked adding future weekdays without respecting the rolling seven-day review window, which would overstate the earliest candidate date.

**Root cause:** The readiness surface mixed raw artifact presence with promotion-clean artifact evidence. A day can have an artifact and still be non-clean because of parse failure, missing fresh price proof, identity mismatch, or missing no-write proof. The projection also has to simulate the reviewed window, not just append missing weekdays.

**Fix status:** Track 54 readiness, heartbeat, and automation-run summaries now expose `clean_artifact_days_found`, `missing_clean_artifact_days`, `earliest_candidate_date`, and projected next eligible dates. The projection counts only clean scheduled dates inside the rolling review window. Current proof is explicit: daily_pulse is 3/5 found, 2 clean, 3 clean days missing, earliest candidate 2026-06-12.

**Prevention:** Promotion decisions must quote clean artifact days, not raw artifact days. If a future summary says only `N/5 found`, treat it as incomplete operator evidence until clean-day counts and the reviewed window are visible.

**Tags:** #track54 #artifact-gate #readiness #automation #operator-proof

---

## 2026-06-09 - Hermes Grok terminal calls must use the xAI OAuth provider path

**Symptom:** Hermes was callable from the Codex terminal and xAI OAuth was logged in, but `hermes --model grok-4.3 --provider xai ...` failed with a missing `XAI_API_KEY` error. This made it look like Hermes/Grok was still unusable from Codex even though the OAuth route worked.

**Root cause:** Hermes has separate provider paths. `xai` expects an API key, while the logged-in dashboard OAuth credential is exposed through `xai-oauth`. The default Hermes model/provider was also Anthropic, so a bare `hermes` launch did not prove the Track 54 Grok path.

**Fix status:** The documented terminal smoke command is now `hermes --model grok-4.3 --provider xai-oauth -z "Return exactly: HERMES_GROK_OK"`. Track 54 Hermes preflight and terminal runner use `provider = xai-oauth`, `model = grok-4.3`, and keep Hermes as a quarantined X sentiment artifact scout only.

**Prevention:** Always prove the exact model/provider tuple used by the automation. Do not treat a generic Hermes status check or a successful bare Hermes launch as proof that Grok 4.3 X-scouting is ready.

**Tags:** #track54 #hermes #grok #xai-oauth #auth #terminal

---

## 2026-06-07 - Browser proof must be coverage-complete, not just route-complete

**Symptom:** Track 54 readiness could accept a legacy browser-smoke proof that proved `/thesis`, `/thesis?audit=1`, and `/overview` loaded, but did not prove desktop/mobile coverage, exact local loaded routes from the command base URL, unique route-matched screenshots for every route/viewport check, screenshots from the current proof directory, actual screenshot visual content from decoded PNG pixels, console cleanliness, forbidden-copy checks, required markers, visible marker reachability, marker obstruction checks, or real UI interaction for every route. The local `/thesis` readiness snapshot could also keep displaying a clean browser proof after the six-hour proof window had aged out, or keep showing stale gate counts from an aged-out readiness report.

**Root cause:** The browser-smoke script had been hardened to emit route/viewport proof lines, but readiness still treated the proof as a generic successful command output. That left a compatibility hole where an older route-only proof shape, wrong route URL, external loaded URL, missing command base URL, different local origin, reused screenshot file, swapped screenshot filename, or faked visual-stat line for a blank PNG could satisfy the readiness item even though it no longer represented the current operator standard. The farmer/audit readiness snapshot exposed `browser_smoke_clean` and readiness gate counts without the browser proof timestamp, browser proof age, or readiness report age, so clean and current were easy to conflate.

**Fix status:** `scripts/build-track54-readiness-report.ts` now requires desktop and mobile proof lines for every Track 54 browser route: load from the same local origin as the command `--base-url` with the exact expected path/query, markers, visible markers, forbidden-copy result, console-error count, theme-toggle interaction, a unique non-empty screenshot file inside the browser-proof directory with the expected route/viewport filename, a matching screenshot byte count, a valid PNG signature, dimensions matching the configured viewport, claimed screenshot visual-content stats, and independently decoded PNG visual-content stats. The browser-smoke runner also rejects hidden, missing, or covered required markers, malformed/tiny/wrong-size PNG captures, and blank or low-information screenshot captures before writing a clean proof. Focused readiness-report tests reject legacy route-only proof, missing command base URLs, mismatched loaded URL origins, wrong loaded routes, external loaded URLs, reused screenshot paths, swapped screenshot filenames, hidden visible markers, covered visible markers, screenshot paths outside the proof directory, missing screenshot files, byte-count mismatches, corrupted screenshot files, dimension mismatches, missing screenshot visual proof, blank-looking claimed visual stats, and actual blank screenshots. The local readiness snapshot now exposes only sanitized readiness report age plus browser proof timestamp, age, and six-hour freshness status, so normal `/thesis` and audit `/thesis?audit=1` distinguish fresh, stale, future-dated, missing browser proof, and present-but-missing-timestamp proof instead of treating all invalid time evidence as clean-ready or merely stale. The thread heartbeat summary now mirrors that distinction with `report_freshness_status` and `browser_smoke_proof_freshness_status`, while keeping the old boolean fields for compatibility; the readiness manifest audit requires the live heartbeat prompt to inspect those fields. Stale or future-dated readiness gate counts are labeled as last-known proof instead of current proof, and stale ready-for-approval mode badges stay lagged instead of green. The live no-write readiness build accepts the fresh six-check browser proof while keeping production writes disabled.

**Prevention:** Whenever a proof-producing script gets stricter, update the consumer to validate the new proof contract directly and update every display surface that summarizes it. A green command exit or clean boolean is not enough when the operator decision depends on specific evidence lines and a freshness window.

**Tags:** #track54 #readiness #browser-smoke #operator-proof #mobile

---

## 2026-06-03 - Grok CLI scout needs noninteractive auth and envelope parsing

**Symptom:** The scheduled Track 54 daily scout/health automations could not produce the 2026-06-03 `daily_pulse` artifact. The first failure was Grok rejecting the generated `mcp_servers.gemini-cli` config, the next failure was the runner treating Grok CLI's outer JSON envelope as the scout payload, and the final real blocker was an expired Grok login that opened an interactive sign-in URL.

**Root cause:** The runner assumed disabled MCP stubs with only `enabled = false` would satisfy Grok CLI 0.2.14, assumed `--output-format json` returned the scout JSON directly instead of a `{ text, stopReason }` wrapper, and used `child.kill()` on Windows, which can leave child Node processes running after a timeout. The automation also had no fail-fast detector for Grok's re-authentication prompt.

**Fix status:** `scripts/run-grok-x-scout.ts` now writes valid disabled MCP stubs with harmless command/args, extracts scout JSON from Grok CLI's `text` envelope, kills the Windows process tree on timeout, loads `.env.local` so `XAI_API_KEY` can be used when present, resolves `--runner auto` to `xai_api` when a key exists and otherwise to the locked-down Grok CLI path, and fails fast with a clear auth message when Grok asks for re-authentication. Track 54 readiness now also checks for a noninteractive credential source by proving either `XAI_API_KEY` is present or the local Grok CLI `auth.json` is valid through the next scout window, not merely unexpired at check time. `scripts/run-track54-artifact-health-check.ts` now reviews existing artifact state but preflights Grok before any retry, returning `retry_blocked_by_grok_preflight = true` instead of launching another scout when credentials are expired or would expire before the scout window. The scout runner also accepts a Grok Build model override through `--grok-cli-model`, `GROK_CLI_MODEL`, or a positional value after runner because npm 11 on Windows can strip unknown flags into bare positional values; the local cached Cursor/Composer 2.5 model ID is `grok-composer-2.5-fast`, and the no-write recovery, daily/friday automation prompts, and approval-only future Grok scout write-mode proposals now carry that model. Focused runner and Track 54 artifact/readiness tests cover the new paths.

**Prevention:** Treat model CLI stdout as an integration contract, not as raw model output. For scheduled jobs, prefer a noninteractive API key or a CLI login verified fresh through the 4:10 PM MT scout window, require preflight-first prompts, and keep the health check no-write until the artifact gate is candidate-ready.

**Tags:** #track54 #grok-cli #automation #windows #auth #artifact-health

---

## 2026-06-03 - Audit routes need separate forbidden-copy gates

**Symptom:** The new `/thesis?audit=1` impact-map panel intentionally rendered parked gaps such as Spring Wheat and Winter Wheat, while the public browser-smoke forbidden list treated those labels as failures. A related page test also scanned the entire audit HTML for `buy`/`sell`, which can collide with legitimate market/audit copy.

**Root cause:** One public-route forbidden-copy policy was being applied to both farmer-facing routes and operator audit routes. Audit mode needs to expose parked gaps for QA, but still must block trading/advice wording from X Pulse copy.

**Fix status:** The page test now checks the exact injected X Pulse phrases after sanitization. `scripts/run-track54-browser-smoke.ts` splits public parked-grain label bans from watch/advice language bans, keeps the public `/thesis` and `/overview` gates strict, and requires `Impact Map audit` on `/thesis?audit=1` while only blocking advice language there.

**Prevention:** Treat audit routes as operator proof surfaces, not public-copy surfaces. Keep public hidden labels forbidden on normal routes; allow parked-gap labels in audit mode only when the route also proves no advice language and no browser console errors.

**Tags:** #track54 #browser-smoke #audit-mode #copy-safety #grain-impact-map

---

## 2026-06-02 - NPM can strip operator flags before a wrapper sees them

**Symptom:** `npm run track54:readiness -- --out ... --browser-smoke-proof-out ... --base-url http://127.0.0.1:3111 --no-start-server` still smoked `http://127.0.0.1:3110`. The proof failed against a stale/default local server and missed the new `Analyzed data`, `Daily automation gate progress`, and `Readiness proof` markers even though the fresh `3111` page returned 200.

**Root cause:** On this Windows/npm 11.4.2 runner, npm converted unknown script flags into `npm_config_* = true` entries and passed only the bare values into `process.argv`. `--no-start-server` became an empty `npm_config_start_server` value. The readiness wrapper only forwarded named flags, so browser smoke fell back to the default base URL and leaked stripped values toward the readiness builder.

**Fix status:** `scripts/run-track54-readiness.ts` now recovers npm-stripped wrapper values by shape, handles the inverted `--no-*` config form, forwards the intended browser-smoke flags, and strips wrapper values out of readiness-builder passthrough. A focused regression test covers the npm 11 value-stripping case. Final post-build readiness proof generated at `2026-06-03T00:29:53.188Z` passed against `http://127.0.0.1:3111` with `Analyzed data:yes`, browser smoke clean, and production writes disabled.

**Prevention:** Test the exact operator command shape, not only the direct script path. Always inspect `browser_smoke_proof.command` and loaded route URLs before trusting a readiness report.

**Tags:** #track54 #readiness #npm #windows #browser-smoke #operator-proof

---

## 2026-06-02 - Explicit artifact-health dates must still respect local cutoff

**Symptom:** `run-track54-artifact-health-check.ts --mode daily_pulse --date 2026-06-02` reported `artifact_due = true` at 11:02 AM MT, even though the scheduled daily-pulse dry-run cutoff is 4:10 PM MT.

**Root cause:** The health-check script treated any explicit `--date` as already due. That was safe for historical dates, but wrong for the current local automation date before the cutoff.

**Fix status:** Explicit review dates now flow through the same `track54CompletedAutomationDateKey()` cutoff comparison as implicit dates. A regression test proves same-day explicit dates stay blocked before 4:10 PM MT while prior completed dates remain due.

**Prevention:** Date override flags should not bypass schedule gates. They should select the review date only; due/not-due status still belongs to the local automation clock.

**Tags:** #track54 #artifact-health #automation #schedule-gate

---

## 2026-06-02 - Failed Grok scout attempts need failure summaries

**Symptom:** A manual morning `daily_pulse` dry-run timed out before Grok returned JSON and left only a prompt file. Artifact health correctly rejected it, but the operator evidence was weak because no summary file explained the failed attempt.

**Root cause:** `run-grok-x-scout.ts` wrote the prompt before invoking Grok, but wrote raw output and summary JSON only after a successful scout response. Timeouts, process failures, or parse failures therefore skipped the file contract that the artifact gate reviews.

**Fix status:** The scout runner now has a mode-aware timeout and writes failure summaries with `status = failed`, `parse_status = failed`, `scout_run_id = null`, `write = false`, and the expected raw artifact path. The artifact-week reviewer surfaces those summaries as failed attempts and does not count them as clean artifact days.

**Prevention:** Every automation gate should record failed attempts in the same artifact family as successful attempts. Missing evidence and failed evidence are different states.

**Tags:** #grok #track54 #artifact-health #operator-proof

---

## 2026-06-01 - Same-day Grok reruns must not downgrade useful artifact evidence

**Symptom:** A fresh no-write daily Grok scout rerun returned 0 signals and overwrote the canonical `daily_pulse-summary.json`, causing the artifact-week reviewer to ignore an earlier same-day artifact with 3 accepted signals and fresh price context.

**Root cause:** The runner preserved timestamped raw/prompt/summary files, but the reviewer followed only the latest summary pointer. A quiet or narrow later scan could therefore make the gate look weaker without any real evidence-quality failure in the earlier same-day artifact.

**Fix status:** `reviewGrokXScoutArtifactWeek()` now scans same-day timestamped summaries and selects the best valid no-write artifact by parsed evidence quality. Promotion briefs, readiness mode gates, and acceptance evidence now carry the selected artifact path and SHA-256 hash. Same-day write-mode evidence remains non-overridable and still holds the gate.

**Prevention:** Retryable evidence collectors should preserve point-in-time artifacts and review the best valid no-write evidence for the day, while treating write-mode evidence as a hard safety signal.

**Tags:** #grok #track54 #automation #artifact-week-gate #retry-safety

---

## 2026-06-01 - Browser smoke must check rendered advice copy

**Symptom:** Track 54 source and prompt tests were green, but the rendered `/thesis` page still exposed `price advice`; after tightening the browser check, `/overview` also exposed a standalone `sell` inside `sell-down proxy`.

**Root cause:** Earlier browser smoke proved routes loaded and avoided parked grain rows, but it did not scan the actual rendered text for trading/advice wording. Source-level checks also missed copy coming from board data and overview explanatory text.

**Fix status:** `npm run track54:browser-smoke` now checks `/thesis`, `/thesis?audit=1`, and `/overview` for forbidden rendered terms with whole-word matching. Thesis copy now says `pricing instruction`, `/overview` says `farmer-movement proxy`, and X Pulse copy scrubbing covers `price advice`, `financial advice`, `buy signal`, and `sell signal`.

**Prevention:** Public-board smoke tests should inspect the rendered page text, not just source files or required markers. Rebuild before running production-mode browser smoke because `next start` serves the last production build.

**Tags:** #browser-smoke #public-copy #thesis-board #track54

---

## 2026-06-01 - Grok scout JSON can drift inside otherwise useful artifacts

**Symptom:** A dry-run Grok daily pulse artifact returned two useful X signals, but strict parsing failed because one `raw_quote` exceeded the excerpt cap and one category used `planting_progress` instead of the allowed enum.

**Root cause:** The prompt contract was stricter than the model's natural wording. Grok stayed close to the requested schema, but small enum and length drift was enough to block the whole artifact before deterministic validation could score the individual signals.

**Fix status:** The scout contract now trims `raw_quote` to the 280-character cap and normalizes common category aliases such as planting/crop/seeding progress into `farmer_report`. The artifact-week review reports parse failures, unlisted accepted handles, price freshness, dry-run/no-write proof, and summary/artifact count mismatches before any write-mode automation can be considered.

**Prevention:**
- Keep Grok as untrusted input, but normalize predictable vocabulary drift before rejecting the artifact.
- Keep the five-clean-artifact-day gate in front of production writes so model-output drift is caught in dry-run mode first.

**Tags:** #grok #x-scout #schema-contract #artifact-week-gate

---

## 2026-05-31 - Clean source rows can still hide partial Prairie crop-progress context

**Symptom:** `/thesis` could show `Source health is clean for this board` while the Canada crop-progress collector metadata still reported `partial_prairie_week`. The source rows were not broken, but the board copy could be misread as a complete MB/SK/AB Prairie package.

**Root cause:** The page only consumed per-packet freshness rows. The `prairie_week_status` completeness flag lived in `source_runs.metadata` and was only surfaced by the watchdog script, not the farmer-facing source-health banner.

**Fix status:** Added Canada crop-progress source-run context to `getThesisBoardData()` and surfaced partial Prairie status in the `/thesis` source-health banner as context, not as a false stale-source count. The top KPI now says `Watch Source Groups` and defines the count as stale/empty/lagged/broken freshness rows, so it does not erase the partial-Prairie completeness caveat.

**Prevention:**
- Keep source freshness and source completeness as separate concepts.
- A collector can be fresh and still be partial because province release cadence is staggered.

**Tags:** #thesis-board #source-freshness #canada-crop-progress #prairie-week

---

## 2026-05-31 - Static legends can reintroduce parked-scope confusion

**Symptom:** The public `/thesis` quick scan showed `Mapping needed = no class-safe source yet` and the Top Takeaway showed `0 mapping gaps` even after Spring/Winter Wheat were parked off the public V1 board.

**Root cause:** The legend and status badges were static while the board rows became allowlist-driven. The row data was correct, but the surrounding copy still described an old placeholder state.

**Fix status:** The Top Takeaway hides zero source-gap badges, and the quick-scan legend is now derived from visible row statuses.

**Prevention:** Legends on scoped public boards should be generated from active row states or hidden when the state is absent.

**Tags:** #thesis-board #ui-copy #scope-control #public-v1

---

## 2026-05-31 - Province-only crop-progress reruns can downgrade complete Prairie package status

**Symptom:** `/thesis` displayed `Source health clean; Prairie crop-progress package is partial` even though `source_runs` contained a same-period complete MB+SK+AB crop-progress package.

**Root cause:** The board and watchdog used the latest `canada_crop_progress` source run by finish time. A later Alberta-only rerun had `partial_prairie_week`, so it overrode the earlier complete package for the same source period.

**Fix status:** Canada crop-progress package selection now sorts by source period, then package completeness, then finish time. Same-period `complete_mb_sk_ab` beats province-only reruns.

**Prevention:** Package-level source status must be selected by package semantics, not just latest collector timestamp. Province-specific reruns are refresh evidence, not proof that the whole Prairie package regressed.

**Tags:** #source-freshness #canada-crop-progress #thesis-board #prairie-status

---

## 2026-05-31 - Packet-count cards can bury the actual market read

**Symptom:** On mobile, the `/thesis` Top Takeaway sat below the current snapshot plus four KPI cards. A farmer had to scroll through packet metadata and counts before seeing the most constructive/cautious grain read.

**Root cause:** The page order treated operational proof as higher priority than the market read. Source provenance matters, but summary counts are support evidence, not the first farmer decision surface.

**Fix status:** Source health now appears before Top Takeaway, and Top Takeaway appears before the compact current snapshot and KPI summary cards.

**Prevention:** On farmer-facing market pages, put source-health trust and the primary read before supporting metadata and metrics. Snapshot proof and KPI cards should not push the market call below the first scan.

**Tags:** #thesis-board #mobile-ux #information-hierarchy #farmer-read

---

## 2026-05-11 - Kalshi open-only fetch can look unwired during no-market gaps

**Symptom:** The Kalshi board showed zero markets even though the public API was reachable and returning commodity series data.

**Root cause:** The first board fetch asked only for `status=open`. On 2026-05-11, Kalshi returned no open Corn/Soybean/Wheat markets, but did return latest finalized markets for all three grains. Treating "no open markets" as "no API data" made the integration look broken.

**Fix status:** The fetch now reads each watched series without a status filter, separates open/active markets from latest returned markets, and shows latest markets as API proof only. Closed/finalized markets are labeled "Not used for line" and do not feed the Bushel Board Implied Line.

**Prevention:**
- Keep active/open market logic separate from latest returned API data.
- Never use closed/finalized Kalshi contracts for live comparison math.
- When open market count is zero, prove API health with latest-market metadata instead of mock prices.

**Tags:** #kalshi #public-api #no-open-markets #live-data-boundary

---

## 2026-05-10 - Kalshi comparison must not be framed as a Bushel Board market

**Symptom:** The Kalshi idea naturally invites language like "our live prediction market" or "model fine-tuning in real time." That wording is ahead of the product and could mislead users, especially before Bushel Board has any stake/trade mechanics, reviewed examples, or training approval.

**Root cause:** Kalshi is a real traded prediction market, while Bushel Board currently produces source-backed thesis signals. Comparing the two is useful, but the systems are not equivalent. Treating Kalshi movement as a training loop also skips the review gate required before any example can become a training candidate.

**Fix status:** The product lane is renamed to Kalshi Prediction Board, and Bushel Board's side is named Bushel Board Implied Line. V1 remains read-only: Kalshi public market probabilities can be displayed beside thesis signals, but they do not feed thesis prompts, scorecards, Supabase writes, or training candidates.

**Prevention:**
- Use "Kalshi YES" for traded market probability and "Bushel Board Implied Line" for our deterministic comparison.
- Never call Bushel Board a live prediction market until users can actually trade or stake.
- If Kalshi returns no active markets, show watched/no-active-market states instead of mock prices.
- Treat Kalshi disagreement as review evidence, not automatic model-training data.

**Tags:** #kalshi #prediction-board #wording-boundary #training-candidates #no-write

---

## 2026-05-10 - Multi-grain thesis harness should share one engine, not fork sixteen systems

**Symptom:** After the Canola harness proved the weekly thesis loop, the natural next step was to run the same idea for all grains. The risk is building one Canola-shaped copy per grain, which would multiply bugs, tests, prompt drift, and review rules.

**Root cause:** The pilot correctly optimized for Canola proof, but its file names, schemas, scripts, and prompts are still Canola-specific. Expanding from one grain to sixteen turns that naming debt into maintenance debt unless the shared mechanics are separated from grain-specific market logic.

**Fix status:** Phase 3 is defined as a shared grain-agnostic base harness plus grain profiles for the canonical 16 dashboard grains. Grain profiles own source relevance, futures/no-futures context, price/basis/logistics/export rules, thin-market caveats, and prompt emphasis. The shared engine owns source admission, point-in-time clocks, hashes, no-future-leakage checks, prompt packaging, frozen artifacts, and next-week review packaging.

**Prevention:**
- Do not clone the Canola harness sixteen times.
- Add grain-specific behavior through configuration/profile files first.
- Keep CGC origin variants as evidence inputs unless intentionally promoted to first-class thesis lanes.
- Treat early-week reads as working theses and Friday post-CFTC artifacts as the official frozen weekly thesis.
- Gemini should challenge assumptions; Codex must keep final source-truth and artifact authority.

**Tags:** #forecast-harness #multi-grain #grain-profiles #gemini-audit #training-candidates

---

## 2026-05-10 - Point-in-time snapshot capture needs audit-grade filenames and rollover logic

**Symptom:** The first point-in-time CGC snapshot lane worked, but review found edge cases that could weaken future historical replay proof: dry-runs could say `captured` even when the current file was already present, same-day or same-timestamp changed payloads could collide, and latest-week detection could pick an old crop-year Week 52 over a new crop-year Week 1.

**Root cause:** The first implementation optimized for the normal weekly path. Historical replay has a higher evidence standard: it must preserve exact payload identity, simulate writes accurately during dry-run, and handle crop-year rollover without relying on row order or grain-week number alone.

**Fix status:** The snapshot writer now checks existing hashes even in dry-run, includes UTC timestamp plus the first eight raw-CSV hash characters in filenames, records both uncompressed CSV hash basis and gzip hash, and compares crop year before grain week. Tests cover dry-run idempotency, same-timestamp changed payloads, defensive date normalization, and crop-year rollover.

**Prevention:**
- Treat point-in-time capture as evidence preservation, not just file download.
- Every raw source artifact needs a timestamp, source URL, content hash, hash basis, local path, and idempotency behavior.
- Latest CGC week logic must compare crop year first, then grain week.
- A missing Gemini response is not proof, but a concrete Gemini edge-case finding should become a regression test before commit.

**Tags:** #cgc #point-in-time #historical-replay #idempotency #crop-year-rollover #gemini-audit

---

## 2026-05-10 - Forecast calibration candidates must prove source and model boundaries

**Symptom:** The first real Canola source artifact work exposed two ways a harness artifact could be overpromoted: a forecast with unknown model pretraining status could still become a calibration candidate, and a filtered market-read export could reveal forbidden source-family names through its omission report.

**Root cause:** The thesis-review classifier only blocked explicitly `tainted` forecasts, not `unknown` or `not_applicable` pretraining status. The market-read exporter originally treated unadmitted source names as safe to report unless they were already on a known forbidden list.

**Fix status:** Forecast reviews now classify unknown or not-applicable pretraining status as `review_only_pretraining_unknown`. The Canola market-read source-row exporter now uses an allowlist for renderable omitted source names, redacts everything else, adds a hard disclaimer, and keeps current-table replay as revision-tainted warning evidence.

**Prevention:**
- Only `pretraining_taint_status = untainted` can become a forward-calibration candidate.
- Omission reports should default to redaction; only deliberately public source names should be renderable.
- Current-table replay artifacts must not carry raw payload through as evidence when source-cutoff proof is missing.

**Tags:** #forecast-harness #pretraining-taint #source-boundary #privacy #gemini-audit

---

## 2026-05-08 - Collector wrapper dry-runs and Windows CLI shims are separate risks

**Symptom:** The thesis-cache wrapper worked for normal collector runs, but `npm run collect:cgc -- --dry-run` did not reliably forward `--dry-run` to the child importer in the Windows runner. A broad `shell: true` Windows fix then broke quoted `node -e` child arguments. Gemini 3.1 Pro Preview also flagged that direct `tsx` child commands can fail on Windows when spawned without shell handling.

**Root cause:** There were two different boundaries mixed together: npm argument forwarding and Windows command-shim execution. `npm` did not preserve the appended dry-run flag the way the wrapper needed, while commands such as `tsx`, `npx`, `.cmd`, and `.bat` need Windows shell handling that ordinary `node` and Python child commands should not use.

**Fix status:** `scripts/run-collector-with-thesis-cache-refresh.ts` now detects Windows CLI shims narrowly, handles `.cmd` / `.bat`, treats `--dry-run=true` as a dry-run, labels failed child starts, and documents that wrapper options must appear before the collector command. Collector docs now say to use importer-specific dry-run commands or direct wrapper invocation for dry-run proof.

**Prevention:**
- Treat npm script argument forwarding as unproven on Windows until a smoke test proves the exact command shape.
- Use shell execution only for commands that need Windows shims; keep normal executable child commands on direct spawn so quoting stays intact.
- If a cache refresh runs after a successful collector, make the refresh-failure retry contract explicit because an external scheduler may rerun the whole collector.

**Tags:** #collectors #windows #npm #thesis-cache #gemini-audit

---

## 2026-05-08 - Portfolio imports worked but freshness reporting was Canola-shaped

**Symptom:** COT and grain-price collectors could run successfully while still giving Canola-centered or misleading freshness proof. Oats COT data was imported in the rolling CFTC load, but no Oats row exists in the latest 2026-04-28 CFTC report, so the heartbeat layer originally reported "no rows" instead of the latest available Oats row being stale at 2026-02-03. Repeat COT and price upserts also left `imported_at` unchanged on existing rows.

**Root cause:** The automation reports and heartbeat code were built around the first Canola analytics path, not the full portfolio data contract. The importers also relied on table defaults for `imported_at`, which only apply on insert, not on conflict updates.

**Fix status:** COT now maps and imports OATS, writes CAD and US heartbeats for Corn, Soybeans, Wheat, Oats, and Canola, and flags stale-source grain rows explicitly. COT and grain-price upserts now stamp `imported_at` on every run. The price importer reports all tracked contracts, fetched contracts, skipped contracts, and latest rows.

**Prevention:**
- Automation summaries must list tracked, fetched, skipped, and stale items, not just the pilot grain.
- For any idempotent importer using upsert, set `imported_at` explicitly when freshness views read that column.
- Treat "latest report date" and "latest available row for this grain" as separate facts when a source can omit a thin contract.

**Tags:** #automations #cftc-cot #grain-prices #freshness #portfolio-data-contract

---

## 2026-05-07 - Public seeding page showed no data after successful USDA import

**Symptom:** The USDA crop-progress importer successfully upserted 2026-05-03 rows for Corn, Soybeans, Wheat, Barley, and Oats, but `/seeding` still rendered "No seeding data yet" for anonymous users.

**Root cause:** `usda_crop_progress` had RLS enabled and only authenticated users had a SELECT policy. The `get_seeding_seismograph()` RPC had public execute grants, but it is security-invoker, so anonymous callers still saw zero underlying rows.

**Fix status:** Migration `20260507144604_allow_public_usda_crop_progress_read.sql` adds an anonymous SELECT policy for public USDA source data and revokes direct write privileges from `anon` / `authenticated`. Live verification showed anonymous `get_seeding_seismograph('CORN', 2026)` returning 87 rows and `/seeding` rendering week ending 2026-05-03.

**Prevention:**
- For public pages backed by RPCs, test the exact anonymous read path, not only service-role data freshness.
- Treat "RPC execute granted" as incomplete proof when the function reads RLS-protected tables.
- Keep source-data writes service-role-only; public pages should get narrow SELECT policies on non-user public datasets.

**Tags:** #supabase #rls #seeding #usda-crop-progress #public-page #rpc

---

## 2026-05-07 - Spring Wheat pulse missed three official USDA states

**Symptom:** The first Spring Wheat premium pulse would have shown Minnesota, North Dakota, and South Dakota only, even though the official 2026-05-03 USDA Spring Wheat report also included Idaho, Montana, and Washington.

**Root cause:** `scripts/import-usda-crop-progress.py` retained only the original 15 grain-belt states for state-level crop-progress rows. That trimming was acceptable for the first corn/soybean-centered seeding map, but it silently dropped major northern spring-wheat reporters.

**Fix status:** Expanded the importer state allowlist to include Idaho, Montana, and Washington; added matching `us_state_centroids` rows in migration `20260507172242_add_spring_wheat_state_centroids.sql`; reran the live Wheat import for 2026. Anonymous `get_seeding_seismograph('WHEAT', 2026)` now returns six Spring Wheat planting states for week ending 2026-05-03.

**Follow-up:** Migration `20260507184844_add_crop_progress_previous_year_metrics.sql` admits USDA `PROGRESS, PREVIOUS YEAR` planting and emergence fields into the canonical row. Spring Wheat hover cards can now show last-year comparison directly from the current USDA report instead of inferring it from a prior crop-year row.

**Prevention:**
- Treat crop-specific geography as part of the data contract, not only a map display detail.
- Before launching a premium grain lane, compare the imported state/province set against the official source's current reporting set.
- Keep Spring Wheat labels explicit: U.S. planting/emergence is USDA Spring Wheat excluding durum; Canadian Manitoba data is currently province-wide seeding plus regional spring-wheat notes.

**Tags:** #seeding #usda-crop-progress #spring-wheat #data-contract #map-coverage

---

## 2026-05-08 - Sorghum needed crop-specific southern Plains and Southeast states

**Symptom:** Adding Sorghum to the premium seeding pulse would have missed Colorado, North Carolina, and Oklahoma even though the official 2026-05-03 USDA Sorghum report included those state progress rows.

**Root cause:** The USDA crop-progress and acreage importers used the same retained-state allowlist that was originally built around the central grain belt plus spring-wheat expansion. Sorghum requires a different reporting footprint, and the map RPC also needs a `us_state_centroids` row before a retained state can render.

**Fix status:** Added Sorghum to both USDA importers, expanded the retained-state allowlist to include Colorado, North Carolina, and Oklahoma, added matching map centroids in migration `20260508161414_add_sorghum_state_centroids.sql`, and reran live 2026 Sorghum progress and acreage imports. Anonymous `get_seeding_seismograph('SORGHUM', 2026)` now returns CO, KS, NC, NE, OK, SD, and TX for week ending 2026-05-03.

**Prevention:**
- For each new USDA crop lane, run a current QuickStats state-set check before assuming the existing map geography is enough.
- Add importer allowlist coverage and `us_state_centroids` coverage in the same change.
- Keep acreage badges tolerant of missing state acreage estimates; North Carolina currently has Sorghum progress but no matching 2026 planted-acre estimate in the importer output.

**Tags:** #seeding #usda-crop-progress #sorghum #data-contract #map-coverage

---

## 2026-05-03 - Supabase migration history drift blocks data-layer deploy

**Symptom:** Data Layer Foundation V1 migrations parsed successfully in a linked Supabase `BEGIN` / `ROLLBACK` check, but `supabase db push --dry-run --linked` would not produce a clean deploy plan.

**Root cause:** The live Supabase migration ledger contains remote-only migration version `20260429100000`, while the local repo does not. That means the database and repository disagree about migration history. Treating that as a warning would risk applying new data contracts on top of an unreviewed schema-history gap.

**Fix status:** Branch `codex/data-layer-foundation-v1` is committed and pushed as `18a0935`, with handoff commit `cd7bbda` pushed after it. On 2026-05-03, remote migration `20260429100000` was recovered from `supabase_migrations.schema_migrations` and mirrored locally as `supabase/migrations/20260429100000_predictive_market_briefs.sql`. The four Data Layer Foundation migrations and follow-up freshness optimization are now applied live, and the Canola validator passes.

**Prevention:**
- Run `supabase migration list --linked` before major DB work, not only at deployment time.
- Treat remote-only migrations as a release gate until their DDL is recovered, duplicated locally, or explicitly marked as repaired.
- Keep SQL rollback parsing as a syntax/schema check only; it does not prove migration-history health.
- Separate GitHub push proof from Supabase deploy proof in handoffs.

**Tags:** #supabase #migration-history #data-layer #release-gate #deployment-proof

---

## 2026-04-30 — Grain Monitor Week 37 parser regression + autonomy charter

**Symptom:** Tuesday 2026-04-29's `collect-grain-monitor` Claude Desktop Routine ran the weekly importer (`scripts/import-grain-monitor-weekly.ts`) against Quorum's Week 37 PDF (`GMPGOCWeek202537.pdf`) and threw `Could not parse vessel lineup, cleared, or inbound metrics` from `parseVesselsAndWeather`. The agent correctly diagnosed it as a script-side parser regression (Week 36 dry-ran cleanly, so the regression was week-specific) but stopped at "report and recommend human follow-up" — defeating the value proposition of an AI-scheduled task.

**Root cause — two regex deltas in Week 37:**
1. **Singular "vessel" when count is 1.** Quorum's Page 1 vessel bullet read *"Prince Rupert vessel lineup for Week 38 2025-26 decreased to 1 vessel..."* — singular. The regex hard-coded the plural `vessels`.
2. **pdf-parse split-letter month artifact.** Quorum's text reads *"...to May 03, 2026..."* in the PDF, but `pdf-parse` extracts it as *"to M ay 03, 2026"* (a space inserted inside the word). The regex `[A-Za-z]+ \d{1,2}, \d{4}` couldn't bridge the space — `[A-Za-z]+` matched only "M" and the date pattern failed.

The same split-letter artifact also silently broke `parsePageMetadata` for Week 37, dropping the `inboundPeriod` and `inboundWeek` fields from `source_notes` (cosmetic provenance loss only — discrete columns were unaffected).

**Fix shipped (commits 620a648, d8f0d66, 95c75d5 on `codex/grain-monitor-weekly-import`):**
1. **Regex patches.** `vessels` → `vessels?` for both lineup count groups. `[A-Za-z]+` → `[A-Za-z]+(?:\s[A-Za-z]+)?` for both Vessels Inbound month tokens (in `parseVesselsAndWeather` AND `parsePageMetadata`). The pattern catches "M ay", "S ept", "A ug", etc. without being permissive enough to over-match.
2. **Parser extraction.** All 6 parsers (`parsePageMetadata`, `parseStocks`, `parseCountryDeliveriesAndPortPerformance`, `parseShipments`, `parseVesselsAndWeather`, `parseWeeklyReportFromPages`) plus their helpers and types moved from the shebang-bearing `scripts/import-grain-monitor-weekly.ts` into a new pure-parser module at `scripts/grain-monitor/parsers.ts`. The importer keeps only IO/CLI/Supabase concerns. This unblocks Vitest, which previously couldn't import any parser without Vite's SSR transform choking on `#!/usr/bin/env node`.
3. **Vitest seatbelt.** Two test files at `lib/__tests__/grain-monitor-weekly-parser.test.ts` (synthetic edge cases) and `lib/__tests__/grain-monitor-weekly-full-parser.test.ts` (full fixtures), 9 tests / 92 assertions covering all 6 parsers across both Week 36 (plural baseline) and Week 37 (singular + split-month). 8 page-text fixture files committed at `lib/__tests__/fixtures/grain-monitor/week{36,37}-page{1,2,3,5}.txt`, captured with the production `pdf-parse` library so they reflect exactly what the runtime parsers see.
4. **Tiered autonomy charter.** `docs/hermes/skills/import-grain-monitor.md` rewritten with explicit Tier 1 / Tier 2 / Tier 3 rules so the next regression self-heals.
5. **Live backfill.** Week 37 row upserted into `grain_monitor_snapshots` with all 38 fields populated and complete `source_notes` (including the previously-dropped inbound section).

**Expectations going forward — what we expect from `collect-grain-monitor`:**

- **Tier 1 (always):** diagnose the failure, identify whether it's source-side (PDF missing) or script-side (parsing failed), confirm no partial DB write, and dry-run the immediately prior week as a regression cross-check. Print all of this in the run summary.
- **Tier 2 (auto-fix when seatbelt holds):** if the failure is a parser-side regex regression mechanically derivable from a one-token PDF wording delta (singular/plural, split-letter month artifact, whitespace/punctuation drift), AND the prior week's PDF still parses cleanly with the proposed patch, AND a new Vitest fixture covering the new wording is added, AND `npm run test` passes, AND the dry-run output passes a sanity sniff (vessel counts 0–100, OCT 0–50%, country stocks 1,000–15,000 kt, total unloads 0–25,000, report_date within 14 days of today) — then commit on the current branch with a `fix(grain-monitor):` prefix and run the live backfill. No remote push, no PR, no merge to master from Tier 2.
- **Tier 3 (always escalate):** schema-level changes (new field, dropped column, type drift), structural PDF reorg (page count change, missing section, layout reshuffle), authentication/network/DB errors, sanity-sniff failures, multi-week regressions, ambiguous diagnosis after two passes.

**Hard guardrails — never violate, even under pressure:**
- Never relax a regex to be permissive enough to match unrelated text. Tight constructs (`vessels?`, `[A-Za-z]+(?:\s[A-Za-z]+)?`) are correct by design.
- Never skip Vitest. If `npm run test` fails on the parser file, abort the self-fix.
- Never fall back to the monthly Excel workbook. A stale-but-clean row beats a rich-but-wrong row.
- Never `git push --force`, `--no-verify`, or bypass hooks.
- Never delete or overwrite a prior week's row. Upsert on `(crop_year, grain_week)` is the only write mode.
- Never run live backfill if dry-run output mismatches the prior week's pattern (terminal stocks jump >25% WoW with no congestion bullet, vessel queue triples with no event in the bullets) — that signals parser drift, not data shift.

**Why this works:** autonomous self-healing only becomes safe once the agent has a verifiable success criterion that runs in seconds. For deterministic parsers, that's a fixture-based test suite. The Vitest seatbelt added in this incident is what makes Tier 2 trustworthy; without it, "AI can fix it" reduces to "AI can guess and hope," which is worse than escalating to a human because failures get committed quietly. The charter is only as safe as the suite the agent must pass before committing — broaden the suite, broaden Tier 2's reach.

**Tags:** #grain-monitor #pdf-parse #regex #autonomy-charter #self-healing #vitest #seatbelt #parser-extraction #lessons-on-lessons

---

## 2026-04-27 — Producer Cars shipment-distribution worksheet name mismatch

**Symptom:** A freshness check for `worksheet='Producer Cars Shipment Distribution'` returned 0 rows for CGC week 37. A local CSV audit found the same thing across every cached CGC CSV from 2020 through the current `gsw-shg-en.csv`: that worksheet name does not appear at all.

**Root cause:** CGC does not publish a separate `Producer Cars Shipment Distribution` worksheet in the long-format CSV. Producer-car data lands under `worksheet='Producer Cars'` with metrics including `Shipments`, `Shipment Distribution`, and `Shipment Destinations`. The phrase "Producer Cars Shipment Distribution" in older docs was a human label, not the exact CSV worksheet value.

**Importer finding:** `supabase/functions/import-cgc-weekly/index.ts` does not filter out the worksheet; it parses every CSV row and upserts to `cgc_observations`. The zero-row result is therefore a source/name mismatch, not an importer filter bug.

**Impact:** Do not query `worksheet='Producer Cars Shipment Distribution'`. For producer-car export/flow logic, use `worksheet='Producer Cars'` plus the relevant shipment metric/region. Existing SQL that uses `Producer Cars`.`Shipment Distribution` is on the right shape; docs and prompts must not reintroduce the nonexistent worksheet name.

**Tags:** #cgc #producer-cars #worksheet-name #shipment-distribution #source-contract

## 2026-04-24 — V1 Grok pipeline kill switch (fail-closed)

**Symptom:** A rogue V1 Grok run landed in `market_analysis` at 2026-04-24 19:08 UTC (13:08 MT) for Canola with `model_used='grok-4.20-reasoning'`. This was 5.5 hours before the Friday 6:47 PM MT V2 Claude Agent Desk swarm was scheduled to fire. CLAUDE.md explicitly designates V1 as "recovery fallback only" — no scheduled writer should have hit the old path. No caller was identified via Vercel routes, scripts, `pg_cron`, `pipeline_runs`, or Claude Desktop Routines; the write was happening but we could not find the trigger.

**Root cause (architectural):** V1 was paused on 2026-03-17 by disabling every Vercel cron, but the V1 Edge Functions themselves (`analyze-grain-market`, `search-x-intelligence`, `analyze-market-data`, `generate-intelligence`, `generate-farm-summary`) were still live with `verify_jwt = false` + `x-bushel-internal-secret` auth. Any caller in possession of `BUSHEL_INTERNAL_FUNCTION_SECRET` — a shell script left in someone's crontab, a stale Hermes worker, a manually invoked Vercel preview, an old Claude Desktop Routine — could still write V1 output into `market_analysis` / `grain_intelligence` / `farm_summaries` tables. Pausing crons was necessary but not sufficient. We needed the *functions* to refuse, not the *schedule* to be empty.

**Fix shipped — fail-closed V1 kill switch at every V1 entrypoint:**
1. **New shared helper** `supabase/functions/_shared/v1-gate.ts` exports `requireV1Enabled(functionName)`. Called at top of every V1 EF after `requireInternalRequest`. Checks `Deno.env.get("ALLOW_V1_GROK")`. Default = refuse with HTTP 410 Gone + a typed JSON envelope (`error`, `function`, `detail`, `pipeline_version_in_use: "v2-claude-agent-desk"`, `unblock_instructions`). Only an explicit `ALLOW_V1_GROK=1` Supabase secret flips it to recovery mode, and even then it logs a loud warning to the EF console.
2. **Gated 5 V1 Edge Functions:** `analyze-grain-market` v16, `search-x-intelligence` v32, `analyze-market-data` v31, `generate-intelligence` v53, `generate-farm-summary` v37. Same pattern in each: `const v1Blocked = requireV1Enabled("<name>"); if (v1Blocked) return v1Blocked;` inserted right after the internal-secret check.
3. **Vercel layer also gated:** `app/api/pipeline/run/route.ts` got a parallel `blockV1IfDisabled()` check that returns 410 unless `process.env.ALLOW_V1_GROK === "1"`. This shuts off the Vercel-side orchestrator that fans out to the V1 chain.
4. **Incidental fix while in that route:** `ALL_GRAINS` in `app/api/pipeline/run/route.ts` was wrong in 4/16 slots (had `"Sunflower Seed"`, `"Canary Seed"`, `"Triticale"`, `"Chickpeas"`; missing `"Beans"`). Corrected to the canonical 16 DB grain names per MEMORY.md. If anyone ever does need to run V1 in recovery mode, it will now target the right grains instead of silently skipping 4.

**Deployed:** All 5 EFs pushed to Supabase via `supabase functions deploy`. All 5 smoke-tested with `curl -H 'x-bushel-internal-secret: <secret>' ...` → HTTP 410 with the deprecation envelope. Vercel route change rides along in this commit.

**Dos and don'ts — retiring legacy pipelines:**

- ✅ **DO** make retirement fail-closed. Default = refuse, explicit env flag = allow. A paused cron is not a retired pipeline; the pipeline is retired when the functions themselves say no.
- ✅ **DO** return HTTP 410 Gone (not 403, not 404, not 500) for intentionally retired endpoints. 410 is the RFC 7231 signal that the resource is permanently unavailable; any honest client stops retrying.
- ✅ **DO** include `unblock_instructions` in the 410 envelope. Future-you will try to run this in recovery mode and won't remember the env var name. Put it in the response body.
- ✅ **DO** gate at every layer independently. The Supabase EFs have their own gate; the Vercel orchestrator has its own gate. If one layer's env is misconfigured, the other still holds.
- ❌ **DON'T** assume pausing the scheduler is enough. Shell scripts, cron entries on dev machines, Hermes workers, and curl-happy humans all live outside your scheduler. Gate the *function*, not the *timer*.
- ❌ **DON'T** rely solely on deleting the env secret (e.g. `XAI_API_KEY`) as a retirement mechanism — CLAUDE.md explicitly says we keep `XAI_API_KEY` in Vercel env so V1 can boot in recovery. The retirement must live in code, not in secret absence.
- ✅ **DO** log loudly when recovery mode activates. A `console.warn("ALLOW_V1_GROK=1 — running <name> in RECOVERY MODE")` shows up in Supabase function logs and gives future-you a breadcrumb to explain why a grok-4.20-reasoning row just appeared in `market_analysis`.
- ✅ **DO** fix the grain-names list at the same time you're in the V1 route. If it ever runs again (emergency recovery), it should target the canonical 16, not silently skip 4. Low-effort, high-value drive-by.
- ❌ **DON'T** spend unbounded time hunting the unknown caller when gating every endpoint is cheap. The gate works regardless of who's calling; the caller-hunt is a bonus, not a blocker.
- ✅ **DO** write the lessons-learned entry the same day the kill switch ships. If the rogue run ever comes back post-gate, future-you needs the full symptom → root cause → fix → unblock trail in one place.

**Files:**
- `supabase/functions/_shared/v1-gate.ts` (new)
- `supabase/functions/analyze-grain-market/index.ts` (v16)
- `supabase/functions/search-x-intelligence/index.ts` (v32)
- `supabase/functions/analyze-market-data/index.ts` (v31)
- `supabase/functions/generate-intelligence/index.ts` (v53)
- `supabase/functions/generate-farm-summary/index.ts` (v37)
- `app/api/pipeline/run/route.ts` (gate + canonical 16 grain names)

**Tags:** #v1-retirement #grok #kill-switch #fail-closed #pipeline #410-gone #recovery-mode #canonical-grains #followup

## 2026-04-24 — CGC Week 37 import failed: IP block + 3 latent bugs unmasked

**Symptom:** Thursday 2026-04-24 `collect-cgc` routine failed at 3:33 PM MT. Supabase logs showed `ECONNRESET` from `grainscanada.gc.ca`. A phantom row landed in `cgc_imports` with `grain_week=39` (today's calendar week), `crop_year='2025-2026'`, `status='failed'`, even though the real current data week is 37. A separate retry storm on 2026-04-16 had left 5 rows with short-format `crop_year='2025-26'` polluting the audit table.

**Root cause (multi-layered):**
1. **CGC TCP-layer IP block** — grainscanada.gc.ca silently drops Supabase edge egress IPs at connection time. The EF's built-in scrape-then-fetch path never got a handshake. Not an HTTP 403; not a rate limit; a raw socket reset. No error body to parse, no retry policy that recovers.
2. **Calendar-derived `grain_week`** — `supabase/functions/import-cgc-weekly/index.ts` had a `getCurrentGrainWeek()` helper that computed the grain week from `NOW()` relative to Aug 1. The catch block used this value when writing the failure row. Net effect: a failure row claimed data week 39 when CGC has only published through week 37.
3. **Short-format `crop_year` drift** — An older retry storm on 2026-04-16 wrote `crop_year='2025-26'` instead of the canonical `'2025-2026'`. Nothing validated the format at write time, so the audit table accumulated rows that silently break any query filtering on the long form.
4. **Schedule doc timezone mislabel** — `docs/reference/collector-task-configs.md` labelled the cron column as "ET" but Claude Desktop Routines fire in the scheduler's **local time** (America/Edmonton, MT). A registered cron of `33 15 * * 4` was documented as "3:33 PM ET" when it actually fires at 3:33 PM MT / 5:33 PM ET. The doc drift made it harder to reason about whether a failure was timing-related.

**Fix shipped:**
- **Vercel proxy** — new route `app/api/cron/import-cgc/route.ts` scrapes CGC from Vercel's serverless egress (not in the blocklist), validates the CSV header, forwards the raw text to `import-cgc-weekly` via the new `csv_data` body parameter. Dual auth: `CRON_SECRET` Bearer or `x-bushel-internal-secret`.
- **EF v36** — `supabase/functions/import-cgc-weekly/index.ts` deleted `getCurrentGrainWeek()`, delegates scraping to `supabase/functions/_shared/cgc-source.ts`, and writes `grain_week: 0` (not a calendar week) in the catch block. Long-format `getCurrentCropYear()` returns `'2025-2026'`.
- **Shared scrape helper** — `supabase/functions/_shared/cgc-source.ts` is the single source of truth for CSV discovery; both the EF (legacy `--direct-ef` path) and the Vercel proxy use it.
- **Collector wrapper** — `scripts/collect-cgc.py` defaults to the Vercel proxy; keeps `--direct-ef` as an emergency escape hatch for non-Supabase egress; never schedule it.
- **Schedule doc corrected** — `docs/reference/collector-task-configs.md` now has a prominent timezone disclaimer, MT-primary columns, and a "CGC Timing Rationale" block explaining the 2h 33m buffer after CGC's ~1 PM MT publish.
- **cgc_imports audit cleaned** — deleted 1 phantom Week 39 row from today + 5 short-format retry-storm rows from 2026-04-16. Audit table is now clean: Week 37 success on top, all remaining rows long-format.

**Post-fix verification:** Week 37 CSV landed via the proxy (4,309 rows in `cgc_observations`), all 16 canonical CAD grain heartbeats written to `score_trajectory` with `scan_type='collector_cgc'`, and `getDisplayWeek()` correctly returns 37. The Week 36 sighting on the dashboard is the *market_analysis* row from last Friday's swarm — this week's swarm runs Fri 2026-04-25 @ 6:47 PM MT and will rewrite to Week 37.

**Dos and don'ts — CGC pipeline:**

- ✅ **DO** scrape external sources from Vercel egress when Supabase egress IPs are blocked. The `app/api/cron/import-cgc` pattern generalizes to any CGC-style blocklist. Short, typed, auditable, no new infrastructure.
- ❌ **DON'T** synthesize `grain_week` from the calendar. Always query `MAX(grain_week) FROM cgc_observations` (or accept the value the CSV itself reports). A calendar-derived week can exceed the latest published CGC week by 1–2 weeks and silently masks fresh analysis behind ghost rows.
- ❌ **DON'T** write `cgc_imports` (or any audit table) with a non-zero `grain_week` in a catch block unless you *know* which week you were attempting. `grain_week=0` is the correct "import failed before we could determine the week" sentinel.
- ✅ **DO** use long-format `crop_year` (`'2025-2026'`) in every write. The short form (`'2025-26'`) is a bug trap — queries filtering on `crop_year='2025-2026'` silently skip short-form rows with no error.
- ❌ **DON'T** trust a single freshness source on the dashboard. Use `getDisplayWeek() = MAX(importWeek, analysisWeek)` — it survives the transient state where CGC has landed a new week but the Friday analysis swarm hasn't rewritten `market_analysis` yet.
- ✅ **DO** interpret Claude Desktop Routine crons as scheduler-local (MT) time. `list_scheduled_tasks` is the source of truth; if a doc disagrees with the live task, the doc is wrong unless a timing change is deliberately deferred.
- ✅ **DO** keep `--direct-ef` in `collect-cgc.py` as an emergency escape hatch for humans running from non-Supabase egress. **DON'T** wire it into any routine — the blocklist will drop it and you'll burn a scheduled slot writing a failure row.
- ✅ **DO** fan out Phase 1 heartbeats to all 16 canonical CAD grains *even if* a grain had zero `cgc_observations` rows this week. The heartbeat row carries prior stance/recommendation forward unchanged — its value is "CGC ran at time T" for the Friday swarm + UI sparklines. Use `has_current_week_rows` in the evidence JSON to distinguish fresh data from carry-forward.
- ❌ **DON'T** sort CGC queries by `grain_week` first when looking for the latest week. `week_ending_date DESC, grain_week DESC` is correct; sorting by `grain_week` alone picks historical week-52 rows from a prior crop year.
- ✅ **DO** validate CSV shape at the proxy boundary (first-line column check). It's cheap, catches upstream page-shape changes early, and means the EF only ever sees a CSV that matches its expected schema.

**Files:**
- `app/api/cron/import-cgc/route.ts` (new)
- `supabase/functions/import-cgc-weekly/index.ts` (v36)
- `supabase/functions/_shared/cgc-source.ts` (new, shared)
- `scripts/collect-cgc.py` (default path = Vercel proxy)
- `docs/reference/collector-task-configs.md` (timezone disclaimer + MT columns)
- `docs/hermes/skills/import-cgc.md` (new collector skill doc)

**Tags:** #cgc #ip-block #vercel-proxy #grain-week #crop-year-format #schedule-drift #audit-trail #pipeline #followup

## 2026-04-16 — Missing bear_reasoning when stance drops (swarm-prompt gap)

**Symptom:** The Overview unified stance chart showed Barley with a -25 WoW stance drop but an empty Bear Case panel. A farmer legitimately asked "why is there no bear case when it is down 25 over the previous week?" — the answer was that our AI produced a directional score without producing structured reasoning to back it up.

**Root cause:** The Friday Claude Agent Desk swarm (Track 41) outputs `stance_score` and `bull_reasoning` / `bear_reasoning` JSONB arrays into `market_analysis`. The swarm prompt does not enforce the invariant that a negative WoW stance move must be accompanied by at least one entry in `bear_reasoning`. When the three specialist analysts all ended up leaning bullish long-term, the bear case got dropped even though the short-term stance tightened.

**Fix (short-term, UI):** `components/dashboard/unified-market-stance-chart.tsx` now renders a delta-aware empty state. When `bearPoints.length === 0 && delta <= -10`, the panel says "Stance softened N WoW, but no specific bearish drivers were captured this week" with a hint to check the grain's delivery/basis/terminal cards. This preserves honesty — we acknowledge the softening rather than silently omitting it.

**Fix (long-term, pipeline):** Add a rule to `docs/reference/grain-desk-swarm-prompt.md` and the desk-chief prompt: if `stance_score` drops >=10 WoW, `bear_reasoning` MUST contain >=1 driver (and vice versa for bullish moves >=10). The validator pass in `supabase/functions/analyze-grain-market` should reject outputs that violate this and re-prompt once before accepting.

**Also addressed in this commit:**
- Overview CA grains now ordered by prairie-acreage popularity (Wheat → Canola → Barley → Amber Durum → Peas → Oats → Lentils → Flaxseed → Soybeans → Corn) rather than by stance score. Most-clicked grains appear first.
- Added explainers under each section header and a top note explaining that CA/US stances diverge legitimately (different data streams: CGC vs USDA; different markets: prairie cash vs CBOT futures). Addresses the "why does Oats differ between CA and US?" farmer question.

**Tags:** #ai-pipeline #swarm #bear-reasoning #ux #overview #followup

## 2026-04-16 — Components orphaned by Overview bull/bear unification

**Symptom:** The Overview page was rewritten to render a single `UnifiedMarketStanceChart` grouped by region (CA + US). The CGC snapshot grid, Logistics Banner, Community Pulse, and the original single-region MarketStanceChart were removed from the page.

**Orphaned symbols (zero callers as of this commit):**
- Components: `MarketSnapshotGrid`, `LogisticsBanner`, `SignalStripWithVoting`, `MarketStanceChart` (the React component — its `BulletPoint` / `GrainStanceData` type exports are still imported by `UnifiedMarketStanceChart`, so the file stays).
- Queries: `getMarketOverviewSnapshot`, `getLogisticsSnapshotRaw`, `getAggregateTerminalFlow`, `getLatestXSignals`.

**Deliberately kept:** `SentimentBanner` (still imported by `app/(dashboard)/my-farm/page.tsx`).

**Decision:** NOT deleted in this PR. Removing them is a follow-up: want to confirm there are no in-flight branches that re-add these before removing, and want to make sure the underlying RPCs / tables behind the queries aren't relied on elsewhere (e.g. `get_aggregate_terminal_flow` may be reused for a future chart). File a separate cleanup PR after this deploys and sits for a week.

**Tags:** #overview #dead-code #followup #ui

## 2026-03-17 — LLM Attention Anchoring on First Number in Prompt

**Symptom:** The Advisor told a farmer "10,000 tonnes still sitting in your bins" when the farmer actually had 5,000 MT remaining (started with 10,000 MT, delivered 5,000 MT). The data injected into the prompt was correct — both numbers were present.

**Root cause:** The farmer card in the system prompt was formatted as `Started with 10.0 Kt, 5.0 Kt still in bins`. The LLM anchored on the first number it encountered (10 Kt) and treated it as the current bin inventory. This is a known LLM behavior — models disproportionately weight the first numeric value in a sequence, especially when both values are in similar units.

**Fix:** Reorder the inventory line to lead with the actionable figure: `5.0 Kt still in bins (of 10.0 Kt starting)`. The remaining quantity — what matters for marketing decisions — now appears first. The starting amount is parenthetical context.

**General principle:** When constructing LLM prompts with numeric data, always lead with the number the model should reference in its response. Background/historical figures should follow in parentheses.

**File:** `lib/advisor/system-prompt.ts:25-26`

**Tags:** #llm #prompt-engineering #advisor #attention-anchoring

## 2026-03-17 — grain_week Mismatch: Calendar Week vs Data Week

**Symptom:** After running the v2 pipeline (`analyze-grain-market`), the dashboard still showed old v1 analysis with stance -45 for Canola. The v2 results (stance +25) were in the database but invisible.

**Root cause:** The v1 pipeline used `getCurrentGrainWeek()` which returns the **calendar shipping week** (= 33 at the time). The v2 pipeline correctly queries `MAX(grain_week) FROM cgc_observations` which returns the **latest data week** (= 31). The dashboard query `ORDER BY grain_week DESC LIMIT 1` picked up the v1 week-33 row over the v2 week-31 row because 33 > 31.

**Fix:** Deleted the mislabeled week-33 rows from `market_analysis` and `grain_intelligence`. The v2 week-31 data (which accurately reflects what the CGC data actually covers) now surfaces correctly.

**Lesson:** Analysis should always be labeled with the week the data covers, not the calendar week when the analysis ran. The `MAX(grain_week) FROM cgc_observations` pattern is the correct approach. When transitioning between pipeline versions, clean up stale data from the old version to prevent ghost rows from masking new results.

**Tags:** #pipeline #grain-week #data-freshness #v1-to-v2-migration

## 2026-03-17 — Decision Rail Marker Position Must Scale with Confidence

**Symptom:** The recommendation card's HAUL/HOLD slider showed the marker at ~86% (far right) for a 55/100 "moderate conviction" HOLD recommendation. Visually, it looked like a high-conviction call when the data was actually borderline.

**Root cause:** `getDecisionPosition()` returned a fixed position based only on action + market stance, ignoring the confidence score. A 55/100 hold and a 95/100 hold had identical marker positions.

**Fix:** Interpolate the marker between center (50%) and the action target based on confidence: `position = 50 + (target - 50) * (confidence / 100)`. At 55/100, a bullish hold moves from 86% → ~70%, which visually reads as "leaning hold, not emphatic." The band width (uncertainty region) was already confidence-scaled — now the marker position matches.

**File:** `components/dashboard/recommendation-card.tsx:107-117`

**Tags:** #ux #visualization #confidence #recommendation-card

## 2026-03-17 — Edge Function 150s Wall-Clock Timeout with xAI Tool Use

**Symptom:** The v2 `analyze-grain-market` Edge Function returned 504 Gateway Timeout on the 3rd grain in the first benchmark run. The xAI API call with `web_search` + `x_search` tool use took 150,087ms.

**Root cause:** Supabase Edge Functions have a 150-second wall-clock limit. When the xAI model decides to use multiple search tools sequentially, each tool call adds latency. The Barley analysis (which involved extensive web search) came close at 124s. With BATCH_SIZE=1, only one grain per invocation, but tool-heavy grains can still hit the ceiling.

**Impact:** A 504 breaks the self-triggering chain — the function never reaches the `enqueue_internal_function` code for remaining grains. The chain must be manually restarted.

**Mitigation:** BATCH_SIZE=1 limits blast radius. If one grain 504s, restart the chain with the remaining grains. The xAI `max_output_tokens: 16384` setting helps but doesn't control tool use latency. A future fix could add a per-grain timeout with graceful fallback.

**Tags:** #edge-function #timeout #xai #pipeline-v2 #tool-use

## 2026-03-16 — CSS color-mix() vs hsl() for Hex CSS Variables

**Symptom:** Implementation plan specified `hsl(var(--prairie) / 0.65)` to apply 65% opacity to a CSS custom property for the TerminalFlowChart bar colors.

**Root cause:** The `hsl()` alpha syntax only works when the CSS variable contains raw HSL channel values (e.g., `--prairie: 100 60% 30%`). Bushel Board's design tokens store hex values (e.g., `--color-prairie: #437a22`), so `hsl(var(--color-prairie) / 0.65)` is invalid CSS and silently fails — the browser drops the declaration entirely, producing no color.

**Fix:** Use `color-mix(in srgb, var(--color-prairie) 65%, transparent)` instead. This works with any color format stored in the variable (hex, rgb, hsl, named colors).

**Caught by:** Gemini pre-review, before any code was written. This is exactly the kind of bug that would have been invisible until visual QA — no build error, no runtime error, just a missing fill color.

**Tags:** #css #design-tokens #color-mix #gemini-review #terminal-net-flow

## 2026-03-16 — PostgREST numeric-as-string in Sentiment/Logistics Pure Functions

**Symptom:** The `vesselSentiment()`, `octSentiment()`, and `shipmentYoySentiment()` pure functions in `logistics-utils.ts` performed numeric comparisons like `vessels > avg + 5`, but the comparisons produced wrong results for certain value ranges.

**Root cause:** Supabase PostgREST serializes `numeric` column values as **strings**, not numbers. When the Grain Monitor snapshot values (e.g., `vessels_vancouver: "9"`, `oct_pct: "205"`) were compared without conversion, JavaScript performed lexicographic string comparison: `"9" <= "205"` evaluates to `true` (because `"9"` > `"2"` in ASCII), but numerically 9 < 205. This is a recurring PostgREST footgun — see also the earlier `Number()` fix for `cgc_observations.ktonnes`.

**Fix:** Wrap all `grain_monitor_snapshots` values in `Number()` at the query boundary before passing to pure functions. The pure functions themselves accept `number` types, keeping the type-safety contract clean.

**Caught by:** Gemini mid-implementation review.

**Tags:** #postgrest #numeric #type-coercion #logistics #gemini-review #terminal-net-flow

## 2026-03-16 — Server/Client Module Boundary: "use client" Transitive Import of Server Module

**Symptom:** `terminal-flow-chart.tsx` (a `"use client"` component) imported types and pure functions from `logistics.ts`, which in turn imports `createClient` from `@/lib/supabase/server`. Build failed with a server-only module error.

**Root cause:** Next.js enforces that `"use client"` components cannot transitively import server-only modules. Even if the client component only uses exported types and pure functions from a module, if that module has *any* import of a server-only dependency (like `@/lib/supabase/server`), the entire dependency chain is invalid. The original `logistics.ts` mixed Supabase query functions (server-only) with pure utility functions and TypeScript types (client-safe) in a single file.

**Fix:** Split into two files:
1. `lib/queries/logistics-utils.ts` — client-safe: TypeScript types, interfaces, and pure functions (sentiment scoring, formatting). No Supabase imports.
2. `lib/queries/logistics.ts` — server-only: Supabase queries that re-export everything from `logistics-utils.ts` for backward compatibility.

Client components import from `logistics-utils.ts`. Server components and server actions import from `logistics.ts` (which provides both queries and re-exported utils).

**Caught by:** Task 6 subagent during component integration.

**Pattern:** When a query module contains both data-fetching functions and pure utility functions, proactively split them if any client component will need the utilities. This is the same pattern used by `lib/queries/observations.ts` (server) vs the composite metric types that live in shared scope.

**Tags:** #nextjs #use-client #module-boundary #server-components #terminal-net-flow

## 2026-03-16 — Float Formatting for Display Values (OCT% and YoY%)

**Symptom:** OCT percentage values rendered as `12.345678%` and YoY percentage values as `7.891234%` in the TerminalFlowChart and LogisticsBanner components. Long decimal strings cluttered the UI and looked unfinished.

**Root cause:** The raw `numeric` values from `grain_monitor_snapshots` (after `Number()` conversion) were interpolated directly into template strings without formatting. No `.toFixed()` call was applied before rendering.

**Fix:** Applied `.toFixed(1)` for OCT percentages (one decimal place provides meaningful precision for car-unloading times) and `.toFixed(0)` for YoY change percentages (whole numbers are sufficient for directional context). Applied at the component render level, not in the query layer, to keep raw precision available for calculations.

**Caught by:** Gemini final review.

**Tags:** #formatting #display #toFixed #gemini-review #terminal-net-flow

## 2026-03-15 — Delivery Gap Chart: Prototype Fidelity Failure (Missing Right Y-Axis + Gap Line)

**Symptom:** User provided exact HTML/Chart.js prototype with 3 datasets on 2 axes. Implementation produced 2 lines on 1 axis with fill-area approximation. The gap LINE on a secondary right Y-axis — the most important visual element ("the gap is the thesis") — was never built.

**Root Cause (process):** The design doc silently simplified the prototype without documenting deviations. Clarifying questions focused on UX (page position, style, toggle behavior) rather than structure (axes, datasets, visual layers). All reviewer agents validated against the derived design doc, not the original prototype. Gemini was consulted on a detail (color choice), not architecture.

**What was lost:**
1. **Right Y-axis** labeled "YoY Gap (Kt)" with green tick marks — completely dropped
2. **Gap as its own plotted LINE** on the right axis — replaced with fill-area between two lines
3. **Headline numbers** — prototype showed 293 Kt gap vs implementation's 563 Kt (different data period, not investigated)

**Process fixes applied:**
1. Gemini collab skill updated with "Prototype Fidelity Check" pattern (Pattern 4) and "Design Doc Deviation Check" (Pattern 5)
2. New Workflow 6 in gemini-collab: "Prototype Fidelity Review" — run BEFORE writing design doc when user provides source code
3. Rule: When user provides exact code, default to faithful reproduction first, improvements second
4. Rule: Spec reviewers must receive both original source AND design doc
5. Rule: Clarifying questions must inventory structural elements (axes, datasets, visual layers) before UX details

**Fix applied:** Rewrote `delivery-gap-chart.tsx` with dual Y-axes (`yAxisId="left"` for cumulative deliveries, `yAxisId="right"` for gap) and 3 datasets: current year Line, prior year dashed Line (both left axis), gap Area + Line (right axis with green ticks). Key Recharts lesson: when using multiple `<YAxis>` components, *every* `<Line>` and `<Area>` must specify a `yAxisId` prop or Recharts throws a runtime error.

**Takeaway for future prototype conversions:**
1. Inventory EVERY axis, dataset, and visual layer from the prototype BEFORE writing a design doc
2. Default to faithful reproduction first — improvements/simplifications second, and only if documented
3. Run the Prototype Fidelity Review workflow (gemini-collab Workflow 6) when user provides source code
4. Spec reviewers must receive both the original source AND the design doc

## 2026-03-15 — Exports Missing Producer Cars Component (112.6 vs 113.5 Kt)

**Symptom:** Dashboard showed Canola exports as 112.6 Kt for week 31 current week, but CGC Excel Summary!H27 showed 113.5 Kt. The 0.9 Kt gap was consistent and exact.

**Root Cause:** The CGC Summary "Exports" row has **THREE** components, not two:
1. **Terminal Exports** (vessels leaving ports, all grades summed): 112.5 Kt
2. **Primary Shipment Distribution "Export Destinations"** (direct cross-border from primary elevators): 0.1 Kt
3. **Producer Cars Shipment Distribution "Export"** (farmer-loaded railcars shipped direct to US): 0.9 Kt

Our code only included components 1+2. Component 3 — Producer Cars exports — was missed because for most grains it's 0 Kt (e.g., Wheat week 31 = 0.0 Kt), making the error invisible unless you checked Canola or other grains with active US rail shipments.

**Verification (cross-grain):**
- Canola week 31: 112.5 + 0.1 + 0.9 = 113.5 ✓ (matches CGC Excel Summary!H27)
- Wheat week 31: 420.7 + 21.4 + 0.0 = 442.1 ✓ (matches CGC Excel Summary!B27)

**Solution:** Added `Producer Cars.Shipment Distribution` with `region = 'Export'` to all exports queries:
1. `lib/queries/observations.ts` — WoW composite metric (new source + "producer_cars_export" region filter)
2. `get_pipeline_velocity()` — SQL exports CTE
3. `get_pipeline_velocity_avg()` — SQL exports CTE
4. `v_grain_yoy_comparison` — both `current_exports` and `prior_exports` CTEs
5. `supabase/functions/_shared/market-intelligence-config.ts` — CGC_DATA_GUARDRAILS documentation

**Also fixed:**
- `supabase/functions/import-cgc-weekly/index.ts` — changed `ignoreDuplicates: true` to `false` (same stale-data bug as the main import route, but in the legacy Edge Function)
- Identified `fetch-cgc-grain-data` as completely dead Edge Function (deployed on Supabase with no local source code, zero references in codebase)

**Prevention:**
- CGC "Exports" = Terminal Exports + PSD Export Destinations + Producer Cars Export. This is now the ONLY correct formula. Update CLAUDE.md to reflect all three components.
- When verifying export totals, always check grains with active Producer Cars US shipments (typically Canola, sometimes Wheat, Peas) — these are the only grains where the third component is non-zero.
- Cross-check new metric definitions against CGC Excel hardcoded values, not just against our own DB queries. Excel is the source of truth.

**Files modified:**
- `lib/queries/observations.ts` (3-component exports composite)
- `supabase/migrations/20260315400000_add_producer_cars_export_to_exports.sql`
- `supabase/functions/_shared/market-intelligence-config.ts` (guardrail docs)
- `supabase/functions/import-cgc-weekly/index.ts` (ignoreDuplicates fix)

**Tags:** #data-integrity #exports #producer-cars #cgc #pipeline #audit

## 2026-03-15 — Stale Prior-Week Data Caused Wrong WoW Direction (Stocks Showed -10.7% Instead of +3.2%)

**Symptom:** After fixing the Stocks formula (see next entry), the Canola Stocks card correctly showed 1,470.5 Kt for week 31, but the WoW change showed **-10.7% "Stock drawdown"** when it should have been **+3.2% "Stock build"**. CGC Excel confirmed week 30 Canola Summary Stocks = 1,424.4 Kt, but our database had 1,646.1 Kt for week 30.

**Root Cause (two compounding bugs):**

1. **Import route only captured current-week rows:** `app/api/cron/import-cgc/route.ts` filtered the full CGC CSV down to `grain_week === grainWeek` (line 106-108). CGC revises prior-week data when publishing new weeks (preliminary → final values). By discarding all non-current-week rows, we never picked up CGC's revisions to prior weeks. Week 30's preliminary value of 1,646.1 Kt was never corrected to the final 1,424.4 Kt.

2. **`ignoreDuplicates: true` prevented updates even if rows were included:** Both the import route (line 139) and the backfill script (line 160) used `ignoreDuplicates: true`, which maps to PostgreSQL's `ON CONFLICT DO NOTHING`. Even if prior-week rows had been included, they would have been silently skipped because the rows already existed. This meant once a row was inserted, it could never be corrected by the pipeline.

**Impact:** Every prior-week value in the database was potentially stale. Any WoW, YoY, or trend calculation that compared current-week values against prior-week values could show the wrong direction and magnitude. This affected all 16 grains, not just Canola.

**Solution:**
1. **Import route:** Changed filter from `grain_week === grainWeek` to `crop_year === cropYear` — now imports ALL rows for the current crop year on every weekly run. Changed `ignoreDuplicates: false` (= `ON CONFLICT DO UPDATE`) so revised values overwrite stale ones.
2. **Backfill script:** Changed `ignoreDuplicates: false`. Added `--live` flag to fetch directly from grainscanada.gc.ca instead of requiring a local CSV file.
3. **Data repair:** Ran `npm run backfill -- --live` to upsert all 126,776 rows from the live CGC CSV, correcting all stale prior-week values across the entire crop year.

**Verification (Canola Summary Stocks after backfill):**
- Week 29: 1,451.3 Kt ✓
- Week 30: 1,424.4 Kt ✓ (was 1,646.1 — now matches CGC Excel)
- Week 31: 1,470.5 Kt ✓
- WoW change: +3.2% (stock build) ✓ (was -10.7% drawdown)

**Prevention:**
- **Never use `ignoreDuplicates: true` for CGC data imports.** CGC revises prior-week data. The pipeline must always use `ON CONFLICT DO UPDATE` to accept revisions.
- **Never filter the CGC CSV to only the current week.** Import the full crop year to catch all prior-week revisions. The CSV is ~127K rows — well within Supabase upsert capacity.
- **Treat any WoW change >10% with suspicion.** A 10.7% swing in national commercial stocks in one week is implausible and should trigger a data freshness check.
- Add a validation rule to `validate-import` that compares prior-week values against the CSV and flags discrepancies.

**Files modified:**
- `app/api/cron/import-cgc/route.ts` (import full crop year, ignoreDuplicates: false)
- `scripts/backfill.ts` (ignoreDuplicates: false, --live flag)

**Tags:** #data-integrity #stale-data #import-pipeline #cgc #wow #revision

## 2026-03-15 — Exports and Commercial Stocks Under-Reported Across Entire Pipeline

**Symptom:** Dashboard showed Canola commercial stocks as 962.5 Kt instead of the CGC-reported 1,470.5 Kt (missing 508 Kt). Exports were under-counted by ~102 Kt across all grains. The user noticed the Stocks key metric card didn't match the CGC Excel, and the Exports pipeline velocity chart was below CGC Summary totals.

**Root Cause (Bug 1 — Stocks):** The `v_grain_yoy_comparison` view and the `getWeekOverWeekComparison()` TypeScript function both filtered `region IN ('Primary Elevators', 'Process Elevators')` for stocks. This excluded all six terminal port locations (Vancouver, Prince Rupert, Churchill, Thunder Bay, Bay & Lakes, St. Lawrence) which hold ~290-500 Kt of grain. The CGC "Total Commercial Stocks" includes ALL Summary Stocks regions. The `getStorageBreakdown()` function also only fetched Primary + Process, then queried a non-existent "Terminal Stocks" worksheet.

**Root Cause (Bug 2 — Exports):** The `get_pipeline_velocity()` RPC, `get_pipeline_velocity_avg()` RPC, and `v_grain_yoy_comparison` view all defined exports as only `Terminal Exports.Exports`. But the CGC "Exports" in Summary = Terminal Exports + Primary Shipment Distribution "Export Destinations" (direct cross-border exports bypassing terminals). This was already documented in CLAUDE.md but never applied to the SQL objects.

**Root Cause (Bug 3 — Delivery delta):** The key metrics card used `period = 'Current Week'` (460.2 Kt) while the Net Balance chart derived weekly deltas from `period = 'Crop Year'` cumulative data (462.0 Kt). The 1.8 Kt (<0.5%) difference is a CGC rounding artifact — they round weekly and cumulative values independently. Not a code bug.

**Solution:**
1. **Stocks:** Removed region filter from `current_stocks`/`prior_stocks` CTEs in `v_grain_yoy_comparison`, made Stocks a composite metric in WoW comparison (summing all Summary Stocks regions), fixed `getStorageBreakdown()` to pull all Summary regions and group terminal ports into "Terminal Elevators"
2. **Exports:** Added PSD Export Destinations to exports CTEs in `get_pipeline_velocity()`, `get_pipeline_velocity_avg()`, `v_grain_yoy_comparison` (current + prior year), and made Exports a composite metric in WoW comparison
3. **Delivery delta:** Documented as acceptable CGC rounding artifact

**Verification (Canola Week 31 vs CGC Excel):**
- Commercial stocks: 1,470.5 Kt ✓ (was 962.5)
- Exports CY: 4,585.8 Kt ✓ (was 4,484.3, Excel shows 4,586.7 — 0.9 Kt CGC rounding)
- Producer deliveries CW: 460.2 Kt ✓ (Excel: 460.1)
- Wheat, Barley, Oats also verified correct

**Prevention:**
- CGC "Exports" always means Terminal Exports + PSD Export Destinations + Producer Cars Export (3 components). Any new SQL/TypeScript that queries exports must include all three.
- CGC "Commercial Stocks" always means ALL Summary Stocks regions — never filter by region unless you explicitly want a subset.
- The fact that CLAUDE.md documented the correct formula didn't prevent the bug because the SQL was written before the documentation. New SQL must be audited against CLAUDE.md definitions before deployment.
- Run `npm run audit-data` after any pipeline SQL changes to catch definition drift.

**Files modified:**
- `lib/queries/observations.ts` (WoW comparison + StorageBreakdown)
- `supabase/migrations/20260315300000_fix_exports_and_stocks_definitions.sql`

**Tags:** #data-integrity #exports #stocks #cgc #pipeline #audit

## 2026-03-15 — Producer-Delivery Formula Drift Broke Week 31 Dashboard Totals

**Symptom:** Week 31 producer-delivery totals on the dashboard did not match the CGC workbook. For Canola, the CGC Summary sheet showed **460.1 Kt** current-week producer deliveries, while Bushel Board surfaced **455.6 Kt** in derived dashboard paths.

**Root Cause:** The repo had multiple competing definitions of "producer deliveries." The canonical framework doc was correct, but active SQL views/RPCs, repo AGENTS guidance, and skill docs still used an older `Primary + Process` shortcut. That shortcut omitted:
- `Primary.Deliveries` from **British Columbia**
- `Producer Cars.Shipments`

There was a second risk layered on top: some query helpers were not filtering `grade=''` on aggregate Primary rows, which can silently double-count grade detail rows. The local `gsw-shg-en.csv` cache was also stale at Week 30, so the audit path initially failed open instead of proving the mismatch against the live Week 31 source.

**Solution:**
1. Added `v_country_producer_deliveries` as the single canonical SQL definition
2. Rebuilt `v_grain_overview`, `v_grain_yoy_comparison`, `get_pipeline_velocity()`, `get_historical_average()`, `get_week_percentile()`, and `get_pipeline_velocity_avg()` on top of that canonical view
3. Hardened TypeScript helpers to require `grade=''` for aggregate Primary / Process / Producer Cars totals
4. Upgraded `scripts/audit-data.ts` to fall back to the live CGC CSV and to audit derived dashboard objects against the workbook Summary sheet
5. Updated AGENTS, agent docs, skills, and planning docs so the wrong formula is no longer documented as valid

**Prevention:**
- Define country producer deliveries in exactly two places only:
  - SQL: `v_country_producer_deliveries`
  - TypeScript: `lib/cgc/delivery-metrics.ts`
- Treat any query that says "Primary + Process" as incomplete unless it explicitly explains why Producer Cars and BC are excluded
- For aggregate Primary / Process / Producer Cars totals, decide explicitly between `grade=''` and per-grade rows; never leave grade handling implicit
- Never trust the local CGC CSV cache for a latest-week audit without checking whether the live source has advanced
- Do not run `npx supabase db push --linked` blindly when unrelated local migrations are still pending on the remote project

**Files modified:**
- `lib/cgc/delivery-metrics.ts`
- `lib/queries/observations.ts`
- `scripts/audit-data.ts`
- `supabase/migrations/20260315100000_fix_country_producer_deliveries.sql`
- `AGENTS.md`
- `docs/reference/data-sources.md`
- `docs/architecture/data-pipeline.md`

**Tags:** #data-integrity #deliveries #cgc #audit #documentation #migration-safety

## 2026-03-12 — v_grain_overview Statement Timeout From Full-Table Scan on 1M+ Rows

**Symptom:** The Overview page displayed "No grain data available yet" even though `v_grain_overview` contained 16 valid rows. No error was surfaced to the user.

**Root Cause:** The view's `latest_week` CTE used `GROUP BY crop_year` + `MAX(grain_week)` to find the current week, which forced Postgres to scan all 1M+ rows in `cgc_observations`. The query took 5.2 seconds, exceeding PostgREST's statement timeout for the `authenticated` role. The timeout caused the query to return no rows silently, triggering the empty-state fallback.

**Solution (migration `20260312180000_optimize_v_grain_overview.sql`):**
1. Added composite index `idx_cgc_obs_crop_year_grain_week (crop_year DESC, grain_week DESC)` on `cgc_observations`
2. Rewrote the `latest_week` CTE from `GROUP BY crop_year ORDER BY crop_year DESC LIMIT 1` to `ORDER BY crop_year DESC, grain_week DESC LIMIT 1` — this reads exactly 1 index entry via Index Only Scan (0 heap fetches) instead of scanning the full table

**Result:** Query time dropped from 5,200ms to 5.5ms (945x speedup).

**Prevention:**
- Any CTE or subquery against `cgc_observations` that uses `GROUP BY` + aggregate to find a single "latest" value should use `ORDER BY ... LIMIT 1` with a supporting index instead
- PostgREST statement timeouts fail silently from the client's perspective — always check whether an empty result could be a timeout rather than genuinely empty data
- Views that underpin primary dashboard pages should be tested with `EXPLAIN ANALYZE` after the table exceeds ~100K rows

**Files modified:**
- `supabase/migrations/20260312180000_optimize_v_grain_overview.sql`

**Tags:** #performance #postgresql #index #postgrest #timeout #overview

## 2026-03-12 — Hidden Scrollbar Styling Must Be Backed By A Real Local Utility

**Symptom:** The overview Community Pulse rail still showed a dated native horizontal scrollbar even though the component used a `scrollbar-hide` class.

**Root Cause:** The component assumed a `scrollbar-hide` utility existed, but this repo did not define one in `app/globals.css`. The browser therefore rendered its default scrollbar chrome, especially visibly on Windows.

**Solution:** Added an explicit `.scrollbar-none` utility in `app/globals.css` and rewired the overview signal rail to use that utility plus a custom scrubber/arrow treatment in `components/dashboard/compact-signal-strip.tsx`.

**Prevention:**
- Do not rely on utility-class names copied from prior projects unless they exist locally
- Any custom scroll treatment should be visually verified on Windows, where native scrollbar chrome is harder to ignore
- If a scrollbar is intentionally hidden, provide an explicit replacement affordance instead of relying on swipe discovery alone

**Files modified:**
- `app/globals.css`
- `components/dashboard/compact-signal-strip.tsx`

**Tags:** #ui #overview #scrollbar #windows #x-feed

## 2026-03-12 — Daylight Auth Variants Need Their Own Contrast Tokens

**Symptom:** The top third of the signup page became difficult to read in the daytime auth scene. The headline, description, and top-left chrome were too washed out against the pale gold background.

**Root Cause:** The auth shell reused a mostly white text/chip treatment that worked for the evening variant but did not hold enough contrast on the daylight gradient. The hero block also sat too close to the absolute-positioned brand chip at narrower widths.

**Solution:** Gave the daylight auth shell its own darker wheat text treatment, stronger badge/logo/proof-card styling, a subtle glass panel behind the hero copy, and extra top spacing in `components/auth/auth-shell.tsx`.

**Prevention:**
- Visual themes that change by time-of-day need separate contrast checks, not just palette swaps
- Absolute-positioned nav/brand chrome must be checked against hero spacing on narrower desktop widths
- Day and evening auth scenes should be visually QA'd in-browser as separate surfaces

**Files modified:**
- `components/auth/auth-shell.tsx`

**Tags:** #auth #signup #contrast #ui #daylight

## 2026-03-12 — Systemic Crop Year Format Mismatch (6 Competing Implementations)

**Symptom:** Historical RPCs (`get_historical_average`, `get_seasonal_pattern`, `get_week_percentile`) returned zero data. Intelligence tables (`grain_intelligence`, `x_market_signals`) couldn't join against `cgc_observations`. All cross-table queries silently returned empty results.

**Root Cause:** `cgc_observations` stores crop year in long format `"2025-2026"` (from CGC CSV), but `lib/utils/crop-year.ts` returned short format `"2025-26"`. There were 6 independent `getCurrentCropYear()` implementations: 1 in `lib/utils/crop-year.ts`, 5 in Edge Functions. Three Edge Functions used short format, creating a format split across all intelligence tables. 188 rows across 8 tables were written in short format that couldn't join to the 1.1M rows in `cgc_observations`.

**Solution:**
1. Standardized `lib/utils/crop-year.ts` to return long format `"2025-2026"`
2. Added `toShortFormat()` for display-only contexts
3. Fixed all 5 Edge Function `getCurrentCropYear()` implementations
4. Created migration `20260312130000` to convert 188 short-format rows to long format across 8 tables
5. Updated all tests to expect long format

**Prevention:**
- Crop year convention is now documented in CLAUDE.md and all agent docs
- `data-audit` agent is now a mandatory verification gate that checks format consistency
- Any shared utility that exists in multiple files must be grepped across the entire codebase when changed

**Tags:** #data-integrity #crop-year #cross-table-join #convention-mismatch

## 2026-03-12 — Primary-Only Historical Comparison Understates Deliveries by ~31%

**Symptom:** `get_historical_average()` for Canola Deliveries showed values ~31% lower than the YoY comparison view (`v_grain_yoy_comparison`), which combined Primary + Process worksheets.

**Root Cause:** `get_historical_average()` queried only `worksheet='Primary'` for deliveries. But crush-heavy grains like Canola send ~31% of deliveries directly to processors (tracked in the Process worksheet as "Producer Deliveries"). The YoY view correctly uses `FULL OUTER JOIN` of Primary + Process, but the historical RPC didn't.

**Solution:** Added a `CASE` expression: when `p_metric='Deliveries' AND p_worksheet='Primary'`, expand to `worksheet IN ('Primary', 'Process') AND metric IN ('Deliveries', 'Producer Deliveries')`. Applied same fix to `get_week_percentile()`.

**2026-03-15 correction:** `Primary + Process` was still an incomplete intermediate fix. The full country producer-delivery formula also requires:
- `Primary.Deliveries` from **AB, SK, MB, and BC**
- `Process.Producer Deliveries` national totals
- `Producer Cars.Shipments`

Treat any older doc or query that says "Primary + Process" as obsolete for producer-delivery totals.

**Prevention:** Any new RPC that aggregates deliveries must check whether Primary+Process combination is needed. See `v_grain_yoy_comparison` as the reference pattern.

**Tags:** #data-integrity #deliveries #primary-process #rpc

## 2026-03-12 — get_seasonal_pattern() GROUP BY Produces Multiple Rows in Scalar Function

**Symptom:** Would have caused runtime error on any call — function declared `RETURNS jsonb` (scalar) but `GROUP BY grain_week` produced multiple rows.

**Root Cause:** The function body had `GROUP BY grain_week` without wrapping the per-week results in an outer `jsonb_agg()`. PostgreSQL would error with "more than one row returned by a subquery used as an expression."

**Solution:** Wrapped per-week aggregation in a CTE (`weekly_agg`), then applied `jsonb_agg(... ORDER BY grain_week)` over the CTE to produce a single JSON array.

**Prevention:** Any `RETURNS jsonb` function must be verified to return exactly one row. A `GROUP BY` inside such a function is a red flag — it needs wrapping in `jsonb_agg()` or `jsonb_object_agg()`.

**Tags:** #postgresql #rpc #scalar-function #group-by

## 2026-03-12 — Agent Orchestration Failure: Zero Verification Gates Run

**Symptom:** 9 bugs shipped to production that should have been caught by existing agents.

**Root Cause:** Track #17 (12-task dual-LLM pipeline) was implemented in a single monolithic session without invoking any verification agents. The data-audit agent (designed to catch data integrity issues), security-auditor (designed to catch auth gaps), and documentation-agent (designed to maintain docs) were never run. The ultra-agent coordinator was never used to enforce workflow gates.

**Solution:**
1. Added mandatory DAG workflow to CLAUDE.md: Plan → Implement → Verify → Document → Ship
2. Upgraded data-audit agent to a mandatory verification gate
3. Upgraded security-auditor to a mandatory verification gate
4. Upgraded documentation-agent to a mandatory post-implementation gate
5. Added ultra-agent workflow enforcement with a critical lesson callout
6. Fixed stale conventions in agent docs (db-architect and data-audit had wrong crop year format)

**Prevention:** The mandatory workflow gates are now documented in CLAUDE.md and enforced through agent descriptions that explicitly state they MUST be invoked. The ultra-agent now includes a "CRITICAL LESSON" callout about Track #17.

**Tags:** #process #agent-orchestration #quality-gates #verification

## 2026-03-12 - CGC CSV Parser Used Positional Indexing Instead of Header Names

**Symptom:** Historical CGC CSV backfill (2020-2023) inserted 758K rows with `crop_year` values like `"1"`, `"2"`, `"3"` instead of `"2020-2021"`, `"2021-2022"`, etc. Historical RPC functions returned only 2 years of data instead of 5.

**Root Cause:** The CSV parser (`lib/cgc/parser.ts`) used hardcoded positional indexing (`parts[0]` = crop_year, `parts[1]` = grain_week). However, old CGC CSVs (2020-2023) have columns ordered `grain_week, crop_year, ...` while current CSVs (2024+) use `Crop Year, Grain Week, ...`. The swap put grain_week values (integers) into the crop_year field.

**Solution:** Changed the parser to build a column index map from the header row using case-insensitive, underscore-normalized header matching. Now detects column positions dynamically regardless of order: `const headerParts = lines[0].split(",").map(h => strip(h).toLowerCase().replace(/\s+/g, "_"))`. Deleted all bad rows (`WHERE crop_year NOT LIKE '____-____'`) and re-backfilled.

**Lesson:** CSV parsers should ALWAYS use header-name-based column mapping, never positional indexing. External data sources can change column order between years.

## 2026-03-11 - Hybrid Farm Units Need One Canonical Storage Unit

**Symptom:** Farmers plan and talk in a mix of `bu/ac`, pounds, and tonnes, but CGC and community comparisons are metric-tonne based. Without a canonical storage rule, the same crop could be entered in different units and become hard to compare honestly across dashboards, AI summaries, and analytics RPCs.

**Root Cause:** The crop-plan workflow originally assumed a single remaining-tonnes input. Once starting grain and yield calculations were added, the product needed to preserve the farmer's preferred unit while still normalizing data for government comparisons and percent-based analytics.

**Solution:** Added `inventory_unit_preference` and `bushel_weight_lbs` to `crop_plans`, converted all farmer-entered crop amounts to canonical metric tonnes before saving, and derived `bu/ac` plus `t/ac` from acres plus starting grain. Delivery logging now supports bushel entry too, but still stores canonical metric-tonne ledger rows.

**Prevention:**
- Choose one canonical storage unit for every workflow before adding multiple user-facing units
- Preserve the farmer's input preference separately from canonical numeric fields
- Treat bushel-weight assumptions as explicit data, not hidden app constants, whenever those assumptions affect yield or MT comparisons

**Files modified:**
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/log-delivery-modal.tsx`
- `lib/utils/grain-units.ts`
- `supabase/migrations/20260312113000_crop_inventory_unit_preferences.sql`

**Tags:** #data-model #units #yield #crop-plans

## 2026-03-11 - Dashboard Brand Links Must Not Bounce Through Public Landing Routes

**Symptom:** The top-left dashboard brand chip looked empty, and clicking it briefly flashed the prairie landing page before returning to the dashboard. Users experienced it as a broken nav control rather than a purposeful transition.

**Root Cause:** The shared dashboard nav linked its brand control to `/`, which is the public landing page. The landing page then checked auth client-side and redirected back into the product after render. At the same time, the header used the full lockup SVG at a very small nav size, so the brand was not legible enough to read as a logo.

**Solution:** Changed the dashboard brand control to use the compact mark and route directly to the signed-in user's role-aware home. Moved authenticated `/` handling into a server redirect in `app/page.tsx`, so signed-in users no longer render the public landing page first. Added a shared day/evening auth shell so prairie visual treatment on auth routes is intentional rather than a side effect of bouncing through `/`.

**Prevention:**
- Treat dashboard brand controls as in-app home links, not generic site-home links
- Server-redirect authenticated users away from public marketing routes before render
- Use mark-sized brand assets in compact nav surfaces; reserve full lockups for larger hero placements

**Files modified:**
- `app/page.tsx`
- `components/landing/landing-page.tsx`
- `components/layout/nav.tsx`
- `components/layout/logo.tsx`
- `components/auth/`
- `lib/auth/auth-scene.ts`

**Tags:** #ux #navigation #branding #auth

## 2026-03-10 - Pipeline Velocity Chart: Silent Data Truncation

**Symptom:** Pipeline Velocity chart showed flat lines for Terminal Receipts and Terminal Exports. Terminal Receipts displayed ~4,226 kt at week 20 instead of the correct 11,087 kt. Lines appeared to stop increasing around week 8, and "lower totals plotted above higher totals."

**Root Cause:** Supabase's PostgREST enforces a server-side `max_rows=1000` limit on all queries. The Terminal Receipts and Terminal Exports worksheets in `cgc_observations` store data per-grade per-region (no pre-aggregated `grade=''` rows like Primary does), producing far more rows than the limit:

| Metric | Row count | Over limit? |
|--------|----------|-------------|
| Terminal Receipts (Wheat) | 3,648 | 3.6x over (20 grades x 6 ports x 30 weeks) |
| Terminal Exports (Wheat) | 1,050 | Slightly over (6 grades x 6 ports x 30 weeks) |
| Primary Deliveries | 90 | OK (3 provinces x 30 weeks, grade='' aggregates) |
| Processing | 30 | OK (national total, grade='' aggregates) |

PostgREST silently truncated the response - no error, no warning. The client code received 1,000 out of 3,648 rows (~first 8 weeks), summed them correctly, then the forward-fill logic carried the last known value flat for remaining weeks.

**Why `.limit(10000)` didn't work:** PostgREST's `max_rows` config acts as an upper ceiling. The client `.limit()` sets a `Range` header, but the server caps it at `max_rows=1000` regardless.

**Solution:** Created `get_pipeline_velocity(p_grain, p_crop_year)` RPC function (migration `20260310200000_pipeline_velocity_rpc.sql`) that aggregates all 5 metrics in PostgreSQL using `SUM() GROUP BY grain_week`. Returns exactly 30 rows per grain instead of 3,648+. Updated `getCumulativeTimeSeries()` in `lib/queries/observations.ts` to call this RPC.

**Additional fix:** Added `Number()` coercion for `ktonnes` values (Postgres `numeric` type may return as strings from PostgREST). Fixed tooltip formatter in `gamified-grain-chart.tsx` to show series names instead of blank labels.

**Prevention:**
- Always check row counts when querying denormalized/long-format tables with `.select()`
- If a query could exceed ~500 rows, prefer a server-side RPC with `GROUP BY`
- CGC Terminal Receipts and Terminal Exports have NO `grade=''` aggregate rows - must always sum across grades
- Test Pipeline Velocity with Wheat first (highest row count: ~3,648 for Terminal Receipts)

**Files modified:**
- `lib/queries/observations.ts` - replaced 5 client queries with single RPC call
- `components/dashboard/gamified-grain-chart.tsx` - fixed tooltip to show series names
- `supabase/migrations/20260310200000_pipeline_velocity_rpc.sql` - new RPC function

**Tags:** #supabase #postgrest #data-truncation #chart #pipeline-velocity #rpc

## 2026-03-10 - Internal Pipeline Auth Was Public-by-Default

**Symptom:** The weekly intelligence chain could be triggered by anyone who knew the function URLs because function-to-function calls used the public anon JWT.

**Root Cause:** Edge Functions were chained over HTTP with `Authorization: Bearer $SUPABASE_ANON_KEY` semantics, and the functions trusted that relay path as if it were private. In practice, the anon JWT is public and `verify_jwt = true` only proved the caller was anonymous, not internal.

**Solution:** Made the Vercel cron route the only public ingress, unscheduled the legacy `pg_cron` job, set the internal pipeline functions to `verify_jwt = false`, and required a shared `x-bushel-internal-secret` backed by `BUSHEL_INTERNAL_FUNCTION_SECRET`.

**Prevention:**
- Never use anon JWTs for internal workflow auth
- Any `verify_jwt = false` function must require an internal secret
- Keep the same internal secret in Vercel and Supabase

**Files modified:**
- `app/api/cron/import-cgc/route.ts`
- `supabase/functions/_shared/internal-auth.ts`
- `supabase/functions/import-cgc-weekly/index.ts`
- `supabase/functions/validate-import/index.ts`
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/config.toml`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #edge-functions #vercel-cron #supabase

## 2026-03-10 - UI-Only Role Gating Is Not Authorization

**Symptom:** Observer accounts were hidden from farmer actions in the UI but could still mutate crop plans, deliveries, sentiment votes, and signal feedback by invoking server actions directly.

**Root Cause:** The role split was implemented primarily in the interface. Server actions only checked authentication, and RLS policies only checked row ownership.

**Solution:** Added deny-by-default role resolution in `lib/auth/role-guard.ts`, enforced farmer-only writes in server actions, and updated RLS to require both `auth.uid() = user_id` and `profiles.role = 'farmer'`.

**Prevention:**
- Never trust UI gating as the final write guard
- Every farmer-only workflow needs matching server-action and RLS enforcement
- Missing profiles must default to observer/deny

**Files modified:**
- `lib/auth/role-guard.ts`
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/grain/[slug]/actions.ts`
- `app/(dashboard)/grain/[slug]/signal-actions.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #security #rls #authorization #server-actions

## 2026-03-10 - Remaining Inventory Was Treated As Total Plan Volume

**Symptom:** Delivery pace bars, analytics, and percentiles overstated or understated progress because the app divided deliveries by `volume_left_to_sell_kt`, even though that field stores current remaining inventory.

**Root Cause:** The UI wording and the stored column were changed to "remaining to sell," but the downstream math still assumed the field represented the original total target.

**Solution:** Standardized pace calculations on `delivered + remaining_to_sell`, updated UI copy to match, and moved the same denominator into `calculate_delivery_percentiles()` and `get_delivery_analytics()`.

**Prevention:**
- Treat `volume_left_to_sell_kt` as a live state field, not a static plan field
- Keep one shared utility for UI pace math
- Mirror the same formula in SQL analytics and percentile logic

**Files modified:**
- `lib/utils/crop-plan.ts`
- `tests/lib/crop-plan.test.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/delivery-pace-card.tsx`
- `supabase/functions/generate-farm-summary/index.ts`
- `supabase/migrations/20260311110000_security_and_workflow_hardening.sql`

**Tags:** #ux #analytics #data-integrity #crop-plans

## 2026-03-11 - Hardcoded Supply Source Names Rot Fast

**Symptom:** Supply disposition queries depended on a hardcoded source string (`AAFC_2025-11-24`), which would go stale as soon as the next AAFC refresh used a different source name.

**Root Cause:** The app queried `supply_disposition` directly with a fixed source literal instead of selecting the current canonical source per grain and crop year.

**Solution:** Added `v_supply_disposition_current` to rank sources by AAFC preference and latest `created_at`, then moved the query layer to read from that view instead of hardcoding a source string.

**Prevention:**
- Do not hardcode date-stamped source identifiers in app queries
- Select a canonical source in SQL whenever multiple snapshots can exist
- Keep `.single()` calls paired with a view that guarantees one row

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `lib/queries/supply-disposition.ts`

**Tags:** #data-integrity #supply-disposition #query-layer

## 2026-03-11 - JSONB Delivery Logs Were Not Idempotent Or Auditable

**Symptom:** Delivery logging appended directly to `crop_plans.deliveries`, so double-submit races created duplicate entries and there was no append-only audit record behind the farmer-facing ledger.

**Root Cause:** Deliveries were stored as a mutable JSONB array inside `crop_plans`, which is convenient for reads but weak for idempotency, history, and operational debugging.

**Solution:** Added `crop_plan_deliveries` as an append-only delivery ledger with `submission_id` idempotency keys, then synchronized `crop_plans.deliveries` from that table as a compatibility projection.

**Prevention:**
- User-submitted event logs should use append-only rows, not only embedded JSON blobs
- Idempotency should use per-submission keys, not best-effort value matching
- Keep cached JSON projections as derived state, not the source of truth

**Files modified:**
- `supabase/migrations/20260311113000_delivery_ledger_and_canonical_supply.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-integrity #idempotency #audit-trail #crop-plans

## 2026-03-11 - Fallback Grains Must Not Masquerade As Unlocked Personalization

**Symptom:** The overview used fallback grains for empty-plan farmers, but the cards looked unlocked and linked into grain pages that then hard-locked. The app felt misleading at the exact moment a skeptical farmer was deciding whether to trust it.

**Root Cause:** The app treated "which grains should we display?" and "which grains has this farmer actually unlocked?" as the same decision. That blurred sample market content and personalized entitlement state.

**Solution:** Split the overview into an explicit `ActiveGrainContext` with separate `activeGrains`, `unlockedSlugs`, and `isPersonalized` fields. Locked overview cards now route to `My Farm`, the page copy explains why farm data sharpens the product, and post-auth flows for farmers land on `My Farm` first instead of `Overview`.

**Prevention:**
- Keep fallback content and unlock state as separate concepts in code
- If a downstream route is locked, upstream summary cards must route to setup, not to the locked destination
- Empty states must explain the next unlock and the value unlocked by completing it

**Files modified:**
- `lib/auth/post-auth-destination.ts`
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `components/landing/landing-page.tsx`
- `app/(dashboard)/overview/page.tsx`
- `app/(dashboard)/my-farm/page.tsx`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/farm-summary-card.tsx`

**Tags:** #ux #onboarding #trust #personalization

## 2026-03-11 - Summarized Social Signals Need Canonical Source Links

**Symptom:** X signal cards summarized posts and asked farmers to vote on relevance, but users could not click through to verify the original source. That created unnecessary trust friction in the most subjective part of the product.

**Root Cause:** The ingestion pipeline stored summary, author, and date, but not the canonical post URL. Frontend components therefore had to fall back to summaries alone and could not reliably deep-link to the source post.

**Solution:** Added `post_url` to `x_market_signals`, extended `search-x-intelligence` to request and store canonical X URLs, exposed the field through signal RPCs, and added outbound "Open post" links to both the ticker and the main X feed.

**Prevention:**
- Any summarized third-party content should store a canonical outbound URL at ingest time
- Trust-sensitive cards should always let the user verify the source directly
- If the exact URL is unavailable, fall back to a search URL that includes the author when possible

**Files modified:**
- `supabase/functions/search-x-intelligence/index.ts`
- `supabase/migrations/20260311121500_x_market_signal_post_urls.sql`
- `lib/queries/x-signals.ts`
- `components/dashboard/signal-tape.tsx`
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #x-feed #trust #data-model

## 2026-03-11 - Full Logo Lockups Should Not Be Paired With A Second Wordmark

**Symptom:** The dashboard header looked broken and "tacky" because the navigation rendered the full Bushel Board lockup SVG and also rendered a separate `Bushel Board` text label beside it. In narrower widths this made the wordmark wrap and visually collide with the nav pills.

**Root Cause:** `public/logo.svg` already contains the Bushel Board wordmark and subtitle, but the shared nav treated `Logo` like an icon-only mark and added another text span next to it.

**Solution:** Normalized the `Logo` component to preserve the lockup aspect ratio, removed the duplicate nav text, and let the header brand render as a single lockup chip.

**Prevention:**
- Know whether a brand asset is a mark-only asset or a full lockup before pairing it with text
- If a header uses the full lockup, never render a second adjacent wordmark
- Test header composition at medium widths, not only wide desktop

**Files modified:**
- `components/layout/logo.tsx`
- `components/layout/nav.tsx`
- `components/layout/desktop-nav-links.tsx`

**Tags:** #ui #branding #navigation

## 2026-03-11 - Social Feed Previews Need To Look Like Posts, Not Motion Widgets

**Symptom:** The overview X section looked like a decorative ribbon instead of a trustworthy source surface. Farmers were being asked to trust a moving tape rather than recognizable post previews.

**Root Cause:** The component optimized for movement and density instead of recognizability. The result looked more like a market ticker than a source feed.

**Solution:** Replaced the ticker treatment with compact post-style cards that show grain context, author handle when available, sentiment, summary, and an explicit outbound action.

**Prevention:**
- Trust-sensitive content should resemble the source it summarizes
- Prefer readable cards over animated ribbons when the user may want to verify the source
- Motion should support scanning, not replace information hierarchy

**Files modified:**
- `components/dashboard/signal-tape.tsx`

**Tags:** #ux #ui #x-feed #trust

## 2026-03-11 - Supporting Social Context Should Stay Visually Subordinate To Core Market Data

**Symptom:** The grain-page X feed became readable and source-verifiable, but the first card treatment consumed too much vertical and visual space. The section started competing with the CGC and farm metrics instead of supporting them.

**Root Cause:** The redesign corrected the "ticker" problem by making the cards look more like posts, but overshot on card size, padding, and follow-on helper banners.

**Solution:** Compacted the feed into slimmer horizontally scrollable post cards, reduced summary depth to two lines, turned feedback states into small pills, and removed the extra full-width helper chrome so the section reads as secondary context.

**Prevention:**
- On analytics-heavy pages, supporting content should be glanceable first and explorable second
- When converting a ribbon into cards, revisit size hierarchy so the new treatment does not become the new primary module
- Keep trust cues, but compress them into lightweight inline affordances when the page already contains large data blocks

**Files modified:**
- `components/dashboard/x-signal-feed.tsx`

**Tags:** #ux #ui #x-feed #hierarchy

## 2026-03-11 - A Grain Page Should Have One Social Surface, Not Two

**Symptom:** The grain page showed X-derived content twice: once as a top preview strip near the thesis and again as the full interactive signal feed later on. Even after compacting the cards, the repeated presence still made the page feel cluttered and logically messy.

**Root Cause:** The app reused both the overview-style preview treatment and the dedicated grain-page feed on the same screen. That duplicated the source layer instead of clarifying it.

**Solution:** Removed the top `SignalTape` from the grain detail page and kept one dedicated X evidence/feed section lower in the page. The overview still uses the lighter cross-grain social preview, while grain detail now has a single source-of-truth social module.

**Prevention:**
- Distinguish clearly between overview preview components and detail-page evidence components
- Do not render two views of the same source data on the same page unless they answer different user questions
- On detail pages, supporting context should appear once in the hierarchy with a clear purpose

**Files modified:**
- `app/(dashboard)/grain/[slug]/page.tsx`

**Tags:** #ux #hierarchy #x-feed #grain-page

## 2026-03-11 - Delivery Ledgers Need Sale Classification, Not Just Volume

**Symptom:** The product could show deliveries and a remaining balance, but it could not honestly tell the farmer how much of the crop was contracted versus still open once deliveries started posting. Every new load made contract metrics drift.

**Root Cause:** `crop_plan_deliveries` stored amount and destination, but not whether the load was delivered against a contract or sold into the open market. That meant the system had no defensible way to decrement `contracted_kt` versus `uncontracted_kt`.

**Solution:** Added `marketing_type` to the delivery ledger, required new deliveries to be classified as `contracted` or `open`, and moved the crop-plan state update into a database trigger so `volume_left_to_sell_kt`, `contracted_kt`, and `uncontracted_kt` stay synchronized automatically.

**Prevention:**
- If a downstream metric depends on the type of transaction, capture that classification at write time
- Do not try to infer contract posture from delivery volume alone once real farmer decisions diverge
- Keep the append-only ledger canonical and derive cached UI projections from it

**Files modified:**
- `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `components/dashboard/log-delivery-modal.tsx`

**Tags:** #data-model #delivery-ledger #contracts #marketing

## 2026-03-11 - CGC Region Names Are Not Unique Keys

**Symptom:** React duplicate key warnings in the SupplyPipeline domestic breakdown after folding in domestic disappearance data. The console showed "two children with the same key: Pacific."

**Root Cause:** `getShipmentDistribution()` returns multiple rows with the same `region` value (e.g., "Pacific" appears for both terminal receipts and exports). The component used `key={d.region}` assuming region names were unique.

**Solution:** Changed to `key={`${d.region}-${i}`}` with array index suffix to guarantee uniqueness.

**Prevention:**
- CGC region names are descriptive labels, not unique identifiers — never use them as React keys
- When rendering lists from aggregated CGC data, always include an index or composite key
- Test collapsible sections with grains that have duplicate region rows (Canola is a good candidate)

**Files modified:**
- `components/dashboard/supply-pipeline.tsx`

**Tags:** #react #cgc-data #keys #supply-pipeline

## 2026-03-11 - HMR Does Not Clear Stale React Trees After Client Directive Changes

**Symptom:** After fixing the duplicate key bug, console errors persisted even though the source code was correct. The errors only cleared after a full dev server restart.

**Root Cause:** When a component gains or changes its `"use client"` directive, Hot Module Replacement may not fully unmount and remount the React tree. Stale component instances continue to render with old key logic.

**Solution:** Stopped and restarted the dev server to force a clean React tree rebuild.

**Prevention:**
- After adding/modifying `"use client"` directives or changing component key strategies, restart the dev server
- Don't debug console errors from stale HMR state — restart first, then investigate
- Preview verification should include a server restart step when `"use client"` changes are involved

**Files modified:** (none — operational fix)

**Tags:** #hmr #next.js #debugging #dev-server

## 2026-03-12 — CGC Freshness Badge Shows Historical Backfill Instead of Current Data

**Symptom:** App header displayed "CGC Wk 52 · 2023-2024" instead of "CGC Wk 30 · 2025-2026".

**Root cause:** `cgc-freshness.tsx` queried `cgc_imports` with `ORDER BY imported_at DESC`. Historical backfill imports (2020-2024) ran on March 12 and received newer `imported_at` timestamps than the actual current 2025-2026 Week 30 import from March 9. The query returned the most recently *imported* row, not the most *current* data.

**The lesson:** `imported_at` (wall-clock time of the job) ≠ logical data time (`crop_year`, `grain_week`). Any query that wants "the latest data" must order by the data's own temporal columns, not the import timestamp. Backfills, re-imports, and reconciliation jobs will always break timestamp-based ordering.

**Fix:** Changed ordering from `.order("imported_at", { ascending: false })` to `.order("crop_year", { ascending: false }).order("grain_week", { ascending: false })`. The `imported_at` field is still used for the freshness dot (green pulse vs amber) since that correctly reflects data staleness.

**Files modified:** `components/layout/cgc-freshness.tsx`

**Tags:** #freshness #ordering #backfill #cgc-imports

## 2026-03-13 — Supplementary Data Pipeline Added (Grain Monitor & Producer Cars)

**Scope:** Added a secondary logistics-focused data pipeline to supplement the core CGC weekly grain data.

**What was added:**
1. **New Supabase tables:**
   - `grain_monitor_snapshots` — system-wide logistics per grain week from Government Grain Monitor PDFs (port throughput, grain-in-storage, etc.)
   - `producer_car_allocations` — per-grain forward-looking rail car data from CGC Producer Car reports (advance allocations for future weeks)

2. **New RPC function:**
   - `get_logistics_snapshot(crop_year, grain_week)` — returns both tables' data as structured JSON for Edge Function integration

3. **Enhanced commodity knowledge:**
   - Updated `commodity-knowledge.ts` with two new sections: "Marketing Strategy & Contract Guidance" and "Logistics & Transport Awareness" (~1.5K tokens, total now ~5.5K)
   - Applied to both `analyze-market-data` and `generate-intelligence` prompts for context-aware logistics discussion

4. **Pipeline integration:**
   - Updated `market-intelligence-config.ts` version bumps: v4 for analyzeMarketData and generateIntelligence, v3 for knowledgeBase
   - `analyze-market-data` fetches logistics snapshot and injects into Step 3.5 Flash prompts
   - `generate-intelligence` receives logistics data in Grok prompts via updated `GrainContext` interface

5. **Data insertion:**
   - Week 30 Grain Monitor data (2025-2026 crop year, 1-week lagged: used for Week 31 analysis)
   - Week 33 Producer Car allocations (2025-2026 crop year, 2-week forward: for Week 31 analysis)
   - Manually inserted for now — automated scraping not yet implemented

6. **Migration file:**
   - `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` creates tables, RPC, and indexes

**Known Data Issues:**
- **Grain name mapping:** `producer_car_allocations` uses CGC commodity naming (e.g., "Durum") while `grains` table uses full names (e.g., "Amber Durum"). Grain disambiguation will be needed when joining these tables in future analysis queries.
- **Producer car cumulative semantics:** Data is cumulative forward-looking, not weekly-only. The RPC returns the latest available week ≤ `grain_week + 3` to ensure allocations don't "age out" mid-analysis.

**Prevention:**
- Grain name mismatches between external data sources and the canonical `grains` table should be documented at ingest time
- Forward-looking data (allocations, forecasts) and historical data (observations) need explicit time-semantic clarity in both schema and query documentation

**What remains:**
- Automated scraping from Government Grain Monitor PDFs and CGC Producer Car reports
- Historical backfill of older grain monitor and producer car data
- UI display components for logistics data (charts, summary tiles, context cards)

**Files modified:**
- `supabase/migrations/20260313120000_create_grain_monitor_and_producer_cars.sql` (new)
- `supabase/functions/_shared/commodity-knowledge.ts`
- `supabase/functions/_shared/market-intelligence-config.ts`
- `supabase/functions/analyze-market-data/index.ts`
- `supabase/functions/generate-intelligence/index.ts`
- `supabase/functions/generate-intelligence/prompt-template.ts`
- `lib/queries/observations.ts` (added `logisticsSnapshot` field to GrainContext)

**Tags:** #data-pipeline #logistics #government-data #supplementary-sources #commerce-context

## 2026-03-13 — Producer Car Grain Names Don't Match Canonical Grains Table

**Symptom:** QC check found that `producer_car_allocations` grain names ("Durum", "Chickpeas") didn't match the canonical `grains` table names ("Amber Durum", "Chick Peas"), causing silent JOIN failures in the `get_logistics_snapshot()` RPC.

**Root Cause:** CGC Producer Car reports use abbreviated commodity names that differ from the CGC weekly grain statistics CSV naming convention used in `grains`. No validation or mapping layer existed at ingest time.

**Solution:** Applied SQL UPDATEs to normalize names:
```sql
UPDATE producer_car_allocations SET grain = 'Amber Durum' WHERE grain = 'Durum';
UPDATE producer_car_allocations SET grain = 'Chick Peas' WHERE grain = 'Chickpeas';
```
Buckwheat left unmatched (minor grain, not in the tracked 16 Canadian grains).

**Prevention:**
- Every new external data source must have a grain-name mapping validation at ingest time
- Document known name discrepancies between CGC report types (weekly CSV vs producer car reports vs grain monitor)
- Future automated ingestion scripts should include a `CASE WHEN` or lookup table to normalize grain names before INSERT

**Tags:** #data-integrity #grain-naming #producer-cars #external-data

## 2026-03-13 — AI Thesis Contradiction: Step 3.5 Flash Bearish vs Grok Bullish on Canola

**Symptom:** The dual-LLM pipeline produced contradictory Canola Week 31 theses — Step 3.5 Flash called bearish (YTD exports -28% YoY), Grok called bullish (stock drawdown shows demand). A farmer reading both would receive conflicting advice.

**Root Cause:** Step 3.5 Flash anchored on cumulative YTD export position without checking whether current-week flow contradicted the conclusion. Three specific errors: (1) conflating YTD position with current flow, (2) ignoring stock draw as a bullish signal, (3) missing the logistics constraint explanation for weak exports.

**Resolution:** Claude moderated the debate using evidence: Week 31 stocks drew -175.6 Kt while 455.6 Kt of deliveries came in, implying 631 Kt absorbed in one week. Vancouver port at 107% capacity (26 vessels vs avg 20, 19.2% out-of-car time) explains the export lag. Corrected thesis: bullish with timing risk, not bearish.

**New references created:**
- `docs/lessons-learned/canola-week31-debate-moderation.md` — full moderation ruling with evidence
- `docs/reference/agent-debate-rules.md` — 8 codified rules for continuous agent improvement

**Prevention:**
- Added flow coherence rules to the pipeline: if thesis says bearish but stocks are drawing, flag the contradiction before publishing
- Added logistics data integration so both models can see port congestion, vessel queues, and out-of-car time
- Codified the "2 of 3 weeks confirmation" rule — don't wait for 2-3 more weeks when the data already shows a pattern

**Tags:** #ai-pipeline #thesis-quality #dual-llm #debate-moderation #canola

## 2026-03-13 — Phantom Migration: knowledge_corpus Recorded But DDL Never Executed

**Symptom:** `knowledge_documents` and `knowledge_chunks` tables did not exist in production, but `supabase_migrations.schema_migrations` showed version `20260312170000` as applied. Edge Functions calling `get_knowledge_context()` RPC silently returned empty results (function also didn't exist).

**Root cause:** Unknown — likely `supabase db push` marked the migration as applied after a transient error. The migration's `GENERATED ALWAYS AS` column with `to_tsvector()` would have failed because `to_tsvector(regconfig, text)` is `STABLE`, not `IMMUTABLE`. PostgreSQL requires `IMMUTABLE` expressions in generated columns. The error may have been swallowed.

**Fix:** Ran the DDL directly via Supabase MCP SQL. Replaced the `GENERATED ALWAYS AS` tsvector column with a trigger-based approach (`BEFORE INSERT OR UPDATE` trigger that populates `search_vector`). Updated the local migration file to match.

**Prevention:**
- Always verify tables exist after `supabase db push` — don't trust the migration history table alone
- Use `SELECT count(*) FROM <table>` as a smoke test after applying migrations
- For full-text search columns, prefer trigger-based tsvector over generated columns (Postgres classifies `to_tsvector` and `setweight` as STABLE, not IMMUTABLE)

**Tags:** #migration #supabase #postgresql #full-text-search #phantom-migration

## 2026-03-13 — Wrong xAI Model ID: grok-4-20 Does Not Exist

**Symptom:** `generate-intelligence` Edge Function returned 400 error: `"Model not found: grok-4-20"`. Canola intelligence generation failed.

**Root cause:** The xAI API uses a different naming convention than expected. The correct model ID for Grok 4.20 beta with reasoning is `grok-4.20-beta-0309-reasoning`, not `grok-4-20`. The model name includes dots, the beta tag, a date suffix, and a reasoning/non-reasoning mode suffix.

**Fix:** Updated the MODEL constant in `generate-intelligence/index.ts` to `grok-4.20-beta-0309-reasoning` and redeployed.

**Prevention:**
- Always verify model IDs against the official docs page (`docs.x.ai/developers/models`) before deploying
- xAI model naming pattern: `grok-{major}.{minor}-{variant}-{date}-{mode}`
- Consider storing model IDs in a configuration table or env var rather than hardcoding, so they can be updated without code deploys

**Tags:** #xai #grok #model-id #edge-function #api

## 2026-03-14 — CFTC Cron Was Disconnected From Intelligence Pipeline

**Symptom:** Friday CFTC COT import (`import-cftc-cot`) ran successfully but the intelligence pipeline (`analyze-market-data` → `generate-intelligence`) never re-ran. Farmers saw intelligence cards without COT context until the next weekly Thursday run.

**Root cause:** The CFTC cron route (`app/api/cron/import-cftc-cot/route.ts`) only called `import-cftc-cot` and returned — it didn't chain to downstream functions like the CGC Thursday pipeline does. The Thursday pipeline runs before CFTC data is available (CFTC publishes Friday), so the weekly intelligence never included COT positioning.

**Fix:** Added chain trigger in the cron route: after successful CFTC import, fire `analyze-market-data` which auto-chains to `generate-intelligence`. This re-runs the dual-LLM pipeline with COT data now available.

**Prevention:**
- Any new data source cron must chain to the intelligence pipeline if the data feeds into LLM analysis
- Document the canonical pipeline chain in CLAUDE.md when adding new ingress points

**Tags:** #cftc #cron #pipeline #chain-trigger #intelligence

## 2026-03-14 — get_cot_positioning() Leaked Future Data Into Historical Reruns

**Symptom:** Regenerating Week 30 intelligence after Week 32 COT data arrived would include Week 31-32 positioning data in the analysis — making historical intelligence non-reproducible.

**Root cause:** The `get_cot_positioning()` RPC only filtered by `p_grain` and `p_crop_year`, then `ORDER BY report_date DESC LIMIT p_weeks_back`. No upper bound on grain_week meant reruns could "see the future."

**Fix:** Added `p_max_grain_week` parameter (DEFAULT NULL for backwards compatibility). Both `analyze-market-data` and `generate-intelligence` now pass `p_max_grain_week: grainWeek` to scope COT data to the target analysis week.

**Prevention:**
- All time-series RPCs used by the intelligence pipeline must accept an "as-of" bound parameter
- Historical reproducibility should be a test case: "regenerating week N later produces the same data inputs"

**Tags:** #cftc #rpc #reproducibility #time-series #intelligence

## 2026-03-14 — CFTC Parser Field Names Mismatched Live SODA API Schema

**Symptom:** `managed_money_spread`, `traders_prod_merc_long/short`, and `traders_other_long` columns were silently null in `cftc_cot_positions` despite the upstream CFTC API having valid data.

**Root cause:** The parser interface (`CftcApiRow`) used field names that don't match the live `kh3c-gbw2` SODA endpoint:
- `m_money_positions_spread_all` → actual: `m_money_positions_spread` (no `_all` suffix)
- `traders_prod_merc_long` → actual: `traders_prod_merc_long_all` (missing `_all`)
- `traders_other_rept_long` → actual: `traders_other_rept_long_all` (missing `_all`)
- `traders_swap_long_all` / `short_all` / `spread_all` → don't exist in disaggregated dataset at all

**Fix:** Corrected field names in `CftcApiRow` interface and `parseCftcCotRows()` mapping. Swap trader counts hardcoded to null (not available in this dataset).

**Prevention:**
- Validate parser output against a live API response during integration testing
- Add a smoke test that fetches one CFTC row and asserts non-null values for key positioning fields

**Tags:** #cftc #parser #soda-api #field-mapping #silent-null

## 2026-03-13 — Dashboard Overhaul Data Audit Findings

Four findings from a systematic audit of the dashboard data layer during the Dashboard Overhaul work.

### Finding 1: Logistics Tables Have No Import Pipeline (HIGH)

**Symptom:** `LogisticsCard` shows empty state. AI intelligence narratives lack logistics context (port throughput, vessel queues, producer car allocations).

**Root cause:** `grain_monitor_snapshots` and `producer_car_allocations` tables exist with proper schema, and the `get_logistics_snapshot()` RPC is consumed by `analyze-market-data` and `generate-intelligence` Edge Functions — but there is NO automated import mechanism. No Edge Function, no cron job, and no script exists to populate these tables. They are likely empty in production.

**Impact:** HIGH. The logistics data path is fully wired (schema, RPC, AI prompts, UI card) but has no data source. This is a silent gap — no errors are thrown, the system simply operates without logistics context.

**Fix needed:** Build an import Edge Function that fetches Grain Monitor and Producer Car data, plus a cron trigger to run it on a regular schedule.

**Tags:** #data-pipeline #logistics #grain-monitor #producer-cars #missing-import

### Finding 2: Oats Missing from CFTC COT Mapping (MEDIUM)

**Symptom:** Oats intelligence narratives have no CFTC COT positioning context, even though CME trades Oats futures which are reported in CFTC COT data.

**Root cause:** The CFTC parser in `supabase/functions/_shared/cftc-cot-parser.ts` maps CME commodity names to CGC grain names, but Oats is not included in the mapping. 10 of 16 CGC grains correctly lack COT data (no futures contracts exist), but Oats is a genuine gap.

**Fix status:** Added `{ "OATS": { cgcGrain: "Oats", mappingType: "primary" } }` to the CFTC parser, widened the COT heartbeat wrapper to write Oats for both Canadian and U.S. tracks, and added an Oats row to `grain_market_mappings`.

**Tags:** #cftc #parser #oats #mapping-gap

### Finding 3: AAFC Supply Data Static from November 2025 (MEDIUM)

**Symptom:** Supply pipeline card shows AAFC balance sheet data sourced from November 2025. By March 2026, carry-out and export estimates may be stale.

**Root cause:** Data was seeded via `scripts/seed-supply-disposition.ts` with source `AAFC_2025-11-24`. AAFC typically publishes 2-3 updated Outlooks per crop year, but there is no automated refresh mechanism — re-seeding is a manual process.

**Fix:** Re-run the seed script with updated AAFC numbers when a new Outlook is published. Consider adding an observability check that flags when supply data is more than 3 months old.

**Tags:** #aafc #supply-disposition #data-freshness #manual-process

### Finding 4: Deliveries WoW Redundancy Resolved (LOW — CLOSED)

**Prior issue:** Deliveries data was shown in 3 components simultaneously (NetBalanceKpi, IntelligenceKpis, WoWComparisonCard), creating visual redundancy on the grain detail page.

**Resolution:** The WS4 grain detail page restructure removed NetBalanceKpi and moved WoWComparisonCard into an expandable accordion. The remaining redundancy (IntelligenceKpis headline number + WoW table detail) is intentional — KPIs serve as a quick-scan summary while the WoW table provides detailed week-over-week context.

**Tags:** #ux #redundancy #resolved #grain-detail

## 2026-03-13 — Import Pipeline Build: Producer Cars + Grain Monitor

### Finding 5: CGC Blocks Supabase Edge Function IPs (HIGH — RESOLVED)

**Symptom:** The `import-producer-cars` Edge Function returned `error sending request for url: Connection reset by peer (os error 104)` when trying to fetch the CGC Producer Car CSV from `grainscanada.gc.ca`.

**Root cause:** The CGC website blocks connections from Supabase Edge Function IPs (AWS us-west-2). This is likely an IP-based WAF rule or rate limiter targeting cloud provider ranges.

**Fix:** Restructured the import to use a **Vercel cron route** (`app/api/cron/import-producer-cars/route.ts`) that fetches the CSV directly from Vercel's infrastructure (which CGC allows). The Edge Function remains deployed as a fallback but is not used in the production pipeline.

**Lesson:** When building import pipelines for government data sources, always test connectivity from the target execution environment before building the full pipeline. Government websites frequently block cloud provider IP ranges.

**Tags:** #import #cgc #edge-function #connectivity #producer-cars

### Finding 6: Grain Monitor Data is Monthly, Not Weekly (MEDIUM — DOCUMENTED)

**Symptom:** Expected weekly granularity from the Quorum Corp Grain Monitor data tables, but the `MonthlyReportDataTables.xlsx` (14.4 MB) contains monthly aggregates for stock levels, vessel data, and terminal volumes.

**Exception:** The Out-of-Car Time sheet (5C-5) has **weekly** granularity — each grain week gets its own column. This is the only weekly metric in the Excel.

**Original workaround:** The import script (`scripts/import-grain-monitor.mjs`) handled both granularities:
- Weekly OCT data: imported directly with correct grain week numbers (weeks 1-26 for current crop year)
- Monthly stock/terminal data: mapped to approximate grain week midpoints (AUG→wk3, SEP→wk7, etc.)
- Manual weekly entries (from PDF reports) are preserved and never overwritten by auto-import

**Update 2026-04-20:** `scripts/import-grain-monitor-weekly.ts` is now the canonical weekly importer. It reads the Quorum weekly PDF (`GMPGOCWeek{YYYY}{WW}.pdf`), writes the real `report_date`, fills the full weekly logistics row, and surfaces lag versus the latest imported CGC week. `scripts/import-grain-monitor.mjs` remains only as the monthly Excel fallback/backfill helper and should not be treated as the weekly source of truth.

**Data sources:**
- Weekly PDF reports: `grainmonitor.ca/Downloads/WeeklyReports/GMPGOCWeek{YYYYWW}.pdf` (rich but requires PDF parsing)
- Monthly Excel data tables: `grainmonitor.ca/Downloads/MonthlyReports/MonthlyReportDataTables.xlsx` (machine-readable, auto-importable)
- GMODS web UI: `grainmonitor.ca/GMODS/` (interactive, no REST API)

**Tags:** #import #grain-monitor #quorum #data-granularity

### Finding 7: Excel Crop Year Duplicate Column Trap (MEDIUM — FIXED)

**Symptom:** January stock values showed ~5 kt instead of ~6,929 kt after import.

**Root cause:** The Quorum Excel has a duplicate "JAN" column at the end of each crop year section — one for actual January data (col 274) and one for the YoY variance comparison (col 289). The parser's month-to-week mapping picked up both, with the variance column (value -0.21) overwriting the real data.

**Fix:** Stop scanning month columns when encountering "YTD AVG" or "YTD" labels, which marks the boundary between real data and variance/comparison columns.

**Tags:** #import #grain-monitor #excel #parsing-bug
