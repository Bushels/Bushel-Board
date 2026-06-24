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
| Grain Monitor total unloads | 9,389 cars | Logistics context |
| Grain Monitor vs 4-week unload avg | -7% | Slight logistics drag |
| Vancouver vessels | 18 | Watch, near pressure threshold |
| Producer cars | 540 week cars, 63 to U.S. | Bullish movement support |
| USDA Wheat export sales | 400,844 mt net sales | New-crop demand context |
| USDA export pace vs projection | unavailable | Blocked claim |

Finding:

- CGC week 45 is now fresh: 4,411 rows imported for week ending 2026-06-14, all 16 grains present, and collector heartbeats written.
- Canada export disappearance still reads mildly bullish at 49.7% of deliveries, but the week shifted from the prior extreme export/delivery read to heavier farm deliveries and weaker current-week exports.
- U.S. export-sales pace cannot be claimed because projection pace is unavailable in the current packet.
- Movement/logistics support exists, but it should not override stale CFTC, Grain Monitor, and producer-car warnings.

## Loop 4 - Start From Positioning

Reason: CFTC is useful for timing and crowding, but it should not be the main directional thesis.

Current primary CFTC Wheat row:

| Metric | Value | Read |
| --- | ---: | --- |
| Primary CFTC market | WHEAT-HRSpring |
| Report date | 2026-06-09 |
| Managed money long | 22,280 |
| Managed money short | 12,324 |
| Net | +9,956 contracts |
| Weekly net change | -8,400 contracts |

Finding:

- Net is still long, but funds liquidated heavily week over week.
- Current mapper treats this as bearish positioning pressure.
- V2 repair: positioning should be a timing/crowding modifier, not a standalone direction creator. A crowded short can cap bearish conviction; liquidation can explain why a bullish supply story is not lifting price.

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

Important: the current product has a two-score problem.

- The visible stance is still based mainly on bull/bear driver counting.
- The lane bars come from the deterministic rating scorecard.
- Those can disagree.

V1 implementation repair:

1. Make the deterministic rating scorecard the source of the headline score.
2. Add a small reconciliation judge that chooses the deciding datum when evidence is mixed.
3. Render daily overlays as a separate "daily tick" unless they rebuild lane contributions.
4. Change Wheat price from "latest row wins" to a Wheat price basket or three-contract visual.
5. Keep X pulse as watch-only until accepted and tied to official/admitted market data.

## Current Confidence

High confidence:

- Metric universe is identified.
- Data access is proven for official packets, CGC week 45, price/FX, and Hermes no-write pulse.
- The relationship map is directionally sound.

Medium confidence:

- Current Wheat read. Price and CGC are now fresh, but Grain Monitor, CFTC, producer cars, and U.S. export-sales freshness still cap confidence.

Low confidence:

- Local cash/basis read. `posted_prices` is empty and `sk_cash_prices` is only Saskatchewan provincial average context.
- Global origin competition. Current repo treats it as watch-only, but Wheat needs this for a stronger public thesis.

## Next Loop

Completed 2026-06-24: price lane repair.

- `lib/thesis/rating-domain-mappers.ts` now maps Wheat price context from a Spring Wheat / HRW / SRW basket when multiple Wheat-class futures rows are present.
- Basket agreement sets the price direction; mixed contract direction lowers confidence instead of letting one contract overrule the source-backed read.
- The 2026-06-24 handoff packet rows would score as bearish price context from the basket, not only from newest MWK26.
- Focused proof passed: `npx vitest run lib/__tests__/thesis-rating-domain-mappers.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node`.

Next loop should start from score reconciliation:

- Verify the repaired price basket against the live packet on `/thesis`.
- Make the deterministic rating scorecard the headline source of truth.
- Add a reconciliation judge that explains which datum is deciding when the score is mixed.
- Improve the Wheat pressure map so distance from the Wheat read and edge thickness visibly communicate impact.

Then start from source freshness:

- Refresh CFTC if a newer report is available.
- Refresh Grain Monitor and producer cars.
- Rerun the relationship loop after those official rows update.

## Closeout And Next Goal

The next session handoff is `docs/plans/2026-06-24-wheat-thesis-goal-handoff.md`.

Do not restart from UI mockups. Start from the scoring and relationship problem:

- full USDA Wheat metric sweep
- live verification and visual surfacing of the repaired Wheat price basket across Spring Wheat, HRW, and SRW
- one canonical Wheat judge for headline score and lane bars
- relationship spiderweb polish where distance and edge weight show source authority and score impact
- Hermes/Grok pulse remains watch-only unless tied back to official or admitted market data
