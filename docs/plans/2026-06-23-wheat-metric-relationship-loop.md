# Wheat Metric Relationship Loop - 2026-06-23

## Purpose

Build the Wheat bull/bear board around one farmer-facing Wheat read, with Canada and U.S. rows treated as evidence geography, not as a Canada-vs-USA product split.

The loop rule for v1:

```text
official data rows -> lane score -> price confirmation -> watch leads -> one Wheat read
```

Grok/Hermes pulse data is a watch lane only. It can raise a lead for review, but it cannot move the Wheat score unless the lead is tied back to official or admitted market data.

## Loop 1 - Start From Price

Reason: market price is the quickest signal that the trade is accepting or rejecting the official-data thesis.

Actions run:

- Refreshed USD/CAD FX through 2026-06-24.
- Refreshed grain futures prices and forced thesis packet cache refresh.
- Cache refresh result: 12/12 packets refreshed, source watermark 2026-06-24T00:19:05Z.
- Repaired the CGC CSV fetch header, imported CGC week 45, and refreshed thesis packet cache again with source watermark 2026-06-24T00:32:06Z.

Current Wheat price rows in the live packet:

| Contract | Market | Latest date | Settlement | Change | Read |
| --- | --- | ---: | ---: | ---: | --- |
| MWK26 | MGEX Spring Wheat | 2026-06-24 | 7.11 USD/bu | -0.594% | Bearish pressure, but Barchart latest-only |
| ZW | CBOT Wheat | 2026-06-22 | 5.975 USD/bu | -1.362% | Bearish confirmation |
| KE | KC HRW Wheat | 2026-06-22 | 6.335 USD/bu | -1.630% | Bearish confirmation |

Finding:

- Price is not confirming a bullish Wheat breakout, even with poor U.S. winter wheat condition.
- The current scorecard price lane only picks the first latest packet price row. Because Spring Wheat has the newest date, the score uses MWK26 and does not fully represent CBOT/KC Wheat pressure.
- V2 repair: Wheat price lane should be a three-contract basket or split visual: Spring, HRW, SRW. A farmer should see whether the whole Wheat complex agrees or only one contract moved.

## Loop 2 - Start From Supply And Weather

Reason: crop condition and supply balance are the most direct Wheat production pressure signals.

Current official facts:

| Metric | Value | Bull/bear effect |
| --- | ---: | --- |
| U.S. winter wheat good/excellent | 26% | Bullish supply stress |
| U.S. winter wheat G/E vs last year | -23 pts | Bullish supply stress |
| U.S. winter wheat harvested | 40% | Bearish/neutral near-term movement, harvest is moving |
| U.S. spring wheat headed | 16% | Neutral, on normal pace |
| U.S. spring wheat good/excellent | 54% | Neutral |
| U.S. WASDE stocks/use | 46.045% | Bearish supply cushion |
| U.S. quarterly stocks | 35,386 kt, +5.15% YoY | Bearish supply cushion |
| Canada Wheat total supply | 36,609 kt | Context |
| Canada Wheat carryout | 5,100 kt, 13.93% of supply | Balanced, not tight enough for strong bull |
| AB moisture adequate/surplus | 92.3% | Bearish/neutral crop support |
| SK cropland moisture adequate/surplus | 90.0% | Bearish/neutral crop support |
| SK Spring Cereals behind normal development | 63.0% | Bullish timing risk, proxy only |

Finding:

- U.S. crop condition is the cleanest bullish datum: 26% G/E and -23 pts YoY.
- WASDE and quarterly stocks are the cleanest bearish counterweight: 46% stocks/use and stocks +5.15% YoY.
- The board should show this as "crop stress is real, but the balance sheet and tape are not confirming a bull read yet."

## Loop 3 - Start From Demand And Movement

Reason: farmers need to know whether available grain is being pulled through demand channels or just piling into the system.

Current demand/movement facts:

| Metric | Value | Bull/bear effect |
| --- | ---: | --- |
| Canada current-week Wheat exports | 319.3 kt | Bullish only relative to deliveries, but much weaker than prior week |
| Canada current-week producer deliveries | 642.8 kt | Bearish movement pressure versus 479.1 kt prior week |
| Canada export/delivery ratio | 49.7% | Mild bullish disappearance against deliveries |
| Canada process/delivery ratio | 2.0% | Bearish domestic processing weakness |
| Canada crop-year producer deliveries | 22,563.7 kt | Context |
| Canada crop-year exports | 37,937.7 kt | Context, CGC week 45 is now fresh |
| Grain Monitor total unloads | 8,027 cars | Logistics context |
| Grain Monitor vs 4-week unload avg | -9% | Slight logistics drag |
| Vancouver vessels | 21 | Watch, above one-year average of 20 |
| Producer cars | 587 week cars, 63 to U.S. | Bullish movement support |
| USDA Wheat export sales | 400,844 mt net sales | New-crop demand context |
| USDA export pace vs projection | unavailable | Blocked claim |

Finding:

- CGC week 45 is now fresh: 4,411 rows imported for week ending 2026-06-14, all 16 grains present, and collector heartbeats written.
- Canada export disappearance still reads mildly bullish at 49.7% of deliveries, but the week shifted from the prior extreme export/delivery read to heavier farm deliveries and weaker current-week exports.
- U.S. export-sales pace cannot be claimed because projection pace is unavailable in the current packet.
- Movement/logistics support exists, but it should not override the balance sheet and price confirmation. Grain Monitor and producer-car rows are now refreshed; they explain execution pressure rather than decide the headline.

## Loop 4 - Start From Positioning

Reason: CFTC is useful for timing and crowding, but it should not be the main directional thesis.

Current primary CFTC Wheat row:

| Metric | Value | Read |
| --- | ---: | --- |
| Primary CFTC market | WHEAT-HRSpring |
| Report date | 2026-06-16 |
| Managed money long | 20,344 |
| Managed money short | 14,192 |
| Net | +6,152 contracts |
| Weekly net change | -3,804 contracts |

Finding:

- Primary HRSpring net is still long, but less long week over week.
- SRW is heavily net short at -69,531 contracts, while HRW is modestly net long at +7,620 contracts.
- Current mapper treats this as bearish positioning pressure.
- V2 repair: positioning should be a timing/crowding modifier, not a standalone direction creator. A crowded SRW short can cap bearish conviction; spring-wheat long liquidation can explain why a bullish supply story is not lifting price.

## Loop 5 - Start From Grok/Hermes Pulse

Reason: X pulse can identify field reports, export rumors, Black Sea weather chatter, and logistics leads before official data catches up.

Current access:

- Hermes terminal path works: xAI OAuth, model `grok-4.3`, x_search tool available.
- Grok CLI path is blocked: auth expired, no `XAI_API_KEY`.
- `grok-composer-2.5-fast` is referenced in recovery scripts, but not currently callable because the Grok CLI credential gate fails.

No-write pulse artifact:

- Run date: 2026-06-23
- Mode: daily_pulse
- Runner: Hermes terminal
- Write mode: false
- Price snapshot: fresh
- Raw signals: 0
- Accepted signals: 0
- Reviewer verdict: insufficient_artifacts

Finding:

- Pulse adds no Wheat evidence today.
- It should show as a quiet/watch lane, not as a bearish or bullish pressure card.
- The board should avoid numeric-looking watch pressure unless an accepted signal is tied to an official row or explicit desk review.

## Current Relationship Model

```text
Supply/weather
  U.S. crop stress strong bull
  Canada moisture support neutral/bear
  WASDE/stocks strong bear

Demand/export
  Canada export pull mild bull with fresh CGC week 45
  U.S. export pace blocked

Movement/logistics
  Producer cars supportive
  Unloads slightly below 4-week avg
  Vancouver lineup watch, not decisive

Price/FX
  All available Wheat contracts down
  Price confirms bear pressure, not bull stress

Positioning
  Funds still net long spring wheat but liquidating
  Timing/crowding risk, not primary direction

Pulse
  No accepted signal today
  Watch-only

One Wheat read
  Lean bear / balanced-to-bear until crop stress is confirmed by price, demand, or a fresher supply shock
```

## Rating System Recommendation

Use one canonical Wheat judge for both the headline and the visual lane bars:

| Lane | Weight | V1 role |
| --- | ---: | --- |
| Supply/weather | 30% | Main production and balance-sheet driver |
| Demand/export flow | 25% | Confirms whether grain is disappearing |
| Movement/logistics | 15% | Determines whether demand can be executed |
| Price/FX/basis | 15% | Confirms or rejects the source read |
| Positioning/timing | 10% | Crowding, liquidation, short-cover risk |
| Watch leads | 0% | Review priority only |

Important: the first score mismatch is repaired for Wheat weekly packets.

- The visible Wheat weekly stance now uses the deterministic rating scorecard when a Wheat scorecard is populated.
- Bull/bear driver counting remains useful explanation copy, but it no longer sets the Wheat weekly headline score.
- Daily overlays remain visibly separate because they are current-day ticks, not a rebuild of the weekly lane scorecard.

V1 implementation repair status:

1. Done: make the deterministic rating scorecard the source of the Wheat weekly headline score.
2. Done: render daily overlays as a separate current-day tick unless they rebuild lane contributions.
3. Done in the mapper: change Wheat price from "latest row wins" to a Wheat price basket.
4. Done as a first UI pass: add a reconciliation judge that explains the deciding datum when evidence is mixed.
5. Done as a first UI pass: expose the Spring Wheat / HRW / SRW price split visually.
6. Standing boundary: keep X pulse as watch-only until accepted and tied to official/admitted market data.

## Current Confidence

High confidence:

- Metric universe is identified.
- Data access is proven for official packets, CGC week 45, price/FX, and Hermes no-write pulse.
- The relationship map is directionally sound.

Medium confidence:

- Current Wheat read. Price, CGC, Grain Monitor, producer cars, CFTC, crop progress, and WASDE are now refreshed/strong enough for the mechanical spine. U.S. export sales and quarterly stocks still cap confidence until their next official release windows.

