# Canola Predictive Harness - Phase 1C Approval Brief

**Date:** 2026-05-09 MT
**Status:** Awaiting Kyle approval before implementation
**Parent review packet:** `docs/plans/2026-05-08-hermes-predictive-harness-results.md`
**Previous patches:**

- `a70ed68 feat: add forecast experiment sidecar harness`
- `bbce003 feat: add canola forecast snapshot builder`

---

## Decision Requested

Approve or revise **Patch Set 1C: read adapter for approved source records only**.

Do not start DeepSeek calls, Hermes automation, sidecar writes, dashboard work, scoring persistence, live migration application, or production integration in Patch Set 1C.

---

## Recommended Decision

**Approve Patch Set 1C after review, but keep it read-only and dry-run first.**

Why: Phase 1B can compile a safe snapshot from local records, but the harness still needs a controlled adapter that turns Bushel Board source data into those records. The adapter is the highest leakage-risk step so far because it touches live source truth and source timing. It should be built as a narrow read-only extractor with hard clock checks before any model sees a packet.

---

## Patch Set 1C Scope

### Create

- `lib/forecast-experiments/source-records.ts`
  - Pure helpers that convert approved source rows into `SnapshotSourceRecord` objects.
  - No Supabase client.
  - No model calls.
  - No writes.
  - Must require `available_at`, `published_at`, `observed_period`, `source_key`, `record_type`, and payload.
  - Must reject records missing timing fields before they reach the snapshot compiler.
  - Must explicitly tag records as `fact`, `interpretation`, `proxy`, `speculation`, or `warning`.

- `lib/forecast-experiments/read-adapter.ts`
  - Read-only adapter interface for approved source families.
  - May import server-only Supabase helpers only if implementation is approved.
  - Must use a read-only connection boundary if available; do not use a write-capable service-role client unless Kyle explicitly approves the risk.
  - Must not be imported by client components or dashboard code.
  - Must not import `market_analysis`, `prediction_scorecard`, `score_trajectory`, or experiment score helpers as forecast inputs.
  - Must only return source records, not write snapshots or predictions.

- `scripts/build-canola-forecast-source-records.ts`
  - CLI that exports source records to local JSON for the existing 1B snapshot CLI.
  - Supports:
    - `--help`,
    - `--crop-year <YYYY-YYYY>`,
    - `--grain-week <1-53>`,
    - `--as-of <YYYY-MM-DD>`,
    - `--source-cutoff-at <ISO timestamp>`,
    - `--output <path>`,
    - `--dry-run`.
  - JSON to stdout when no output path is supplied.
  - Diagnostics to stderr.
  - Must be read-only.
  - Must not write sidecar experiment tables.

- `lib/__tests__/forecast-experiments-source-records.test.ts`
  - Unit tests for conversion/validation behavior.

- `lib/__tests__/forecast-experiments-read-adapter.test.ts`
  - Tests must mock the read boundary without touching live Supabase.
  - Tests must prove blocked forecast/score/prose source families cannot be returned.

### Modify

- `package.json`
  - Add narrow scripts only, for example:
    - `forecast:canola:source-records`
    - `test:forecast:source-records`
  - Do not change collector scripts or dashboard scripts.

### Do Not Create Yet

- DeepSeek runner.
- Hermes scheduler.
- Sidecar insert/upsert writer.
- Score persistence.
- Production dashboard reads.
- `forecast_signal_rules`.
- Live migration application.

---

## Approved Source Families For 1C

Patch Set 1C should start with the smallest useful Canola source set:

1. `canola_market_read`
  - Source: deterministic local Canola read shape, not LLM prose.
  - Record types: `fact`, `interpretation`, `warning`.
  - Use only fields with source freshness already present in the packet.
  - Must natively accept and enforce `source_cutoff_at` through every internal query before it can be used.
  - If it only reflects current database state, it is not approved for 1C except as `current_table_replay_mode` evidence with a revision warning.

2. `cgc_weekly`
   - Source: CGC weekly data already admitted by Bushel Board source rules.
   - Record types: `fact`, `interpretation`, `warning`.
  - Must preserve CGC week, week ending date, import/source availability, unit, worksheet, metric, grain, region, and grade where available.
  - Must not use week ending date as availability.
  - `available_at` must come from ingestion/source-run time or physical public publish time.

3. `grain_prices`
   - Source: price observations only up to `source_cutoff_at`.
   - Record types: `fact`, `warning`.
  - Must not provide outcome-window prices after the forecast cutoff.
  - Must carry contract code or explicit warning if contract mapping is not yet trustworthy.
  - Must normalize all comparison timestamps to UTC before boundary checks.
  - Must account for market close timing before admitting same-day settlement records.

4. `source_runs`
   - Source: source freshness and import clock metadata.
   - Record types: `warning`, `fact`.
   - Must not become a proxy for later data content.

Anything else requires a new explicit source-family addition.

---

## Forbidden Forecast Inputs

The read adapter must not return source records from:

- `prediction_scorecard`
- `forecast_experiment_scores`
- `forecast_experiment_predictions`
- `market_analysis` rows created after cutoff
- `score_trajectory` rows created after cutoff
- `grain_intelligence`
- `farm_summaries`
- `posted_prices`
- `crop_plans`
- `chat_extractions`
- `knowledge_state`
- private farmer/operator/chat data
- dashboard components or route output

Production tables may be read only when explicitly approved as source truth and only with cutoff-bound queries.

---

## Timing Contract

