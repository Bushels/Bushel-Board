# Yahoo Finance Grain Prices Integration — Design Doc

**Date:** 2026-03-18
**Status:** Approved
**Author:** Kyle + Claude
**Track:** #23 — Live Grain Futures Prices

## Problem

The `grain_prices` table exists but is empty. The Advisor chat (`context-builder.ts`) already queries `getRecentPrices()` per grain — it returns nothing. The intelligence pipeline (`analyze-grain-market`) relies on Grok's `web_search` to find prices at generation time, which is unreliable and ephemeral. Every thesis we generate lacks anchored price context.

## Solution

A Node.js script (`scripts/import-grain-prices.ts`) that fetches daily futures settlement data from Yahoo Finance's public HTTP API and upserts into the existing `grain_prices` table. No API key required. No new dependencies.

## Approach

**Phase A (this track):** Local script, manual trigger, populates prices before intelligence runs.
**Phase B (future):** Supabase Edge Function (`import-grain-prices`) triggered by `pg_cron` or pipeline chaining via `enqueue_internal_function`. Keeps DB-heavy background jobs co-located with the database.

## Symbol Mapping

| Bushel Board Grain | Yahoo Ticker | Exchange | Currency | Unit |
|---|---|---|---|---|
| Wheat | `ZW=F` | CBOT | USD | cents/bu |
| Canola | `RS=F` | ICE/WCE | CAD | $/tonne |
| Corn | `ZC=F` | CBOT | USD | cents/bu |
| Oats | `ZO=F` | CBOT | USD | cents/bu |
| Soybeans | `ZS=F` | CBOT | USD | cents/bu |
| HRW Wheat | `KE=F` | CBOT | USD | cents/bu |
| Spring Wheat | `MWE=F` | MIAX | USD | cents/bu |

**Grains without futures (no price data):** Barley, Flaxseed, Peas, Lentils, Amber Durum, Rye, Mustard Seed, Sunflower, Canary Seed, Chickpeas, Triticale. These are handled gracefully — `getRecentPrices()` returns `[]` and price context is omitted from prompts.

**Canola note:** `RS=F` trades on ICE Canada and may not be available through Yahoo Finance. The script must handle this gracefully (skip + log warning). If unavailable, Canola remains price-less in the DB and we evaluate Barchart OnDemand as a future supplement.

## Price Unit Normalization (Critical)

**CBOT grains quote in cents per bushel.** Yahoo returns `558.25` which means 558.25 cents = **$5.5825/bu**. Storing raw values and displaying `$558.00` would be a 100x error that destroys farmer trust.

**Strategy: Normalize to base currency at ingestion.**

| Exchange | Raw Unit | Stored As | Normalization |
|---|---|---|---|
| CBOT | cents/bu | USD/bu | `raw / 100` |
| ICE/WCE (Canola) | CAD/tonne | CAD/tonne | No conversion needed |

The `settlement_price` column always stores the price in the base currency unit (dollars, not cents). Downstream consumers never need to know about cents — they just format `$5.58/bu` or `$673.50/tonne`.

A `unit` column will be added to the schema to disambiguate display formatting (e.g., `$/bu` vs `$/tonne`).

## Data Flow

```
Yahoo Finance HTTP API (query2.finance.yahoo.com)
        ↓
scripts/import-grain-prices.ts (Node.js/TypeScript)
        ↓ upsert via Supabase service role
grain_prices table (existing schema, unchanged)
        ↓ already wired (zero code changes)
├── Advisor chat (lib/advisor/context-builder.ts → getRecentPrices)
└── Intelligence pipeline (future: data-brief.ts price summary)
```

## Yahoo Finance HTTP API

**Endpoint:** `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}`

**Query parameters:**
- `range=32d` — lookback window (`days + 2` buffer for N+1 change calculation + weekends)
- `interval=1d` — daily bars
- `includePrePost=false` — settlement prices only

**Response structure (relevant fields):**
```json
{
  "chart": {
    "result": [{
      "meta": { "currency": "USD", "exchangeName": "CME", "symbol": "ZW=F" },
      "timestamp": [1710201600, ...],
      "indicators": {
        "quote": [{
          "close": [548.25, 552.00, ...],
          "volume": [85600, 79400, ...],
          "open": [...], "high": [...], "low": [...]
        }]
      }
    }]
  }
}
```

**Rate limiting:** Yahoo has no documented rate limit for this endpoint, but we'll be polite with 500ms delays between requests (~7 grains × 0.5s = 3.5s total). The script makes at most 7 HTTP requests per run.

## Script Specification

### CLI Interface

```bash
npm run import-prices              # Fetch & upsert last 30 days for all grains
npm run import-prices -- --dry-run # Fetch & print, no DB writes
npm run import-prices -- --days 7  # Override lookback window
npm run import-prices -- --help    # Show usage
```

### Field Mapping

