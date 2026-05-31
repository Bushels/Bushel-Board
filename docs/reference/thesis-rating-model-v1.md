# Thesis Rating Model V1

Purpose: define how Bushel Board should turn admitted source facts into a transparent bull/bear rating before any LLM writes farmer-facing prose.

This is a planning and source-admission contract, not a deployed scoring engine yet.

Use with:

- `docs/reference/data-lineage-map.md` - where data starts and where it appears.
- `docs/reference/source-registry.md` - which sources are admitted and how fresh they should be.
- `docs/reference/canonical-grain-fact-model.md` - shared fact shape and quality fields.
- `docs/reference/cgc-market-mechanics-v1.md` - Canadian CGC movement accounting and guardrails.

## Core Rule

The rating must be explainable from source rows and derived metrics. The LLM may summarize and challenge the scorecard, but it must not secretly invent the score.

```text
source rows
  -> canonical facts
  -> derived metrics
  -> domain signal scores
  -> freshness / quality adjustments
  -> transparent bull-bear rating
  -> LLM-written thesis explanation
```

A farmer-facing thesis can say "bullish", "bearish", or "balanced" only after the scorecard shows:

1. which signal domains contributed,
2. which sources supported each signal,
3. which sources were stale, missing, partial, or proxy-mapped,
4. where the major conflicts are.

## V1 Scope

The V1 board only covers source-backed lanes:

- Corn
- Soybeans
- Wheat
- Durum
- Canola
- Barley
- Oats

Parked until class-safe mapping exists:

- Spring Wheat
- Winter Wheat

Excluded until explicitly reopened:

- pulses, flax, rye, mustard, canaryseed, chickpeas, sunflower, beans,
- US rice/cotton,
- Kalshi / prediction-market feedback into the thesis,
- unadmitted social/weather/local-cash sources.

## Score Shape

Each grain-country scorecard should produce this shape before prose:

```text
grain
lane: canada | us | cross_border
period_anchor
source_watermark
overall_score: -100..100
overall_label: strong_bear | bear | lean_bear | balanced | lean_bull | bull | strong_bull
confidence_score: 0..100
confidence_label: high | medium | low
domains[]
contradictions[]
quality_adjustments[]
missing_required_sources[]
llm_allowed_claims[]
llm_blocked_claims[]
```

The overall score is directional conviction. It is not price prediction precision.

Recommended label bands:

| Overall score | Label |
| --- | --- |
| `>= 70` | Strong bull |
| `30..69` | Bull |
| `10..29` | Lean bull |
| `-9..9` | Balanced |
| `-29..-10` | Lean bear |
| `-69..-30` | Bear |
| `<= -70` | Strong bear |

## Domain Signal Model

Each domain returns:

```text
domain
score: -100..100
weight: 0..1
weighted_score
confidence: high | medium | low
freshness_status: strong | watch | stale | empty | partial | expected_lag
sources[]
positive_evidence[]
negative_evidence[]
blocked_claims[]
```

### V1 Domain Weights

Initial weights should be boring and auditable. Do not optimize until we have replay/evaluation evidence.

| Domain | Canada weight | US weight | Reason |
| --- | ---: | ---: | --- |
| Supply / balance sheet | 0.20 | 0.25 | Sets crop-year denominator and stocks pressure. |
| Demand / disappearance | 0.25 | 0.25 | Export/domestic pull is central to old-crop pricing. |
| Movement / pipeline | 0.20 | 0.10 | CGC weekly flow is strongest for Canada; weaker direct equivalent in US V1. |
| Logistics | 0.10 | 0.05 | Explains movement friction; rarely proves price direction alone. |
| Price / basis / spreads | 0.15 | 0.15 | Confirms market response; basis remains weak until local cash is admitted. |
| Positioning | 0.05 | 0.10 | Useful pressure/context; COT is lagged and sometimes proxy-mapped. |
| Weather / crop condition | 0.05 | 0.10 | More important during growing season; lower outside active risk windows. |
| Farmer/local behavior | 0.00 | 0.00 | Parked for public V1 until privacy and local-data thresholds are defined. |

Weights should renormalize across admitted domains only when a domain is structurally absent for that lane. They should not renormalize across stale or failed sources; stale/failed sources should reduce confidence.

