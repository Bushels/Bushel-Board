# Hermes Predictive Harness Kickoff - Canola V1

**Date:** 2026-05-08 MT
**Purpose:** Paste this whole document into Hermes as the first assignment.
**Mode:** Phase 0 discovery and design only. Stop before implementation.
**Target user:** Kyle, Bushel Board owner.

**2026-05-09 superseded note:** Do not paste this into Hermes and do not build Hermes automation from it. This is a historical seed packet only. The active path is Codex Automation, documented in `docs/plans/2026-05-09-codex-automation-predictive-harness-ops.md`.

---

## TL;DR For Hermes

Build the starting plan for an experimental Bushel Board predictive harness. The harness should use Hermes as orchestration and memory, a cheap LLM such as DeepSeek V4 for structured weekly analysis, and deterministic scoring as the source of truth.

Do not replace the current production thesis pipeline. Do not write to production thesis tables. Your first output is a review packet that Codex and Gemini can critique before any code, migration, or automation is created.

---

## Current Repo Truth

Bushel Board is not greenfield.

- Production weekly thesis work is currently handled by the Claude Agent Desk flow, not Grok.
- The old Grok/xAI production analysis chain is retired and must not be revived.
- `market_analysis` stores the published thesis.
- `score_trajectory` stores weekly anchors, collector heartbeats, and thesis movement through time.
- `prediction_scorecard` already exists as the deterministic scoring layer for 7, 14, and 28 day follow-through.
- `scripts/evaluate-predictions.ts` already evaluates `score_trajectory` rows against `grain_prices`.
- `lib/prediction-scorecard.ts` already contains pure scoring helpers.
- Canola has a deterministic market-read direction in `lib/canola-market-read.ts` and `scripts/generate-canola-market-read.ts`.

This task is not "replace production with Hermes." This task is "design the sidecar harness that can prove whether Hermes plus a cheap LLM adds predictive value."

---

## Assignment Scope

### In Scope

- Canola only.
- Weekly cadence first.
- Historical walk-forward backtest design first.
- 1-week and 4-week prediction horizons.
- Strict point-in-time snapshots: only data knowable as of the forecast week.
- Structured LLM output with no prose-only forecasts.
- Deterministic scoring and confidence calibration.
- A review packet for Codex and Gemini.

### Out Of Scope For This First Run

- No production writes to `market_analysis`, `grain_intelligence`, `farm_summaries`, or published dashboard surfaces.
- No changes to Claude Agent Desk production agents.
- No Grok/xAI restoration.
- No farmer private data, operator posted prices, chat extractions, or personally identifiable data.
- No live trading, trading recommendation claims, or "profitable system" language.
- No migrations, code edits, cron jobs, or deployments until Kyle approves the review packet.

---

## Required Files To Inspect

Read these before proposing implementation:

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_STATE.md`
- `docs/plans/2026-04-13-prediction-scorecard-and-twice-daily-pulse.md`
- `supabase/migrations/20260413162000_create_prediction_scorecard.sql`
- `lib/prediction-scorecard.ts`
- `lib/__tests__/prediction-scorecard.test.ts`
- `scripts/evaluate-predictions.ts`
- `docs/reference/cgc-market-mechanics-v1.md`
- `docs/reference/source-registry.md`
- `lib/canola-market-read.ts`
- `scripts/generate-canola-market-read.ts`
- `hermes/`
- `docs/hermes/SOUL.md`

If any file is missing, say so explicitly in the result packet. Do not invent file contents.

---

## Product Goal

Create a private experimental loop that answers:

> If Hermes and a cheap LLM had been asked each week to forecast canola, using only data available at that point in time, would the system have made useful directional calls with honest confidence?

Useful means:

- better than naive baselines,
- transparent enough to audit,
- calibrated enough that confidence means something,
- safe enough not to contaminate production intelligence,
- and useful to farmers as decision support rather than market prophecy.

---

## Desired System Shape

```text
Historical week snapshot
  -> deterministic source packet
  -> DeepSeek V4 structured analysis
  -> experimental forecast ledger
  -> later realized price/fundamental outcome
  -> deterministic score
  -> rule memory and calibration notes
  -> Codex/Gemini review
  -> only then promotion decision
