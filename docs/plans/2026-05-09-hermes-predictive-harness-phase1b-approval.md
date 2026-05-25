# Canola Predictive Harness - Phase 1B Approval Brief

**Date:** 2026-05-09 MT
**Status:** Awaiting Kyle approval before implementation
**Parent review packet:** `docs/plans/2026-05-08-hermes-predictive-harness-results.md`
**Previous patch:** `a70ed68 feat: add forecast experiment sidecar harness`

---

## Decision Requested

Approve or revise **Patch Set 1B: deterministic snapshot builder only**.

Do not start DeepSeek calls, Hermes automation, live Supabase reads, sidecar writes, dashboard work, or production integration in Patch Set 1B.

---

## Recommended Decision

**Approve Patch Set 1B after review.**

Why: the model must never see a loose pile of current database rows. It needs a frozen, timestamped, hashable packet that proves what information was available at forecast time. Patch Set 1B builds that packet compiler locally before any model or database adapter is added.

---

## Patch Set 1B Scope

### Create

- `lib/forecast-experiments/snapshot.ts`
  - Pure snapshot compiler for `canola-forecast-snapshot-v1`.
  - Accepts source records as inputs; does **not** fetch from Supabase.
  - Requires:
    - `grain = "Canola"`,
    - `crop_year`,
    - `grain_week`,
    - `as_of_date`,
    - exact `source_cutoff_at`,
    - `snapshot_mode`,
    - source record timestamps,
    - source record freshness metadata.
  - Produces:
    - canonical snapshot JSON,
    - deterministic `snapshot_hash`,
    - source clock summary,
    - leakage warnings,
    - revision-taint flags.
  - Rejects or flags records after `source_cutoff_at`.
  - Sorts canonical arrays before hashing.
  - Uses stable object-key serialization before hashing.
  - Blocks forecast/score outputs from becoming forecast inputs.
  - No model calls.
  - No Supabase calls.
  - No production table imports.

- `scripts/build-canola-forecast-snapshot.ts`
  - CLI wrapper around the pure compiler.
  - Supports:
    - `--help`,
    - `--input <path>`,
    - `--output <path>`,
    - `--crop-year <YYYY-YYYY>`,
    - `--grain-week <1-53>`,
    - `--as-of <YYYY-MM-DD>`,
    - `--source-cutoff-at <ISO timestamp>`,
    - `--snapshot-mode <strict_artifact_mode|current_table_replay_mode>`,
    - `--dry-run`.
  - JSON to stdout when no output path is supplied.
  - Diagnostics to stderr.
  - Idempotent: same inputs produce the same hash.
  - Local files only in this patch set.
  - No Supabase client imports.
  - No production environment variable reads.

- `lib/__tests__/forecast-experiments-snapshot.test.ts`
  - Unit tests for compiler behavior.

### Modify

- `package.json`
  - Add one narrow script, for example:
    - `forecast:canola:snapshot`
  - Avoid broader script churn.

### Do Not Create Yet

- Supabase read adapter.
- DeepSeek forecast runner.
- Hermes scheduler.
- Score writer.
- Dashboard reads.
- `forecast_signal_rules`.

---

## Snapshot Contract

### Snapshot Mode

Allowed values:

- `strict_artifact_mode`
  - Only immutable source artifacts or rows with trustworthy point-in-time availability.
  - Required for any future public skill claim.

- `current_table_replay_mode`
  - Uses current historical source tables or exported rows.
  - Must set `revision_taint_status = "revision_tainted"`.
  - Allowed only for harness plumbing and local development.

### Minimum Snapshot Shape

```json
{
  "schema_version": "canola-forecast-snapshot-v1",
  "grain": "Canola",
  "crop_year": "2026-2027",
  "grain_week": 1,
  "as_of_date": "2026-08-07",
  "source_cutoff_at": "2026-08-07T14:30:00-06:00",
  "snapshot_mode": "strict_artifact_mode",
  "revision_taint_status": "untainted",
  "source_clocks": [
    {
      "source_key": "cgc_weekly",
      "observed_period": "CGC Week 1",
      "published_at": "2026-08-06T13:00:00-06:00",
      "available_at": "2026-08-06T13:05:00-06:00",
      "freshness_hours": 25.42
    }
  ],
  "records": [
    {
      "source_key": "cgc_weekly",
      "record_type": "fact",
      "available_at": "2026-08-06T13:05:00-06:00",
      "payload": {
        "metric": "producer_deliveries",
        "value": 123.4,
        "unit": "Ktonnes"
      }
    }
  ],
  "warnings": [],
  "blocked_sources": [],
  "snapshot_hash": "sha256:..."
}
```

### Source Record Requirements

Every source record must include:

- `source_key`
- `record_type`
- `observed_period`
- `published_at`
- `available_at`
- `payload`

Allowed `record_type` values:

- `fact`
- `interpretation`
- `proxy`
- `speculation`
- `warning`

Blocked source keys for forecast input:

- `prediction_scorecard`
- `forecast_experiment_scores`
- `forecast_experiment_predictions`
- `market_analysis_after_cutoff`
- `score_trajectory_after_cutoff`

