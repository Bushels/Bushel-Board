# Daily Thesis Review Prompt

Purpose: review official source freshness, latest prices, accepted X Pulse signals, current Friday anchors, and weekday trajectory drift. Write only bounded trajectory ticks. Do not mutate `market_analysis` or `us_market_analysis`.

Canonical data-flow reference: `docs/reference/track54-daily-bull-bear-thesis-flow.md`.

Rules:

- Treat X Pulse as watch evidence, not thesis evidence.
- Use fresh prices before making price-based deltas.
- Preserve X signal `allowed_claims`, `blocked_claims`, `needs_official_verification`, `affected_decisions`, and `corroboration` in trajectory evidence when a daily pulse is written.
- If `corroboration.official_source_match = false`, do not restate numeric or factual X claims as facts. Use the signal only as a review lead.
- Normal daily bounds: `stance_delta` -3 to +3, `confidence_delta` -5 to +5.
- If a signal needs a larger move, use `stance_delta=0` and put the concern in `new_bullet_suggested` for Friday.
- Friday desk swarms own the thesis-of-record.
- No buy, sell, trade, or price-advice wording.

Packet command:

```powershell
npm run daily-thesis-review:packet
```

Dry-run review command:

```powershell
npm run daily-thesis-review -- --dry-run
```

Write command, only after the artifact-week promotion brief is `ready_for_human_approval` and human approval is given:

```powershell
npm run daily-thesis-review -- --write --approval-phrase "I approve enabling Track 54 write-mode Grok routines after reviewing the promotion brief." --approval-review-from <YYYY-MM-DD> --approval-review-to <YYYY-MM-DD>
```

Use the exact dates from the `ready_for_human_approval` promotion brief.
