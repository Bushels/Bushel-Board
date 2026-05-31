# Bushel Board Data Lineage Map

This is the closest thing to an org chart for the product.

Better term: a data lineage map. Data lineage means "where a number starts, how it gets transformed, and where it ends up in the UI."

## Core Mental Model

Most dashboard numbers come from one of these root sources:

1. `cgc_observations` for Canadian Grain Commission weekly grain data.
2. `supply_disposition` and `v_supply_disposition_current` for AAFC-style balance sheet data.
3. `x_market_signals` for sentiment-scout output from the X API v2 gateway.
4. `grain_sentiment_votes` and `metric_sentiment_votes` for farmer voting.
5. `crop_plans` and `crop_plan_deliveries` for farmer-specific data.
6. `grain_monitor_snapshots` and `producer_car_allocations` for logistics context.
7. `usda_export_sales`, `usda_wasde_estimates`, `usda_crop_progress` for US market context.
8. `canada_crop_progress` for province-staggered Prairie seeding/progress/condition context where directly mapped.
9. `cftc_cot_positions` for disaggregated fund/commercial positioning.

The main pattern is:

`source -> raw table -> SQL view/RPC -> lib/queries/* -> page.tsx -> component card`

## Current Layered System Map

Use this map first. It separates raw facts, generated analysis, runtime chat,
and quality/ops. That split matters because source data can be current while
the Friday thesis layer is still one grain week behind.

```mermaid
flowchart TD
  S["External Sources"] --> I["Collectors / Importers"]

  S1["CGC weekly stats"] --> I
  S2["CGC producer cars"] --> I
  S3["Grain Monitor weekly PDF"] --> I
  S4["USDA crop progress / export sales / WASDE"] --> I
  S4b["Canada provincial crop progress"] --> I
  S5["CFTC COT"] --> I
  S6["Futures prices"] --> I

  I --> R["Supabase Source Tables"]
  R --> R1["cgc_observations"]
  R --> R2["producer_car_allocations"]
  R --> R3["grain_monitor_snapshots"]
  R --> R4["usda_crop_progress"]
  R --> R5["usda_export_sales"]
  R --> R6["usda_wasde_raw / usda_wasde_mapped"]
  R --> R7["cftc_cot_positions"]
  R --> R8["grain_prices"]

  R --> DB["Views + RPCs"]
  DB --> DB1["v_grain_overview"]
  DB --> DB2["v_supply_pipeline"]
  DB --> DB3["get_pipeline_velocity()"]
  DB --> DB4["get_logistics_snapshot()"]
  DB --> DB5["get_seeding_seismograph()"]
  DB --> DB6["get_usda_*_context()"]

  R --> A["Analysis Layer"]
  DB --> A
  A --> A1["Canadian desk swarm"]
  A --> A2["US desk swarm"]
  A --> A3["Collector heartbeats / soft reviews"]
  A1 --> O1["market_analysis"]
  A1 -. legacy archive only .-> O2["grain_intelligence"]
  A2 --> O3["us_market_analysis"]
  A2 --> O4["us_grain_intelligence"]
  A3 --> O5["score_trajectory"]
  A3 --> O6["us_score_trajectory"]

  U["Farmer Input"] --> U1["profiles"]
  U --> U2["crop_plans"]
  U --> U3["crop_plan_deliveries"]
  U --> U4["farmer_memory"]
  U --> U5["local_market_intel"]
  U --> U6["posted_prices"]

  U1 --> P["Personalization Layer"]
  U2 --> P
  U3 --> P
  U4 --> P
  U5 --> P
  U6 --> P
  O1 --> P
  DB --> P
  P --> FS["farm_summaries"]
  P --> CH["chat context"]
  CH --> CT["chat_threads / chat_messages"]

  I --> Q["Quality + Ops"]
  A --> Q
  Q --> Q1["cgc_imports"]
  Q --> Q2["validation_reports"]
  Q --> Q3["health_checks"]
  Q --> Q4["prediction_scorecard"]
  Q --> Q5["daily_digests"]

  R --> L["Next.js Query Helpers"]
  DB --> L
  O1 --> L
  O2 --> L
  O3 --> L
  O4 --> L
  O5 --> L
  O6 --> L
  FS --> L
  P --> L

  L --> UI["App Pages"]
  UI --> UI1["/overview"]
  UI --> UI2["/grain/[slug]"]
  UI --> UI3["/my-farm"]
  UI --> UI4["/seeding"]
  UI --> UI5["/us + /us/[market]"]
  UI --> UI6["/chat"]
  UI --> UI7["/advisor"]
  UI --> UI8["/digest"]
```

### CGC routine note

