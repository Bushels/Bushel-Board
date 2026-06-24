# Wheat Thesis Goal Handoff - 2026-06-24

## Start Here

Next session should start a Wheat-only goal, not a broad grain-board redesign.

Recommended goal objective:

```text
Build a Wheat-first Bull/Bear thesis system that fully traces USDA, CGC, price, CFTC, logistics, and Hermes/X pulse data into one consistent farmer-facing score, with a visual relationship spiderweb where distance/weight shows impact on the Wheat bullish/bearish read, then deploy and verify it.
```

## Clean Closeout - 2026-06-24

- Hindsight memory was checked again for Wheat/USDA/Rule 21/Hermes/Grok context. It returned no matching documents, memories, tags, or mental models. Checked-in repo docs remain the operating truth.
- No new Wheat agent was created. The existing `grain-report` skill now carries the next-session Wheat loop start order, source inventory, and no-write Hermes/Grok boundary.
- The retired `ai-pipeline-v2` skill was tightened into an archive-only tombstone so it cannot be mistaken for a live recovery path.
- The `cftc-cot` skill was tightened so CFTC stays a Wheat timing/crowding input, not a primary direction creator by itself.
- This closeout added no new score authority. The latest dashboard behavior is a farmer-facing USDA Wheat source-sweep panel that inventories official U.S. rows already represented in the scorecard.
- An unfinished Wheat X-sentiment prototype was parked at `docs/plans/2026-06-24-wheat-x-sentiment-ranking-plan.md`; its executable TypeScript/test draft and leftover component draft were removed because the prototype scored trusted prairie bearish signals as bullish and the component depended on the removed scorer.

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
- `/thesis` now shows packet-window price trend context under the Spring Wheat / HRW / SRW price basket. It compares the earliest and latest packet settlements per leg and labels sparse/provisional source coverage. This is not a full historical price chart.
- `/thesis` now also shows 60-day historical Wheat futures context under the price proof strip. Migration `20260624192708_get_wheat_price_history` is applied live and exposes bounded public RPC `get_wheat_price_history(60)` for Spring Wheat, HRW, and SRW only; anon proof returned 103 rows across the three legs.
- Wheat weekly-packet headline scores now resolve from the deterministic rating scorecard when a Wheat scorecard is populated. Driver counts still build bull/bear explanation copy, but the visible Wheat weekly score and confidence come from `ratingScorecard.overall_score` and `ratingScorecard.confidence_score`; daily trajectory overlays remain the only current-day override.
- `/thesis` now has a farmer-facing reconciliation judge, a node-and-edge relationship spiderweb, and visible Spring Wheat / HRW / SRW price-basket proof strip. The judge chooses the largest weighted scorecard datum, shows freshness proof, compares the main counterweight, and keeps the visual layers as explanation over the existing scorecard rather than new scoring authority.
- `/thesis` now has a USDA Wheat source-sweep panel that shows Crop Progress, WASDE balance, Export Sales, and Quarterly Stocks with source freshness, cadence, latest row date, weighted score effect, and relation labels such as deciding row, bear pressure, bull support, or cadence-limited context.
- `/thesis` now shows the USDA relationship chain from condition signal to balance anchor to demand confirmation to inventory check to price confirmation, plus source-specific judge copy and `Decision role` blocks for each USDA source card.
- Hindsight memory was checked for Wheat/Wheat-loop context and returned no matching memories; checked-in repo docs remain the operating truth.
- Source freshness loop was completed after the first UI proof:
  - CFTC official SODA feed was checked directly; Wheat contracts were available for report date 2026-06-16.
  - CFTC import wrote 8 rows and heartbeats; Wheat positioning now shows HRSpring managed money net +6,152, down 3,804 contracts week over week, with SRW net -69,531 and HRW net +7,620.
  - Grain Monitor importer advanced from week 43 to week 45, report date 2026-06-23, covered period 2026-06-08 to 2026-06-14.
  - Producer Cars importer advanced to week 47; Wheat week cars 587, crop-year cars 14,750, with 63 cars to the U.S., 300 to Pacific, and 174 to Thunder Bay.
  - Thesis packet cache refreshed 12/12 with source watermark 2026-06-24T15:46:49Z.
  - Source freshness watchdog is green: cache items 12, alerts 0, freshness watch count reduced from 33 to 15.

## What Is Not Done

- The visible USDA Wheat sweep now has source-specific relationship language, but it is still an explanation layer. The next loop needs live-packet verification plus historical export context before treating it as a complete USDA scoring review.
- The relationship spiderweb now makes side, distance, node rank, and edge thickness visible, but the next scoring pass still needs to prove whether source authority should alter distance separately from weighted score impact.
- The reconciliation judge now has deciding-datum, freshness, counterweight, and source-specific language; the next loop should verify those patterns against live USDA packets and historical price/export context.
- Wheat price basket scoring is repaired and visible with packet-window plus 60-day historical futures context. This is still price confirmation only; it does not add score authority.
- Positioning still needs to become a timing/crowding modifier instead of a primary direction creator.
- Local cash/basis remains weak because `posted_prices` is empty and SK cash prices are only provincial-average context.
- Global origin competition is still watch-only.

## Next Technical Sequence

1. Use the new USDA Wheat source-sweep panel as the visible inventory, then verify every Wheat metric currently wired into the packet and scorecard:
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
2. Verify the repaired Wheat price basket and historical futures context against the live packet:
   - Spring Wheat / MGEX
   - HRW Wheat / KCBT
   - SRW Wheat / CBOT
   - show disagreement as lower confidence
   - current UI has packet-window trend context plus public-safe 60-day history; broader historical export context is still separate work
3. Extend the reconciliation judge after the full Wheat source sweep.
   - headline score is already scorecard-backed for Wheat weekly packets
   - judge card now shows the deciding datum, freshness proof, and strongest counterweight on `/thesis`
   - CFTC, Grain Monitor, and producer cars are refreshed; next loop should verify and refine source-specific explanations for USDA exports, stocks, WASDE, crop progress, and price confirmation
   - daily overlays should stay visibly separate from weekly scorecard truth
4. Deepen the relationship spiderweb model:
   - center: one Wheat read
   - first ring: high-authority lanes with score weight
   - second ring: movement/logistics and positioning
   - outer ring: watch leads, global context, local-basis gaps
   - edge color: bull/bear/neutral
   - edge thickness: effect size
   - current v1 distance: lower weighted score impact sits farther away
   - next v2 question: whether source authority, freshness, or replay accuracy should also affect distance
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
- bearish side: WASDE/stocks, fresh price action, refreshed logistics, and current CGC flow do not confirm a bullish breakout
- watch side: X pulse was quiet; no accepted Hermes signal moved the thesis; positioning is now fresher but remains timing/crowding context, not the deciding datum

Do not hard-code that read. It is the starting checkpoint for the next loop.
