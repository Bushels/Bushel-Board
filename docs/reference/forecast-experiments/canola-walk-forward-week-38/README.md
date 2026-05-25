# Canola Walk-Forward Fixture - Week 38

This synthetic, human-authored fixture demonstrates the local thesis-review loop without live Supabase reads, model calls, sidecar writes, production writes, dashboard imports, or complete price history.

It is a deterministic harness fixture, not a public market-performance claim, model-output trace, training proof, live Supabase output, or price-skill proof.

## Flow

```text
source-rows.json
  -> forecast.json
  -> output/workflow.json
  -> next-week-evidence.json
  -> output/thesis-review-prompt-pack.json
  -> review.json
  -> output/thesis-review-package.json
```

## Commands

```bash
npx tsx scripts/run-canola-forecast-local-workflow.ts --source-rows docs/reference/forecast-experiments/canola-walk-forward-week-38/source-rows.json --forecast docs/reference/forecast-experiments/canola-walk-forward-week-38/forecast.json --output-dir docs/reference/forecast-experiments/canola-walk-forward-week-38/output --crop-year 2025-2026 --grain-week 38 --as-of 2026-04-24 --source-cutoff-at 2026-04-24T16:30:00-06:00 --snapshot-mode strict_artifact_mode --horizon-days 7 --exchange ICE --contract-code RSN26 --contract-month 2026-07 --roll-policy fixed_contract_no_roll --model-training-cutoff 2026-03-31 --provider manual-fixture --model human-authored-fixture-v1 --runner-mode manual_model_output --prompt-version canola-forecast-prompt-v1 --created-at 2026-04-24T16:35:00-06:00
```

```bash
npx tsx scripts/build-canola-thesis-review-prompt-pack.ts --run-artifact docs/reference/forecast-experiments/canola-walk-forward-week-38/output/run-artifact.json --evidence docs/reference/forecast-experiments/canola-walk-forward-week-38/next-week-evidence.json --review-as-of 2026-05-01 --review-cutoff-at 2026-05-01T16:30:00-06:00 --reviewer fixture --prompt-version canola-thesis-review-prompt-v1 --created-at 2026-05-01T16:31:00-06:00 --output docs/reference/forecast-experiments/canola-walk-forward-week-38/output/thesis-review-prompt-pack.json
```

```bash
npx tsx scripts/review-canola-thesis-week.ts --run-artifact docs/reference/forecast-experiments/canola-walk-forward-week-38/output/run-artifact.json --review docs/reference/forecast-experiments/canola-walk-forward-week-38/review.json --output docs/reference/forecast-experiments/canola-walk-forward-week-38/output/thesis-review-package.json
```

## Interpretation

The fixture shows the intended learning motion:

- freeze a bullish Canola thesis at Week 38,
- reveal only evidence available after the forecast cutoff and before the review cutoff,
- block evidence that was already known, too late, or forbidden,
- label each original driver,
- record missed signals and next-week adjustments,
- classify real model-output reviews as forward-calibration candidates only if they are not revision-tainted, pretraining-tainted, fixture-only, or inconclusive.

Because this directory is synthetic and human-authored, its generated review package must remain `review_only_fixture`. Price scoring is not applicable to this fixture.
