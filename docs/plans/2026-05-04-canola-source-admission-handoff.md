# Canola Source Admission Handoff

Date: 2026-05-04
Updated: 2026-05-06

Purpose: hand off the next Bushel Board session after the deterministic Canola Market Read V1 and knowledge-normalization work. The next session should import and verify source data before adding another thesis writer or dashboard claim.

## Current State

- Branch: `codex/data-layer-foundation-v1`
- PR: https://github.com/Bushels/Bushel-Board/pull/12
- Deterministic Canola Market Read V1 exists and reads from `get_canada_thesis_packet('Canola', ...)`.
- `source_runs` now has successful live run summaries for Producer Cars, CFTC COT, StatsCan crop baseline, Canola Council inventory, FX rates, and grain prices.
- Active Codex automations now refresh Producer Cars, CFTC COT, StatsCan baseline, price/FX, and Canola Council inventory on their source cadence.
- Barchart OnDemand intraday Canola quote support is wired and paused until `BARCHART_ONDEMAND_API_KEY` is available.
- FX CAD recalculation is restricted to service-role collectors after migration `20260506180718`.
- `get_canada_thesis_packet()` now prefers the requested packet crop year for supply rows after migration `20260506181223`; the live Canola read shows the 2025-2026 crop baseline facts.
- No new weather, cash-bid, satellite, AIS, Kalshi, or social-data lane has been admitted for Canola V1.

## Admission Order And 2026-05-05 Outcome

Immediate import/admission order:

1. `cgc_producer_cars`
   - Existing script: `scripts/import-producer-cars.mjs`.
   - Why it matters: direct farmer rail demand and allocation pressure.
   - Outcome: live import succeeded, `producer_car_allocations` has current Canola rows, `source_runs` is populated, and Codex automation runs after the weekly CGC import.

2. `cftc_cot`
   - Existing script/function: `scripts/collect-cftc-cot.py` and Supabase Edge Function `import-cftc-cot`.
   - Why it matters: futures positioning pressure.
   - Outcome: live import succeeded, direct `CANOLA` rows are present, soybean oil/meal remain secondary proxy/context rows, and Codex automation runs after the Friday CFTC release.

3. `aafc_statscan_supply`
   - Existing script: `scripts/import-canola-crop-baseline.ts` for Canola baseline; `scripts/seed-supply-disposition.ts` remains the broader seed path.
   - Why it matters: crop-size denominator for delivery pace, export pace, stocks-to-use, and supply pressure.
   - Outcome: final 2025 production/yield/seeded/harvested acres and 2026 intended seeded acres are stored in `supply_disposition` and exposed through `v_supply_disposition_current`.

4. `grain_prices`
   - Existing lane is thin/stale risk.
   - Why it matters: price follow-through after movement/supply facts.
   - Outcome: FX and grain price importers write `source_runs`; USD-linked price rows receive CAD normalization from the latest available USD/CAD rate on or before the price date.

5. `canola_council_markets_stats`
   - Inventory DB lane now exists: `canola_council_market_stats_inventory`.
   - Why it matters: Canola Council has useful Canola-specific tables for production, processing, supply/disposition, exports, top markets, and prices.
   - Outcome: inventory scraper captures page URL, table title, upstream source, update date, period hints, unit hints, headers, and sample rows. Values are not admitted into metric tables yet.

Deferred for later: weather/drought/satellite/GEE, local cash bids, AIS/shipping, Kalshi, and social/X signal lanes.

## Public Baseline Values To Seed First

| Metric | Value | Source |
| --- | --- | --- |
| 2025 final canola production | 21.804 million tonnes | Statistics Canada, final 2025 production release, 2025-12-04 |
| 2025 final canola yield | 44.7 bu/ac | Statistics Canada, final 2025 production release, 2025-12-04 |
| 2025 final seeded acres | 21.617 million acres | Statistics Canada Table 32-10-0359-01, visible through Canola Council production page |
| 2025 final harvested acres | 21.490 million acres | Statistics Canada Table 32-10-0359-01, visible through Canola Council production page |
| 2026 intended seeded acres | 21.839 million acres | Statistics Canada, seeding-intentions release, 2026-03-05 |

Use these as source-traceable facts only. Do not convert them into thesis prose until the deterministic packet/read shows source, period, unit, and freshness warnings.

## Canola Council Pages To Inventory

- Production: https://www.canolacouncil.org/markets-stats/production/
- Supply/disposition: https://www.canolacouncil.org/markets-stats/supply-disposition/
- Processing: https://www.canolacouncil.org/markets-stats/processing/
- Exports: https://www.canolacouncil.org/markets-stats/exports/
- Top markets: https://www.canolacouncil.org/markets-stats/top-markets/

Admission rule: Canola Council is a strong Canola-specific aggregator. It is not automatically the primary source. Preserve the upstream source label, for example Statistics Canada, Canadian International Merchandise Trade Database, Canadian Oilseed Processors Association, AAFC Outlook for Principal Crops, GlobalData, or LMC.

## Paste-Ready Next Session Prompt

```text
We are in C:\Users\kyle\Agriculture\bushel-board-app on branch codex/data-layer-foundation-v1.

Continue Bushel Board Sprint 1 source admission for Canola.

Read first:
1. PROJECT_STATE.md
2. docs/reference/source-registry.md
3. docs/reference/canonical-grain-fact-model.md
4. docs/plans/2026-05-03-canola-market-read-v1.md
5. docs/plans/2026-05-04-canola-source-admission-handoff.md

Task:
Watch the 2026-05-06 Grain Monitor automation, then verify the first scheduled Codex automation runs for Producer Cars, CFTC COT, StatsCan crop baseline, price/FX, and Canola Council inventory. Confirm each writes or preserves a current `source_run`, and confirm the live Canola packet can see the admitted facts. Do not admit Canola Council scraped values beyond inventory until source label, update date, period, and units are explicit. When the Barchart key arrives, add `BARCHART_ONDEMAND_API_KEY`, dry-run `scripts/import-barchart-canola-intraday.ts`, then unpause the hourly Barchart automation.

Rules:
- Facts, interpretation, and speculation stay separate.
- Use live source tables/RPCs as truth, not stale market_analysis prose.
- Show stale, empty, lagged, or proxy sources explicitly.
- Do not add weather, cash-bid, satellite, AIS, Kalshi, or social-data lanes yet.
- Verify with the exact direct Canola validator before claiming done:
  npx tsx scripts/validate-data-layer-foundation.ts --grain Canola --market Canola
```
