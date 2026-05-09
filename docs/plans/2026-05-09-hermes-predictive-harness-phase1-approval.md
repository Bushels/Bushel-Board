# Canola Predictive Harness - Phase 1A Approval Brief

**Date:** 2026-05-09 MT
**Status:** Awaiting Kyle approval before implementation
**Parent review packet:** `docs/plans/2026-05-08-hermes-predictive-harness-results.md`

---

## Decision Requested

Approve or revise **Patch Set 1A: sidecar contracts and pure scoring only**.

Do not start DeepSeek calls, Hermes automation, snapshot replay, dashboard work, or production integration in Patch Set 1A.

---

## Recommended Decision

**Approve Patch Set 1A.**

Why: it creates the safe test stand before any model is allowed to make a forecast. The work is low-risk because it is sidecar-only, testable locally, and does not touch production thesis tables or dashboard reads.

---

## Patch Set 1A Scope

### Create

- `supabase/migrations/YYYYMMDDHHMMSS_create_forecast_experiment_tables.sql`
  - Create `experimental` schema if absent.
  - Create sidecar tables:
    - `experimental.forecast_experiment_runs`
    - `experimental.forecast_experiment_predictions`
    - `experimental.forecast_experiment_scores`
  - Do **not** create `forecast_signal_rules` yet.
  - Do **not** apply migration to live Supabase in this patch set unless Kyle separately approves DB push.

- `lib/forecast-experiments/schema.ts`
  - Zod schema for `canola-forecast-v1`.
  - Type exports for forecast JSON.
  - No model calls.
  - No Supabase calls.

- `lib/forecast-experiments/scoring.ts`
  - Pure helpers for:
    - directional result,
    - magnitude error,
    - Brier score,
    - confidence bucket,
    - roll-policy validation,
    - market-close start-price guard.
  - No Supabase calls.
  - No production imports from `market_analysis`, `score_trajectory`, or `prediction_scorecard`.

- `lib/__tests__/forecast-experiments-schema.test.ts`
- `lib/__tests__/forecast-experiments-scoring.test.ts`

### Modify

- `package.json`
  - Add one narrow test script if useful, for example `test:forecast`.
  - Avoid broader script churn.

### Read-Only / Do Not Touch

- `market_analysis`
- `grain_intelligence`
- `farm_summaries`
- `score_trajectory`
- `prediction_scorecard`
- `posted_prices`
- `crop_plans`
- `chat_extractions`
- `knowledge_state`
- dashboard components
- app routes
- Hermes runtime server

---

## Non-Negotiable Guardrails

- No production writes.
- No dashboard reads.
- No model/API calls.
- No DeepSeek key handling.
- No Hermes scheduler changes.
- No live Supabase migration push without a separate yes.
- No farmer/operator/private chat data.
- No historical skill claims.
- No use of generic Canola price series without an explicit contract and roll policy.

---

## Acceptance Checks

Patch Set 1A is done only when:

- `git diff --name-only` contains only the approved files.
- Migration is sidecar-only and creates under `experimental`.
- Tests prove invalid forecast JSON is rejected.
- Tests prove model-pretraining taint is represented.
- Tests prove 28-day scoring requires a declared contract/roll policy.
- Tests prove same-day settlement is rejected when forecast timestamp is before market close.
- Tests prove Brier score and calibration buckets are computed deterministically.
- `npm run test -- lib/__tests__/forecast-experiments-schema.test.ts lib/__tests__/forecast-experiments-scoring.test.ts` passes, or the exact local command gap is documented.
- No production table name appears in new implementation files except in explicit read-only guardrail text.

---

## Explicit Stop Point

After Patch Set 1A:

1. Stop.
2. Show the diff.
3. Report tests.
4. Ask whether to proceed to Patch Set 1B.

Patch Set 1B would be the deterministic snapshot builder. It is not included here.

---

## Kyle Approval Phrase

To proceed, Kyle can say:

```text
Approve Patch Set 1A.
```

Anything else should be treated as review feedback or revision, not implementation approval.
