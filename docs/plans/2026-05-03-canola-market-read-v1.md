# Canola Market Read V1

Date: 2026-05-03

Goal: make Canola the first complete Bushel Board grain-intelligence pilot. The first output is not another dashboard card. It is a source-traceable weekly market read that separates facts, interpretation, speculation, and farmer action.

## Product Shape

```text
source registry
  -> canola thesis packet
  -> deterministic market read skeleton
  -> LLM polish only after validation
  -> UI / public post
```

## V1 Question

For canola, answer four farmer questions:

1. What changed this week?
2. Is the commercial system pulling grain harder or backing off?
3. Is demand absorbing farmer deliveries or building pressure?
4. What should a farmer watch before pricing or hauling?

## Required Inputs

| Lane | Required Source | Required Fact Class | V1 Rule |
| --- | --- | --- | --- |
| Supply | AAFC / Statistics Canada supply-disposition | Production, carry-in, total supply, carry-out | Use only if source label and crop year are visible. Mark stale if update path is not current. |
| Movement | CGC weekly stats | Producer deliveries, shipments, exports, stocks | Must use documented producer-delivery and export formulas. |
| Logistics | Grain Monitor + CGC Producer Cars | Terminal pressure, unloads, vessel timing, producer car allocations | Carry lag explicitly. Do not smooth Grain Monitor lag away. |
| Prices | Futures/price feed | Recent price direction and contract context | Use as follow-through, not as the only thesis driver. Mark stale if no current sample. |
| Positioning | CFTC / mapped positioning | Fund/commercial pressure where mapping is direct or labelled proxy | If mapping is not direct, show `proxy_mapping` rather than pretending certainty. |
| Weather | Not v1 unless source registry says ready | Production/seeding/harvest risk | Show unavailable until the source, station/region mapping, and horizon are defined. |
| Cash basis | Not v1 unless posted/local prices exist | Farmer cheque relevance | Show unavailable; do not imply local basis from futures. |

## Output Contract

The market read must have these sections:

```text
headline
bottom_line
what_changed
facts
interpretation
speculation
farmer_watch_items
freshness
quality_warnings
source_links
```

Rules:

1. `facts` contains only numbers with source references.
2. `interpretation` explains what the facts mean.
3. `speculation` is labelled and must state the trigger that would prove or disprove it.
4. `farmer_watch_items` is practical, but not personal financial advice.
5. `freshness` lists every Tier 1 source used, its latest period, and stale/current status.
6. `quality_warnings` must be visible if any required source is stale, missing, proxy-mapped, or lagged.

## Canola Fact Packet

The first implementation should read from:

```text
get_canada_thesis_packet('Canola', '<crop_year>', <grain_week>)
get_thesis_data_freshness('Canola', null)
```

Those RPCs are part of Data Layer Foundation V1 and are not live until the migrations deploy.

If the RPC is unavailable, the market read must fail closed with:

```text
status: unavailable
reason: data_layer_not_deployed
```

Do not fall back to stale `market_analysis` prose as if it were source truth.

## First Deterministic Skeleton

Before using an LLM, generate a mechanical read:

```text
Headline: Canola market read unavailable until source freshness validates
Bottom line: No recommendation.
What changed: derived from packet deltas only.
Facts: packet facts only.
Interpretation: template rules only.
Speculation: none unless trigger is explicit.
Watch items: source freshness, delivery pace, export pace, logistics pressure, price follow-through.
```

This keeps the first output boring but correct. The LLM can improve tone later.

## Acceptance Criteria

Canola Market Read V1 is done when:

1. Source registry exists and names every source used.
2. Canonical fact model exists and defines identity/time/unit/source rules.
3. Data Layer Foundation migrations are live.
4. `npx tsx scripts/validate-data-layer-foundation.ts --grain Canola` passes against Supabase.
5. Canola packet returns facts, freshness, and quality warnings.
6. The read shows unavailable/stale sources instead of hiding them.
7. No new weather, cash-bid, satellite, AIS, or social-data lane is added before this works.

Current status, 2026-05-04:

- Items 1-7 are in place for the deterministic, non-LLM layer.
- The validator passes for Canola after live migration apply.
- `source_runs` is live but empty until collectors write run summaries.
- The deterministic generator is built in `lib/canola-market-read.ts` and `scripts/generate-canola-market-read.ts`.
- `npm run canola-market-read -- markdown` renders the required sections from `get_canada_thesis_packet('Canola', ...)`, including empty/stale/lagged/proxy warnings.
- No LLM thesis writer or new source lane has been added.

## Next Source Admission Order

This is the next-session order for making the deterministic Canola read more complete. It is intentionally source-first, not UI-first.

1. Producer Cars / railcar staging: verify `scripts/import-producer-cars.mjs`, current table freshness, and whether the packet/RPC exposes the right producer-car facts. Treat as logistics context beside CGC, not as a replacement for weekly CGC movement.
2. CFTC COT: verify `collect-cftc-cot.py`, the `import-cftc-cot` Edge Function, `cftc_cot_positions`, and `get_cot_positioning()`. Canola direct ICE rows should be labelled direct; soybean oil/meal rows stay proxy/context.
3. Crop-size baseline: seed or update the Canola 2025 final production/yield/seeded acres/harvested acres and the 2026 intended seeded acres from Statistics Canada Table 32-10-0359-01. These values set the denominator for pace, supply, and stocks-to-use math.
4. Supply/disposition: refresh the AAFC / Statistics Canada supply row and make the source date visible in the packet. If AAFC forecasts and Statistics Canada final production differ, preserve both and label forecast vs final.
5. Canola Council Markets & Stats: inventory and scrape only after each table's upstream source, update date, period, and unit are captured. Useful pages include production, supply/disposition, processing, exports, and top markets.
6. Price and FX context: fix thin/stale `grain_prices` before using futures as follow-through. Keep CAD/USD translation as context, not a standalone thesis.
7. Weather, drought, satellite, cash bids, AIS, Kalshi, and social lanes remain out of Canola V1 until individually admitted in the source registry.

Primary public values to seed first:

| Metric | Value | Source / period |
| --- | --- | --- |
| 2025 final canola production | 21.804 million tonnes | Statistics Canada final 2025 production release, 2025-12-04 |
| 2025 final canola yield | 44.7 bu/ac | Statistics Canada final 2025 production release, 2025-12-04 |
| 2025 final seeded acres | 21.617 million acres | Canola Council production page citing Statistics Canada Table 32-10-0359-01 |
| 2025 final harvested acres | 21.490 million acres | Canola Council production page citing Statistics Canada Table 32-10-0359-01 |
| 2026 intended seeded acres | 21.839 million acres | Statistics Canada seeding-intentions release, 2026-03-05 |

## Public-Facing Bar

Canola is the public credibility pilot. Any chart, post, or thesis from this read must preserve:

```text
number
unit
period
source
scope
lag
confidence
```

If one of those is missing, it is not ready for X, LinkedIn, or farmer-facing UI.
