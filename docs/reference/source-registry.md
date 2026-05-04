# Bushel Board Source Registry

Purpose: this is the human-readable source contract for the grain intelligence spine. A source can feed a thesis, chart, alert, or public claim only after its identity, cadence, units, time semantics, and failure modes are explicit here or in the deployed `source_runs` / `grain_market_mappings` contracts.

This file is not a status log. Current run health belongs in Supabase `source_runs`.

## V1 Rule

No new major data source enters Bushel Board until these fields are known:

```text
source_id
canonical source name
official URL or API
target table or RPC
collector command or routine
update cadence
dating system
geographic scope
unit convention
expected lag
known failure modes
v1 use
freshness proof
```

If one of those fields is unknown, the source can be discussed in planning but it cannot drive a farmer-facing recommendation.

## Tier 1 Sources

These are the sources that must be solid before Bushel Board becomes a live thesis engine.

| Source ID | Lane | Official Source | Target | Collector | Cadence | Dating System | Units | Known Lag / Failure Mode | V1 Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cgc_weekly_stats` | Canada | Canadian Grain Commission Grain Statistics Weekly CSV | `cgc_observations`, `cgc_imports` | `npm run import-cgc` | Weekly, Thursday after CGC publish | `crop_year`, `grain_week`, `week_ending_date` | `Ktonnes` | CGC publish delay, external fetch block, local CSV cache stale | Canada movement anchor: deliveries, shipments, terminal receipts, exports, stocks |
| `cgc_producer_cars` | Canada | Canadian Grain Commission producer car CSV | `producer_car_allocations` | `node scripts/import-producer-cars.mjs` | Weekly, Thursday | `crop_year`, `grain_week` | Cars / allocation counts by grain and destination | Grain-name mismatches, cumulative forward-looking semantics | Logistics and farmer-direct rail pressure |
| `grain_monitor_weekly` | Canada | Quorum Grain Monitor weekly PDF | `grain_monitor_snapshots` | `npm run import-grain-monitor:weekly` | Weekly, Wednesday routine | Report week / real `report_date` | Mixed logistics metrics; store source units explicitly | PDF layout drift, 1-2 week natural lag vs CGC | Logistics context: port capacity, unloads, vessel timing, stocks |
| `aafc_statscan_supply` | Canada | AAFC / Statistics Canada supply-disposition | `supply_disposition`, `v_supply_disposition_current` | Manual/periodic seed path, not yet strong enough | Periodic / annual crop-year updates | `crop_year`, source release date | Kt / MMT depending source; normalize before display | Stale source label risk, manual update gap | Production, total supply, carry-in, carry-out, stocks-to-use |
| `usda_crop_progress` | US | USDA NASS QuickStats / Crop Progress | `usda_crop_progress` | `npm run import-usda-crop-progress` | Weekly during season | `week_ending`, `market_year` | Percent progress / condition | API auth/key failure, raw-row vs canonical-row drift | US seeding/harvest/condition context |
| `usda_export_sales` | US / global demand | USDA FAS Export Sales | `usda_export_sales` | `npm run import-usda` | Weekly Thursday | `week_ending`, `market_year` | Metric tonnes / bushels by source convention; normalize in query layer | Freshness lag, commodity mapping errors | US demand and export pace context |
| `usda_wasde` | US / world | USDA WASDE / PSD | `usda_wasde_raw`, `usda_wasde_mapped` | `npm run import-usda-wasde`, archive backfill | Monthly | Report month, marketing year | USDA source units, mapped per attribute | Latest-vs-archive ambiguity, revision history loss | Balance-sheet context for US and world supply/demand |
| `cftc_cot` | Futures positioning | CFTC Commitment of Traders | `cftc_cot_positions` | `python scripts/collect-cftc-cot.py` | Weekly, Friday release for Tuesday report | `report_date` | Contracts; derive tonnes only with explicit contract size | Inherent 3-day lag, source mapping/proxy risk | Positioning pressure where mapping is direct or explicitly proxied |
| `grain_prices` | Cross-border price context | Current futures/market price feed in app | `grain_prices`, `v_latest_grain_prices` | `npm run import-grain-prices` | Intended daily; current feed is thin | Sample timestamp / contract date | USD/CAD per bu, tonne, or contract depending source | Thin market tape, stale weekends/holidays, mapping gaps | Price follow-through and scorecard evaluation |

## Tier 2 Sources

These are farmer-value sources, but they should wait until Tier 1 freshness and thesis packets are deployed and validated.

| Source ID | Lane | Target | Current State | V1 Boundary |
| --- | --- | --- | --- | --- |
| `posted_prices` | Local cash / basis | `posted_prices`, pricing RPCs | Table exists, 0 rows in latest audit | Do not make basis claims from empty data. Start with manual/operator postings before paid feeds. |
| `farmer_inventory` | Farmer behavior | `crop_plans`, `crop_plan_deliveries` | My Farm storage tracker exists | Use only with privacy thresholds; never expose small-cell comparisons. |
| `weather` | Weather risk | `weather_cache` or future weather tables | Empty in latest audit | Do not use for thesis until source, cadence, station/region mapping, and forecast horizon are defined. |
| `fx_rates` | Canada/US price context | FX table/importer | Present as supporting lane | Use for price translation, not standalone thesis prose. |
| `x_market_signals` | Social/sentiment | `x_market_signals` | Legacy/archive mixed `x` and `web` sources | Keep as archive until direct X API v2 lane is rebuilt and provenance is tight. |
| `kalshi` | Prediction-market validation | `predictive_market_briefs` / future live market table | Editorial context, not source truth | Keep in validation/comparison lane. Do not feed it back into market-analysis writers. |

## Source Admission Checklist

Before a source feeds the weekly market read:

1. Source URL/API is official or the proxy status is labelled.
2. Collector command exists and accepts `--help` where practical.
3. Target table or RPC is named.
4. Date semantics are explicit.
5. Units are explicit and normalized only in documented code.
6. Freshness can be checked by `source_runs` or a table-specific fallback.
7. Failure modes are listed.
8. Grain/market mapping is direct, context, or proxy with confidence.
9. Public-facing claims can point back to source rows.

## First Pilot

Canola is the first Canada pilot. It may use only Tier 1 data that passes freshness checks. Tier 2 data can appear as `unavailable`, `stale`, or `not yet wired`, but it must not be silently implied.
