# Thesis Rating Model V1

Purpose: define how Bushel Board turns admitted source facts into a transparent bull/bear rating before any LLM writes farmer-facing prose.

Status as of 2026-06-03: V1 is implemented as a deterministic parallel scorecard/audit layer. The core code lives in `lib/thesis/rating-model.ts`, `lib/thesis/rating-domain-mappers.ts`, `lib/thesis/grain-impact-map.ts`, `lib/thesis/grain-data-coverage.ts`, `lib/thesis/scorecard-llm-guardrails.ts`, and `lib/queries/thesis-board.ts`; audit details render only on `/thesis?audit=1`. The scorecard does not replace visible farmer-facing stance fields yet.

Use with:

- `docs/reference/data-lineage-map.md` - where data starts and where it appears.
- `docs/reference/source-registry.md` - which sources are admitted and how fresh they should be.
- `docs/reference/canonical-grain-fact-model.md` - shared fact shape and quality fields.
- `docs/reference/cgc-market-mechanics-v1.md` - Canadian CGC movement accounting and guardrails.
- `docs/reference/grain-impact-mind-map-v1.md` - grain-specific impact factors, substitutes, seasonal gates, and admitted/watch/parked source boundaries.

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

As of 2026-06-03, `lib/thesis/grain-impact-domain-weights.ts` applies a small grain-specific tilt on top of these base lane weights before normalization. The tilt is derived from `lib/thesis/grain-impact-map.ts`:

- `official_thesis_input` impact factors can increase that domain's weight by `0.12`, capped at `0.30` per domain.
- `price_context` factors can increase that domain's weight by `0.10`, capped inside the same per-domain limit.
- `watch_only` and `parked` factors do not move the deterministic score. They stay visible in audit/mind-map surfaces until a source is admitted.

This means Canola can weight admitted demand/logistics/soy-complex context differently from Wheat, Corn, or Durum without admitting new sources or letting global/watch chatter become a thesis fact.

As of 2026-06-03, the impact map also carries explicit global competitor factors for Canola, Wheat, Durum, Barley, Oats, Corn, and Soybeans. These factors may cite `usda_wasde_raw` for broad monthly WASDE/PSD world-balance context, but they remain `watch_only` unless the specific country/origin/policy/tender/customs/freight/quality source is admitted and mapped. They do not add deterministic score weight.

As of 2026-06-03, each grain profile also carries audit-only `marketResponses[]` rules. These rules describe how to interpret combinations such as official flow plus price confirmation, local bull signals capped by global competitors, feed substitution, thin liquidity, or quality/tender uncertainty. `buildScorecardLlmPayload()` exposes them as `market_response_context` in the roundtable prompt-pack guardrail JSON, alongside market shape, market structure, seasonal windows, and Viking topic hooks. They can guide LLM explanation and human review, but they do not create a new score path, allowed claim, blocked claim, or confidence override.

As of 2026-06-03, `lib/thesis/grain-data-coverage.ts` derives an audit-only coverage matrix from the same grain impact map. Each factor is classified across `pulled`, `packeted`, `scored`, `explanation_only`, and `missing` checkpoints. `official_thesis_input` and bounded `price_context` factors are treated as score-capable lanes, `watch_only` factors are explanation-only, and parked gaps become missing-source rows. The same profile emits bounded `admissionPriorities[]`: watch-only lanes rank ahead of missing-source gaps because they already have some source footing, but each priority still carries an explicit no-score boundary until packet admission, mapper logic, freshness handling, and tests exist. The `/thesis?audit=1` panel uses this matrix to show what is already connected versus what still needs source admission; normal `/thesis` stays farmer-facing.

## Source-to-Domain Map

