# Canola Command - Production Release

- **Release date:** 2026-07-29 MT
- **Status:** Owner-only production release complete
- **Production:** https://prairie-canola-command.buperac.chatgpt.site
- **Site source:** `canola-command/` commit `2b7797063e57d7bb5b8e181f55b89d2951379a13`
- **Pipeline source:** root commit `f5d0cdaab4aea024059a9afbb7f882b957483d76`

## Product truth

Canola Command is a release-time market intelligence board, not a tick-by-tick trading terminal. It automates official-source ingestion, shows each source's reporting period and next expected release, reconciles physical supply and demand, and ranks separate bull and bear pressure. A missing source stays missing. A failed or pre-release collector run cannot make an overdue source look current.

The board intentionally withholds a directional score when evidence coverage or cash transmission is insufficient. CFTC positioning, rail expectations, vessel congestion, and similar ambiguous timing signals may change urgency, but they do not vote on price direction.

## Live official data spine

| Lane | Role | Timing and release rule | Score authority |
|---|---|---|---|
| CGC weekly grain statistics | Producer deliveries, direct crush, exports, and licensed stocks | Weekly; Thursday release clock, accepted only after a successful run for the new source period | Core physical vote |
| AAFC Outlook for Principal Field Crops | Seeded area, yield, production, crush, exports, and carryout targets across three crop years | Outlook-release cadence; latest accepted publication is dated 2026-07-20 | One balance-sheet lineage vote; components also support attribution |
| Statistics Canada | Farm-stock anchors, commercial stocks, crush/output, and renewable-fuel context | Table-specific monthly/quarterly clocks | Physical anchor or confirmation, depending on table |
| USDA PSD | U.S. rapeseed and rapeseed-oil supply/demand balance | Monthly release period | U.S. balance confirmation |
| EIA Monthly Biofuels Capacity and Feedstocks Update | U.S. Canola-oil biofuel feedstock consumption | Monthly; latest accepted period April 2026, released 2026-06-30; next expected 2026-07-31 | Demand confirmation only; country of origin is not reported |
| CFTC COT | Managed-money and commercial Canola positioning | Weekly report | Timing/crowding only; zero score |
| Prairie crop reports | Canola area, development, and condition evidence | Province-specific weekly/seasonal cadence | Crop evidence when the exact province/period package is accepted |
| Grain Monitor and Producer Cars | Port/vessel congestion and rail allocation context | Weekly publication clocks | Watch/timing only; zero score |

## Physical ledger

The farmer-readable inventory model separates observed and modeled quantities:

1. CGC supplies observed crop-year producer deliveries, crush, exports, and licensed primary/process/port stocks.
2. Statistics Canada supplies the latest official farm-stock anchor.
3. Farm bins are modeled forward from that anchor using date-prorated CGC deliveries plus a calibrated unreported-disappearance term.
4. The displayed scenario range tests zero to two times that calibrated disappearance rate. It is explicitly not a confidence interval.
5. AAFC carryout is reconciled against modeled farm bins plus licensed stocks, while AAFC crush/export targets are compared with accepted CGC actual pace.
6. Rollover, reconciliation, cumulative-series forward-fill, and double-count gates fail closed.

## Canadian demand engine

- COPA estimated 2026 Canola crush nameplate: 15.0 Mt/year.
- AAFC 2026-27 crush forecast: 13.5 Mt, displayed as forward load against nameplate, not measured utilization.
- Statistics Canada seed crushed, oil output, and meal output are displayed separately.
- Renewable-fuel capacity, actual fuel output, seed-crush capacity, and oil volume remain separate units and are never added together.
- EIA adds a direct official U.S. Canola-oil biofuel consumption lane while clearly stating that the source does not identify the oil's country of origin.

## Cash and farmer decision layer

The board does not pretend a public futures proxy is the farmer's realizable price.

- PDQ is treated as licensed/private. Current terms prohibit scraping and public redistribution without written authorization.
- A current licensed ICE Canola feed remains an external commercial gate.
- The private calculator accepts the farmer's actual elevator bid, tonnes, optional ICE reference, later bid, freight, grade deductions, storage, holding months, and financing rate.
- Inputs stay in the browser tab. The output shows net farmgate today, basis, cheque value, carrying cost, later-bid hurdle, and the tested later-bid advantage.

## Automation

- `bushel-collect-aafc-canola`: weekdays at 08:45 MT, no-agent Hermes job.
- `bushel-collect-eia-canola`: weekdays at 09:20 MT, no-agent Hermes job.
- Both exact installed Windows aliases completed manual production-path runs successfully.
- The AAFC collector discovers the newest official outlook, requires three crop years and all expected metrics, reconciles the balance, and writes idempotently.
- The EIA collector requires the exact official series, unit, U.S. row, and six consecutive months, then commits data and source-run evidence atomically.
- A Census customs launcher exists but is intentionally unscheduled until `CENSUS_API_KEY` is present.

## Ranking contract

- Deterministic model version: `CANOLA-EVIDENCE-V1.2.0`.
- Bull pressure and bear pressure remain separate; missing evidence is not renormalized away.
- Coverage is shown by decision horizon.
- Price context confirms transmission but cannot override official physical movement or balance-sheet facts by itself.
- AAFC has one directional lineage vote even when several AAFC components are displayed.
- COT, rail, vessels, and social/context lanes have zero directional score authority.
- The strongest current bull and bear cases are selected from accepted evidence, not hardcoded copy.

## Production proof

- Private production request returned HTTP 200 for the allowed owner.
- Production title and headline loaded from live data; the physical ledger reported live.
- EIA production lane returned April 2026 at 365 million pounds.
- Farm calculator reproduced the audited test case: $680/t net farmgate, -$20/t basis, $680,000 cheque, $23.60/t carry, $723.60/t hurdle, and $6.40/t tested advantage.
- Desktop and 390 px mobile views had no horizontal overflow.
- Browser console errors: 0.
- Recent production Worker errors: 0.
- Nested site tests: 43/43; lint and production build passed.
- Root tests: 1,263/1,263 TypeScript tests and 73/73 Python collector tests; typecheck and production build passed.
- Production Supabase migrations and the EIA atomicity/security regression passed.

## Known external gates

These are visible data gaps, not hidden product completion claims:

1. Written PDQ redistribution authorization or another licensed current ICE/cash-price feed.
2. Farmer-specific elevator bid/basis/freight/grade/storage feeds; manual private entry is live now.
3. `CENSUS_API_KEY` for Canada-origin U.S. Canola seed/oil customs.
4. Destination-specific Canadian customs trade beyond aggregate CGC exports.
5. Fresh Grain Monitor, Producer Cars, Manitoba crop, and complete Prairie package releases.
6. Pre-existing Supabase migration-history drift outside the Canola migration set; it was not rewritten during this release.

## Repository boundary

The existing Bushel Board normal `/thesis` route remains Wheat-only. Canola Command is a separate production property and codebase inside `canola-command/`. Shared root collectors and database migrations can serve both products, but no Canola display was silently re-enabled inside the Wheat farmer board.
