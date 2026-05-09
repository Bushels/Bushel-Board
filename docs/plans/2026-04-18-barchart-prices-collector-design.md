# Barchart-Based Grain Prices Collector — Design Doc

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-18 • **Status:** scoping, blocked on sales contact

## TL;DR

Replace the Yahoo Finance + Barchart-HTML-scrape hybrid in `scripts/import-grain-prices.ts` with a single Barchart REST API collector. This closes our Canola and Spring Wheat data gaps, gives us full historical time series (not just latest close), and unifies currency/unit normalization behind one contract.

**Blocker:** need to finish procurement of Barchart OnDemand (or Barchart Market Data API) access — the sales contact is `solutions@barchart.com`. This doc designs against the likely API shape so we can ship the same day the credentials land.

## Why now

- **Yahoo Finance gaps:** `RS=F` (ICE Canola) and `MW=F` (MGEX Spring Wheat) have no usable data on Yahoo. The live collector falls back to scraping `barchart.com/futures/quotes/<symbol>/overview` for those two — which only returns the latest close, not a multi-day series. Any chart/sparkline for Canola shows a single dot for the day the scrape ran.
- **Fragile scrape:** the HTML overview page layout changes without notice. A Barchart rebrand in Q4 2025 broke the scrape for 3 days until we updated selectors. Next time, canola price_tape goes stale — and the price-analyst Rule 15 trigger fires `price_data_stale: true` on the most important grain in the country.
- **Currency inconsistency:** current code marks Canola as CAD and CBOT symbols as USD, but FX normalization runs downstream via `recalculate_grain_prices_cad`. An authoritative feed that emits native currency per-contract removes guesswork.

## Data shape we need

One row per (grain, contract, price_date) — the existing `grain_prices` UNIQUE key holds:

| Column | Source |
|---|---|
| `settlement_price` | daily settle, in native currency |
| `change_amount` / `change_pct` | WoW/DoD delta vs prior settle |
| `volume` | end-of-day total volume |
| `open_interest` | end-of-day OI |
| `currency` | CAD (RS) / USD (CBOT+MGEX) |
| `source` | `'barchart'` |

The existing schema already has all of these; the scrape path only populates 3–4 columns because the overview HTML doesn't expose volume/OI cleanly.

## Barchart API options

Ranked by preference:

### Option A — Barchart OnDemand (`marketdata.barchart.com`) — preferred
- **Endpoint:** `GET /getHistory?apikey=<k>&symbol=RSK26&type=daily&startDate=20260101`
- **Returns:** JSON with daily OHLCV + settle for the entire contract lifetime.
- **Auth:** API key in query string (or header, per tenant contract).
- **Rate limit:** varies by contract; typical $500/mo tier gives 10K calls/day. We need ~7 grains × 1 call/day = 7 calls/day. Massive headroom.
- **Coverage:** ICE Canola (RSK26, RSN26, RSX26 roll), MGEX Spring Wheat (MWK26), full CBOT complex, plus Matif (European rapeseed) if we ever want it.

### Option B — Barchart Market Data API (github.com/barchart)
- Public SDKs (`barchart/marketdata-api-js`, `barchart/marketdata-api-python`) are WebSocket-based streaming feeds — designed for live quotes, not batch EOD.
- Would work but overkill for our "1 cron per day, grab yesterday's settle" use case.
- Could use for Bushy chat real-time price tool later.

### Option C — Continue scraping Barchart HTML
- Only fallback if A/B both blocked on cost. Fragile, partial data, legally gray-area (ToS forbids scraping).
- Acceptable ONLY as a transition while we wait for key. Document the reliance in monitoring so the first pulse_pm after a scrape break fires an alert.

**Recommendation:** Option A. Email to `solutions@barchart.com` asking for OnDemand quote for: 2 exchanges (ICE + MGEX) + CBOT + daily history + 10K calls/day cap. Expected <$1K/mo based on public pricing tiers for OnDemand.

## Collector architecture

### File layout

```
supabase/functions/import-grain-prices/index.ts     # new Edge Function (replaces npm run import-prices)
lib/grain-price-sources.ts                           # keep; add fetchBarchartOnDemand()
scripts/import-grain-prices.ts                       # keep for manual runs / backfills
```

Move the canonical runtime from a local `npm run` script to an Edge Function so it fits the other scheduled collectors (`collect-cgc`, `collect-wasde`, etc.). Keep the script for dev + backfills.

### Flow (per run, once per weekday at ~16:30 ET after CBOT close)

