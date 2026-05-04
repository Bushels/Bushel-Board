# Bushel Board Source Registry

Purpose: this is the human-readable source contract for the grain intelligence spine. A source can feed a thesis, chart, alert, or public claim only after its identity, cadence, units, time semantics, and failure modes are explicit here or in the deployed `source_runs` / `grain_market_mappings` contracts.

This file is not a status log. Current run health belongs in Supabase `source_runs`.

See also `docs/reference/cgc-market-mechanics-v1.md` for CGC accounting, movement relationships, and interpretation guardrails.

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

## Operating Precedence

For Canadian market reads, weekly CGC movement data outranks slower compiled or modelled releases.

1. `cgc_weekly_stats` - primary weekly Canada grain movement truth.
2. `grain_monitor_weekly` and `cgc_producer_cars` - logistics explanation around the CGC movement.
3. `cftc_cot` and `grain_prices` - futures positioning and price context, with proxy labels where mapping is not direct.
4. `aafc_statscan_supply` - crop-size and balance-sheet baseline, useful but slower and sometimes compiled from upstream grain-flow records.
5. `canola_council_markets_stats` - Canola-specific public aggregator, useful for discovery and display, but its underlying source label decides whether it can act as source truth.
6. Weather, drought, satellite, and GEE-derived lanes - context only until individually admitted.

AAFC / Statistics Canada supply-disposition data can set the seasonal balance sheet, but it must not replace fresh CGC weekly flow when the question is what is moving now.
Canola Council tables can speed up Canola-specific coverage, but scraped values must preserve the table's own source label, update date, unit, and period. If the underlying source is Statistics Canada, CGC, COPA, AAFC, GlobalData, or LMC, Bushel Board should store both the Canola Council page and the upstream source.

## Tier 1 Sources

These are the sources that must be solid before Bushel Board becomes a live thesis engine.

