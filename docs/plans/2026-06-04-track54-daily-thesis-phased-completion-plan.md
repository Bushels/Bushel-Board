# Track 54 Daily Thesis Phased Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Track 54 daily Bull/Bear thesis loop by separating evidence collection, promotion approval, first bounded write proof, and automation registration into gated phases.

**Architecture:** Official collectors and prices remain the thesis base. Grok is a quarantined X scout that produces local no-write artifacts first; Codex/Claude validation decides whether those artifacts can become accepted X evidence; only after a clean artifact gate and Kyle approval can a bounded daily trajectory writer run. Friday thesis-of-record writes remain the desk-swarm lane, not Grok.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Codex automations, Grok Build CLI or xAI API fallback, Track 54 scripts, `x_scout_runs`, `x_market_signals`, `score_trajectory`, `us_score_trajectory`, `thesis_packet_cache`.

---

## Direct Verdict

Yes: stop adding pipeline surface area and phase the remaining work.

The last stretch has been slow because the goal was really five goals tangled together:

```text
1. Official data and prices stay fresh
2. Grok/X scout produces clean no-write artifacts
3. Artifact gate becomes approval-ready
4. One bounded daily write is manually approved and proven
5. Write-mode automation is registered only after that proof
```

We have been treating those as one giant "daily thesis automation" goal. That makes every small readiness issue feel like the whole feature is still unfinished.

## Current Checkpoint

Use this as the starting point unless a newer readiness run proves otherwise:

- Track 54 implementation is broadly built: price refresh, scout contract, validation, artifact review, readiness report, heartbeat summary, browser smoke, UI audit surface, and approval-gated write commands exist.
- Production Grok write routines remain disabled.
- Grok remains an X evidence scout only, not a thesis writer.
- Latest readiness still holds manual review: `overall_status = hold_manual_review`, `production_writes_enabled = false`, and `browser_smoke_clean = true`.
- Current reviewed daily-pulse window is short of the required gate: latest readiness is `3/5` artifact days found, `2` clean artifact days, `3` clean artifact days still missing, with `1` accepted signal and `1` decision-grade accepted signal.
- The selected 2026-06-08 artifact is a Hermes terminal no-write artifact at `data\X Scout Runs\2026-06-08\daily_pulse-hermes-terminal-20260609T020001Z-raw.json`, SHA-256 `57009259510318769b7191b23d1ff1373cc08979bdae0cdd71306c603f045339`.
- Friday-deep gate remains `0/1` artifact days found, `0` clean, with `1` clean Friday artifact still missing.
- The original Grok runner still has missing credential proof: `credential_source = none`, `credential_issue = missing_credential`, `cli_auth_file_present = false`, and `xai_api_key_present = false`.
- Hermes terminal proof is available for no-write artifact collection: `provider = xai-oauth`, `model = grok-4.3`, `x_search` listed, and terminal preflight OK.
- A dry-run daily thesis review still builds the packet and remains idempotent: it found the earlier Wheat X Pulse decision but skipped it as already applied (`writes_attempted = 0`, `writes_skipped_existing = 1`).
- Future write-mode runs require both explicit Kyle approval and the exact reviewed artifact window from the mode-scoped promotion brief. The approval phrase alone is rejected; commands must include `--approval-review-from YYYY-MM-DD` and `--approval-review-to YYYY-MM-DD`. Proposed Codex write automations also carry a structured `approval_review_window`, and readiness rejects proposal drift if that structure no longer matches the mode gate.
- The no-write operator summaries now expose `clean_artifact_days_found`, and the active `track-54-promotion-review` heartbeat is manifest-audited for that field.
- The next operator action is to let the June 9 through June 12 no-write windows collect evidence through the scheduled automations; because the daily gate uses a rolling seven-day review window, the June 2 clean day drops out before the gate can pass. Refresh the original Grok credential before any write-mode approval.

## Non-Negotiable Scope

- Do not revive `/api/pipeline/run`.
- Do not revive retired Grok/xAI thesis-writing functions.
- Do not let Grok write `market_analysis`, `us_market_analysis`, `score_trajectory`, `us_score_trajectory`, or `thesis_packet_cache`.
- Do not register write-mode automations before the matching artifact gate is candidate-ready and Kyle approves.
- Do not add another integration before v1 ships. Direct X API, extra MCPs, or new model routing are v2 unless a current phase is blocked.
- Do not spend more time on observability unless it removes a decision blocker.

## Phase Map

```text
Phase 0: Freeze scope
  -> Phase 1: Prove no-write scout runner readiness
  -> Phase 2: Collect clean no-write evidence days
  -> Phase 3: Produce human approval packet
  -> Phase 4: Prove one manual bounded daily write
  -> Phase 5: Register write-mode automation
  -> Phase 6: Prove Friday thesis-of-record handoff
  -> Phase 7: Clean docs and close v1
```