As of 2026-05-02, the Codex CGC importer is:

`npm run import-cgc`

That script fetches the live CGC page/CSV from the local Codex runtime, forwards
the raw CSV to `import-cgc-weekly` with `csv_data`, verifies
`cgc_observations`, and writes 16 `collector_cgc` heartbeat rows into
`score_trajectory`. It does not call `/api/cron/import-cgc`, does not call the
V1 Grok analysis chain, and does not trigger the Friday swarm.

Dry-run command: `npm run import-cgc:dry`.

## 1. Weekly Production Chain (Current — V2 Claude Agent Desk)

The live weekly pipeline is the Claude/Codex desk workflow. All Vercel crons
are disabled (2026-03-17). Routine data collection is now script/agent driven.
The Grok/xAI thesis-writing chain is retired and cannot be used as recovery.

```mermaid
flowchart TD
  A["CGC weekly CSV"] --> B["Codex routine: npm run import-cgc"]
  B --> C["import-cgc-weekly (Edge Function)"]
  C --> D["cgc_observations"]
  C --> E["cgc_imports (status in success/partial/failed)"]
  C --> F["validate-import"]
  F --> G["validation_reports"]
  B --> X["score_trajectory collector_cgc heartbeats"]

  H["Claude Desktop Routine: grain-desk-weekly (Fri 6:47 PM ET)"] --> I["CAD swarm"]
  H2["Claude Desktop Routine: us-desk-weekly (Fri 7:30 PM ET)"] --> I2["US swarm"]

  I --> J["6 Haiku scouts (supply/demand/basis/sentiment/logistics/macro)"]
  J --> K["3 Sonnet specialists (export/domestic/risk)"]
  K --> L["Opus desk chief"]
  L --> M["market_analysis + score_trajectory"]

  I2 --> J2["8 Haiku scouts (supply/demand/export/price/cot/wasde/conditions/macro)"]
  J2 --> K2["4 Sonnet specialists (export/domestic/price/risk) + planted-area (Mar-Sep)"]
  K2 --> L2["Opus desk chief"]
  L2 --> M2["us_market_analysis + us_score_trajectory"]

  D --> J
  X --> J
  D --> J2
  N["Anthropic web_search_20250305"] --> J
  O["search-x-signals Edge Function (X API v2)"] --> J

  M --> P["Claude/Codex farm summary writer"]
  Q["crop_plans"] --> P
  R["calculate_delivery_percentiles()"] --> P
  P --> S["farm_summaries"]

  S --> T["validate-site-health"]
  D --> T
  M --> T
  T --> U["health_checks"]

  L --> V["Opus meta-reviewer (Sat)"]
  V --> W["desk_performance_reviews"]
  L2 --> V2["Opus meta-reviewer (Sat)"]
  V2 --> W2["us_desk_performance_reviews"]
```

### Daily data collectors (feed the weekly swarm)

6 Claude Desktop Routines drop data into Supabase throughout the week:

| Routine | Cadence | Writes to |
| --- | --- | --- |
| `collect-crop-progress` | Mon | `usda_crop_progress` + `score_trajectory` (scan_type=`collector_crop_progress`) |
| `collect-grain-monitor` | Wed | `grain_monitor_snapshots` + `score_trajectory` (scan_type=`collector_grain_monitor`) |
| `collect-export-sales` | Thu AM | `usda_export_sales` + `score_trajectory` (scan_type=`collector_export_sales`) |
| `collect-cgc` | Thu PM | `cgc_observations` (via `import-cgc-weekly`) + `score_trajectory` (scan_type=`collector_cgc`) |
| `collect-cftc-cot` | Fri PM | `cftc_cot_positions` + `score_trajectory` (scan_type=`collector_cftc_cot`) |
| `collect-wasde` | Fri monthly | `usda_wasde_estimates` + `score_trajectory` (scan_type=`collector_wasde`) |

Friday's weekly anchor is written by the desk chief with `scan_type='weekly_debate'`
and `model_source='claude-opus-desk-chief-v2'`.

## 1b. Retired Grok Analysis Chain

The old Grok/xAI chain is deprecated. Its runtime entrypoints now return
HTTP 410 tombstones and must not write to `market_analysis`,
`grain_intelligence`, `score_trajectory`, or `farm_summaries`.

```mermaid
flowchart TD
  A["CGC CSV"] --> B["import-cgc-weekly"]
  B --> C["cgc_observations / cgc_imports"]
  C --> D["validate-import"]
  D -. retired .-> E["search-x-intelligence tombstone"]
  E -. no writes .-> F["x_market_signals"]
  D -. retired .-> G["analyze-grain-market tombstone"]
  G -. no writes .-> H["market_analysis"]
  D -. retired .-> I["analyze-market-data / generate-intelligence tombstones"]
  I -. no writes .-> J["grain_intelligence"]
```

