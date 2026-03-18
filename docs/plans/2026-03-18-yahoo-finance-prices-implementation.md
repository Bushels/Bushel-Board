# Yahoo Finance Grain Prices — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Populate `grain_prices` table with real daily futures data from Yahoo Finance so the Advisor chat and intelligence pipeline have anchored price context.

**Architecture:** Node.js TypeScript script fetches from Yahoo Finance v8 chart HTTP API, normalizes CBOT cents→dollars, upserts into existing Supabase `grain_prices` table. One minor migration adds `unit` column. Query layer gets `unit` field. No new npm dependencies.

**Tech Stack:** TypeScript (tsx), native `fetch`, Supabase JS client, existing `grain_prices` schema.

**Design Doc:** `docs/plans/2026-03-18-yahoo-finance-prices-design.md`

---

### Task 1: Schema Migration — Add `unit` Column

**Files:**
- Create: `supabase/migrations/20260318120000_add_grain_prices_unit.sql`

**Step 1: Write the migration**

```sql
-- Add unit column to grain_prices for display formatting
-- '$/bu' for CBOT grains (wheat, corn, oats, soybeans)
-- '$/tonne' for ICE grains (canola)
ALTER TABLE grain_prices ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '$/bu';

-- Update the convenience view to include the new column
CREATE OR REPLACE VIEW v_latest_grain_prices AS
SELECT DISTINCT ON (grain)
  grain,
  contract,
  exchange,
  price_date,
  settlement_price,
  change_amount,
  change_pct,
  currency,
  unit,
  source
FROM grain_prices
ORDER BY grain, price_date DESC;
```

**Step 2: Apply migration to Supabase**

Run via Supabase MCP `apply_migration` tool with:
- `project_id`: `ibgsloyjxdopkvwqcqwh`
- `name`: `add_grain_prices_unit`
- `query`: the SQL above

**Step 3: Verify migration**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'grain_prices' AND column_name = 'unit';
```

Expected: `unit | text | '$/bu'::text`

**Step 4: Commit**

```bash
git add supabase/migrations/20260318120000_add_grain_prices_unit.sql
git commit -m "feat: add unit column to grain_prices for display formatting"
```

---

### Task 2: Update Query Layer — Include `unit` Field

**Files:**
- Modify: `lib/queries/grain-prices.ts`
- Modify: `lib/advisor/types.ts`

**Step 1: Add `unit` to the `GrainPrice` interface**

In `lib/queries/grain-prices.ts`, update the `GrainPrice` interface:

```typescript
export interface GrainPrice {
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  contract: string;
  exchange: string;
  currency: string;
  unit: string;
}
```

**Step 2: Add `unit` to the Supabase select and mapping**

In the same file, update `getRecentPrices`:

```typescript
export async function getRecentPrices(
  grainName: string,
  days = 10
): Promise<GrainPrice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grain_prices")
    .select("price_date, settlement_price, change_amount, change_pct, contract, exchange, currency, unit")
    .eq("grain", grainName)
    .order("price_date", { ascending: false })
    .limit(days);

  if (error) {
    console.error("getRecentPrices error:", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    price_date: String(r.price_date),
    settlement_price: Number(r.settlement_price),
    change_amount: Number(r.change_amount),
    change_pct: Number(r.change_pct),
    contract: String(r.contract),
    exchange: String(r.exchange),
    currency: String(r.currency),
    unit: String(r.unit),
  }));
}
```

**Step 3: Add `unit` to `GrainPriceContext` in advisor types**

In `lib/advisor/types.ts`, update `GrainPriceContext`:

```typescript
export interface GrainPriceContext {
  grain: string;
  latest_price: number;
  price_change_pct: number;
  contract: string;
  exchange: string;
  currency: string;
  unit: string;
  price_date: string;
}
```

**Step 4: Update context-builder to pass `unit` through**

In `lib/advisor/context-builder.ts`, around line 164, update the price mapping:

```typescript
return {
  grain,
  latest_price: latest.settlement_price,
  price_change_pct: latest.change_pct,
  contract: latest.contract,
  exchange: latest.exchange,
  currency: latest.currency,
  unit: latest.unit,
  price_date: latest.price_date,
};
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: No errors.

