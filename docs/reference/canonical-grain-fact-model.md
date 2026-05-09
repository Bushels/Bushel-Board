# Canonical Grain Fact Model

Purpose: define the shape of a grain fact before the LLM or UI interprets it. The goal is not to flatten every source into one giant table immediately. The goal is to force every thesis packet, chart, and public claim to carry the same identity, time, unit, source, and confidence rules.

See also `docs/reference/cgc-market-mechanics-v1.md` for the first source-specific relationship map and interpretation guardrails.

## Mental Model

```text
source rows
  -> canonical fact contract
  -> derived metrics
  -> interpretation
  -> speculation / recommendation
```

The model must keep those layers separate. A number is a fact. "Exports are lagging" is interpretation. "Basis may need to improve" is speculation unless backed by live cash/basis data.

## Fact Shape

Every fact used by a market read should be representable with this shape, even when the physical storage stays in source-specific tables.

```text
canonical_grain
market_lane
fact_category
metric
source_name
source_table
source_row_key
source_metric
source_region
region_scope
region
crop_year
grain_week
week_ending_date
market_year
report_date
period
value
unit
normalized_value
normalized_unit
is_cumulative
mapping_type
mapping_confidence
source_run_id
freshness_status
confidence
quality_flags
formula
notes
```

## Required Semantics

| Field | Rule |
| --- | --- |
| `canonical_grain` | Bushel Board grain name used by product surfaces, e.g. `Canola`, `Wheat`, `Peas`. |
| `market_lane` | `canada`, `us`, `cross_border`, `world`, `local`, or `validation`. |
| `fact_category` | One of `supply`, `demand`, `logistics`, `price`, `positioning`, `weather`, `farmer_behavior`, `international_context`, `freshness`, `quality`. |
| `metric` | Product-facing metric name, not necessarily the source column. Example: `producer_deliveries_cumulative`. |
| `source_name` | Registry source ID. Must match `source_runs.source_name` when the ledger is live. |
| `region_scope` | `national`, `prairie`, `province`, `state`, `port`, `terminal`, `local_area`, `world`, or `unknown`. |
| `period` | `current_week`, `crop_year_to_date`, `marketing_year`, `monthly`, `point_in_time`, or `forecast`. |
| `value` / `unit` | Raw source value and unit. Do not hide source units. |
| `normalized_value` / `normalized_unit` | Optional calculation used for comparison or display. Must keep the formula. |
| `mapping_type` | `direct`, `context`, or `proxy`. Proxy mappings are allowed only when visible. |
| `confidence` | `high`, `medium`, or `low`, based on source quality and mapping confidence, not model confidence. |
| `quality_flags` | Array of warnings such as `stale_source`, `missing_cash_basis`, `proxy_mapping`, `partial_region`, `source_lag_expected`. |

## Time Rules

Do not collapse these into one generic date field:

| Source Class | Primary Time Field | Why It Matters |
| --- | --- | --- |
| CGC weekly stats | `crop_year`, `grain_week`, `week_ending_date` | Crop-year pace is the farmer decision frame. |
| Grain Monitor | `report_date`, source report week | It naturally lags CGC and must say so. |
| USDA weekly | `week_ending`, `market_year` | US season and Canada grain week do not line up cleanly. |
| CFTC COT | `report_date` | Tuesday positions released Friday are stale by design. |
| WASDE / PSD | report month, marketing year | Monthly balance sheets revise history and projections. |
| Prices | sample timestamp, contract | Market tape can go stale over weekends and holidays. |

## Unit Rules

1. Store source units honestly.
2. Normalize only when a formula is documented.
3. Display farmer-friendly units, but keep the metric-tonne spine for cross-source math.
4. A bushel conversion must carry bushel weight when it affects the answer.
5. `Ktonnes`, tonnes, MMT, contracts, percent complete, and dollars are not interchangeable.

## Scope Rules

Never mix geographic scope without a bridge formula.

Examples:

| Allowed | Not Allowed |
| --- | --- |
| CGC Western province deliveries plus national process deliveries using the documented producer-delivery formula | Treating Primary deliveries alone as national producer deliveries |
| US soybeans as `context` for canola oilseed pressure | Storing US soybeans as Canadian canola truth |
| Grain Monitor vessel pressure as logistics context with lag flag | Using Grain Monitor lagged data as if it were current CGC week data |

## Derived Metric Contract

Every derived metric must keep its inputs visible.

Example for Canadian canola delivery pace:

```text
metric: producer_delivery_share_of_supply
formula: country producer deliveries crop-year-to-date / total supply
inputs:
  - cgc_weekly_stats: v_country_producer_deliveries
  - aafc_statscan_supply: supply_disposition total_supply
quality_flags:
  - stale_supply_source if supply_disposition source is not current
  - missing_source_run if source_runs is not populated
```

Example for canola exports:

```text
metric: total_exports_cumulative
formula: Terminal Exports by grade summed across ports + direct export-destination flows + eligible Producer Cars destination rows
inputs:
  - cgc_weekly_stats: terminal export rows
  - cgc_weekly_stats: Primary Shipment Distribution export destination rows
  - cgc_producer_cars: producer car direct export rows when available
quality_flags:
  - grade_sum_required
  - producer_cars_direct_export_gap if direct-export rows are unavailable
```

## Thesis Packet Boundary

The thesis packet is facts only. It should return:

```text
supply
demand
logistics
prices
positioning
weather
farmer_behavior
international_context
freshness
quality_warnings
```

It should not return:

```text
headline
recommendation
bullish/bearish conclusion
farmer action advice
LLM-written paragraph
```

Those belong one layer higher, after validation.
