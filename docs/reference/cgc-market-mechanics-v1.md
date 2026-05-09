# CGC Market Mechanics V1

Purpose: define how Bushel Board turns Canadian Grain Commission weekly rows into market facts, derived signals, and guarded interpretation. This is the training layer for the system and analysts. It is not LLM fine-tuning, and it is not a market thesis.

Use this with:

- `docs/reference/source-registry.md` - source identity, cadence, lag, and admission rules.
- `docs/reference/canonical-grain-fact-model.md` - shared fact shape and source/quality fields.
- `docs/reference/cgc-excel-map.md` - sheet, row, CSV, and Supabase mapping detail.
- `docs/reference/canola-cash-movement-map.md` - Canola V1 dashboard map for old-crop flow, farmer holding, and new-crop pressure.

## Core Rule

CGC data explains weekly movement through the licensed Canadian grain handling system. It does not, by itself, explain farmer intent, price motivation, crop size, basis, weather damage, or global demand.

Keep the layers separate:

```text
CGC source rows
  -> accounting rules
  -> derived movement signals
  -> interpretation with source flags
  -> speculation only when outside evidence supports it
```

## System Sketch

```text
AAFC / StatsCan crop-size baseline
        |
        v
available supply context
        |
        v
CGC weekly movement
        |
        +--> producer deliveries
        |      +--> primary elevator deliveries
        |      +--> process elevator producer deliveries
        |      +--> producer car shipments
        |
        +--> commercial pipeline
        |      +--> primary shipments and stocks
        |      +--> process shipments, milled grain, and stocks
        |      +--> terminal receipts, stocks, exports, and disposition
        |
        +--> explanation sources
               +--> Grain Monitor logistics
               +--> producer car / rail staging
               +--> prices, basis, COT, weather, and crop reports
```

## CGC Row Identity

Each `cgc_observations` row is one measurement with this identity:

```text
crop_year
grain_week
week_ending_date
worksheet
metric
period
grain
grade
region
ktonnes
```

`period = Current Week` is the weekly flow or point-in-time stock for that grain week.

`period = Crop Year` is cumulative crop-year-to-date flow through that grain week.

`ktonnes` means thousands of tonnes. Do not mix it with tonnes, MMT, bushels, cars, contracts, dollars, or percentages unless the formula is explicit.

## Main Relationship Map

| Market question | CGC source rows | Derived fact | What it can say | What it cannot say alone |
| --- | --- | --- | --- | --- |
| How much grain is entering the system? | `Primary.Deliveries`, `Process.Producer Deliveries`, `Producer Cars.Shipments` | Country producer deliveries | Farmer grain moved into licensed primary/process/producer-car channels | Farmer motivation, farm inventory left, or basis response |
| Where is grain sitting commercially? | `Primary.Stocks`, `Process.Stocks`, `Terminal Stocks.Stocks`, `Summary.Stocks` | Commercial stocks | Grain held inside licensed commercial channels | Total farm stocks or unpriced farm inventory |
| Is downstream pull strong? | `Primary.Shipments`, `Terminal Receipts.Receipts`, `Process.Shipments` | Pipeline movement | Grain is moving from country elevators toward terminals/processors | That the grain was exported or priced well |
| Are exports executing? | `Terminal Exports.Exports`, `Primary Shipment Distribution.Export Destinations`, `Producer Cars.Shipment Distribution Export` | Total CGC export movement | Export loadout or direct export-destination flow occurred | Export sales, margins, or final buyer economics |
| Is domestic use active? | `Process.Producer Deliveries`, `Process.Milled/Mfg Grain`, `Process.Shipments` | Process/crush demand proxy | Domestic processing flow is active | Crush margin or processor profitability without price/oil/meal data |
| Is direct farmer rail meaningful? | `Producer Cars.Shipments`, `Shipment Distribution`, `Shipment Destinations` | Producer-car flow | Farmer-direct rail movement is bypassing normal elevator channels | A full rail-service diagnosis without staging, car supply, and corridor data |
| Where is grain going after primary/process handling? | `Primary Shipment Distribution` | Destination split | Domestic, port, container, process, or export-destination direction | Final disappearance unless reconciled with terminal/process/export rows |