**Step 6: Commit**

```bash
git add lib/queries/grain-prices.ts lib/advisor/types.ts lib/advisor/context-builder.ts
git commit -m "feat: include unit field in grain price queries and advisor context"
```

---

### Task 3: Write the Import Script

**Files:**
- Create: `scripts/import-grain-prices.ts`

**Step 1: Write the complete script**

Reference `scripts/seed-grain-prices.ts` for patterns (env loading, CLI flags, batch upsert, JSON stdout).

The script must implement:

1. **Symbol mapping config** — hardcoded array of `{ grain, symbol, exchange, currency, unit, centsToBase }` objects. `centsToBase: true` for all CBOT grains.

2. **Yahoo Finance fetch function** — `fetchYahooChart(symbol: string, days: number)` that calls `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${days + 2}d&interval=1d&includePrePost=false`. Returns parsed `{ timestamps, closes, volumes }` or `null` on failure. Retry once on 500 with 2s delay.

3. **Row builder** — iterates timestamps/closes, normalizes CBOT cents→dollars (`close / 100`), computes day-over-day `change_amount` and `change_pct`. Uses N+1 pattern: first bar is anchor for change calc only — discard from upsert set.

4. **Supabase upsert** — batch upsert with `onConflict: "grain,contract,price_date"`. Explicitly passes `currency`, `unit`, and `source: "yahoo-finance"` in every row. Never relies on schema defaults.

5. **CLI** — `--help`, `--dry-run`, `--days N` (default 30). 500ms `setTimeout` between grains.

6. **Output** — JSON summary to stdout, diagnostics to stderr. Exit 1 if all symbols fail.

Key implementation details:

```typescript
// Symbol mapping
const GRAIN_SYMBOLS = [
  { grain: "Wheat", symbol: "ZW=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Canola", symbol: "RS=F", exchange: "ICE", currency: "CAD", unit: "$/tonne", centsToBase: false },
  { grain: "Corn", symbol: "ZC=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Oats", symbol: "ZO=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Soybeans", symbol: "ZS=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "HRW Wheat", symbol: "KE=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Spring Wheat", symbol: "MWE=F", exchange: "MGEX", currency: "USD", unit: "$/bu", centsToBase: true },
];

// Yahoo fetch — key parsing logic
const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${days + 2}d&interval=1d&includePrePost=false`;
// Parse: chart.result[0].timestamp, chart.result[0].indicators.quote[0].close/volume
// Timestamps are Unix seconds → new Date(ts * 1000).toISOString().slice(0, 10)
// CAUTION: UTC conversion — verify during dry run that dates match actual trading days
// Yahoo daily timestamps are typically market close (16:00 ET), safe for UTC extraction

// Cents normalization
const normalizedClose = config.centsToBase ? rawClose / 100 : rawClose;