```

Hermes is the scheduler, analyst runner, memory keeper, and reviewer of its own misses.
The scorer is the judge.

---

## Model And Provider Rules

- Target model family: DeepSeek V4.
- Prefer a cheap/fast model for routine weekly structured analysis.
- Keep model name in configuration, for example `DEEPSEEK_PREDICTION_MODEL`.
- Do not hard-code the model name into business logic.
- Do not send private farmer/operator data to DeepSeek in V1.
- Store model provider, model name, prompt version, and output schema version with every forecast.
- Raw LLM text is not enough. Forecasts must parse into strict JSON.

---

## Required Forecast Output Shape

Design around a strict JSON object like this:

```json
{
  "grain": "Canola",
  "crop_year": "2025-2026",
  "grain_week": 38,
  "as_of_date": "2026-05-05",
  "horizon_days": 28,
  "direction": "bullish",
  "stance_score": 32,
  "confidence_pct": 61,
  "expected_move_pct_range": {
    "low": 1.0,
    "high": 4.0
  },
  "recommendation": "HOLD_FIRM",
  "top_drivers": [
    {
      "driver": "Producer deliveries slowing relative to export demand",
      "directional_effect": "bullish",
      "evidence_source": "CGC packet",
      "confidence": "medium"
    }
  ],
  "invalidating_triggers": [
    "Futures settle below the current 20-day range low",
    "Next CGC report shows export pace below the 5-year median"
  ],
  "known_blind_spots": [
    "No verified prairie cash basis in this V1 run"
  ]
}
```

The exact schema can change, but the review packet must propose one schema with field names, allowed values, and validation rules.

---

## Data Guardrails

### No Future Leakage

Every forecast must have an `as_of_date` and a source cutoff. The LLM cannot see:

- prices after the cutoff,
- reports published after the cutoff,
- later news,
- later corrected CGC values unless the replay intentionally models revisions,
- any scorecard rows generated after the forecast.

### Week N vs Week N+1 Separation

Do not mix lagging official data with later events without labeling timing. CGC Week N, live price action, producer car allocations, weather events, and news may all represent different clock times.

The packet must state:

- what each source covers,
- when it was published,
- how old it was at forecast time,
- whether it is fact, interpretation, proxy, or speculation.

### Canola Flow Math

For Canadian canola, do not reduce market flow to one worksheet. Preserve the repo's CGC rules:

- Producer deliveries use the approved CGC logic.
- Terminal receipts and terminal exports require grade summing where aggregate rows are absent.
- Export interpretation must respect direct export-destination flows and Producer Cars where relevant.
- Domestic disappearance is residual math, not a standalone CSV metric.

### Proxy Limits

US soybeans, soybean oil, palm oil, crude oil, FX, or China policy can be used as context. They must not be stored as official Canadian canola facts.

---

## Proposed Sidecar Storage

Do not implement yet. In the review packet, recommend the minimum table/file shape for:

- `forecast_experiment_runs`: one row per harness run.
- `forecast_experiment_predictions`: one row per forecast horizon.
- `forecast_experiment_scores`: deterministic outcome scoring.
- `forecast_signal_rules`: optional promoted/demoted rule memory after enough observations.

If you think existing `score_trajectory` and `prediction_scorecard` should be reused instead, defend that choice and identify every constraint change required. Default preference is sidecar tables until the experiment proves itself.

---

## Baselines Required

The harness is not useful unless it beats simple baselines. Include at least these:

- naive no-change baseline,
- previous-week direction baseline,
- moving-average momentum baseline,
- stance copied from current production `market_analysis` when a point-in-time row exists.

Do not claim model skill without comparing against baselines.

---

## Scoring Required

The review packet must define how V1 scores:

- direction accuracy,
- magnitude error,
- Brier score for probability/confidence,
- calibration by confidence bucket,
- bias by grain and horizon,
- unresolved cases,
- flat market handling,
- missing price data handling.

Plain "hit rate" is not enough.

---

## Confidence Rules

Confidence is earned, not asserted.

- Forecast confidence must be capped until enough backtest samples exist.
- Repeated same-direction misses must reduce future confidence.
- Divergent official data vs live price/news must lower confidence or produce neutral/watch.
- Confidence calibration must be visible in the result packet.

If the LLM says "70% confidence", the system must eventually verify whether 70% calls are right about 7 out of 10 times.

---

## First Hermes Run Deliverable

Create exactly one review packet:

`docs/plans/2026-05-08-hermes-predictive-harness-results.md`

The packet must contain these sections, in this order:

1. `Executive Verdict`
   - Pick one: `BUILD`, `BUILD AFTER FIXES`, or `DO NOT BUILD YET`.

2. `Repo Evidence Read`
   - List every required file inspected.
   - For each, summarize the relevant contract in 1-3 bullets.
   - Say explicitly if a file was missing or stale.

3. `Recommended V1 Architecture`
   - Include an ASCII data-flow diagram.
   - Clearly separate Hermes, DeepSeek, deterministic scripts, Supabase, and dashboard.

4. `Sidecar Data Model`
   - Proposed tables or files.
   - Key columns.
   - Which existing tables remain untouched.

5. `Forecast JSON Schema`
   - Exact schema proposal.
   - Validation rules.
   - One sample Canola forecast object.

6. `Backtest Protocol`
   - How to replay historical weeks.
   - How to prevent future leakage.
   - How to handle revised source data.
   - Which baselines are included.

7. `Scoring And Calibration`
   - Metrics.
   - Thresholds.
   - Confidence bucket rules.
   - What counts as unresolved.

8. `Risks And Failure Modes`
   - At least 10 concrete risks.
   - Include legal/reputation risk for public-facing outputs.
   - Include data leakage, overfitting, stale source data, and model drift.

9. `Implementation Patch Plan`
   - File-by-file patch plan only.
   - No code in this first run unless Kyle explicitly asks.
   - Mark each file as create/modify/read-only.

10. `Review Gate For Codex And Gemini`
    - Include a short checklist for Codex.
    - Include a short Gemini prompt that can be run against this results file.
    - End with `STOPPING FOR REVIEW`.

---

## Gemini Review Notes Already Collected

Gemini CLI was asked for focused guardrails using `gemini-3.1-pro-preview`. It returned useful guidance, but the CLI also hit server capacity errors after retries. Treat this as helpful input, not final authority.

High-signal Gemini notes:

- Enforce strict temporal context to prevent future leakage.
- Separate Week N official data from Week N+1 or live signals.
- Isolate LLM outputs so production source tables cannot be contaminated.
- Route forecasts through empirical scorecard logic.
- Upgrade confidence only when evidence and scored history justify it.
- Treat US soy or soybean oil as context, not Canadian canola facts.
- Preserve comprehensive canola flow math.
- Prefer immutable point-in-time snapshots over live cumulative queries where backtesting would be polluted by revisions.

---

## Codex/Gemini Review Gate

After Hermes writes the results packet, stop. Do not implement.

Codex review should answer:

- Does the plan create a parallel production pipeline by accident?
- Are `market_analysis`, `grain_intelligence`, and dashboard reads protected?
- Is the no-future-leakage protocol enforceable?
- Is scoring deterministic enough to trust?
- Are confidence and calibration treated honestly?
- Are private farmer/operator data excluded?
- Is the implementation plan small enough for V1?

Gemini review prompt:

```text
@docs/plans/2026-05-08-hermes-predictive-harness-results.md
Identify every missing guardrail or weak assumption that could make this Canola predictive harness look accurate in backtests but fail in real use. Focus on future leakage, source timing, confidence calibration, and contamination of production Bushel Board tables.
```

Only after Codex and Gemini review should Kyle decide whether Hermes proceeds to implementation.

---

## Hard Stop Conditions

Stop and report instead of proceeding if:

- you cannot determine current production thesis ownership,
- required files are missing or contradict each other,
- the plan requires editing production tables before a sidecar proof,
- point-in-time snapshots cannot be built from available data,
- DeepSeek output cannot be forced into strict JSON,
- private farmer/operator data would be exposed to an external model,
- or the first patch would touch more than the experimental harness surface.

---

## Final Instruction To Hermes

Do the discovery. Write the results packet. Stop for review.

The goal is not to sound ambitious. The goal is to design a harness that can survive hostile audit, prove or disprove predictive value, and avoid contaminating the current Bushel Board production intelligence path.