Low confidence:

- Local cash/basis read. `posted_prices` is empty and `sk_cash_prices` is only Saskatchewan provincial average context.
- Global origin competition. Current repo treats it as watch-only, but Wheat needs this for a stronger public thesis.

## Next Loop

Completed 2026-06-24: price lane repair.

- `lib/thesis/rating-domain-mappers.ts` now maps Wheat price context from a Spring Wheat / HRW / SRW basket when multiple Wheat-class futures rows are present.
- Basket agreement sets the price direction; mixed contract direction lowers confidence instead of letting one contract overrule the source-backed read.
- The 2026-06-24 handoff packet rows would score as bearish price context from the basket, not only from newest MWK26.
- Focused proof passed: `npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node`.

Completed 2026-06-24: reconciliation explanation and visual proof.

- `/thesis` now shows a `Reconciliation judge` card that selects the largest weighted scorecard datum and compares it with the strongest bull/bear offsets.
- `/thesis` now shows a `Relationship spiderweb` ring view where inner/middle/outer distance bands represent impact on the Wheat read and edge-width pills represent weighted points.
- `/thesis` now shows a `Price basket proof` strip for Spring Wheat/MGEX, HRW/KCBT, and SRW/CBOT agreement/disagreement.
- Public-copy guardrails now allow Spring Wheat as a futures contract leg while still forbidding separate Spring Wheat/Winter Wheat Bull/Bear lanes or mapping claims.

Completed 2026-06-24: stronger judge and spiderweb visual pass.

- The reconciliation judge now shows the deciding datum's source freshness, states the strongest opposite-side counterweight, and uses farmer-readable freshness copy such as `Older official row` instead of raw statuses.
- The relationship spiderweb now renders as a true node-and-edge map: Wheat in the center, bear pressure left, bull support right, numbered nodes by weighted impact, inner/middle/outer distance rings, and edge thickness tied to weighted points.
- Targeted desktop visual proof was captured at `scratch/wheat-spiderweb-section.png`; the standing browser-smoke proof also verifies the spiderweb marker is reachable and unobscured on desktop and mobile.
- This remains an explanation surface over the deterministic scorecard. It does not add new scoring authority.

Completed 2026-06-24: source freshness loop.

- Official CFTC SODA check showed all three Wheat contracts available for report date 2026-06-16; import wrote 8 rows and 9 COT heartbeat rows.
- Grain Monitor advanced to week 45 from the 2026-06-23 weekly report; total unloads are 8,027 cars, 9% below the four-week average, with 21 Vancouver vessels.
- Producer Cars advanced to week 47; Wheat week cars are 587, crop-year cars are 14,750, and destination split includes 63 U.S., 300 Pacific, and 174 Thunder Bay cars.
- Thesis packet cache refreshed 12/12 after the source updates; source freshness watchdog is green with 0 alerts and freshness watch count 15.
- Export sales dry-run confirmed the latest ALL WHEAT data is still 2026-06-11; this is waiting on the next weekly USDA release, not a parser failure.

Completed 2026-06-24: USDA relationship-read slice.

- `/thesis` now adds source-specific reconciliation judge copy so the deciding datum is interpreted by source role, not only by weighted points.
- The USDA Wheat sweep now shows a visible relationship chain: Condition signal -> Balance anchor -> Demand confirmation -> Inventory check -> Price confirmation.
- Each USDA card now carries a `Decision role` block that explains how Crop Progress, WASDE, Export Sales, and Quarterly Stocks should affect the Wheat read.
- This remains an explanation surface over the existing scorecard; it adds no score authority and does not change data weights.

Next loop should start from source-specific Wheat data depth:

- Use the enhanced USDA Wheat source-sweep panel as the visible source inventory, then verify Crop Progress, WASDE, Export Sales, and quarterly stocks against live packets and historical context.
- Verify the repaired price basket against the live packet on `/thesis`, then add historical contract context so Spring Wheat, HRW, and SRW disagreement is easy to interpret.
- Refine the reconciliation judge's source-specific explanation patterns after the visible USDA sweep is verified, especially where crop stress fights balance-sheet or price confirmation.
- Decide whether spiderweb distance should remain pure weighted-score impact or also incorporate source authority, freshness, and replay accuracy.
- Rerun the relationship loop after the next official export-sales and stocks rows update.

## Closeout And Next Goal

The next session handoff is `docs/plans/2026-06-24-wheat-thesis-goal-handoff.md`.

Do not restart from UI mockups. Start from the scoring and relationship problem:

- visible USDA source-sweep verification and historical context
- live verification and visual surfacing of the repaired Wheat price basket across Spring Wheat, HRW, and SRW
- one canonical Wheat judge for headline score and lane bars
- relationship-spiderweb v2 where distance can separate source authority, freshness, replay accuracy, and score impact if the next loop proves that improves the read
- Hermes/Grok pulse remains watch-only unless tied back to official or admitted market data