## Phase 0: Freeze Scope And Stop The Drift

**Purpose:** Prevent more "almost done" infrastructure work from replacing the actual shipping sequence.

**Files:**

- Create: `docs/plans/2026-06-04-track54-daily-thesis-phased-completion-plan.md`
- Modify later only when phase state changes: `PROJECT_STATE.md`
- Modify later only when phase state changes: `docs/plans/STATUS.md`

- [x] **Step 1: Save this phase plan**

Run no runtime commands for this step. This is a planning checkpoint only.

Expected:

- The plan exists.
- No production pipeline, Grok search, Supabase write, or Codex write-mode automation is triggered.

- [x] **Step 2: Reject nice-to-have observability until a gate needs it**

Current example: adding `grok_runner` to `npm run track54:automation-runs` is nice-to-have, not required if `npm run track54:heartbeat-summary` already exposes `grok_runner.credential_issue`.

Expected:

- No more telemetry fields are added unless a phase cannot be judged without them.
- If a missing field blocks a phase, add the smallest focused test and field only.

## Phase 1: Prove No-Write Scout Runner Readiness

**Purpose:** Make the no-write scout able to run again without treating Grok/Hermes as a thesis writer.

**Files:**

- Usually none.
- Modify only if the preflight command itself is wrong: `scripts/check-track54-grok-preflight.ts`
- Test only if modifying preflight logic: `lib/__tests__/track54-readiness-report.test.ts`

- [x] **Step 1: Check original Grok credential state**

Run:

```powershell
npm run track54:grok-preflight
```

Expected pass shape:

```json
{
  "credential_ok": true,
  "ok": true
}
```

Expected current failure shape if still blocked:

```json
{
  "credential_ok": false,
  "credential_issue": "expired_auth or missing_credential",
  "ok": false
}
```

- [x] **Step 2: Check Hermes terminal readiness**

Run:

```powershell
npm run track54:hermes-preflight
```

Expected pass shape:

```json
{
  "ok": true,
  "provider": "xai-oauth",
  "model": "grok-4.3",
  "x_search_tool_listed": true
}
```

Expected:

- This proves Hermes can be used as a no-write terminal artifact fallback.
- This does not run X search.
- This does not write Supabase rows.
- This does not make the daily thesis write loop complete.

- [ ] **Step 3: Refresh the original Grok credential before write approval**

Operator action:

```powershell
grok login
```

Fallback operator action if CLI auth keeps expiring:

```text
Add XAI_API_KEY to .env.local, then rerun the preflight.
```

Expected:

- `credential_source` becomes `cli_auth` or `xai_api_key`.
- `credential_issue` becomes `null`.
- No Grok search runs during this step.

- [ ] **Step 4: Run the no-write recovery path when the local artifact window is due**

Run:

```powershell
npm run track54:recover-after-grok-login
```

Expected:

- The script reviews existing artifacts first.
- It retries only missing or invalid no-write artifacts.
- The shortcut delegates to `track54:artifact-health:both-retry`, avoiding Windows/npm 11 wrapper flag noise.
- The deterministic artifact-health path may use `--fallback hermes_terminal` only after the original Grok preflight fails and Hermes preflight passes.
- If the current local day has no due Track 54 scout window, it refreshes readiness without launching Grok.
- Any Grok CLI retry uses Cursor/Composer 2.5 via `grok-composer-2.5-fast`.
- It refreshes readiness.
- It does not run any `--write` command.
- It does not write Supabase rows unless the deterministic no-write artifact path is explicitly designed to write none.

## Phase 2: Build The No-Write Artifact Window

**Purpose:** Get enough clean evidence days before asking Kyle to approve a write loop.

**Files:**

- Usually none.
- Modify only if a script bug blocks review: `scripts/review-grok-x-scout-artifact-week.ts`
- Modify only if recovery behavior is wrong: `scripts/run-track54-artifact-health-check.ts`
- Modify only if readiness projection is wrong: `scripts/build-track54-readiness-report.ts`
- Focused tests if modified: `lib/__tests__/grok-x-scout-artifact-week.test.ts`, `lib/__tests__/track54-artifact-health.test.ts`, `lib/__tests__/track54-readiness-report.test.ts`

- [ ] **Step 1: Let scheduled no-write runs accumulate evidence**

Expected daily order:

```text
3:45 PM MT price/cache refresh
3:55 PM MT Grok auth preflight
4:10 PM MT daily_pulse no-write scout
4:20 PM MT Hermes terminal shadow recovery only if today's artifact is missing/invalid/stale
4:45 PM MT artifact health check
5:05 PM MT late auth recovery
5:30 PM MT thread heartbeat review
```

Expected Friday addition:

```text
4:50 PM MT friday_deep no-write scout
5:15 PM MT final artifact health check
```

- [ ] **Step 2: Inspect the operator packet after each run**

Run:

```powershell
npm --silent run track54:heartbeat-summary
npm run track54:automation-runs
```

Expected:

- `production_writes_enabled = false`
- `write_automations_safe = true`
- Write-mode automations are missing or inactive.
- Daily-pulse selected artifacts show raw path and SHA-256 hash.
- Grok auth blocker is visible under `grok_runner.credential_issue`.
- Failed or blocked automations are named directly.

- [ ] **Step 3: Require the artifact gate, not vibes**

Daily-pulse candidate threshold:

```text
artifact_days_found: 5/5
accepted_signal_count: at least 1
decision_grade_accepted_signal_count: at least 1
write_mode_artifact_days: 0
missing_no_write_evidence_days: 0
artifact_identity_mismatch_days: 0
summary_count_mismatch_days: 0
production_writes_enabled: false
```

Friday-deep candidate threshold:

```text
artifact_days_found: 1/1
run day is Friday
accepted_signal_count: at least 1
decision_grade_accepted_signal_count: at least 1
write_mode_artifact_days: 0
production_writes_enabled: false
```

Expected:

- Until the threshold is met, the correct verdict is blocked by artifact gates.
- Do not manually approve a write loop because the code "looks ready."

## Phase 3: Produce The Human Approval Packet

**Purpose:** Convert clean no-write evidence into a decision Kyle can approve or reject.

**Files:**

- Existing builder: `scripts/build-grok-x-scout-promotion-brief.ts`
- Existing tests: `lib/__tests__/grok-x-scout-promotion-brief.test.ts`

- [ ] **Step 1: Build the mode-scoped promotion brief**

Run for daily-pulse when the five-day gate is candidate-ready:

```powershell
npx tsx scripts/build-grok-x-scout-promotion-brief.ts --mode daily_pulse
```

Run for Friday-deep when the Friday gate is candidate-ready:

```powershell
npx tsx scripts/build-grok-x-scout-promotion-brief.ts --mode friday_deep
```

Expected:

- The brief lists selected artifact paths and hashes.
- The brief lists accepted and rejected evidence counts.
- The brief lists proposed write-mode automation IDs.
- The brief names the dry-run collectors that must be disabled before write-mode registration.
- The brief does not register automation.
- The brief does not write Supabase rows.

- [ ] **Step 2: Make the approval decision explicit**

Kyle approval must be explicit and mode-scoped.

Expected approval shape:

```text
Kyle approves Track 54 daily_pulse promotion for the reviewed artifact window.
```

or:

```text
Kyle approves Track 54 friday_deep promotion for the reviewed Friday artifact.
```

Expected rejection shape:

```text
Hold promotion; continue no-write evidence collection.
```

## Phase 4: Prove One Manual Bounded Daily Write

**Purpose:** Run exactly one supervised write before scheduling write-mode automation.

**Files:**

- Existing writer: `scripts/run-daily-thesis-review.ts`
- Existing approval guard: `scripts/track54-write-gate.ts`
- Existing tests: `lib/__tests__/daily-thesis-updates.test.ts`, `lib/__tests__/daily-thesis-review-packet.test.ts`, `lib/__tests__/track54-write-gate.test.ts`, `lib/__tests__/track54-write-approval.test.ts`

- [ ] **Step 1: Run the exact command from the approved promotion brief**

Use only the command generated by the approved mode-scoped brief. The command must include:

```text
--write
--approval-phrase
--approval-review-from
--approval-review-to
```

Expected:

- The writer re-checks the same reviewed artifact window.
- It writes only bounded daily trajectory rows.
- It does not write `market_analysis`.
- It does not write `us_market_analysis`.
- It does not refresh `thesis_packet_cache` directly.
- It reports writes attempted, applied, skipped, and blockers.

- [ ] **Step 2: Verify the board still renders cleanly**

Run:

```powershell
npm run track54:readiness
```

Expected:

- Browser smoke passes for `/thesis`, `/thesis?audit=1`, and `/overview`.
- The daily overlay is visible only where a bounded trajectory row exists.
- X Pulse remains watch/evidence language, not advice.
- Retired Grok pipeline tombstone checks still pass.

## Phase 5: Register Write-Mode Automation

**Purpose:** Automate only after one manual write proves the exact lane.

**Files:**

- Codex automation manifests managed by the Codex app, not raw repo edits.
- Existing readiness audit: `scripts/build-track54-readiness-report.ts`
- Existing automation summary: `scripts/summarize-track54-automation-runs.ts`

- [ ] **Step 1: Disable the matching dry-run collector**

For daily-pulse promotion:

```text
Disable or pause grok-x-scout-artifact-week-review only after approval.
```