| Source ID | Lane | Official Source | Target | Collector | Cadence | Dating System | Units | Known Lag / Failure Mode | V1 Use |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cgc_weekly_stats` | Canada | Canadian Grain Commission Grain Statistics Weekly CSV | `cgc_observations`, `cgc_imports` | `npm run import-cgc` | Weekly, Thursday after CGC publish | `crop_year`, `grain_week`, `week_ending_date` | `Ktonnes` | CGC publish delay, external fetch block, local CSV cache stale | Canada movement anchor: deliveries, shipments, terminal receipts, exports, stocks |
| `cgc_producer_cars` | Canada | Canadian Grain Commission producer car CSV | `producer_car_allocations` | `node scripts/import-producer-cars.mjs` | Weekly, Thursday | `crop_year`, `grain_week` | Cars / allocation counts by grain and destination | Grain-name mismatches, cumulative forward-looking semantics | Logistics and farmer-direct rail pressure |
| `grain_monitor_weekly` | Canada | Quorum Grain Monitor weekly PDF | `grain_monitor_snapshots` | `npm run import-grain-monitor:weekly` | Weekly, Wednesday routine | Report week / real `report_date` | Mixed logistics metrics; store source units explicitly | PDF layout drift, 1-2 week natural lag vs CGC | Logistics context: port capacity, unloads, vessel timing, stocks |
| `aafc_statscan_supply` | Canada | AAFC / Statistics Canada supply-disposition | `supply_disposition`, `v_supply_disposition_current` | Manual/periodic seed path, not yet strong enough | Periodic / annual crop-year updates | `crop_year`, source release date | Kt / MMT depending source; normalize before display | Stale source label risk, manual update gap | Production, total supply, carry-in, carry-out, stocks-to-use |
| `canola_council_markets_stats` | Canada / Canola | Canola Council of Canada Markets & Stats | Future source-normalized Canola market stats tables, not yet created | Not yet built | Varies by page and upstream source | Calendar year, crop year, month, or market profile depending table | Acres, tonnes, CAD, CAD/tonne, percent, country/region | Dynamic table scraping drift, mixed upstream sources, page update date not always equal to upstream release date | Canola-specific discovery and dashboard coverage for production, supply/disposition, processing/crush, exports, oil/meal, top markets, and prices. Not source truth unless upstream provenance is captured. |
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

## Canola Public Baseline Facts

These are the first crop-size facts to seed or verify before the Canola read is promoted beyond deterministic V1. They are not a replacement for weekly CGC flow; they set the crop-year denominator for pace and stocks-to-use math.

| Fact | Current value to seed / verify | Source | Notes |
| --- | --- | --- | --- |
| 2025 final canola production | 21.804 million tonnes | Statistics Canada, The Daily, 2025-12-04; Table 32-10-0359-01 | November Field Crop Survey final estimate, subject to revision for two years. |
| 2025 national canola yield | 44.7 bu/ac | Statistics Canada, The Daily, 2025-12-04; Table 32-10-0359-01 | Farmer-facing yield unit; keep metric-tonne/hectare conversions explicit if used. |
| 2025 final seeded acres | 21.617 million acres | Canola Council production page citing Statistics Canada Table 32-10-0359-01 | Use Statistics Canada table as upstream truth when loading DB rows. |
| 2025 final harvested acres | 21.490 million acres | Canola Council production page citing Statistics Canada Table 32-10-0359-01 | Use for production/yield checks; keep distinct from seeded acres. |
| 2026 intended seeded acres | 21.839 million acres | Statistics Canada, The Daily, 2026-03-05; Table 32-10-0359-01 | Preliminary seeding-intention estimate. Replace with June seeded-area survey when released. |

Useful public source URLs:

- Statistics Canada final 2025 production release: https://www150.statcan.gc.ca/n1/daily-quotidien/251204/dq251204a-eng.htm
- Statistics Canada final 2025 production table: https://www150.statcan.gc.ca/n1/daily-quotidien/251204/t001a-eng.htm
- Statistics Canada 2026 seeding-intentions release: https://www150.statcan.gc.ca/n1/daily-quotidien/260305/dq260305a-eng.htm
- Statistics Canada 2026 seeding-intentions table: https://www150.statcan.gc.ca/n1/daily-quotidien/260305/t001a-eng.htm
- Canola Council production page: https://www.canolacouncil.org/markets-stats/production/
- Canola Council supply/disposition page: https://www.canolacouncil.org/markets-stats/supply-disposition/
- Canola Council exports page: https://www.canolacouncil.org/markets-stats/exports/
- Canola Council processing page: https://www.canolacouncil.org/markets-stats/processing/
- Canola Council top markets page: https://www.canolacouncil.org/markets-stats/top-markets/

## Candidate Agroclimate Watchlist

These sources are useful for Canola, but they sit below the weekly CGC / Grain Monitor / producer-car / COT spine. They are not admitted Canola Market Read V1 inputs until each lane has a collector/API path, units, geography, lag, and freshness proof. They may be displayed as watched, stale, proxy, or research-only sources.

| Source ID | Lane | Official / Primary Source | Cadence / Dating | Likely Use | V1 Boundary |
| --- | --- | --- | --- | --- | --- |
| `aafc_canadian_drought_monitor` | Official drought benchmark | AAFC Canadian Drought Monitor ArcGIS ImageServer / Open Canada dataset | Monthly, usually by the 10th for the previous month | Official drought-class context for yield risk | Too lagged for live stress detection. Display lag explicitly. |
| `aafc_agroclimate_maps` | Weather/agroclimate context | AAFC Agroclimate Maps and linked Open Canada layers | Near-real-time weather observations assembled within about 12 hours; map products use fixed or rolling windows | Precipitation, temperature, GDD, SPI, SPEI, soil moisture, drought-index context | Do not admit the whole map family. Admit one layer at a time with units and time window pinned. |
| `aafc_vegdri` | Vegetation drought stress | AAFC Vegetation Drought Response Index ImageServer / Open Canada dataset | Weekly model product at 1 km according to service metadata | Drought-driven vegetation stress context beyond raw NDVI | Research-only until freshness is proven. On 2026-05-04, the AAFC image service metadata observed by Codex ended at 2025-08-30. |
| `aafc_smos_soil_moisture` | Satellite surface soil moisture | Open Canada dataset `c0ea8c27-e62e-45bc-b64c-d475650d84a2`; AAFC ImageServer | Created daily from SMOS and averaged weekly, biweekly, or monthly | Surface moisture anomaly for drought/waterlogging/seeding context | Strong candidate, but coarse 0.25 degree grid and top-soil semantics must be labelled. |
| `nasa_servir_esi` | Evaporative stress proxy | NASA/SERVIR ESI via Drought.gov / SERVIR downloads | 4-week and 12-week rasters | Early flash-drought signal from ET/LST anomalies | Proxy source, not AAFC. Canadian coverage and access path must be proven before use. |
| `gee_derived_drought_stack` | Derived near-live proxy | Google Earth Engine over MODIS NDVI, MODIS LST, SMAP/SMOS-style soil moisture, precipitation inputs | Depends on selected ingredients | Fast proxy beside official AAFC products | Derived model, not source truth. Requires formulas, back-test, and explicit proxy label. |

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
