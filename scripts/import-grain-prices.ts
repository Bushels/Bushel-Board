#!/usr/bin/env npx tsx
/**
 * Yahoo Finance Grain Prices Import Script
 *
 * Fetches daily futures settlement prices from Yahoo Finance and upserts
 * them into the grain_prices Supabase table.
 *
 * Usage:
 *   npm run import-prices                    # Import last 30 days
 *   npm run import-prices -- --days 7        # Import last 7 days
 *   npm run import-prices -- --dry-run       # Fetch only, do not write
 *   npm run import-prices -- --help          # Show help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: uses upsert with ON CONFLICT (grain, contract, price_date).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Yahoo Finance Grain Prices Import Script

Usage:
  npm run import-prices                    Fetch & upsert last 30 days of prices
  npm run import-prices -- --days 7        Override lookback to 7 days
  npm run import-prices -- --dry-run       Fetch data but do not write to DB
  npm run import-prices -- --help          Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)

Symbols fetched:
  ZW=F   Wheat (CBOT)         KE=F   HRW Wheat (CBOT)
  RS=F   Canola (ICE)         MWE=F  Spring Wheat (MGEX)
  ZC=F   Corn (CBOT)          ZS=F   Soybeans (CBOT)
  ZO=F   Oats (CBOT)

Output:
  stdout  JSON summary { dry_run, grains_fetched, grains_skipped, rows_upserted, errors, duration_ms }
  stderr  Progress diagnostics
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

const daysIndex = args.indexOf("--days");
const DAYS =
  daysIndex !== -1 && args[daysIndex + 1]
    ? parseInt(args[daysIndex + 1], 10)
    : 30;

if (isNaN(DAYS) || DAYS < 1 || DAYS > 365) {
  console.error("ERROR: --days must be a number between 1 and 365.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local may not exist — that's fine if env vars are already set
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
  );
  console.error("Check your .env.local file.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface PriceRow {
  grain: string;
  contract: string;
  exchange: string;
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  volume: number | null;
  open_interest: number | null;
  currency: string;
  unit: string;
  source: string;
}

interface GrainSymbol {
  grain: string;
  symbol: string;
  exchange: string;
  currency: string;
  unit: string;
  centsToBase: boolean;
}

const GRAIN_SYMBOLS: GrainSymbol[] = [
  { grain: "Wheat", symbol: "ZW=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Canola", symbol: "RS=F", exchange: "ICE", currency: "CAD", unit: "$/tonne", centsToBase: false },
  { grain: "Corn", symbol: "ZC=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Oats", symbol: "ZO=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Soybeans", symbol: "ZS=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "HRW Wheat", symbol: "KE=F", exchange: "CBOT", currency: "USD", unit: "$/bu", centsToBase: true },
  { grain: "Spring Wheat", symbol: "MWE=F", exchange: "MGEX", currency: "USD", unit: "$/bu", centsToBase: true },
];

// ---------------------------------------------------------------------------
// Yahoo Finance fetch
// ---------------------------------------------------------------------------

interface ChartData {
  timestamps: number[];
  closes: (number | null)[];
  volumes: (number | null)[];
}

async function fetchYahooChart(
  symbol: string,
  days: number
): Promise<ChartData | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${days + 2}d&interval=1d&includePrePost=false`;

  const attempt = async (): Promise<Response> => {
    return fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
      },
    });
  };

  let resp: Response;
  try {
    resp = await attempt();
  } catch (err) {
    console.error(`  Network error fetching ${symbol}: ${err}`);
    return null;
  }

  // Handle 404 — symbol not found, graceful skip
  if (resp.status === 404) {
    console.error(`  ${symbol}: 404 Not Found — skipping`);
    return null;
  }

  // Handle 429 or 500 — retry once after 2 seconds
  if (resp.status === 429 || resp.status >= 500) {
    console.error(
      `  ${symbol}: HTTP ${resp.status} — retrying in 2s...`
    );
    await new Promise((r) => setTimeout(r, 2000));
    try {
      resp = await attempt();
    } catch (err) {
      console.error(`  ${symbol}: retry network error: ${err}`);
      return null;
    }
    if (!resp.ok) {
      console.error(
        `  ${symbol}: retry failed with HTTP ${resp.status} — skipping`
      );
      return null;
    }
  }

  if (!resp.ok) {
    console.error(`  ${symbol}: HTTP ${resp.status} — skipping`);
    return null;
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    console.error(`  ${symbol}: failed to parse JSON response`);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chart = (body as any)?.chart;
  if (!chart?.result?.[0]) {
    console.error(`  ${symbol}: no chart data in response`);
    return null;
  }

  const result = chart.result[0];
  const timestamps: number[] = result.timestamp ?? [];
  const quotes = result.indicators?.quote?.[0] ?? {};
  const closes: (number | null)[] = quotes.close ?? [];
  const volumes: (number | null)[] = quotes.volume ?? [];

  if (timestamps.length === 0) {
    console.error(`  ${symbol}: empty timestamp array`);
    return null;
  }

  return { timestamps, closes, volumes };
}

// ---------------------------------------------------------------------------
// Row builder
// ---------------------------------------------------------------------------

function buildRowsForGrain(
  spec: GrainSymbol,
  chart: ChartData
): PriceRow[] {
  const rows: PriceRow[] = [];
  const { timestamps, closes, volumes } = chart;

  // N+1 lookback: index 0 is the anchor, only upsert from index 1 onwards
  for (let i = 1; i < timestamps.length; i++) {
    const rawClose = closes[i];
    const rawPrev = closes[i - 1];

    // Skip null closes (holidays)
    if (rawClose == null || rawPrev == null) continue;

    // Cents normalization — CBOT grains come in cents, store in dollars
    const price = spec.centsToBase ? rawClose / 100 : rawClose;
    const prev = spec.centsToBase ? rawPrev / 100 : rawPrev;

    const settlement_price = Number(price.toFixed(4));
    const change_amount = Number((price - prev).toFixed(4));

    // Division by zero guard
    const change_pct = prev
      ? Number(((change_amount / prev) * 100).toFixed(3))
      : 0;

    const volume = volumes[i] != null ? volumes[i] : null;
    const price_date = new Date(timestamps[i] * 1000)
      .toISOString()
      .slice(0, 10);

    rows.push({
      grain: spec.grain,
      contract: spec.symbol,
      exchange: spec.exchange,
      price_date,
      settlement_price,
      change_amount,
      change_pct,
      volume,
      open_interest: null, // Yahoo chart API doesn't return OI
      currency: spec.currency,
      unit: spec.unit,
      source: "yahoo-finance",
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  let grainsFetched = 0;
  let grainsSkipped = 0;
  const allRows: PriceRow[] = [];

  console.error(
    `Importing grain prices from Yahoo Finance (${DAYS}-day lookback)...`
  );

  for (const spec of GRAIN_SYMBOLS) {
    console.error(`Fetching ${spec.grain} (${spec.symbol})...`);

    const chart = await fetchYahooChart(spec.symbol, DAYS);

    if (!chart) {
      grainsSkipped++;
      console.error(`  Skipped ${spec.grain}`);
    } else {
      const rows = buildRowsForGrain(spec, chart);
      allRows.push(...rows);
      grainsFetched++;
      console.error(
        `  ${spec.grain}: ${chart.timestamps.length} data points → ${rows.length} rows`
      );
    }

    // Rate-limit: 500ms delay between fetches
    await new Promise((r) => setTimeout(r, 500));
  }

  console.error(
    `\nFetch complete: ${grainsFetched} grains fetched, ${grainsSkipped} skipped, ${allRows.length} total rows`
  );

  if (DRY_RUN) {
    console.error("\n--- DRY RUN: rows that would be upserted ---");
    for (const row of allRows) {
      console.error(
        `  ${row.grain} | ${row.price_date} | ${row.settlement_price} ${row.currency} | Δ${row.change_amount} (${row.change_pct}%)`
      );
    }
    const duration_ms = Date.now() - startTime;
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          grains_fetched: grainsFetched,
          grains_skipped: grainsSkipped,
          rows_upserted: 0,
          errors: 0,
          duration_ms,
        },
        null,
        2
      )
    );
    return;
  }

  // All symbols failed → exit 1
  if (grainsFetched === 0) {
    console.error("ERROR: All symbols failed to fetch. Exiting.");
    const duration_ms = Date.now() - startTime;
    console.log(
      JSON.stringify(
        {
          dry_run: false,
          grains_fetched: 0,
          grains_skipped: grainsSkipped,
          rows_upserted: 0,
          errors: grainsSkipped,
          duration_ms,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  // Batch upsert
  const BATCH_SIZE = 50;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("grain_prices").upsert(batch, {
      onConflict: "grain,contract,price_date",
    });

    if (error) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE)} error: ${error.message}`
      );
      errors += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  const duration_ms = Date.now() - startTime;
  const result = {
    dry_run: false,
    grains_fetched: grainsFetched,
    grains_skipped: grainsSkipped,
    rows_upserted: upserted,
    errors,
    duration_ms,
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(
    `Done. Upserted: ${upserted}, Errors: ${errors}, Time: ${duration_ms}ms`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
