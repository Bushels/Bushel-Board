# Pipeline Runs Control Table Design

**Date:** 2026-03-14  
**Status:** Proposed  
**Scope:** Weekly CGC intelligence pipeline only (`/api/cron/import-cgc` -> `validate-import` -> `search-x-intelligence` -> `analyze-market-data` -> `generate-intelligence` -> `generate-farm-summary` -> `validate-site-health`)

## Direct Recommendation

Add one new table: `pipeline_runs`.

Use it as the **control plane** for the weekly pipeline. A control plane is the part that tracks what should run, what already ran, and what state the system is in. Do **not** replace `cgc_imports`, `validation_reports`, or `health_checks`; those should remain stage-specific evidence tables.

This is the simplest design that gives you:

- one row per weekly run
- explicit stage ownership
- safe retries
- clean monitoring
- a future TLA+ target that matches the real database model

## Why One Table Is Enough

Your current pipeline already writes good evidence:

- `cgc_imports` proves the import happened
- `validation_reports` proves validation passed or failed
- `health_checks` proves the end-state quality

What is missing is one canonical row that answers:

- What week is currently running?
- What stage is it in?
- Is it active, failed, or complete?
- Is there more batch work remaining?
- What is the latest error?

That is what `pipeline_runs` should do.

## Table Shape

```sql
create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),

  run_key text not null unique,
  crop_year text not null,
  grain_week integer not null,

  trigger_source text not null
    check (trigger_source in ('vercel-cron', 'manual', 'recovery')),

  state text not null
    check (state in (
      'importing_cgc',
      'import_failed',
      'validating_import',
      'validation_failed',
      'searching_x_deep',
      'analyzing_market_data',
      'generating_intelligence',
      'generating_farm_summaries',
      'validating_site_health',
      'complete',
      'complete_with_warnings'
    )),

  status text not null
    check (status in ('running', 'blocked', 'failed', 'completed')),

  current_stage text not null
    check (current_stage in (
      'import-cgc',
      'validate-import',
      'search-x-intelligence',
      'analyze-market-data',
      'generate-intelligence',
      'generate-farm-summary',
      'validate-site-health'
    )),

  stage_attempt integer not null default 1,

  grain_cursor integer not null default 0,
  grain_total integer not null default 16,
  user_cursor integer not null default 0,
  user_total integer not null default 0,

  chain_triggered boolean not null default false,
  last_request_id bigint,

  last_error text,
  last_error_stage text
    check (
      last_error_stage is null or
      last_error_stage in (
        'import-cgc',
        'validate-import',
        'search-x-intelligence',
        'analyze-market-data',
        'generate-intelligence',
        'generate-farm-summary',
        'validate-site-health'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_pipeline_runs_status_updated
  on public.pipeline_runs (status, updated_at desc);

create index idx_pipeline_runs_week
  on public.pipeline_runs (crop_year, grain_week desc);
```

## Column Meanings

- `run_key`
  - Format: `2025-2026:30`
  - This is the human-readable unique identity for one weekly run.

- `state`
  - The high-level state machine label.
  - This is what you look at first in logs and dashboards.

- `status`
  - Simple operational status:
    - `running`: actively progressing
    - `blocked`: intentionally stopped by a gate like failed validation
    - `failed`: a stage crashed or returned an unrecoverable error
    - `completed`: terminal success state

- `current_stage`
  - The exact pipeline step that owns the row right now.
  - This is useful because `state` is human-facing and `current_stage` maps directly to code.

- `stage_attempt`
  - Count retries of the current stage.
  - Prevents blind infinite-loop retries.

- `grain_cursor`, `grain_total`
  - Progress counters for grain-batched stages.
  - `grain_cursor = 5` means five grains have been fully processed for the current stage.

- `user_cursor`, `user_total`
  - Progress counters for farm summary batching.

- `chain_triggered`
  - True when the current stage successfully handed work to the next stage.
  - This matters because "stage work finished" and "next stage was queued" are different facts.

- `last_request_id`
  - Optional `pg_net` request ID returned by `enqueue_internal_function()`.
  - Useful for tracing handoffs in `net._http_response`.

- `metadata`
  - Small JSON context only.
  - Example:
    - validation summary
    - batch size used
    - pulse/deep mode if ever extended later
  - Do not turn this into a dumping ground for full logs.

## State and Status Mapping

Recommended mapping:

| `state` | `status` | Meaning |
|---|---|---|
| `importing_cgc` | `running` | Current CGC week is being fetched and upserted |
| `import_failed` | `failed` | Import failed hard |
| `validating_import` | `running` | Post-import checks are in progress |
| `validation_failed` | `blocked` | Validation failed, downstream chain must stop |
| `searching_x_deep` | `running` | Deep X scan batches are in progress |
| `analyzing_market_data` | `running` | Per-grain analysis batches are in progress |
| `generating_intelligence` | `running` | Per-grain intelligence batches are in progress |
| `generating_farm_summaries` | `running` | Per-user summary batches are in progress |
| `validating_site_health` | `running` | Final health validation is in progress |
| `complete` | `completed` | Pipeline completed and health checks passed |
| `complete_with_warnings` | `completed` | Pipeline completed but final health reported `warn` or `fail` |

## Legal Transition Rules

Only allow these moves:

```text
importing_cgc
-> validating_import
-> searching_x_deep
-> analyzing_market_data
-> generating_intelligence
-> generating_farm_summaries
-> validating_site_health
-> complete | complete_with_warnings
```

Failure branches:

```text
importing_cgc -> import_failed
validating_import -> validation_failed

searching_x_deep -> searching_x_deep
searching_x_deep -> analyzing_market_data

analyzing_market_data -> analyzing_market_data
analyzing_market_data -> generating_intelligence

generating_intelligence -> generating_intelligence
generating_intelligence -> generating_farm_summaries

generating_farm_summaries -> generating_farm_summaries
generating_farm_summaries -> validating_site_health
```

Rules in plain English:

- A stage can advance only when its own work is complete.
- Batch stages stay in the same state while work remains.
- `validation_failed` is a hard gate. Nothing downstream may run.
- `complete_with_warnings` is still terminal. It means the chain finished, but health was not clean.

## Core Invariants

These are the rules that should always stay true.

1. One active row per week.
   - For a given `run_key`, there may be many historical rows only if you decide to version runs later.
   - For now, simpler is better: one row per `run_key`.

2. One owner stage at a time.
   - Exactly one `current_stage` owns the run row at any moment.

3. No downstream stage before upstream completion.
   - Example: `generate-intelligence` cannot start unless `analyzing_market_data` has fully exhausted its grain batches.

4. Validation failure blocks the chain.
   - If `state = validation_failed`, then `status` must be `blocked`.

5. Completed runs are immutable except for notes.
   - Once `status = completed`, do not restart the same row.
   - Create a new recovery run instead if you ever need that later.

6. Cursor values must be monotonic.
   - `grain_cursor` and `user_cursor` can move forward, never backward, for a given run row.

## How Each Stage Should Update the Row

### 1. `/api/cron/import-cgc`

On start:

- create row if missing
- set:
  - `state = importing_cgc`
  - `status = running`
  - `current_stage = import-cgc`
  - `chain_triggered = false`
  - clear `last_error`

On success:

- keep same row
- set:
  - `state = validating_import`
  - `current_stage = validate-import`
  - `chain_triggered = true`
  - `last_request_id = <optional pg_net id if queued that way later>`

On failure:

- set:
  - `state = import_failed`
  - `status = failed`
  - `last_error`
  - `last_error_stage = import-cgc`

### 2. `validate-import`

On start:

- assert current row is in `validating_import`

On pass:

- set:
  - `state = searching_x_deep`
  - `status = running`
  - `current_stage = search-x-intelligence`
  - `chain_triggered = true`
  - `metadata.validation_status = 'pass'`

On fail:

- set:
  - `state = validation_failed`
  - `status = blocked`
  - `chain_triggered = false`
  - `metadata.validation_status = 'fail'`
  - `last_error = 'validation failed'`
  - `last_error_stage = validate-import`

### 3. `search-x-intelligence`

On each batch:

- assert current row is `searching_x_deep`
- increment `grain_cursor` by number of finished grains
- if more grains remain:
  - keep same state
  - set `chain_triggered = true` after queueing next batch
- if no grains remain:
  - set:
    - `state = analyzing_market_data`
    - `current_stage = analyze-market-data`
    - reset `grain_cursor = 0`
    - `chain_triggered = true`

### 4. `analyze-market-data`

Same pattern as X search:

- advance `grain_cursor`
- self-loop while grains remain
- move to `generating_intelligence` when done

### 5. `generate-intelligence`

Same grain-batch pattern:

- advance `grain_cursor`
- self-loop while grains remain
- move to `generating_farm_summaries` when done
- set `user_total` before the first farm-summary batch if known

### 6. `generate-farm-summary`

On each batch:

- assert current row is `generating_farm_summaries`
- increment `user_cursor`
- self-loop while users remain
- when final batch finishes:
  - set:
    - `state = validating_site_health`
    - `current_stage = validate-site-health`
    - `chain_triggered = true`

### 7. `validate-site-health`

On success:

- if health status is `pass`:
  - set:
    - `state = complete`
    - `status = completed`
    - `completed_at = now()`

- if health status is `warn` or `fail`:
  - set:
    - `state = complete_with_warnings`
    - `status = completed`
    - `completed_at = now()`
    - `metadata.health_status = 'warn' | 'fail'`

## SQL Guardrails

Use these constraints from day one:

- `unique (run_key)`
- `check` constraints for `state`, `status`, `current_stage`
- a trigger that auto-updates `updated_at`

Useful next-step guardrail:

- a small `advance_pipeline_run(...)` Postgres function that validates legal transitions before writing them

That is better than letting each function hand-edit the row however it wants.

## Recommended Minimal API

If you implement this, keep the write path tiny.

Recommended RPC helpers:

```sql
create function public.start_pipeline_run(...)
create function public.advance_pipeline_run(...)
create function public.fail_pipeline_run(...)
create function public.complete_pipeline_run(...)
```

Why:

- Edge Functions stay simpler
- legal transitions live in one place
- retries become safer
- this is a much better future base for TLA+ modeling

## What Not To Do

- Do not mix the daily `scan-signals` pulse cron into this table yet.
- Do not store giant logs in `metadata`.
- Do not use `status` alone without `state`; it is too vague.
- Do not restart a completed row in place.

## Best First Implementation Sequence

1. Add `pipeline_runs` table.
2. Create one row at the start of `/api/cron/import-cgc`.
3. Update only import and validation first.
4. Once that is stable, wire in the three grain-batch stages.
5. Last, wire in `generate-farm-summary` and `validate-site-health`.

This reduces risk because the hardest part is not the schema. It is getting the stage ownership rules right.

## Practical Outcome

For Bushel Board, this gives you one dashboard question with one answer:

> "For week 30, where is the pipeline right now, and is it healthy?"

Today that answer is spread across multiple tables and logs. With `pipeline_runs`, it becomes a single row.
