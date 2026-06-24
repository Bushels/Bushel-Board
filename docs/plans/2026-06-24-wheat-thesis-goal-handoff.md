# Wheat Thesis Goal Handoff - 2026-06-24

## Start Here

Next session should start a Wheat-only goal, not a broad grain-board redesign.

Recommended goal objective:

```text
Build a Wheat-first Bull/Bear thesis system that fully traces USDA, CGC, price, CFTC, logistics, and Hermes/X pulse data into one consistent farmer-facing score, with a visual relationship spiderweb where distance/weight shows impact on the Wheat bullish/bearish read, then deploy and verify it.
```

## What Is Done

- `/thesis` is visually redesigned around one Wheat read.
- Canada and U.S. are evidence geography, not competing product tabs.
- USDA Crop Progress for the 2026-06-22 release is surfaced on the board:
  - winter wheat harvested 40%
  - winter wheat good/excellent 26%
  - spring wheat headed 16%
  - spring wheat good/excellent 54%
- First Wheat relationship loop is documented at `docs/plans/2026-06-23-wheat-metric-relationship-loop.md`.
- CGC week 45 import was repaired and verified:
  - week ending 2026-06-14
  - 4,411 rows
  - all 16 grains present
  - thesis cache refreshed 12/12
- Price/FX refresh was verified:
  - MWK26 Spring Wheat: 7.11 USD/bu on 2026-06-24, -0.594%
  - ZW CBOT Wheat: 5.975 USD/bu on 2026-06-22, -1.362%
  - KE KC HRW Wheat: 6.335 USD/bu on 2026-06-22, -1.630%
- Hermes terminal no-write X scout ran for 2026-06-23 with fresh price proof and 0 accepted signals.
- Vercel preview was deployed and build checks passed before this closeout.

## What Is Not Done

- Full USDA Wheat sweep is not complete.
- The farmer-facing relationship spiderweb is not built.
- The canonical Wheat judge is not implemented.
- The visible headline score and deterministic scorecard can still disagree.
- Wheat price still needs a basket repair across Spring Wheat, HRW, and SRW.
- Positioning still needs to become a timing/crowding modifier instead of a primary direction creator.
- Local cash/basis remains weak because `posted_prices` is empty and SK cash prices are only provincial-average context.
- Global origin competition is still watch-only.

## Next Technical Sequence

1. Inventory every Wheat metric currently wired into the packet and scorecard:
   - USDA Crop Progress
   - USDA WASDE
   - USDA Export Sales
   - USDA quarterly stocks
   - CGC exports, deliveries, process, terminal flows
   - Grain Monitor
   - Producer cars
   - CFTC COT
   - grain prices and FX
   - Hermes/X pulse artifacts
2. Repair Wheat price scoring:
   - use Spring Wheat, HRW, and SRW as a basket
   - show disagreement as lower confidence
   - avoid "latest price row wins"
3. Make the deterministic rating scorecard the headline source of truth.
4. Add a reconciliation judge that explains the deciding datum when evidence is mixed.
5. Build the relationship spiderweb:
   - center: one Wheat read
   - first ring: high-authority lanes with score weight
   - second ring: movement/logistics and positioning
   - outer ring: watch leads, global context, local-basis gaps
   - edge color: bull/bear/neutral
   - edge thickness: effect size
   - distance: lower authority or lower score impact
6. Run visual QA on desktop and mobile, then deploy.

## No-Write And Retired-Path Boundaries

- Do not revive `/api/pipeline/run`.
- Do not call `analyze-grain-market`, `search-x-intelligence`, `analyze-market-data`, `generate-intelligence`, or `generate-farm-summary`.
- Do not let Grok/Hermes write thesis rows, Supabase rows, `x_market_signals`, `score_trajectory`, `us_score_trajectory`, `market_analysis`, `us_market_analysis`, or `thesis_packet_cache`.
- Hermes/Grok pulse is watch-only until accepted evidence is tied back to official or admitted market data.
- Hindsight is useful memory, but checked-in repo docs remain the operating truth for the next session.

## Current Read To Preserve

The current best read is lean bear / balanced-to-bear:

- bullish side: poor U.S. winter wheat condition is real supply stress
- bearish side: WASDE/stocks, fresh price action, and current CGC flow do not confirm a bullish breakout
- watch side: X pulse was quiet; no accepted Hermes signal moved the thesis

Do not hard-code that read. It is the starting checkpoint for the next loop.