These are not forbidden forever. They are forbidden as Week N forecast inputs because they can leak later scoring or later thesis work.

### Canonical Hash Rules

The snapshot hash must be reproducible across machines and input ordering.

Required rules:

- Sort `records` before hashing by:
  - `available_at` ascending,
  - `source_key` ascending,
  - `record_type` ascending,
  - stable payload hash ascending.
- Sort `source_clocks` before hashing by:
  - `available_at` ascending,
  - `source_key` ascending,
  - `observed_period` ascending.
- Serialize objects with stable recursive key ordering.
- Exclude runtime-only fields such as wall-clock `created_at`, temp file path, process ID, or current repo dirty status from `snapshot_hash`.
- Prefix hashes with `sha256:`.

Normal `JSON.stringify` is not enough unless the compiler first recursively sorts object keys.

### Payload Boundary

Patch Set 1B treats each source `payload` as opaque JSON. That means the compiler can verify the record-level clock but cannot prove a nested payload does not contain future rows.

Concrete boundary:

- 1B compiler responsibility: reject records whose declared `available_at` is after `source_cutoff_at`.
- 1C adapter responsibility: trim any nested payload rows to the cutoff before the compiler receives them.
- Public skill claims are not allowed from snapshots until the future 1C adapter proves payload-level cutoff filtering.

### Cutoff Sanity Rule

`source_cutoff_at` must align with `as_of_date`.

Patch Set 1B should reject snapshots where the cutoff calendar date is not the same as `as_of_date`, unless an explicit future patch adds a named end-of-day rollover policy. This prevents a bad input such as `as_of_date = 2026-08-07` with `source_cutoff_at = 2027-08-07T14:30:00-06:00`.

### Strict Mode Warning

In Patch Set 1B, the compiler trusts the caller's `snapshot_mode` because inputs are local files. That is acceptable for contract plumbing only.

Before any public claim:

- `strict_artifact_mode` must require origin artifact hashes or equivalent proof of immutability.
- mutable database exports must remain `current_table_replay_mode`.
- `current_table_replay_mode` must stay `revision_tainted`.

---

## Non-Negotiable Guardrails

- No production writes.
- No live Supabase reads in Patch Set 1B.
- No dashboard reads.
- No model/API calls.
- No DeepSeek key handling.
- No Hermes scheduler changes.
- No farmer/operator/private chat data.
- No historical skill claims.
- No generic Canola price series.
- No source record without `available_at`.
- No forecast prompt can include records after `source_cutoff_at`.
- No snapshot hash can depend on property order or runtime timestamps.
- `current_table_replay_mode` must be visibly revision-tainted.
- CLI must not import Supabase clients or production environment helpers.
- CLI must not read `SUPABASE_*`, `DEEPSEEK_*`, `OPENAI_*`, or Hermes runtime variables.
- `strict_artifact_mode` is a local assertion in 1B, not a public-proof claim.

---

## Acceptance Checks

Patch Set 1B is done only when:

- `git diff --name-only` contains only the approved files.
- Snapshot compiler is pure and has no Supabase/model/Hermes imports.
- Snapshot CLI has no Supabase/model/Hermes imports.
- Snapshot CLI does not read production environment variables.
- CLI supports `--help`.
- CLI emits machine-readable JSON to stdout.
- CLI diagnostics go to stderr.
- Tests prove input array order does not change `snapshot_hash`.
- Tests prove object property order does not change `snapshot_hash`.
- Tests prove identical inputs produce identical `snapshot_hash`.
- Tests prove a future-dated source record is rejected or blocked.
- Tests prove mismatched `as_of_date` and `source_cutoff_at` are rejected.
- Tests prove `current_table_replay_mode` sets `revision_taint_status = "revision_tainted"`.
- Tests prove blocked forecast/score source keys cannot enter the forecast snapshot.
- Tests prove missing `available_at` fails validation.
- Tests prove source clock freshness is deterministic.
- `npm run test:forecast` still passes.
- New focused snapshot test command passes.
- `npm run build` passes.

---

## Explicit Stop Point

After Patch Set 1B:

1. Stop.
2. Show changed files.
3. Report tests.
4. Ask whether to proceed to Patch Set 1C.

Patch Set 1C would be the read adapter that builds source records from approved Bushel Board data sources. It is not included here.

---

## Gemini Review Applied

Gemini CLI `gemini-3.1-pro-preview` reviewed this brief on 2026-05-09. Material findings incorporated:

- Deterministic hashes require array sorting and stable object-key serialization.
- Top-level `available_at` checks do not prove nested payloads are trimmed; 1C must own payload-level cutoff filtering.
- `source_cutoff_at` needs a sanity relationship to `as_of_date`.
- CLI isolation must be explicit, not just compiler isolation.
- `strict_artifact_mode` cannot become a public claim until source immutability is proven.

---

## Kyle Approval Phrase

To proceed, Kyle can say:

```text
Approve Patch Set 1B.
```

Anything else should be treated as review feedback or revision, not implementation approval.
