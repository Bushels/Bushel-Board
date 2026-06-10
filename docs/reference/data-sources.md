# Bushel Board Data Source Precedence

See also:

- `docs/reference/source-registry.md` - source admission contract, cadence, units, lag, and failure modes.
- `docs/reference/canonical-grain-fact-model.md` - identity/time/unit/source rules for thesis packets and market reads.

## Canonical Sources

| Data Category | Canonical Source | Table/View | Scope |
|--------------|-----------------|------------|-------|
| Balance sheet (production, supply, exports, crush, carry-out) | AAFC | `supply_disposition` / `v_supply_pipeline` | National |
| Weekly deliveries, shipments, stocks | CGC | `cgc_observations` / `v_country_producer_deliveries` | Western primary regions + national process/port totals |
| AI narratives + KPIs (CAD / US) | Claude Agent Desk (V2 swarm) | `market_analysis` / `us_market_analysis` + `score_trajectory` / `us_score_trajectory` | Per-grain weekly thesis, stance score, bull/bear reasoning |
| Legacy AI narratives | Retired Grok V1 archive | `grain_intelligence` | Read-only history - never use for live surfaces or calculations |
| X/Twitter social signals | X API v2 gateway + sentiment-scout | `x_market_signals` | Pre-scored, farmer-relevant |
| US export sales / WASDE / conditions | USDA (FAS + NASS) | `usda_export_sales`, `usda_wasde_raw` / `usda_wasde_mapped`, `usda_crop_progress` | US national, mapped to CGC grains; `usda_wasde_raw` also carries world veg-oil rows (`country_code '00'`: rapeseed, rapeseed oil, palm oil, soybean oil) for the bounded Canola demand-context lane. `usda_wasde_estimates` is deprecated/orphaned — do not use for active reads. |
| Fund / commercial positioning | CFTC Disaggregated COT | `cftc_cot_positions` | Per-commodity weekly |
| User farm data | User input | `crop_plans` / `farm_summaries` | Per-user |

## Rules

1. **AAFC `supply_disposition`** is the sole source for balance sheet numbers (production, total supply, exports, crush, carry-out)
2. **CGC `cgc_observations`** is the sole source for weekly operational metrics (deliveries, shipments, stocks)
3. **`grain_intelligence`** is legacy read-only history - NEVER use it for live thesis surfaces or calculations
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
| grain_intelligence | National + Prairie (mixed in retired AI narrative) | Frozen legacy archive |
| x_market_signals | Canadian agriculture Twitter/X | Weekly (before intelligence) |

## Data Flow (Current — V2 Claude Agent Desk)

```
CGC Weekly CSV → import-cgc-weekly → cgc_observations (weekly operational metrics)
AAFC Balance Sheet → supply_disposition (national annual balance)
USDA FAS/NASS/WASDE → usda_* (US weekly + monthly)
CFTC COT → cftc_cot_positions (weekly positioning)
X API v2 gateway (sentiment-scout) → x_market_signals (weekly scored signals)
                      ↓
CAD swarm (6 scouts → 3 specialists → Opus chief) → market_analysis + score_trajectory
US swarm (8 scouts → 4 specialists → Opus chief) → us_market_analysis + us_score_trajectory
                      ↓
Claude/Codex farm summary writer → farm_summaries (personalized narratives)
                      ↓
validate-site-health → health_checks
```

Legacy V1 chain (`search-x-intelligence` → `analyze-market-data`/`analyze-grain-market`
→ `generate-intelligence` → `generate-farm-summary`) is retired. Runtime entrypoints
return HTTP 410 tombstones and must not write `market_analysis`, `grain_intelligence`,
`farm_summaries`, or `x_market_signals`.