Future X analysis should use the direct X API v2 lane, then store vetted
signals into `x_market_signals`. Do not revive Grok `x_search` as the bridge.

## 2. Grain Detail Page Call Map

File: `app/(dashboard)/grain/[slug]/page.tsx`

```mermaid
flowchart LR
  P["grain/[slug]/page.tsx"] --> Q1["getGrainOverviewBySlug()"]
  P --> Q2["getCumulativeTimeSeries()"]
  P --> Q3["getWeekOverWeekComparison()"]
  P --> Q4["getProvincialDeliveries()"]
  P --> Q5["getStorageBreakdown()"]
  P --> Q6["getGradeDistribution()"]
  P --> Q7["getDeliveryChannelBreakdown()"]
  P --> Q8["getMarketAnalysis()"]
  P --> Q10["getLogisticsSnapshot()"]
  P --> Q11["getCotPositioning()"]
  P --> Q12["getProcessorCapacity()"]
  P --> Q13["getRecentPrices()"]
  P --> Q14["getProcessorInventory()"]
  P --> Q15["getMetricSentiment()"]

  Q1 --> V1["v_grain_overview"]
  V1 --> V2["v_country_producer_deliveries"]
  V2 --> T1["cgc_observations"]

  Q2 --> R1["get_pipeline_velocity()"]
  R1 --> V2
  R1 --> T1

  Q3 --> T1
  Q4 --> T1
  Q5 --> T1
  Q6 --> T1
  Q7 --> T1
  Q7 --> T2["producer_car_allocations"]

  Q8 --> T4["market_analysis"]

  Q10 --> R2["get_logistics_snapshot()"]
  R2 --> T5["grain_monitor_snapshots"]
  R2 --> T2

  Q11 --> T6["cftc_cot_positions"]
  Q12 --> T7["processor_capacity"]
  Q13 --> T8["grain_prices"]
  Q14 --> R3["get_processor_inventory()"]
  R3 --> T1
  Q15 --> R4["get_metric_sentiment()"]
  R4 --> T9["metric_sentiment_votes"]
```

## 3. My Farm Page Call Map

File: `app/(dashboard)/my-farm/page.tsx`

```mermaid
flowchart LR
  P["my-farm/page.tsx"] --> Q1["getFarmSummary()"]
  P --> Q2["getDeliveryAnalytics()"]
  P --> Q3["getSupplyDispositionForGrains()"]
  P --> Q4["getGrainOverview()"]
  P --> Q5["getMarketAnalysis()"]
  P --> Q6["getSentimentOverview()"]
  P --> Q7["getUserSentimentVote()"]
  P --> Q8["crop_plans query"]

  Q1 --> T1["farm_summaries"]
  Q2 --> R1["get_delivery_analytics()"]
  R1 --> T2["crop_plans"]
  R1 --> T3["profiles"]

  Q3 --> V1["v_supply_disposition_current"]
  V1 --> T4["supply_disposition"]

  Q4 --> V2["v_grain_overview"]
  V2 --> V3["v_country_producer_deliveries"]
  V3 --> T5["cgc_observations"]

  Q5 --> T6["market_analysis"]
  Q6 --> R2["get_sentiment_overview()"]
  R2 --> T7["grain_sentiment_votes"]
  Q7 --> T7
  Q8 --> T2
```

## 4. Overview Page Call Map

File: `app/(dashboard)/overview/page.tsx`

```mermaid
flowchart LR
  P["overview/page.tsx"] --> Q1["getMarketOverviewSnapshot()"]
  P --> Q2["getSentimentOverview()"]
  P --> Q3["getLatestXSignals()"]

  Q1 --> V1["v_country_producer_deliveries"]
  Q1 --> T1["cgc_observations"]
  V1 --> T1

  Q2 --> R1["get_sentiment_overview()"]
  R1 --> T2["grain_sentiment_votes"]

  Q3 --> T3["x_market_signals"]
```

## 5. Data Point Lineage Table