| Yahoo Field | grain_prices Column | Notes |
|---|---|---|
| `meta.symbol` | — | Used to look up grain name from mapping |
| `timestamp[i]` | `price_date` | Unix → YYYY-MM-DD |
| `quote.close[i]` | `settlement_price` | Normalized: CBOT `raw/100` (cents→dollars), ICE as-is |
| computed | `change_amount` | `close[i] - close[i-1]` (N+1 lookback: fetch extra day, discard anchor) |
| computed | `change_pct` | `change_amount / close[i-1] * 100` |
| `quote.volume[i]` | `volume` | Daily volume |
| — | `open_interest` | Not available from Yahoo chart API (NULL) |
| mapping config | `grain` | From symbol mapping table |
| mapping config | `contract` | Yahoo ticker (e.g., `ZW=F`) |
| mapping config | `exchange` | From mapping (e.g., `CBOT`) |
| mapping config | `currency` | From mapping (e.g., `USD`) |
| hardcoded | `source` | `"yahoo-finance"` |

### Output

JSON to stdout:
```json
{
  "dry_run": false,
  "grains_fetched": 6,
  "grains_skipped": ["Canola"],
  "rows_upserted": 180,
  "errors": 0,
  "duration_ms": 4200
}
```

Diagnostics to stderr:
```
Fetching Wheat (ZW=F)... 30 bars
Fetching Canola (RS=F)... WARN: no data returned, skipping
Fetching Corn (ZC=F)... 30 bars
...
Done. Upserted: 180, Skipped: 1 (Canola), Errors: 0, Time: 4.2s
```

### N+1 Lookback for Change Calculation

To correctly compute `change_amount` for every day in the requested window, the script fetches `days + 2` days from Yahoo (extra buffer for weekends). The earliest fetched bar is used only as a reference for computing the second bar's change — it is **not upserted** into the database. This prevents overwriting real change values with `0` on subsequent runs with smaller windows.

### Error Handling

- **No data for symbol:** Log warning, skip, continue to next grain. Non-fatal.
- **Yahoo API returns error/500:** Retry once after 2s. If still fails, skip and log.
- **Supabase upsert error:** Log error, continue. Report in summary.
- **All symbols fail:** Exit with code 1 and error summary.

### Conventions

Following existing script patterns (`seed-grain-prices.ts`, `seed-supply.ts`):
- Accept `--help` flag
- JSON output to stdout, diagnostics to stderr
- Idempotent (upsert with `ON CONFLICT (grain, contract, price_date)`)
- Load `.env.local` for Supabase credentials
- Pin approach: no new npm dependencies (uses native `fetch`)

## Schema Changes (Minor Migration)

The existing `grain_prices` table needs one new column for display formatting:

```sql
-- Migration: add unit column for price display formatting
ALTER TABLE grain_prices ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '$/bu';
```

Updated schema:
```sql
CREATE TABLE grain_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  contract text NOT NULL,
  exchange text NOT NULL,
  price_date date NOT NULL,
  settlement_price numeric,    -- Always in base currency (dollars, not cents)
  change_amount numeric,
  change_pct numeric,
  volume integer,
  open_interest integer,
  currency text NOT NULL DEFAULT 'CAD',
  unit text NOT NULL DEFAULT '$/bu',  -- NEW: '$/bu' or '$/tonne'
  source text NOT NULL,
  imported_at timestamptz DEFAULT now(),
  UNIQUE (grain, contract, price_date)
);
```

**Currency default note:** The script MUST explicitly pass `currency` in every upsert row. CBOT grains are USD — relying on the `DEFAULT 'CAD'` would silently corrupt data.

## Integration Points (Already Wired)

### 1. Advisor Chat (zero changes needed)

`lib/advisor/context-builder.ts:157-175` already calls:
```typescript
const prices = await getRecentPrices(grain, 5).catch(() => []);
```

Once the table has data, the Advisor will automatically include price context like:
> "Wheat (ZW=F): $5.58/bu, +1.2% this week, CBOT"

(Note: stored as normalized dollars, not cents — $5.58 not $558)

### 2. Intelligence Pipeline (future enhancement)

`supabase/functions/_shared/data-brief.ts` could be extended to include a price summary in the pre-computed analyst ratios injected into Grok's prompt. This is not part of Phase A.

## Testing Plan

1. Run `npm run import-prices -- --dry-run` — verify fetch works, no DB writes
2. Run `npm run import-prices` — verify rows appear in `grain_prices`
3. Verify: `SELECT * FROM v_latest_grain_prices;` returns data
4. Verify: Advisor chat for a grain with prices shows price context
5. Verify: Grains without futures (e.g., Barley) gracefully omit prices

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Yahoo blocks/throttles requests | Low | 500ms delay, only 7 requests. Personal use. |
| `RS=F` (Canola) not available | Medium | Graceful skip. Evaluate Barchart later. |
| Yahoo API response format changes | Low | Pin to v8 chart API. Script logs parse errors clearly. |
| Open interest not available | Certain | Column stays NULL. Not critical for thesis. |
| Yahoo ToS restricts automated use | Medium | "Research and educational purposes" per yfinance. Low volume. |

## Definition of Done

1. `npm run import-prices` fetches and upserts grain futures prices
2. `npm run import-prices -- --dry-run` works without DB writes
3. `npm run import-prices -- --help` shows usage
4. `npm run build` passes
5. `v_latest_grain_prices` view returns real data
6. Advisor chat shows price context for Wheat (manual test)
7. Script handles symbol failures gracefully (no crash on Canola skip)
8. Documented in CLAUDE.md