1. For each `GRAIN_SPECS[i]`, call `fetchBarchartOnDemand(spec.barchartSymbol, startDate, endDate)` with `startDate = max(last_imported, now - 7d)`.
2. Normalize response → `PriceRow[]`. Values arrive in native currency per-contract (no cents→dollars flip needed; Barchart OnDemand settle is already in base units).
3. Upsert batch to `grain_prices` with `ON CONFLICT (grain, contract, price_date) DO UPDATE` so intraday reruns are idempotent.
4. Call `recalculate_grain_prices_cad(start, end)` RPC to fill the `settlement_price_cad` column using latest FX.
5. Emit audit row to `cgc_imports`-style log (or reuse `pipeline_runs` with `source='barchart-prices'`).

### Contract-roll handling

Existing specs hardcode `RSK26`, `MWK26`. Once May 2026 contracts first-notice out, we need `RSN26`, `MWN26`. Options:

- **A. Reference table** — `grain_contract_calendar (grain, symbol, first_trade, first_notice, is_active)`. Collector reads `is_active=true` rows. Rolls managed via migration.
- **B. Nearest-active resolver** — Barchart OnDemand `getQuote` with wildcard `RS*` returns the current active contract. Collector picks it. Simpler but opaque in logs.

**Recommendation: A.** Explicit contract calendar matches our audit-trail norms and makes the "which contract was cited in week X?" question answerable from Supabase alone.

## Monitoring

Add to validate-site-health checks (if not already present):
- `grain_prices.price_date` max < 4 calendar days old → warn
- `grain_prices.price_date` max < 7 calendar days old → alert, trigger `price_data_stale` in price-analyst
- Each run writes `x_api_query_log`-style audit row with `rows_fetched`, `duration_ms` (new table `price_import_log` or reuse existing import tracking).

## Migration plan

**Step 1 (today, blocked on sales):** Get OnDemand key.

**Step 2:** Add `fetchBarchartOnDemand(symbol, start, end)` to `lib/grain-price-sources.ts`. Keep existing `fetchBarchartSnapshot` as fallback for the 24h window when OnDemand key first lands (no backfill yet).

**Step 3:** Add `grain_contract_calendar` migration + seed with current active contracts.

**Step 4:** Port `scripts/import-grain-prices.ts` logic into `supabase/functions/import-grain-prices/index.ts` and wire scheduled task at 16:30 ET weekdays.

**Step 5:** Backfill: run script with `--days 365` once to populate a year of daily history for Canola + Spring Wheat (today's table has zero rows for those). Verify against one external check point (e.g., `RSK26` 2026-01-15 settle from agriculture.com or AAFC weekly report).

**Step 6:** Retire Yahoo fetcher. Flip all `GRAIN_SPECS` entries to `barchartSymbol`. Drop `yahooSymbol` field entirely. Update tests.

**Step 7:** Monitor for 2 weeks, then remove the legacy HTML scrape code path from `lib/grain-price-sources.ts`.

## Budget envelope

7 grains × 1 daily history call × 22 weekday runs/mo = **154 calls/mo** for the scheduled collector.
If we add intraday refresh (hourly during market hours): 7 × 8h × 22d = 1,232 calls/mo. Still inside a $500/mo OnDemand tier.

Bushy real-time price tool (future): cap at 100 calls/day = 3,000/mo. Total ≈ 4,200 calls/mo. Comfortable on standard tier.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Barchart pricing is opaque without sales call | Email-in parallel with scoping; if quote >$1K/mo, fall back to DTN or Refinitiv for quote |
| OnDemand data lags settle by 30–60 min after close | Schedule collector 2h after market close instead of the close itself |
| Contract roll missed → stale data flagged as fresh | `grain_contract_calendar.is_active` check + validate-site-health flag on price_date staleness |
| Lost Yahoo fallback means a Barchart outage = zero prices | Keep Yahoo fetcher as read-only fallback behind a feature flag for 30 days after cutover |

## Definition of Done

- [ ] Barchart OnDemand API key in Vercel env + Supabase secrets (`BARCHART_API_KEY`)
- [ ] `fetchBarchartOnDemand` unit-tested against fixture JSON
- [ ] `grain_contract_calendar` table seeded with current 7 active contracts
- [ ] `supabase/functions/import-grain-prices` deployed; scheduled task `collect-grain-prices` created (16:30 ET Mon–Fri)
- [ ] 365-day backfill for Canola + Spring Wheat verified against external check point
- [ ] `v_latest_grain_prices` returns fresh rows for all 7 grains
- [ ] Dashboard grain-hero sparkline (`PriceSparkline`) renders Canola + Spring Wheat without gaps
- [ ] Yahoo fetcher removed from code path; README + CLAUDE.md updated

## Open questions

1. Do we want per-crop-year contract preferences (always front-month vs always new-crop-month)? Price-analyst Rule 15 cites a specific contract; having both `front` and `new_crop` rows simultaneously would let the analyst choose the right one per grain.
2. Is Matif rapeseed ($RS-like European contract) useful for canola cross-reference? Cheap to add if the tier covers it.
3. Should we also collect ICE HRSW (hard red spring) as a cross-check on MGEX, or stick with MGEX as the single spring-wheat authority?
