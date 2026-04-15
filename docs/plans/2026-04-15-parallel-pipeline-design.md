# Parallel Pipeline + Overview Explainer — Design Doc

**Date:** 2026-04-15
**Status:** Approved
**Author:** Kyle + Claude (pipeline audit + brainstorming)
**Track:** 40 — Parallel Pipeline Orchestrator
**Replaces:** Serial fire-and-forget chain (analyze-grain-market self-chaining via pg_net)

---

## Problem

The intelligence pipeline processes 16 grains serially — one Grok call at a time, each chaining to the next via pg_net fire-and-forget. Full run takes ~15-20 minutes, has 16 points of failure with no observability, and silent chain breaks mean the pipeline can stop mid-run with no alarm. The entry point (`/api/cron/import-cgc`) is disabled and returns a pause message.

The Overview page shows stance scores with no context — farmers see "+25 Bullish" for Canola but no indication of why. Paid customers need at least a one-line explainer.

## Solution

1. **Parallel orchestrator:** A single API route fires all 16 grain analyses simultaneously, polls for completion, then triggers farm summaries and health checks. Wall time drops from ~15 minutes to ~90 seconds.

2. **Pipeline observability:** A `pipeline_runs` table tracks every run — which grains were requested, which completed, which failed, how long it took.

3. **Overview explainer:** Each grain on the stance chart gets a one-line thesis summary + an "Analyzed by 16 Agriculture Trained AI Agents" badge.

4. **Manual trigger for alpha:** Pipeline runs are triggered manually from Claude Code sessions. Automation (cron or multi-agent desk) comes later.

---

## 1. Architecture

### Current (serial)
```
grain1 → grain2 → grain3 → ... → grain16 → farm-summaries → health-check
  each step queues the next via pg_net (fire-and-forget)
  ~15-20 minutes, 16 failure points, zero observability
```

### Proposed (parallel)
```
/api/pipeline/run (Vercel serverless, up to 300s)
  ├── 1. Import CGC CSV                     (~8s)
  ├── 2. Validate import                    (~3s)
  ├── 3. Fire 16 analyze-grain-market       (all parallel via pg_net)
  │     ├── Wheat ──→ writes result ──→ updates pipeline_runs
  │     ├── Canola ──→ writes result ──→ updates pipeline_runs
  │     ├── ... (14 more, all concurrent)
  │     └── each ~30-60s, running simultaneously
  ├── 4. Poll pipeline_runs until all 16 report back (~60s wall)
  ├── 5. Fire generate-farm-summary          (self-chaining, existing)
  ├── 6. Poll until summaries complete       (~30s)
  └── 7. Fire validate-site-health           (terminal, ~3s)

Total wall time: ~90 seconds
```

### Key change in analyze-grain-market

The Edge Function becomes a **pure function** — no more chaining:
- Remove: self-chaining to next grain (lines 590-604)
- Remove: trigger to generate-farm-summary
- Add: accept `run_id` in request body
- Add: update `pipeline_runs.grains_completed` on success, `grains_failed` on error
- Keep: everything else identical (same Grok call, same data loading, same Viking knowledge)

---

## 2. Data Model

### `pipeline_runs` table (new)

```sql
CREATE TABLE pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','failed')),
  grains_requested text[] NOT NULL,
  grains_completed text[] NOT NULL DEFAULT '{}',
  grains_failed text[] NOT NULL DEFAULT '{}',
  failure_details jsonb DEFAULT '{}',
  farm_summaries_completed int DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','cron','retry'))
);
```

Each grain Edge Function receives `run_id` and atomically appends to `grains_completed` or `grains_failed` via RPC:

```sql
CREATE FUNCTION update_pipeline_grain_status(
  p_run_id uuid,
  p_grain text,
  p_status text,  -- 'completed' or 'failed'
  p_error text DEFAULT NULL
) ...
```

---

## 3. Orchestrator API Route

### `POST /api/pipeline/run`

Parameters (all optional):
- `grains`: string[] — subset of grains to analyze (default: all 16)
- `skip_import`: boolean — skip CGC import if data is already current
- `crop_year`: string — override (default: auto-detect)

Response (streamed as JSON when complete):
```json
{
  "run_id": "abc-123",
  "status": "completed",
  "crop_year": "2025-2026",
  "grain_week": 35,
  "grains_completed": 16,
  "grains_failed": 0,
  "farm_summaries": 6,
  "duration_ms": 94200
}
```

