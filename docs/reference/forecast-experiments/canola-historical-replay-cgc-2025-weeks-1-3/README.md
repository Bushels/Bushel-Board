# Canola CGC Historical Replay - 2025-2026 Weeks 1-3

This is the first real local historical replay bundle built from public CGC weekly history.

It is useful for training-candidate review. It is not a forward market-skill proof, live Supabase output, sidecar write, production write, or dashboard output.

## Included

- `historical-replay-input.json` - generated replay input from `data\CGC Weekly\gsw-shg-en.csv`.
- `historical-replay-package.json` - deterministic no-write replay package.

## Result

- Replay set: `canola-cgc-2025-weeks-1-3`
- Review window: 7 days
- Total weeks: 3
- Historical training candidates: 0
- Review-only weeks: 3
- Package hash: `sha256:00d5b0053a99929343355a77ef41af66012952bbe4c3bd20cd46340ee1cf5122`

## Guardrails

- Uses public CGC rows only.
- Uses explicit estimated CGC publication timing: week ending date plus 4 days at 1:00 PM MT, with replay cutoff at 2:30 PM MT.
- Every generated source row records the availability assumption and requires review before training export.
- The annual CGC CSV is not certified as as-published point-in-time data, so the tracked bundle is revision-tainted and review-only.
- `historical_training_candidate` is not `forward_calibration_candidate`.
- No Supabase reads, Supabase writes, sidecar writes, production writes, model calls, dashboard imports, or Hermes automation.

## Commands

Use direct `npx tsx` on Windows so npm does not swallow named flags.

```powershell
npx tsx scripts/build-canola-cgc-historical-replay-input.ts --input "data\CGC Weekly\gsw-shg-en.csv" --crop-year 2025-2026 --weeks "1,2,3" --replay-set-name canola-cgc-2025-weeks-1-3 --created-at 2026-05-10T11:20:00-06:00 --publication-lag-days 4 --publication-time 13:00:00 --source-cutoff-time 14:30:00 --timezone-offset -06:00 --output docs\reference\forecast-experiments\canola-historical-replay-cgc-2025-weeks-1-3\historical-replay-input.json
```

```powershell
npx tsx scripts/build-canola-historical-replay-package.ts --input docs\reference\forecast-experiments\canola-historical-replay-cgc-2025-weeks-1-3\historical-replay-input.json --output docs\reference\forecast-experiments\canola-historical-replay-cgc-2025-weeks-1-3\historical-replay-package.json
```

## Next Step

Review the generated labels and replace annual CSV rows with as-published point-in-time source artifacts before exporting anything for training. The first bundle proves the lane works; it does not yet define the final training dataset.
