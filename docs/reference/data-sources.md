# Bushel Board Data Source Precedence

## Canonical Sources

| Data Category | Canonical Source | Table/View | Scope |
|--------------|-----------------|------------|-------|
| Balance sheet (production, supply, exports, crush, carry-out) | AAFC | `supply_disposition` / `v_supply_pipeline` | National |
| Weekly deliveries, shipments, stocks | CGC | `cgc_observations` / `v_country_producer_deliveries` | Western primary regions + national process/port totals |
| AI narratives + KPIs | Grok | `grain_intelligence` | Display-only — never use for calculations |
| X/Twitter social signals | Grok + x_search | `x_market_signals` | Pre-scored, farmer-relevant |
| User farm data | User input | `crop_plans` / `farm_summaries` | Per-user |

## Rules

1. **AAFC `supply_disposition`** is the sole source for balance sheet numbers (production, total supply, exports, crush, carry-out)
2. **CGC `cgc_observations`** is the sole source for weekly operational metrics (deliveries, shipments, stocks)
3. **`grain_intelligence.kpi_data`** is display-only narrative context — NEVER extract values for calculations
4. **Never mix scopes casually** — only combine national AAFC numbers with CGC metrics when there is a documented bridge formula
5. **Approved bridge formula:** country producer deliveries =
   `Primary.Deliveries` (AB/SK/MB/BC, `grade=''`) +
   `Process.Producer Deliveries` (national, `grade=''`) +
   `Producer Cars.Shipments` (AB/SK/MB, `grade=''`)
6. **`macro_estimates` is DEPRECATED** — do not query or reference this table

## Scope Reference

| Source | Geographic Scope | Update Frequency |
|--------|-----------------|------------------|
| AAFC supply_disposition | National (all Canada) | Annual (crop year start) |
| CGC cgc_observations | Western primary provinces (AB, SK, MB, BC) + national process/port rows | Weekly (Thursday) |
| grain_intelligence | National + Prairie (mixed in AI narrative) | Weekly (after CGC import) |
| x_market_signals | Canadian agriculture Twitter/X | Weekly (before intelligence) |

## Data Flow

```
CGC Weekly CSV → cgc_observations (weekly operational metrics)
                      ↓
AAFC Balance Sheet → supply_disposition (national annual balance)
                      ↓
search-x-intelligence → x_market_signals (scored social posts)
                      ↓
generate-intelligence → grain_intelligence (AI narratives, display-only)
                      ↓
generate-farm-summary → farm_summaries (personalized narratives)
```