## Source-to-Domain Map

| Source ID / table | Domain | Signal role | Mapping rule |
| --- | --- | --- | --- |
| `cgc_weekly_stats` / `cgc_observations` | Movement / pipeline, demand, commercial stocks | Canada movement anchor | Direct for mapped CGC grains only. Use CGC formulas from `cgc-market-mechanics-v1.md`. |
| `cgc_producer_cars` / `producer_car_allocations` | Logistics, farmer-direct movement | Direct rail pressure and destination context | Context source; do not infer whole rail-service state alone. |
| `grain_monitor_weekly` / `grain_monitor_snapshots` | Logistics | Corridor, vessel, unload, port context | Context source with natural lag label. |
| `aafc_statscan_supply` / `supply_disposition` | Supply / balance sheet | Crop size, total supply, carryout, stocks-to-use | Direct when release date, crop year, and unit are present. |
| `canada_crop_progress` | Weather / crop condition | Prairie seeding/condition state | Partial until MB+SK+AB are complete or missing province is explicitly stale/missing. |
| `usda_crop_progress` | Weather / crop condition, supply risk | US planting/harvest/condition | Direct for US commodities where NASS mapping is explicit. |
| `usda_export_sales` | Demand | Export sales and projection pace | Direct only when commodity code, market year, units, and WASDE denominator pass admission. |
| `usda_wasde` | Supply / balance sheet, demand | Monthly balance sheet and revisions | Direct for mapped commodities; revision deltas should be shown separately from latest level. |
| `usda_quarterly_stocks` | Supply / balance sheet | Measured stocks surprise / inventory level | Direct for all-wheat/corn/soybeans/barley/oats where unit conversion is locked. |
| `cftc_cot` | Positioning | Fund/commercial pressure | Direct or proxy by contract. Proxy labels must be visible. |
| `grain_prices` | Price / basis / spreads | Futures price follow-through and cross-market confirmation | Direct by contract only; Canada/US comparisons need FX and unit normalization. |
| `fx_rates` | Price / basis / spreads | Currency translation | Context only, not standalone thesis evidence. |
| `posted_prices` | Price / basis / spreads | Local cash/basis | Parked until rows exist and source/area cadence is defined. |
| `crop_plans`, `crop_plan_deliveries` | Farmer/local behavior | Farmer inventory and delivery behavior | Parked for public V1; private/premium use requires privacy thresholds. |
| `x_market_signals` | Sentiment | Market chatter | Archive only until direct X API v2 lane and provenance are rebuilt. |
| `kalshi` | Validation | Prediction-market comparison | Validation only; must not feed thesis score or training candidates in V1. |

## Domain Scoring Guidelines

These are first-pass deterministic rules. They should be implemented as small helper functions with tests before any model optimization.

### 1. Supply / Balance Sheet

Bullish evidence:

- production, yield, or acreage below prior estimate or market expectation,
- ending stocks or stocks-to-use tighter than prior report,
- quarterly stocks below expected/use pace,
- crop condition below average during active growing season.

Bearish evidence:

- production, yield, or acreage above prior estimate or market expectation,
- ending stocks or stocks-to-use looser than prior report,
- quarterly stocks above expected/use pace,
- crop condition above average during active growing season.

Guardrails:

- A large crop is not automatically bearish if demand is also accelerating.
- Annual/quarterly data can set the denominator, but weekly flow outranks it for "what is happening now" movement claims.
- Projection changes and latest levels are different signals; do not blend them without showing both.

### 2. Demand / Disappearance

Bullish evidence:

- export sales or shipments running ahead of seasonal pace,
- CGC export movement ahead of prior year / recent average,
- domestic processing/crush/use above seasonal pace,
- WASDE exports/use revised higher.

Bearish evidence:

- sales or shipments running behind pace,
- cancellations or weak outstanding sales,
- domestic processing below seasonal pace,
- WASDE exports/use revised lower.

Guardrails:

- CGC exports are movement, not sales.
- USDA export sales are commitments/shipments, not final price response.
- Barley/Oats projection pace stays null unless importer-level admission passes commodity/year/month/unit and 60-140% reasonableness checks.

### 3. Movement / Pipeline

Bullish evidence:

- commercial stocks drawing while exports/process use are active,
- pipeline velocity strong relative to normal and not just forced deliveries,
- terminal receipts converting into exports without excess stock build.

Bearish evidence:

- producer deliveries high while exports/process are weak,
- commercial stocks building with weak disappearance,
- terminal receipts exceed exports persistently with logistics warnings.

Guardrails:

- Deliveries rising only proves grain entered licensed channels.
- It does not prove farmer panic selling, basis improvement, or farm inventory exhaustion.
- Missing worksheet weeks must forward-fill cumulative series; do not treat missing as zero.

### 4. Logistics

Bullish evidence:

- logistics improving after prior bottleneck while demand remains strong,
- producer-car/direct flows support export movement,
- port/vessel/unload metrics confirm capacity to execute demand.

Bearish evidence:

- corridor friction blocks otherwise strong demand,
- vessel/unload/port metrics show accumulating delays,
- producer-car allocation/shipment mismatch suggests movement friction.

Guardrails:

- Grain Monitor lags CGC; expected lag should reduce freshness but not automatically invalidate the source.
- Logistics explains why movement can be delayed; it rarely proves standalone bull/bear direction.

### 5. Price / Basis / Spreads

Bullish evidence:

- futures price confirms stronger fundamental signal,
- inverse/spread strength if spread data is admitted,
- local basis strength after local cash source admission.

Bearish evidence:

- futures fails to confirm supportive fundamentals,
- carry/spread weakness if admitted,
- basis weakness after local cash source admission.

Guardrails:

- Futures prices can be stale on weekends/holidays.
- Canada/US price comparisons require FX and unit normalization.
- Do not make basis claims from empty `posted_prices`.

### 6. Positioning

Bullish evidence:

- funds covering shorts / adding longs while fundamentals improve,
- commercial behavior confirms physical tightness where available.

Bearish evidence:

- funds adding shorts / liquidating longs while fundamentals weaken,
- crowded long vulnerable to bearish catalyst.

Guardrails:

- COT is Tuesday data released Friday; it is stale by design.
- Contract-to-grain mapping must be direct/proxy-labelled.
- Wheat-class COT must not be silently collapsed into generic wheat-class board rows.

### 7. Weather / Crop Condition

Bullish evidence:

- delayed seeding, poor condition, drought/excess moisture during yield-sensitive windows,
- Canada + US condition stress aligning for comparable crops.

Bearish evidence:

- fast planting, strong condition, improved moisture during key windows,
- broad favorable conditions across major regions.

Guardrails:

- Partial Prairie packages must say partial until Alberta lands or is explicitly stale/missing.
- Weather is seasonal. Outside growing season, lower its weight unless it affects logistics or harvest.
- Derived satellite/weather proxies require separate source admission.

### 8. Farmer / Local Behavior

Public V1 weight is zero.

Allowed only after privacy/source gates:

- sufficient farmer count for peer comparison,
- no small-cell exposure,
- local geography labels,
- source cadence and failure modes defined,
- clear split between private/premium personalization and public market thesis.

## Interaction Rules

Interactions are where the real rating quality comes from. V1 should explicitly surface these, not hide them.

| Interaction | Bullish interpretation | Bearish interpretation | Required sources |
| --- | --- | --- | --- |
| Tight supply + strong demand | High-conviction bull | n/a | Supply + demand |
| Big supply + weak demand | n/a | High-conviction bear | Supply + demand |
| Strong exports + falling commercial stocks | Physical pull may be tightening pipeline | n/a | CGC exports + stocks or USDA sales/stocks |
| Strong deliveries + weak disappearance | Farmer/commercial supply pressure | Bearish unless price/logistics explain it | CGC deliveries + exports/process |
| Strong demand + logistics friction | Bullish demand exists but execution risk caps score | Bearish if delays create backlog and price weakens | Demand + logistics + price |
| Bullish fundamentals + bearish price | Divergence; lower confidence until price confirms | Market may know something model misses | Fundamentals + price |
| Bearish fundamentals + bullish price | Divergence; check positioning/weather/macro | Lower conviction bearish | Fundamentals + price |
| Bullish fundamentals + crowded long | Bull case vulnerable to liquidation | n/a | Fundamentals + COT |
| Bearish fundamentals + crowded short | Short-covering risk caps bear score | n/a | Fundamentals + COT |
| Canada/US same direction | Cross-border confirmation | Cross-border pressure | Canada + US mapped packets |
| Canada/US split | Local basis/regional opportunity, lower broad conviction | Same | Canada + US mapped packets |