| Source ID / table | Domain | Signal role | Mapping rule |
| --- | --- | --- | --- |
| `cgc_weekly_stats` / `cgc_observations` | Movement / pipeline, demand, commercial stocks | Canada movement anchor | Direct for mapped CGC grains only. Use CGC formulas from `cgc-market-mechanics-v1.md`. |
| `cgc_producer_cars` / `producer_car_allocations` | Logistics, farmer-direct movement | Direct rail pressure and destination context | Context source; do not infer whole rail-service state alone. |
| `grain_monitor_weekly` / `grain_monitor_snapshots` | Logistics | Corridor, vessel, unload, port context | Context source with natural lag label. |
| `aafc_statscan_supply` / `supply_disposition` | Supply / balance sheet | Crop size, total supply, carryout, stocks-to-use | Direct when release date, crop year, and unit are present. |
| `canada_crop_progress` | Weather / crop condition | Prairie seeding/condition/timing/moisture state | Partial until MB+SK+AB are complete or missing province is explicitly stale/missing; condition rows score only when the packet contains official `condition_good_excellent_pct` rows; Saskatchewan development group rows can score only as capped proxy timing evidence for mapped public grains; AB All Crops and SK Cropland moisture rows can score only as capped broad moisture proxy evidence for mapped Prairie grains. |
| `usda_crop_progress` | Weather / crop condition, supply risk | US planting/harvest/condition | Direct for US commodities where NASS mapping is explicit. |
| `usda_export_sales` | Demand | Export sales and projection pace | Direct only when commodity code, market year, units, and WASDE denominator pass admission. |
| `usda_wasde` | Supply / balance sheet, demand | Monthly balance sheet and revisions | Direct for mapped commodities; revision deltas should be shown separately from latest level. |
| `usda_quarterly_stocks` | Supply / balance sheet | Measured stocks surprise / inventory level | Direct for all-wheat/corn/soybeans/barley/oats where unit conversion is locked. |
| `cftc_cot` / `cftc_cot_positions` | Positioning | Fund/commercial pressure | Score only `mapping_type = primary` rows in V1. Proxy labels may be visible context, but proxy rows do not move deterministic Bull/Bear scores. |
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
- As of 2026-06-03, `lib/thesis/rating-domain-mappers.ts` scores Canada `supply_disposition` carryout <=8% of total supply as bullish supply pressure and >=18% as bearish supply pressure.
- As of 2026-06-03, the US supply mapper scores `usda_wasde_mapped` ending-stocks cuts of at least 500 kt or stocks/use <=10% as bullish, and ending-stocks raises of at least 500 kt or stocks/use >=20% as bearish.
- As of 2026-06-03, the same US supply mapper scores `usda_quarterly_stocks` surprises <=-1,000 kt or YoY stocks <=-5% as bullish, and surprises >=1,000 kt or YoY stocks >=5% as bearish. If WASDE and quarterly stocks both score, they merge into one `supply` domain instead of creating duplicate supply reads.

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
- As of 2026-06-03, `lib/thesis/rating-domain-mappers.ts` scores Canada `grain_monitor_snapshots` unloads >=15% above the four-week average as bullish logistics capacity and <=-15% as bearish movement friction.
- The same mapper scores terminal capacity >=90% or Vancouver vessel lineup >=20 vessels as bearish logistics friction.
- Canada `producer_car_allocations` can add bounded bullish context when the latest packet row has >=25 weekly cars or >=10 cars to US destinations. US logistics remains structurally outside V1 until a source is admitted.

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
- As of 2026-06-03, `lib/thesis/rating-domain-mappers.ts` scores fresh `grain_prices` moves >=0.5% as bullish price confirmation and <=-0.5% as bearish price pressure. This is optional context, not a required official thesis source.
- Barchart latest-only rows can score only as low-confidence provisional momentum; stale or missing `grain_prices` freshness blocks the price contribution instead of making a price claim.

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
- As of 2026-06-03, `lib/thesis/rating-domain-mappers.ts` scores only primary CFTC rows. Net-long plus non-negative week-over-week net change is bullish; net-short or negative week-over-week net change is bearish.

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
- As of 2026-06-03, Canada `canada_crop_progress` province seeded average <=25% scores as bullish seasonal delay risk; >=75% scores as bearish seeding-risk relief.
- As of 2026-06-03, Canada `canada_crop_progress` `condition_good_excellent_pct` rows can score during May-October only when official province-level rows are present in the packet: <=50% good/excellent or <=-8% versus the five-year average is bullish crop-stress pressure; >=75% or >=8% versus the five-year average is bearish supply-cushion pressure.
- As of 2026-06-03, Canada `canada_crop_progress` Saskatchewan `development_behind_pct` rows can add bounded proxy weather timing pressure after packet admission: >=60% behind normal adds bullish delay/timing risk, while <=25% behind normal lowers timing risk. This is low-confidence proxy evidence and applies only to mapped public lanes: Oilseeds -> Canola, Spring Cereals -> Wheat/Durum/Barley/Oats. It must not be described as crop-specific condition, quality, Spring Wheat, or Winter Wheat proof.
- As of 2026-06-03, Canada `canada_crop_progress` `soil_moisture_adequate_surplus_pct` rows can add bounded proxy weather moisture pressure during May-October after packet admission: an average <=55% adequate/surplus or <=-8% versus five-year/previous-year context adds bullish crop-stress risk; an average >=75% or >=8% versus five-year/previous-year context lowers near-term moisture stress. This is low-confidence proxy evidence and applies only to AB All Crops / SK Cropland rows mapped to Canola, Wheat, Durum/Amber Durum, Barley, and Oats. It must not be described as crop-specific condition, quality, yield, Corn, or Soybeans proof.
- Current Canada collector caveat: the table and packet path now support crop-condition, crop-development, and broad moisture proxy rows. `scripts/import-canada-crop-progress.py` imports seeded progress plus Alberta emergence, Alberta surface-soil moisture/pasture rows, Saskatchewan cropland/hayland/pasture topsoil moisture rows, and Saskatchewan crop-development group rows (`development_normal_pct`, `development_ahead_pct`, `development_behind_pct`). It does not yet emit admitted crop-specific `condition_good_excellent_pct` rows, so direct condition scoring remains dormant until official condition rows are parsed.
- As of 2026-06-03, US `usda_crop_progress` good/excellent <=50% or YoY <=-8% scores as bullish crop stress, while good/excellent >=70% or YoY >=8% scores as bearish supply cushion during April-November.
- US planting pace `planted_pct_vs_avg` <=-5% scores as bullish delay risk; >=5% scores as bearish planting comfort during the active crop-progress window.

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
