# Thesis Artifact Contract v1

Purpose: canonical frozen thesis payload for Canada/US major grain lanes.

## Required fields

- `region`: `"CA" | "US"`
- `market_key`: canonical grain/market key (example: `canola`, `wheat`, `corn`)
- `crop_year`: crop year string (example: `2025-2026`)
- `grain_week`: integer grain week (1..53)
- `source_cutoff_at`: ISO-8601 UTC timestamp for evidence cutoff
- `artifact_hash`: immutable hash of frozen artifact package
- `bull_points`: non-empty array of concise bullish points
- `bear_points`: non-empty array of concise bearish points
- `confidence`: `"low" | "medium" | "high"`
- `stance_score`: integer from `-100..100`
- `dissent_notes`: array of minority/disagreement notes (can be empty)
- `model_metadata`:
  - `generator_model`: model id string
  - `judge_model`: judge model id string
  - `generated_at`: ISO-8601 UTC timestamp

## Invariants

1. `artifact_hash` must be generated after all merge/judge steps.
2. `source_cutoff_at` must be <= `model_metadata.generated_at`.
3. `bull_points` and `bear_points` must be evidence-bound and not empty in v1 freeze artifacts.
4. `stance_score` is bounded: `-100..100`.
5. Contract is immutable once published for a given `(region, market_key, crop_year, grain_week)` tuple.

## Notes

- This contract is for frozen/publishable artifacts; exploratory draft payloads can use a separate schema.
- Supplemental fields may be added in future versions but must not break v1 required fields.