## Freshness and Quality Adjustments

Overall confidence starts from source/domain confidence. Directional score should not be over-penalized for known expected lag, but confidence must be.

Suggested confidence adjustments:

| Condition | Confidence adjustment | Direction adjustment |
| --- | ---: | ---: |
| Required direct source fresh/strong | `0` | `0` |
| Expected-lag source but within normal cadence | `-5` | `0` |
| Source stale beyond cadence | `-15` | reduce affected domain score by 25% |
| Source empty where required | `-25` | affected domain score = 0 |
| Partial province/region package | `-10` | reduce affected domain score by 30% |
| Proxy mapping | `-10` | reduce affected signal score by 20% |
| Missing source_run / no freshness proof | `-15` | reduce affected domain score by 20% |
| Conflicting high-quality domains | `-5 to -15` | no automatic direction change; record contradiction |
| Formula uses fallback approximation | `-10` | reduce affected signal score by 15% |

Hard blockers:

- no admitted source for the domain but domain contributes non-zero score,
- stale/empty source used without warning,
- unit conversion not documented,
- proxy mapping hidden from UI/prose,
- LLM claim not tied to a source row or scorecard field.

## Insufficient Data Rules

The model must return `insufficient_data` instead of a bull/bear score when:

1. no fresh direct source exists for the primary domain of the lane,
2. the only evidence is proxy/social/unadmitted local data,
3. source units or dates cannot be reconciled,
4. the grain-class mapping is unresolved,
5. mandatory freshness proof is missing for a new source.

For parked Spring/Winter Wheat, the correct output is no board row, not a low-confidence generic wheat rating.

## LLM Boundary

The LLM may:

- explain the scorecard in farmer-readable language,
- point out contradictions,
- propose watch items for next collector run,
- challenge whether deterministic score weights overstate a signal.

The LLM must not:

- invent new source facts,
- change the numeric score without emitting a structured override reason,
- convert a proxy signal into a direct claim,
- make basis/weather/farmer-inventory claims from empty or unadmitted sources,
- publish a recommendation when the scorecard is `insufficient_data`.

## Example: Canada Canola V1 Skeleton

```text
grain: Canola
lane: canada
period_anchor: 2025-2026 wk NN
overall_score: computed after domains
confidence_score: computed after freshness

Supply / balance sheet:
  sources: aafc_statscan_supply, canola_council_markets_stats inventory-only
  use: total supply, production, seeded acres, carryout

Demand / disappearance:
  sources: cgc_weekly_stats
  use: exports, process deliveries, milled/manufactured grain

Movement / pipeline:
  sources: cgc_weekly_stats
  use: producer deliveries, commercial stocks, terminal receipts/exports

Logistics:
  sources: grain_monitor_weekly, cgc_producer_cars
  use: port/rail context, direct farmer rail pressure

Price:
  sources: grain_prices, fx_rates
  use: ICE Canola and related oilseed contracts with labels

Positioning:
  sources: cftc_cot
  use: canola direct/proxy as admitted

Weather:
  sources: canada_crop_progress during season
  use: Prairie status only after MB/SK/AB package status is clear
```

## Example: US Corn V1 Skeleton

```text
grain: Corn
lane: us
period_anchor: market_year YYYY

Supply / balance sheet:
  sources: usda_wasde, usda_quarterly_stocks, usda_crop_progress

Demand:
  sources: usda_export_sales, usda_wasde

Movement / pipeline:
  sources: none direct in V1
  status: structurally absent, do not infer from Canada CGC

Logistics:
  sources: none direct in V1
  status: structurally absent

Price:
  sources: grain_prices, fx_rates when cross-border normalized

Positioning:
  sources: cftc_cot

Weather:
  sources: usda_crop_progress during season
```

## Implementation Preference

Build this in three stages:

1. schema + docs only,
2. deterministic domain score helpers with tests,
3. UI scorecard/audit surface,
4. only then allow LLM thesis prose to consume the scorecard.

Do not add new data sources as part of this work. The point is to understand and weight the current admitted spine first.