For Friday-deep promotion:

```text
Disable or pause grok-x-scout-friday-deep-artifact-review only after approval.
```

Expected:

- Price/cache refresh remains active.
- Auth preflight remains active.
- Health/recovery visibility remains active if still useful.
- The retired Grok writer remains tombstoned.

- [ ] **Step 2: Register only the approved write-mode automation**

Expected daily write-mode automation IDs:

```text
grok-x-scout-daily
daily-thesis-review
```

Expected Friday write-mode automation ID:

```text
grok-x-scout-friday-deep
```

Expected:

- The automation prompt includes Kyle approval language.
- The automation prompt includes the reviewed artifact window.
- The automation prompt includes the dry-run-disable prerequisite.
- The automation prompt does not call retired endpoints.
- The automation prompt does not let Grok author thesis rows.
- Any approved Grok scout write-mode command uses Cursor/Composer 2.5 via `grok-composer-2.5-fast`.

- [ ] **Step 3: Confirm automation safety after registration**

Run:

```powershell
npm run track54:automation-runs
npm run track54:readiness
```

Expected:

- Automation run summary shows the newly registered routine only after approval.
- Readiness does not report an unsafe pre-approval write routine.
- Any write-mode routine reports bounded scope and approval proof.

## Phase 6: Prove Friday Thesis-Of-Record Handoff

**Purpose:** Keep daily updates bounded and preserve Friday as the thesis-of-record writer.

**Files:**

- Existing bundle builder: `scripts/build-friday-x-signal-bundle.ts`
- Existing desk prompt docs: `docs/reference/grain-desk-swarm-prompt.md`, `docs/reference/us-desk-swarm-prompt.md`
- Existing tests: `lib/__tests__/friday-x-signal-bundle.test.ts`, `lib/__tests__/friday-desk-prompt-contract.test.ts`

- [ ] **Step 1: Build Friday X bundle after friday_deep gate is clean**

Run:

```powershell
npx tsx scripts/build-friday-x-signal-bundle.ts
```

Expected:

- Bundle includes only desk-ready accepted signals.
- Unverified X claims remain review leads.
- Bundle includes source tier, post URL, post date, affected grains, affected regions, allowed claims, blocked claims, and corroboration.

- [ ] **Step 2: Run Friday desk workflow under existing desk-swarm rules**

Expected:

- Canada desk writes Canada thesis-of-record rows.
- US desk writes US thesis-of-record rows.
- Grok does not author, rank, or publish thesis rows.
- Friday output refreshes the board through the existing thesis packet path.

## Phase 7: Close V1 And Prune Noise

**Purpose:** End the build loop cleanly instead of drifting into v2.

**Files:**

- Modify: `PROJECT_STATE.md`
- Modify: `docs/plans/STATUS.md`
- Modify if a non-obvious bug was fixed: `docs/lessons-learned/issues.md`

- [ ] **Step 1: Record the final verified v1 state**

Expected final status must include:

```text
latest clean readiness timestamp
daily_pulse artifact gate state
friday_deep artifact gate state
approved write-mode automation IDs
first manual write proof
browser smoke proof
retired Grok pipeline proof
remaining v2 backlog
```

- [ ] **Step 2: Move anything extra to v2**

Default v2 backlog:

```text
direct X API v2 deterministic ingestion
more granular X account tiering
automation-runs auth convenience field if still useful
full Vitest open-handle cleanup
additional public X Pulse UI refinements
```

Expected:

- V1 closes with working proof, not perfect tooling.
- Nice-to-have automation polish does not block the daily Bull/Bear loop.

## Stop Conditions

Stop and re-plan if any of these happen:

- Grok auth fails repeatedly after both CLI login and `XAI_API_KEY`.
- The X scout produces no decision-grade evidence for a full clean week.
- A write-mode command attempts to write outside bounded trajectory rows.
- `/thesis` starts implying X evidence is official-source fact.
- A new integration is proposed before Phase 5 is complete.
- Readiness can no longer distinguish no-write evidence from write-mode evidence.

## Recommended Execution

Use inline execution in this thread until Phase 4 is complete. This lane is operational and stateful; subagents are useful for code review, but not for clicking through credential/auth and promotion gates.

Do not resume by adding another telemetry field. Resume at the Phase 1 runner checks:

```powershell
npm run track54:grok-preflight
npm run track54:hermes-preflight
```

If original Grok still reports `credential_issue = expired_auth` or `missing_credential` but Hermes preflight is OK, keep collecting no-write artifacts through the scheduled primary collectors and their deterministic Hermes fallback. Refresh original Grok auth before write-mode approval, then run:

```powershell
npm run track54:recover-after-grok-login
```

Do not manually run a scout or a write command just because Hermes is available; use the scheduled no-write windows or the deterministic artifact-health command.
