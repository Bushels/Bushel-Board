# Model Benchmark Run Contract v1

Canonical schema for deterministic thesis model benchmark records.

## Required fields

- `run_id` (string): unique benchmark run identifier.
- `model_id` (string): model/provider id (e.g. `openai/gpt-5.3-codex`).
- `input_artifact_hash` (string): frozen thesis input hash used by *all* models in run.
- `output_hash` (string): deterministic hash of parsed model output.
- `scores` (object): benchmark scores.
  - `directional_accuracy` (number, 0..1)
  - `evidence_coverage` (number, 0..1)
  - `calibration_error` (number, 0..1)
  - `overclaim_penalty` (number, 0..1)
  - `final_score` (number, 0..1)
- `review_window` (object)
  - `start_at` (ISO-8601 with timezone)
  - `end_at` (ISO-8601 with timezone)
- `status` (enum): `queued | running | completed | failed`

## Invariants

1. `review_window.start_at <= review_window.end_at`
2. `final_score` should be deterministic for identical input payload + scoring logic version.
3. `input_artifact_hash` must be identical across compared models in same cohort.
4. `output_hash` is required even when status is `failed` (set from error payload shape if no parsed thesis).
