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

Current status, 2026-05-03:

- Items 1-5 are in place at the data-layer level.
- The validator passes for Canola after live migration apply.
- `source_runs` is live but empty until collectors write run summaries.
- The deterministic Canola read generator is not built yet.

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
