# Canola Forward Source Artifact - Week 38 - 2026-05-10

This is the first non-synthetic source artifact for the Canola walk-forward harness.

It freezes filtered rows from a deterministic Canola Market Read generated on 2026-05-10. It is not a model forecast, training proof, price-skill proof, sidecar write, live Supabase writer, or dashboard output.

The raw market-read JSON is intentionally not tracked. It was generated locally, then filtered before commit because the full read can include source families that are forbidden as forecast inputs.

## Included

- `source-rows.json` - filtered forecast source rows.
- `output/source-records.json` - source rows after the forecast source-record gate.
- `output/snapshot.json` - deterministic frozen snapshot.

## Guardrails

- Raw private or unadmitted lanes are omitted before snapshot build.
- Omitted source families are recorded only as safe public source names or redacted categories with counts.
- The snapshot is strict artifact mode because the committed rows are the frozen input artifact.
- There is no model output yet.
- There is no training candidate yet.
- There is no next-week review package yet.

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

## Next Step

Select a model with an explicit training cutoff before building a forecast prompt pack and freezing a bull/bear thesis. If the model's pretraining boundary is unknown, the review package must not become a training or calibration candidate.
