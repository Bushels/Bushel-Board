# Canola Source Admission Handoff

Date: 2026-05-04

Purpose: hand off the next Bushel Board session after the deterministic Canola Market Read V1 and knowledge-normalization work. The next session should import and verify source data before adding another thesis writer or dashboard claim.

## Current State

- Branch: `codex/data-layer-foundation-v1`
- PR: https://github.com/Bushels/Bushel-Board/pull/12
- Deterministic Canola Market Read V1 exists and reads from `get_canada_thesis_packet('Canola', ...)`.
- `source_runs` exists, but each collector still needs live run summaries before source freshness becomes complete.
- No new weather, cash-bid, satellite, AIS, Kalshi, or social-data lane has been admitted for Canola V1.

## What Is Left For Canola Data

Immediate import/admission order:

1. `cgc_producer_cars`
   - Existing script: `scripts/import-producer-cars.mjs`.
   - Why it matters: direct farmer rail demand and allocation pressure.
   - Need next: dry-run/live verification, table freshness check, source-run summary, and packet/RPC visibility.

2. `cftc_cot`
   - Existing script/function: `scripts/collect-cftc-cot.py` and Supabase Edge Function `import-cftc-cot`.
   - Why it matters: futures positioning pressure.
   - Need next: verify latest CFTC import, confirm `CANOLA (ICE)` direct rows, keep soybean oil/meal as proxy/context, and show COT lag by design.

3. `aafc_statscan_supply`
   - Existing script: `scripts/seed-supply-disposition.ts`.
   - Why it matters: crop-size denominator for delivery pace, export pace, stocks-to-use, and supply pressure.
   - Need next: update Canola baseline rows with final 2025 crop size and 2026 intended acres.

4. `grain_prices`
   - Existing lane is thin/stale risk.
   - Why it matters: price follow-through after movement/supply facts.
   - Need next: verify current Canola futures/price feed, sample timestamp, unit, contract, and CAD/USD handling.

5. `canola_council_markets_stats`
   - New candidate registry source, not yet a DB lane.
   - Why it matters: Canola Council has useful Canola-specific tables for production, processing, supply/disposition, exports, top markets, and prices.
   - Need next: scrape inventory first, not ingestion. Capture page URL, table title, upstream source, update date, period, units, and whether the value is raw source truth or a Council-compiled display.

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
Start with Producer Cars and CFTC COT. Verify/import deterministically, write source_runs where the collectors support it, and confirm what the live Canola packet can see. Then seed or prepare the Statistics Canada 2025 final Canola production/yield/acres and 2026 intended seeded acres. Inventory Canola Council Markets & Stats pages, but do not admit scraped values until source label, update date, period, and units are explicit.

Rules:
- Facts, interpretation, and speculation stay separate.
- Use live source tables/RPCs as truth, not stale market_analysis prose.
- Show stale, empty, lagged, or proxy sources explicitly.
- Do not add weather, cash-bid, satellite, AIS, Kalshi, or social-data lanes yet.
- Verify with the exact direct Canola validator before claiming done:
  npx tsx scripts/validate-data-layer-foundation.ts --grain Canola --market Canola
```
