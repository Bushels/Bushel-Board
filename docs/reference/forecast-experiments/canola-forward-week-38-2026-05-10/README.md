# Canola Forward Source Artifact - Week 38 - 2026-05-10

This is the first non-synthetic source artifact for the Canola walk-forward harness.

It freezes filtered rows from a deterministic Canola Market Read generated on 2026-05-10. It is not a model forecast, training proof, price-skill proof, sidecar write, live Supabase writer, or dashboard output.

The raw market-read JSON is intentionally not tracked. It was generated locally, then filtered before commit because the full read can include source families that are forbidden as forecast inputs.

## Included

- `source-rows.json` - filtered forecast source rows.
- `output/source-records.json` - source rows after the forecast source-record gate.
- `output/snapshot.json` - deterministic frozen snapshot.
- `output/prompt-pack.json` - forecast prompt pack bound to the frozen snapshot.
- `forecast.json` - first real frozen bull/bear thesis output.
- `output/run-artifact.json` - hashed forecast run artifact.

## Guardrails

- Raw private or unadmitted lanes are omitted before snapshot build.
- Omitted source families are recorded only as safe public source names or redacted categories with counts.
- The snapshot is strict artifact mode because the committed rows are the frozen input artifact.
- The model output is a forecast artifact only; it is not training data.
- There is no training candidate yet because no next-week review has been completed.
- There is no next-week review package yet.
- Gemini was used for exporter review, not as the forecaster, because the Gemini 3.1 Pro Preview training cutoff is not hard enough for this calibration lane.

## Commands

```powershell
npx tsx scripts/generate-canola-market-read.ts --crop-year 2025-2026 --grain-week 38 --format json | Set-Content -Path "$env:TEMP\canola-market-read-week38.json"
```

```powershell
npx tsx scripts/export-canola-market-read-source-rows.ts --input "$env:TEMP\canola-market-read-week38.json" --output docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/source-rows.json --as-of 2026-05-10 --source-cutoff-at 2026-05-10T08:55:00-06:00 --cutoff-proof frozen_forward_artifact --created-at 2026-05-10T08:55:00-06:00
```

```powershell
npx tsx scripts/build-canola-forecast-source-records.ts --input docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/source-rows.json --output docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/source-records.json
```

```powershell
npx tsx scripts/build-canola-forecast-snapshot.ts --input docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/source-records.json --output docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/snapshot.json
```

```powershell
npx tsx scripts/build-canola-forecast-prompt-pack.ts --snapshot docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/snapshot.json --output docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/prompt-pack.json --horizon-days 7 --exchange ICE --contract-code RSN26 --contract-month 2026-07 --roll-policy fixed_contract_no_roll --model-training-cutoff 2024-06-01 --prompt-version canola-forecast-prompt-v1 --created-at 2026-05-10T09:15:00-06:00
```

```powershell
npx tsx scripts/build-canola-forecast-run-artifact.ts --snapshot docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/snapshot.json --forecast docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/forecast.json --output docs/reference/forecast-experiments/canola-forward-week-38-2026-05-10/output/run-artifact.json --provider openai-codex-local --model gpt-5-codex-2024-06-cutoff --runner-mode manual_model_output --prompt-version canola-forecast-prompt-v1 --prompt-hash sha256:d368cefe0bc578826793c5ec6a34b712389b0098d54695a713a28110a230af72 --model-training-cutoff 2024-06-01 --created-at 2026-05-10T09:25:00-06:00
```

## Next Step

Wait for next-week public evidence, then build `next-week-evidence.json`, `output/thesis-review-prompt-pack.json`, and `output/thesis-review-package.json`.

The review package can only become a forward-calibration candidate if it uses accepted next-week evidence, avoids revision/pretraining contamination, and passes human review. It still must not write sidecar or production tables without a separate review gate.
