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
- First Wheat pressure-map model/panel is wired into `/thesis` from `lib/thesis/wheat-pressure-map.ts`. It traces source nodes, factor nodes, packet contributions, CA/US evidence geography, X Pulse watch proof, and relationship nodes into one Wheat read.
- Wheat price scoring no longer uses the "latest price row wins" shortcut when multiple Wheat futures classes are present. `lib/thesis/rating-domain-mappers.ts` now builds a Spring Wheat / HRW / SRW basket; agreement sets direction and disagreement lowers confidence. Focused proof passed: `npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node`.
- Wheat weekly-packet headline scores now resolve from the deterministic rating scorecard when a Wheat scorecard is populated. Driver counts still build bull/bear explanation copy, but the visible Wheat weekly score and confidence come from `ratingScorecard.overall_score` and `ratingScorecard.confidence_score`; daily trajectory overlays remain the only current-day override.
- Hindsight memory was checked for Wheat/Wheat-loop context and returned no matching memories; checked-in repo docs remain the operating truth.

## What Is Not Done

- Full USDA Wheat sweep is not complete.
- The first relationship map exists, but the radial "spiderweb" metaphor still needs visual polish: distance from the Wheat read, edge thickness, and impact ranking should be faster to read at a glance.
- The canonical Wheat reconciliation judge is not implemented.
- The Wheat weekly headline score now uses the deterministic scorecard, but the final reconciliation judge still needs to explain the deciding datum when CA/US lanes or source domains conflict.
- Wheat price basket scoring is repaired in the deterministic mapper, but the top visual still needs a clearer three-contract split so farmers can see Spring Wheat, HRW, and SRW agreement/disagreement immediately.
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
2. Verify the repaired Wheat price basket against the live packet and expose the contract split visually:
   - Spring Wheat / MGEX
   - HRW Wheat / KCBT
   - SRW Wheat / CBOT
   - show disagreement as lower confidence
3. Add a reconciliation judge that explains the deciding datum when evidence is mixed.
   - headline score is already scorecard-backed for Wheat weekly packets
   - the judge still needs to explain why the score is leaning that way
   - daily overlays should stay visibly separate from weekly scorecard truth
4. Polish the relationship spiderweb:
   - center: one Wheat read
   - first ring: high-authority lanes with score weight
   - second ring: movement/logistics and positioning
   - outer ring: watch leads, global context, local-basis gaps
   - edge color: bull/bear/neutral
   - edge thickness: effect size
   - distance: lower authority or lower score impact
5. Run visual QA on desktop and mobile, then deploy.

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