Every returned source record must include:

- `published_at`
- `available_at`
- `observed_period`
- `source_key`
- `record_type`
- `payload`

Clock rules:

- `available_at <= source_cutoff_at`
- `published_at <= source_cutoff_at`
- if a mutable source row has `updated_at`, then `updated_at <= source_cutoff_at`
- if a mutable source row has `imported_at` or `created_at`, then that ingestion timestamp must be `<= source_cutoff_at`
- `source_cutoff_at` calendar date must match `as_of_date`
- no query may include rows created/imported after `source_cutoff_at`
- records without trustworthy `available_at` must become warnings or be rejected
- `observed_period` or week-ending date must never be used as a proxy for `available_at`
- all adapter boundary comparisons must normalize timestamps to UTC before comparing

If a source table updates historical rows in place and cannot prove `updated_at <= source_cutoff_at`, the adapter must exclude the row or emit a severe warning record. It must not silently include the corrected row in a historical replay.

If a source table cannot prove point-in-time availability, it must be exported only under `current_table_replay_mode` and marked revision-tainted downstream.

### Mutable Source Rule

Mutable source tables are the main 1C leakage risk.

For any table that can revise rows after initial import:

- require `available_at`,
- require an ingestion clock such as `created_at`, `imported_at`, or source-run timestamp,
- require `updated_at <= source_cutoff_at` when `updated_at` exists,
- reject rows where the update/import clock is after cutoff,
- emit a `revision_risk` warning when the table cannot prove point-in-time state.

No public skill claim may use snapshots built from source records with unresolved `revision_risk` warnings.

### Timezone Rule

The adapter must parse all input clocks as offset-aware instants and compare in UTC. String comparison is forbidden for boundary decisions.

For price sources:

- same-day settlement is only valid if the forecast was produced after market close,
- otherwise the start/price-context record must use the last settlement available before the forecast timestamp,
- any source clock without an explicit timezone offset is rejected.

### Read-Only Connection Rule

Patch Set 1C should prefer a read-only database role or credential. If the repo does not have one yet, implementation must either:

- stop and request a read-only credential/role, or
- keep 1C in local-export mode and require a manually provided source-record JSON file.

Do not quietly use a write-capable service-role client for convenience.

---

## Non-Negotiable Guardrails

- No production writes.
- No sidecar writes.
- No live migration application.
- No model/API calls.
- No DeepSeek key handling.
- No Hermes scheduler changes.
- No dashboard reads.
- No client component imports.
- No private farmer/operator/chat data.
- No historical skill claims.
- No generic Canola price series without contract warning.
- No source record without `available_at`.
- No records after `source_cutoff_at`.
- No mutable-row updates after `source_cutoff_at`.
- No week-ending date as availability proxy.
- No source clock without timezone offset.
- No write-capable Supabase client unless separately approved.
- No current-state helper output unless it enforces `source_cutoff_at`.
- No experiment score or prediction rows as forecast inputs.
- No production thesis prose as an unlabelled fact source.

---

## Acceptance Checks

Patch Set 1C is done only when:

- `git diff --name-only` contains only approved 1C files.
- Source-record pure helpers have no Supabase/model/Hermes imports.
- Read adapter is server-only and cannot be imported by client components.
- CLI supports `--help`.
- CLI emits machine-readable JSON to stdout.
- CLI diagnostics go to stderr.
- Tests prove missing `available_at` is rejected.
- Tests prove future `available_at` and future `published_at` records are rejected or blocked.
- Tests prove forbidden forecast inputs are blocked.
- Tests prove grain price records after cutoff cannot be emitted.
- Tests prove mutable rows with `updated_at > source_cutoff_at` are rejected or warned as revision risk.
- Tests prove observed period / week-ending date cannot substitute for `available_at`.
- Tests prove timezone-less clocks are rejected.
- Tests prove untrusted contract mapping creates a warning instead of a clean price fact.
- Tests prove current-state helpers without cutoff support cannot be used as strict sources.
- Tests prove adapter output can be passed into `buildCanolaForecastSnapshot`.
- Static scan proves no write-capable Supabase service-role helper is used unless explicitly approved.
- Static scan proves no model calls, no Hermes imports, no dashboard imports, and no sidecar writes.
- `npm run test:forecast` still passes.
- New focused source-record test command passes.
- `npm run build` passes.
- Gemini review finds no blockers or blockers are patched before commit.

---

## Explicit Stop Point

After Patch Set 1C:

1. Stop.
2. Show changed files.
3. Report tests.
4. Ask whether to proceed to Patch Set 1D.

Patch Set 1D would be sidecar persistence for runs/snapshots/predictions or a model-runner approval brief, depending on what 1C proves. It is not included here.

---

## Gemini Review Applied

Gemini CLI `gemini-3.1-pro-preview` reviewed this brief on 2026-05-09. Material findings incorporated:

- Mutable tables can leak future corrections unless `updated_at`, `imported_at`, or source-run clocks are cutoff-bound.
- `observed_period` and week-ending dates must never be treated as availability.
- Adapter boundary checks must normalize offset-aware timestamps to UTC.
- Read-only claims are weak if the adapter quietly uses a write-capable service-role client.
- `canola_market_read` cannot be used as a strict source unless it accepts and enforces `source_cutoff_at` internally.

---

## Kyle Approval Phrase

To proceed, Kyle can say:

```text
Approve Patch Set 1C.
```

Anything else should be treated as review feedback or revision, not implementation approval.
