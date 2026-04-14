#!/usr/bin/env npx tsx
/**
 * Grain Prices Import Script
 *
 * Fetches daily futures settlement prices and upserts them into the grain_prices
 * Supabase table.
 *
 * Source strategy:
 * - Yahoo Finance for CBOT-listed contracts with usable free chart data
 * - Barchart overview-page scrape fallback for ICE Canola and MGEX Spring Wheat
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

import {
  buildLatestRowFromSnapshot,
  buildRowsForGrain,
  fetchBarchartSnapshot,
  fetchYahooChart,
  type GrainPriceSpec,
  type PriceRow,
} from "@/lib/grain-price-sources";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Grain Prices Import Script

Usage:
  npm run import-prices                    Fetch & upsert last 30 days of prices
  npm run import-prices -- --days 7        Override lookback to 7 days
  npm run import-prices -- --dry-run       Fetch data but do not write to DB
  npm run import-prices -- --help          Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)

Source strategy:
  Yahoo Finance chart API:
    ZW=F, KE=F, ZC=F, ZS=F, ZO=F

  Barchart fallback (latest close only):
    RSK26  Canola (ICE)
    MWK26  Spring Wheat (MGEX)

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

if (Number.isNaN(DAYS) || DAYS < 1 || DAYS > 365) {
  console.error("ERROR: --days must be a number between 1 and 365.");
  process.exit(1);
}

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
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
  console.error("Check your .env.local file.");
  process.exit(1);
}

const GRAIN_SPECS: GrainPriceSpec[] = [
  {
    grain: "Wheat",
    contract: "ZW=F",
    yahooSymbol: "ZW=F",
    exchange: "CBOT",
    currency: "USD",
    unit: "$/bu",
    centsToBase: true,
  },
  {
    grain: "Corn",
    contract: "ZC=F",
    yahooSymbol: "ZC=F",
    exchange: "CBOT",
    currency: "USD",
    unit: "$/bu",
    centsToBase: true,
  },
  {
    grain: "Oats",
    contract: "ZO=F",
    yahooSymbol: "ZO=F",
    exchange: "CBOT",
    currency: "USD",
    unit: "$/bu",
    centsToBase: true,
  },
  {
    grain: "Soybeans",
    contract: "ZS=F",
    yahooSymbol: "ZS=F",
    exchange: "CBOT",
    currency: "USD",
    unit: "$/bu",
    centsToBase: true,
  },
  {
    grain: "HRW Wheat",
    contract: "KE=F",
    yahooSymbol: "KE=F",
    exchange: "KCBT",
    currency: "USD",
    unit: "$/bu",
    centsToBase: true,
  },
  {
    grain: "Canola",
    contract: "RSK26",
    barchartSymbol: "RSK26",
    exchange: "ICE",
    currency: "CAD",
    unit: "$/tonne",
    centsToBase: false,
  },
  {
    grain: "Spring Wheat",
    contract: "MWK26",
    barchartSymbol: "MWK26",
    exchange: "MGEX",
    currency: "USD",
    unit: "$/bu",
    centsToBase: false,
  },
];

async function fetchRowsForSpec(spec: GrainPriceSpec, days: number): Promise<PriceRow[]> {
  if (spec.yahooSymbol) {
    const chart = await fetchYahooChart(spec.yahooSymbol, days);
    if (!chart) return [];
    return buildRowsForGrain(spec, chart);
  }

  if (spec.barchartSymbol) {
    const snapshot = await fetchBarchartSnapshot(spec.barchartSymbol);
    if (!snapshot) return [];
    return [
      buildLatestRowFromSnapshot(
        spec,
        snapshot,
        new Date().toISOString().slice(0, 10),
      ),
    ];
  }

  return [];
}

async function main() {
  const startTime = Date.now();
  let grainsFetched = 0;
  let grainsSkipped = 0;
  const allRows: PriceRow[] = [];

  console.error(`Importing grain prices (${DAYS}-day lookback)...`);

  for (const spec of GRAIN_SPECS) {
    const sourceLabel = spec.yahooSymbol
      ? `Yahoo Finance ${spec.yahooSymbol}`
      : `Barchart ${spec.barchartSymbol}`;
    console.error(`Fetching ${spec.grain} (${sourceLabel})...`);

    const rows = await fetchRowsForSpec(spec, DAYS);

    if (rows.length === 0) {
      grainsSkipped++;
      console.error(`  Skipped ${spec.grain}`);
    } else {
      allRows.push(...rows);
      grainsFetched++;
      console.error(`  ${spec.grain}: ${rows.length} row(s) from ${rows[0]?.source}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.error(
    `\nFetch complete: ${grainsFetched} grains fetched, ${grainsSkipped} skipped, ${allRows.length} total rows`,
  );

  if (DRY_RUN) {
    console.error("\n--- DRY RUN: rows that would be upserted ---");
    for (const row of allRows) {
      console.error(
        `  ${row.grain} | ${row.contract} | ${row.price_date} | ${row.settlement_price} ${row.currency} | Δ${row.change_amount} (${row.change_pct}%) | ${row.source}`,
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
        2,
      ),
    );
    return;
  }

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
        2,
      ),
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
  const BATCH_SIZE = 50;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("grain_prices").upsert(batch, {
      onConflict: "grain,contract,price_date",
    });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE)} error: ${error.message}`);
      errors += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  let cadNormalization:
    | { usd_rows_updated: number; cad_rows_updated: number; missing_fx_rows: number }
    | null = null;

  if (allRows.length > 0) {
    const sortedDates = allRows.map((row) => row.price_date).sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    const { data, error } = await supabase.rpc("recalculate_grain_prices_cad", {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error(
        `CAD normalization warning: ${error.message} (grain prices were still imported)`,
      );
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      cadNormalization = {
        usd_rows_updated: Number(row?.usd_rows_updated ?? 0),
        cad_rows_updated: Number(row?.cad_rows_updated ?? 0),
        missing_fx_rows: Number(row?.missing_fx_rows ?? 0),
      };
      console.error(
        `CAD normalization: USD updated ${cadNormalization.usd_rows_updated}, CAD passthrough ${cadNormalization.cad_rows_updated}, missing FX ${cadNormalization.missing_fx_rows}`,
      );
    }
  }

  const duration_ms = Date.now() - startTime;
  const result = {
    dry_run: false,
    grains_fetched: grainsFetched,
    grains_skipped: grainsSkipped,
    rows_upserted: upserted,
    errors,
    cad_normalization: cadNormalization,
    duration_ms,
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(`Done. Upserted: ${upserted}, Errors: ${errors}, Time: ${duration_ms}ms`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
