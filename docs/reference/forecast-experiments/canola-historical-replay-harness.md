# Canola Historical Replay Harness

## Direct Answer

Historical data can be used for learning. It must be packaged as historical replay, not forward calibration proof.

The harness builds local no-write packages from:

1. point-in-time source rows available at the historical source cutoff,
2. a deterministic frozen snapshot,
3. next-window public evidence labels,
4. candidate classification for training use.

## Candidate Modes

- `historical_training_candidate` - clean historical example that can be reviewed for training/export.
- `review_only_revision_tainted` - the snapshot came from current/revised state and is not clean training input.
- `review_only_labeler_pretraining_tainted` - a model-assisted labeler could already know later outcomes.
- `review_only_labeler_pretraining_unknown` - a model-assisted labeler lacks an explicit training cutoff.
- `review_only_no_accepted_evidence` - no next-window evidence survived the evidence gate.
- `review_only_inconclusive` - the historical label is inconclusive.

`historical_training_candidate` is not the same as `forward_calibration_candidate`. Historical examples can help train and tune the system, but they cannot prove live market skill by themselves.

## Guardrails

- No Supabase reads.
- No Supabase writes.
- No sidecar writes.
- No production writes.
- No model API calls.
- No dashboard imports.
- No Hermes automation.
- Training export still requires review.

The evidence gate blocks:

- evidence available before or at the forecast cutoff,
- evidence available after the review cutoff,
- forbidden/private/proprietary source families.

The review cutoff must be after the source cutoff and inside the declared review window, currently 7 or 28 days.

## Command

```powershell
npm run forecast:canola:historical-replay -- --input path\to\historical-replay-input.json --output path\to\historical-replay-package.json
```

Use `--dry-run` to prove the package hash without writing output.

## Input Shape

```json
{
  "replay_set_name": "canola-weekly-history-v1",
  "review_window_days": 7,
  "created_at": "2026-08-14T16:45:00-06:00",
  "weeks": [
    {
      "period_id": "2026-2027-week-1",
      "crop_year": "2026-2027",
      "grain_week": 1,
      "as_of_date": "2026-08-07",
      "source_cutoff_at": "2026-08-07T14:30:00-06:00",
      "snapshot_mode": "strict_artifact_mode",
      "source_rows": [],
      "review_as_of_date": "2026-08-14",
      "review_cutoff_at": "2026-08-14T14:30:00-06:00",
      "labeler": {
        "kind": "human_review",
        "name": "codex"
      },
      "outcome_label": {
        "directional_outcome": "bullish",
        "thesis_verdict": "held",
        "outcome_summary": "Next-week evidence supported the bullish read.",
        "supporting_evidence_keys": ["cgc-week-2"],
        "contradicting_evidence_keys": [],
        "missed_signals": [],
        "adjustments_for_next_week": []
      },
      "next_week_evidence": []
    }
  ]
}
```

`source_rows` and `next_week_evidence` must be populated from reviewed local artifacts before the package can become a candidate.
