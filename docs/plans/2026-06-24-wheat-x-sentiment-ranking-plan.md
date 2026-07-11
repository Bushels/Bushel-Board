# Parked Wheat X Sentiment Ranking Plan - Track 54 Extension

**Date:** 2026-06-24
**Status:** Parked prototype. Do not wire into `/thesis` until Grok/Hermes auth and the scoring math are re-verified.
**Primary model:** Grok 4.3 through Hermes when available; Grok Composer 2.5-fast remains optional and not assumed callable.
**Goal:** Produce a watch-only, location-weighted, source-tiered Wheat X sentiment read that farmers can see on `/thesis` without moving the official scorecard.

## Parking Note - 2026-06-24

This was found as untracked prototype work during the Wheat USDA source-sweep closeout. The executable scorer/test draft and the leftover farmer-card component draft were removed from the live tree because the scorer's own test failed and the component imported that removed scorer:

```text
npx vitest run lib/__tests__/x-pulse-sentiment.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node
```

Result: 1 passed, 2 failed. The core bug was directional: trusted prairie bearish signals produced `lean_bullish`, because source quality and location weights were added as positive score terms instead of weighting the signed sentiment direction.

Keep this document as a future design note only. There is no live `components/thesis` Wheat X Pulse component in this lane. The next implementation must rebuild the pure scoring function with source tier and location relevance as confidence or magnitude weights, not as bullish points, before adding UI.

## Objective

Eventually turn daily X chatter into a ranked Wheat sentiment signal that:

- Prioritizes prairie SK/AB/MB context and trusted accounts.
- Produces a clean -1.0 to +1.0 watch-only score plus categorical lean.
- Never moves the official scorecard.
- Improves over time through a documented prompt and data loop.
- Stays watch-only unless an accepted signal is tied back to official or admitted market data.

## Corrected Scoring Contract

The signed signal should be:

```text
signed_direction * grok_confidence * source_tier_weight * location_weight * recency_weight
```

Source tier and location relevance should increase or decrease the confidence/magnitude of the signed signal. They must not add bullish points by themselves.

Suggested lean buckets:

| Lean | Score |
| --- | ---: |
| strong_bullish | > 0.55 |
| lean_bullish | 0.20 to 0.55 |
| neutral | -0.20 to 0.20 |
| lean_bearish | -0.55 to -0.20 |
| strong_bearish | < -0.55 |

## Future Implementation Layers

Layer A: Scout prompt

- Wheat-first search themes belong in the no-write Grok/Hermes scout prompt only.
- Any optional `location_weight_hint` must be treated as model-supplied context, not authority.

Layer B: Aggregator

- Future file: `lib/thesis/x-pulse-sentiment.ts`.
- Pure function: `computeWheatXSentiment(watchSummary)`.
- Filters to Wheat and Durum only.
- Returns score, lean, confidence, signal count, prairie signal count, top cited signals, and one watch-only tension note.

Layer C: Farmer card

- Future component should show quiet, mixed, bearish, or bullish watch states.
- Boundary copy must say: `Watch-only evidence. Does not change the official thesis score.`

Layer D: Integration points

- Reconciliation judge: one watch-only tension or alignment line.
- Friday X-signal bundle: Wheat-only paragraph.
- Track 54 promotion brief: accepted-rate and prairie-coverage metrics.

## Restart Criteria

Do not restart this lane until:

- USDA Wheat source-sweep verification and historical context are stable.
- Grok/Hermes availability is freshly verified in the same session.
- A corrected red/green test proves bearish trusted prairie signals score bearish.
- The UI keeps X pulse as watch-only evidence, not score authority.
