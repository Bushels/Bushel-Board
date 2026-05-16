# Weekly Thesis Benchmark Report Template

Use this template for the human review artifact generated from benchmark runs.

## Header
- Run ID
- Market key
- Grain week
- Review window start/end
- Top model and score

## Model results
For each model include:
- model_id
- final_score
- status
- directional_accuracy
- evidence_coverage
- calibration_error
- overclaim_penalty

## Failure cases
List models that:
- failed (`status != completed`), or
- scored below the review threshold (`final_score < 0.50`).

## Recommendation
One operator-facing recommendation:
- Promote candidate for next cycle when top model is strong and no failures exist.
- Otherwise hold promotion and review failure cases.

## Safety Footer
`Review-only artifact. Do not auto-promote to production publish path.`