// N+1 change calc — skip index 0 for upsert, use it only as prev reference
for (let i = 1; i < closes.length; i++) {
  const prev = config.centsToBase ? closes[i - 1] / 100 : closes[i - 1];
  const curr = config.centsToBase ? closes[i] / 100 : closes[i];
  const change_amount = Number((curr - prev).toFixed(4));
  const change_pct = prev ? Number(((change_amount / prev) * 100).toFixed(3)) : 0;
  // push row with curr, change_amount, change_pct
}
```

**Step 2: Add `import-prices` script to `package.json`**

Add to the `"scripts"` section:
```json
"import-prices": "npx tsx scripts/import-grain-prices.ts"
```

**Step 3: Verify `--help` works**

Run: `npm run import-prices -- --help`
Expected: Usage text to stderr, exit 0.

**Step 4: Commit**

```bash
git add scripts/import-grain-prices.ts package.json
git commit -m "feat: add Yahoo Finance grain price import script"
```

---

### Task 4: Test Dry Run

**Step 1: Run dry run**

Run: `npm run import-prices -- --dry-run`

Expected stderr output like:
```
Fetching Wheat (ZW=F)... 30 bars
Fetching Canola (RS=F)... [30 bars or WARN: no data]
Fetching Corn (ZC=F)... 30 bars
...
```

Expected stdout: JSON summary with `"dry_run": true`.

**Step 2: Verify price normalization in dry-run output**

Check that CBOT wheat prices are in the ~$5-6 range (dollars), NOT ~$550-600 (cents). If you see prices above $100 for wheat, the cents normalization is broken.

**Step 3: Check Canola (RS=F) availability**

Note in stderr whether Canola returns data or is skipped. Either outcome is acceptable — document which one occurred.

---

### Task 5: Live Import Run

**Step 1: Run the import**

Run: `npm run import-prices`

Expected: JSON summary showing `rows_upserted > 0`, `errors: 0`.

**Step 2: Verify data in Supabase**

```sql
SELECT * FROM v_latest_grain_prices;
```

Expected: One row per grain with real prices, `source = 'yahoo-finance'`.

**Step 3: Spot-check normalization**

```sql
SELECT grain, settlement_price, currency, unit
FROM grain_prices
WHERE grain = 'Wheat'
ORDER BY price_date DESC
LIMIT 3;
```

Expected: `settlement_price` in ~$5-6 range (USD/bu), NOT ~$550.

**Step 4: Spot-check change calculations**

```sql
SELECT grain, price_date, settlement_price, change_amount, change_pct
FROM grain_prices
WHERE grain = 'Wheat'
ORDER BY price_date DESC
LIMIT 5;
```

Expected: `change_amount` is reasonable day-over-day delta (e.g., ±$0.05), `change_pct` is small (e.g., ±1%).

**Step 5: Commit** (nothing to commit — data is in Supabase, not git)

---

### Task 6: Gemini Verification of Live Data

**Step 1: Ask Gemini to cross-check prices**

Use `mcp__gemini-cli__ask-gemini` to verify:
- "Cross-check the Wheat futures price we just imported against current market data. Our imported Wheat (ZW=F) shows $X.XX/bu on date YYYY-MM-DD. Does this look correct? Also verify Corn and Oats if available."

This catches any systematic normalization errors before the data feeds into the Advisor.

---

### Task 7: Build Verification

**Step 1: Run production build**

Run: `npm run build`
Expected: No errors. The `unit` field additions to types must compile cleanly.

**Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass. No existing tests touch `grain_prices` so no breakage expected.

**Step 3: Commit if any fixes were needed**

---

### Task 8: Update CLAUDE.md and STATUS.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plans/STATUS.md`

**Step 1: Add to CLAUDE.md**

In the `## Commands` section, add:
```
- `npm run import-prices` — Fetch daily grain futures from Yahoo Finance into Supabase
```

In the `## Intelligence Pipeline` tables section, update `grain_prices` description:
```
`grain_prices` (daily futures settlement prices, source: yahoo-finance)
```

**Step 2: Add Track #23 to STATUS.md**

Add a new track entry:
```
| 23 | Live Grain Futures Prices | Complete (Phase A) | Yahoo Finance import script, 7 grains, daily settlement data |
```

**Step 3: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md
git commit -m "docs: add Yahoo Finance price import to CLAUDE.md and STATUS.md"
```

---

## Task Dependency Graph

```
Task 1 (migration) ──→ Task 2 (query layer) ──→ Task 3 (script) ──→ Task 4 (dry run)
                                                                          ↓
                                                                     Task 5 (live import)
                                                                          ↓
                                                                     Task 6 (Gemini verify)
                                                                          ↓
                                                                     Task 7 (build check)
                                                                          ↓
                                                                     Task 8 (docs)
```

Tasks 1-3 are independent of each other (schema, query layer, script) but Task 3's upsert needs Task 1's `unit` column to exist. Tasks 4-8 are sequential.