| UI data point | Query function | SQL object | Base source |
| --- | --- | --- | --- |
| Overview producer deliveries | `getMarketOverviewSnapshot()` | `v_country_producer_deliveries` | `cgc_observations` |
| Overview terminal receipts | `getMarketOverviewSnapshot()` | direct aggregation | `cgc_observations` |
| Overview exports | `getMarketOverviewSnapshot()` | direct aggregation | `cgc_observations` |
| Overview commercial stocks | `getMarketOverviewSnapshot()` | direct aggregation | `cgc_observations` |
| Grain hero thesis | `getMarketAnalysis()` | direct table read | `market_analysis` |
| Grain bull/bear cards | `getMarketAnalysis()` | direct table read | `market_analysis` |
| Grain key metrics row | `getWeekOverWeekComparison()` | in-code composite math | `cgc_observations` |
| Grain net balance chart | `getCumulativeTimeSeries()` | `get_pipeline_velocity()` | `v_country_producer_deliveries` + `cgc_observations` |
| Grain delivery breakdown chart | `getDeliveryChannelBreakdown()` | direct query mix | `cgc_observations` + `producer_car_allocations` |
| Grain province map | `getProvincialDeliveries()` | direct query | `cgc_observations` |
| Grain storage breakdown | `getStorageBreakdown()` | direct query | `cgc_observations` |
| Grain grade donut | `getGradeDistribution()` | direct query | `cgc_observations` |
| Grain logistics card | `getLogisticsSnapshot()` | `get_logistics_snapshot()` | `grain_monitor_snapshots` + `producer_car_allocations` |
| Grain COT card | `getCotPositioning()` | direct table read | `cftc_cot_positions` |
| Grain processor inventory | `getProcessorInventory()` | `get_processor_inventory()` | `cgc_observations` |
| Grain price sparkline | `getRecentPrices()` | direct table read | `grain_prices` |
| Thesis Canada crop-progress drivers/freshness | `buildCanadaThesisBoardItem()` / `getThesisBoardData()` | `get_canada_thesis_packet()` + `v_source_freshness` | `canada_crop_progress` + `grain_market_mappings` |
| Grain metric voting badges | `getMetricSentiment()` | `get_metric_sentiment()` | `metric_sentiment_votes` |
| My Farm weekly summary | `getFarmSummary()` | direct table read | `farm_summaries` |
| My Farm delivery pace | `getDeliveryAnalytics()` | `get_delivery_analytics()` | `crop_plans` |
| My Farm percentiles | `getFarmSummary()` | direct table read | `farm_summaries` |
| My Farm recommendations | derived in page code | mixed | `market_analysis` + `v_supply_disposition_current` + `v_grain_overview` + `crop_plans` |
| Overview community pulse | `getSentimentOverview()` | `get_sentiment_overview()` | `grain_sentiment_votes` |
| Overview signal strip | `getLatestXSignals()` | direct table read | `x_market_signals` |

## 6. Most Important Formulas

These are the numbers most likely to cause confusion.

### Producer Deliveries

Canonical formula:

`Primary.Deliveries (AB/SK/MB/BC, grade='') + Process.Producer Deliveries (grade='') + Producer Cars.Shipments (AB/SK/MB, grade='')`

Main SQL object:

`v_country_producer_deliveries`

### Exports

Canonical formula:

`Terminal Exports + Primary Shipment Distribution where region='Export Destinations' + Producer Cars Shipment Distribution where region='Export'`

This is why "Exports" is not just one worksheet.

### Pipeline Velocity

Main SQL object:

`get_pipeline_velocity()`

It combines:

1. producer deliveries from `v_country_producer_deliveries`
2. terminal receipts from `Terminal Receipts`
3. exports from the full exports formula above
4. processing from `Process.Milled/Mfg Grain`

Then `lib/queries/observations.ts` forward-fills missing cumulative weeks so a lagging worksheet does not incorrectly look like zero.

### Published Market Analysis

The weekly thesis shown to farmers is not generated directly from the CGC import.

It is:

`cgc_observations + v_supply_pipeline + logistics RPC + X API v2 signals + Claude/Codex desk workflow -> market_analysis`

### Farm Summary

The farmer summary is a separate personalized layer:

`crop_plans + delivery percentiles + community analytics + Claude/Codex desk context -> farm_summaries`

## 7. How To Read The System Quickly

If you want to trace any card:

1. Start at the page file.
2. Find the `get...()` query function called by that page.
3. Check whether that query uses a direct table read, a SQL view, or an RPC.
4. If it uses a view or RPC, trace that object back to its source tables.

The practical shortcut is:

`page.tsx -> lib/queries/* -> view/RPC -> base table`

## 8. Best Next Step

If you want this to become easier to maintain, the clean next move after the V1 rating-model contract is a live internal `/system-map` page that renders these diagrams and links each card to its query function and SQL object.

For thesis scoring specifically, use `docs/reference/thesis-rating-model-v1.md` as the next layer above this lineage map: lineage proves where facts came from; the rating model defines how admitted facts interact into transparent bull/bear domain scores.

Why this is better than a static org chart:

1. it stays close to the code
2. it is easier to update after each schema change
3. it reduces the chance that documentation drifts away from reality
