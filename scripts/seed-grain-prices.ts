#!/usr/bin/env npx tsx
/**
 * Grain Prices Seed Script
 *
 * Inserts sample daily futures settlement prices into the grain_prices
 * Supabase table for UI development.
 *
 * Usage:
 *   npm run seed-prices              # Run the seed
 *   npm run seed-prices -- --dry-run # Parse only, do not insert
 *   npm run seed-prices -- --help    # Show help
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
Grain Prices Seed Script

Usage:
  npm run seed-prices              Insert sample futures data into Supabase
  npm run seed-prices -- --dry-run Build rows only, do not insert
  npm run seed-prices -- --help    Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)

Output:
  stdout  JSON summary { rows_built, rows_upserted, errors, duration_ms }
  stderr  Progress diagnostics
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

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
// Types
// ---------------------------------------------------------------------------

interface PriceRow {
  grain: string;
  contract: string;
  exchange: string;
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  volume: number;
  open_interest: number;
  currency: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Sample data — 4 grains x 5 days (March 10-14, 2026)
// ---------------------------------------------------------------------------

const DATES = [
  "2026-03-10",
  "2026-03-11",
  "2026-03-12",
  "2026-03-13",
  "2026-03-14",
];

interface GrainSpec {
  grain: string;
  contract: string;
  exchange: string;
  currency: string;
  prices: number[];       // settlement prices for each date
  volumes: number[];      // volume for each date
  openInterest: number[]; // OI for each date
}

const GRAINS: GrainSpec[] = [
  {
    grain: "Canola",
    contract: "RSK26",
    exchange: "ICE",
    currency: "CAD",
    prices: [665.20, 668.40, 670.10, 667.80, 673.50],
    volumes: [42310, 38920, 45100, 41250, 50830],
    openInterest: [198450, 199100, 199800, 198600, 200200],
  },
  {
    grain: "Wheat",
    contract: "WK26",
    exchange: "CBOT",
    currency: "USD",
    prices: [548.25, 552.00, 555.75, 551.50, 558.00],
    volumes: [85600, 79400, 92100, 88300, 96500],
    openInterest: [312400, 313200, 314800, 313900, 316100],
  },
  {
    grain: "Barley",
    contract: "ABK26",
    exchange: "ICE",
    currency: "CAD",
    prices: [294.00, 296.50, 298.20, 295.80, 299.40],
    volumes: [3210, 2890, 3540, 3100, 3780],
    openInterest: [18200, 18350, 18500, 18400, 18650],
  },
  {
    grain: "Oats",
    contract: "OK26",
    exchange: "CBOT",
    currency: "USD",
    prices: [362.50, 364.75, 367.00, 363.25, 368.50],
    volumes: [2150, 1980, 2340, 2080, 2510],
    openInterest: [8900, 8950, 9020, 8980, 9100],
  },
];

function buildRows(): PriceRow[] {
  const rows: PriceRow[] = [];

  for (const g of GRAINS) {
    for (let i = 0; i < DATES.length; i++) {
      const price = g.prices[i];
      const change_amount =
        i === 0 ? 0 : Number((price - g.prices[i - 1]).toFixed(2));
      const prevPrice = i === 0 ? price : g.prices[i - 1];
      const change_pct =
        i === 0
          ? 0
          : Number(((change_amount / prevPrice) * 100).toFixed(3));

      rows.push({
        grain: g.grain,
        contract: g.contract,
        exchange: g.exchange,
        price_date: DATES[i],
        settlement_price: price,
        change_amount,
        change_pct,
        volume: g.volumes[i],
        open_interest: g.openInterest[i],
        currency: g.currency,
        source: "manual",
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  const allRows = buildRows();
  console.error(`Built ${allRows.length} grain price rows (4 grains x 5 days)`);

  if (DRY_RUN) {
    const duration_ms = Date.now() - startTime;
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          rows_built: allRows.length,
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
    rows_built: allRows.length,
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