### Polling logic

The orchestrator polls `pipeline_runs` every 5 seconds:
```sql
SELECT
  array_length(grains_completed, 1) as done,
  array_length(grains_failed, 1) as failed,
  array_length(grains_requested, 1) as total
FROM pipeline_runs WHERE id = $run_id;
```

When `done + failed = total`, polling stops. If `failed > 0`, status is `partial`.

### Timeout

If any grain hasn't reported back in 120 seconds, the orchestrator marks it as timed out in `grains_failed` and proceeds.

---

## 4. Overview Enhancement

### Stance explainer (one line per grain)

Each grain on the Market Stance chart gets the `thesis_title` from `market_analysis` displayed below the bar:

```
CANOLA     ████████░░  +25 Bullish
Crush margins strong, terminal exports up 22% YoY.

WHEAT      ░░░░░░░░░░    0 Neutral
Export pace on target, US HRW competition intensifying.

OATS       ░░░░████▓▓  -35 Bearish
Deliveries 40% above 5yr avg, domestic demand soft.
```

### "Analyzed by" badge

Below the chart title:
```
Grain Market Stance · Analyzed by 16 Agriculture Trained AI Agents · Week 35
```

No model names. No architecture details. Establishes credibility for paid customers.

### Data source

`thesis_title` already exists in `market_analysis` — generated by Grok, stored per grain per week. The Overview page query just needs to include it alongside the stance score. No new database columns required.

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| 1 grain Grok timeout | Marked failed, 15 others complete. Status: `partial`. |
| pg_net fails to queue a grain | Orchestrator detects missing grain after 120s, marks timed out. |
| All grains fail | Status: `failed`. Farm summaries not triggered. |
| Farm summary batch fails | Logged, remaining batches continue. Health check still runs. |
| Retry failed grains | `POST /api/pipeline/run?grains=Mustard,Triticale` — only those re-analyzed. |

---

## 6. What Changes vs What Stays

| Component | Change |
|-----------|--------|
| `analyze-grain-market` Edge Function | Remove self-chaining + farm-summary trigger. Add `run_id`, report completion to `pipeline_runs`. |
| `generate-farm-summary` Edge Function | No changes — self-chains in batches of 5 |
| `validate-site-health` Edge Function | No changes |
| `/api/cron/import-cgc` | Keep as-is (paused). New route handles orchestration. |
| **New:** `/api/pipeline/run` | Parallel orchestrator |
| **New:** `pipeline_runs` table | Run tracking + observability |
| **New:** `update_pipeline_grain_status` RPC | Atomic grain completion updates |
| Overview page (`app/(dashboard)/overview/`) | Add thesis explainer per grain + "Analyzed by" badge |
| `lib/queries/market-stance.ts` | Include `thesis_title` in query |

---

## 7. Deferred

| Feature | Why defer |
|---------|-----------|
| Multi-agent desk (Haiku/Sonnet/Opus tiers) | Phase 2 — needs Anthropic API. Parallel orchestrator is the foundation. |
| Grok debate round after agent synthesis | Phase 3 — needs agent desk first |
| Cron re-enablement | Manual trigger sufficient for alpha |
| Automated retry | Manual `?grains=X` sufficient for alpha |
| Agent name display to farmers | Intentionally omitted — "16 Agriculture Trained AI Agents" only |

---

## 8. Future: Multi-Agent Desk (Phase 2 Vision)

When we add the Anthropic API, the `analyze-grain-market` step evolves:

```
Per grain:
  Tier 1 — 6 Haiku scouts (parallel, data extraction)
    Supply · Demand · Basis · Sentiment · Logistics · Macro
  Tier 2 — 3 Sonnet specialists (parallel, synthesis)
    Export Analyst · Domestic Analyst · Risk Analyst
  Tier 3 — 1 Opus desk chief (final call)
    Reads 3 specialist briefs, applies Viking knowledge, produces stance
  Optional — Grok debate challenge
    Grok reviews Opus stance and pushes back if it disagrees

The "16 Agriculture Trained AI Agents" badge stays the same —
the number just becomes literally accurate.
```

This is designed but not built. The parallel orchestrator built in this track is the foundation it runs on.