## Accounting Rules

### 1. Country Producer Deliveries

Country producer deliveries are not `Primary.Deliveries` alone.

Formula:

```text
Primary.Deliveries
  where region in Alberta, Saskatchewan, Manitoba, British Columbia
  and grade = ''
+
Process.Producer Deliveries
  where region = ''
  and grade = ''
+
Producer Cars.Shipments
  where region in Alberta, Saskatchewan, Manitoba
  and grade = ''
```

Use the same formula for `Current Week` and `Crop Year`.

Why it matters: primary-only delivery math undercounts grains with meaningful process or producer-car flow. Canola is the obvious example because processor receipts matter.

### 2. Exports

CGC export movement is broader than `Terminal Exports` alone.

Formula:

```text
Terminal Exports.Exports
+
Primary Shipment Distribution.Shipment Distribution
  where region = 'Export Destinations'
+
Producer Cars.Shipment Distribution
  where region = 'Export'
```

Use the same formula for `Current Week` and `Crop Year`.

Why it matters: direct export-destination flows and producer-car export rows can be small, but omitting them breaks reconciliation against CGC summary-style export totals.

### 3. Terminal Worksheets Require Grade Summing

Terminal receipts, terminal exports, and terminal stocks are grade-level rows. Do not expect `grade = ''` aggregate rows.

Correct pattern:

```text
SUM(ktonnes)
where worksheet in ('Terminal Receipts', 'Terminal Exports', 'Terminal Stocks')
and grain = target grain
and period = target period
```

The current live CSV shape stores terminal port rows by named port such as Vancouver, Prince Rupert, Churchill, Thunder Bay, Bay & Lakes, and St. Lawrence. Do not add a region total unless a future source version actually contains one.

### 4. Current Week And Crop Year Are Separate Facts

Do not derive current-week flow by subtracting cumulative values unless the current-week row is missing and the method is explicitly labelled as a backfill approximation.

CGC can revise cumulative values. A cumulative difference can therefore include source corrections, not just physical weekly movement.

### 5. Region Scope Must Be Explicit

Primary rows are provincial. Process rows are usually national or provincial depending on metric. Terminal rows are port-level. Producer Cars rows mix provincial shipments, shipment distribution, and destination views.

Allowed:

```text
Primary Alberta + Saskatchewan + Manitoba + British Columbia deliveries
```

Not allowed:

```text
Primary provincial deliveries + Summary deliveries
```

That double-counts or mixes an input with an aggregate.

### 6. Not Every Grain Exists In Every Worksheet

Some worksheets naturally omit grains or rows. Missing rows are not zero unless the source semantics prove zero. When joining worksheets, use null-aware logic and keep missing-source flags.

## Interpretation Guardrails

| Fact | Safe interpretation | Needs outside source before saying | Prohibited without support |
| --- | --- | --- | --- |
| Deliveries are rising | More grain entered licensed channels this week | Farmers are selling because basis improved | Farmers are panic selling |
| Primary stocks are rising | Commercial country stocks increased | Elevators are plugged or bids are backing off | Farms are full |
| Terminal receipts exceed terminal exports | More grain reached ports than left ports in the same period | Vessel delays or port congestion | Ports are failing |
| Exports are ahead of last year | Export movement pace is stronger | Demand is stronger or prices are cheap | Importers are aggressively buying |
| Process deliveries are strong | Domestic processing pull is active | Crush margins are good | Crushers are profitable |
| Producer cars increase | More farmer-direct rail movement occurred | Producers are avoiding elevators due to basis or service | Elevator system is broken |
| Stocks draw while exports/process rise | Commercial pipeline is drawing inventory | Tight supply or forced shipment | Supply shortage |

## Outside Sources Required

CGC can tell what moved. These sources explain why it matters:

| Question | Required source class |
| --- | --- |
| How much supply exists? | AAFC / Statistics Canada crop-size and supply-disposition data |
| Was movement price-driven? | Futures, cash bid, basis, FX, and contract context |
| Was movement logistics-driven? | Grain Monitor, railcar staging, unloads, vessels, corridor delays |
| Was movement weather-driven? | Weather, drought, soil moisture, crop condition, field reports |
| Is export demand stronger? | Export sales, destination data, world supply/demand, spreads |
| Are funds amplifying price pressure? | CFTC COT, with lag and proxy labels |
| Are farmers likely undersold or holding grain? | Private farm data only with privacy thresholds, plus local basis and delivery signals |

## Training Example Format

Before any LLM writer uses CGC data, each example should follow this format:

```text
grain:
crop_year:
grain_week:
facts:
  - source row or derived metric
interpretation:
  - allowed explanation
speculation:
  - labelled, only if outside source supports it
quality_flags:
  - stale_source
  - missing_cash_basis
  - logistics_lag
  - proxy_mapping
prohibited_claims:
  - unsupported farmer intent
  - unsupported price causation
```

Example state labels:

| Label | Required evidence |
| --- | --- |
| `farmer_delivery_surge` | Country producer deliveries current week materially above recent average or prior year |
| `terminal_pull` | Terminal receipts and/or terminal exports rising with supportive logistics data |
| `processor_pull` | Process producer deliveries and milled/manufactured grain strong relative to history |
| `commercial_stock_build` | Primary/process/terminal stocks rising faster than outbound movement |
| `commercial_stock_draw` | Stocks falling while export/process movement remains active |
| `logistics_lag_risk` | Grain Monitor or rail data lags CGC or conflicts with current CGC movement |
| `price_context_missing` | CGC movement changed but cash/futures/basis data is stale or absent |

These are not thesis conclusions. They are labelled source states that a deterministic reader or human analyst can use.

## V1 Validation Checks

Each weekly CGC automation should eventually produce these checks:

1. Latest source week detected from the live CGC CSV.
2. Import row written to `cgc_imports` and attributed to the same run.
3. `source_runs` row written as `success`, `partial`, `failed`, or `skipped`.
4. Country producer deliveries reconciled to the approved formula.
5. Export movement reconciled to the approved formula.
6. Terminal receipts/exports/stocks calculated by summing grades.
7. Current-week and crop-year facts kept separate.
8. Missing worksheet/grain combinations flagged as missing, not silently zero.
9. Grain Monitor lag vs CGC reported instead of normalized away.
10. Public market read shows fact, interpretation, speculation, and quality flags separately.

## Live Shape Snapshot

This is a grounding snapshot from the live table on 2026-05-04, not a current-status promise.

```text
latest crop_year: 2025-2026
latest grain_week: 38
week_ending_date: 2026-04-26
latest-week rows: 4313
```

Canola Week 38 example derived from live `cgc_observations`:

| Metric | Kt |
| --- | ---: |
| Country producer deliveries, current week | 433.3 |
| Country producer deliveries, crop year | 15218.0 |
| Terminal receipts, current week | 183.7 |
| Terminal receipts, crop year | 6746.4 |
| Export movement, current week | 194.0 |
| Export movement, crop year | 6205.9 |
| Primary stocks, current week | 808.7 |
| Terminal stocks, current week | 216.7 |
| Process producer deliveries, current week | 180.8 |

The numbers above are useful as a known-good example for relationship tests. They should not be copied into future market reads unless freshness is checked again.

## What This Enables

This reference enables:

- deterministic CGC relationship tests;
- farmer-readable movement explanations;
- dashboard relationship panels;
- source-traceable training examples;
- LLM market-writing guardrails later.

This reference does not enable:

- autonomous market recommendations;
- unsupported farmer-intent claims;
- price-causation claims without price/basis data;
- replacing AAFC/StatsCan crop-size baselines;
- using stale Grain Monitor data as if it were current CGC movement.
