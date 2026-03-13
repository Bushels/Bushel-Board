#!/usr/bin/env npx tsx
/**
 * CGC Backfill Script
 *
 * Reads the full CGC CSV from the reference data directory and batch-inserts
 * all rows into Supabase cgc_observations using the service role key.
 *
 * Usage:
 *   npm run backfill              # Run the full backfill
 *   npm run backfill -- --dry-run # Parse only, do not insert
 *   npm run backfill -- --help    # Show help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: uses upsert with ON CONFLICT to skip existing rows.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { parseCgcCsv } from "../lib/cgc/parser";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
CGC Backfill Script — Load historical grain data into Supabase

Usage:
  npm run backfill                          Run the full backfill
  npm run backfill -- --dry-run             Parse CSV only, do not insert into Supabase
  npm run backfill -- --csv <path>          Use a custom CSV file path
  npm run backfill -- --csv <path> --dry-run  Dry-run with a custom CSV
  npm run backfill -- --help                Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)

Output:
  stdout  JSON summary { rows_parsed, rows_inserted, rows_skipped, duration_ms }
  stderr  Progress diagnostics
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");

const csvArgIndex = args.indexOf("--csv");
const csvOverride = csvArgIndex !== -1 ? args[csvArgIndex + 1] : null;
const DEFAULT_CSV_CANDIDATES = [
  resolve(process.cwd(), "data", "CGC Weekly", "gsw-shg-en.csv"),
  resolve(process.cwd(), "data", "gsw-shg-en.csv"),
  resolve(__dirname, "../../Bushel Board/data/gsw-shg-en.csv"),
];

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// Load .env.local if dotenv-style vars are not already set
// tsx does not auto-load .env files, so we do a quick manual load
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

function resolveDefaultCsvPath(): string {
  for (const candidate of DEFAULT_CSV_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_CSV_CANDIDATES[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function backfill() {
  const startTime = Date.now();

  // Locate the CSV — use override or default relative to this script's directory
  const csvPath = csvOverride
    ? resolve(csvOverride)
    : resolveDefaultCsvPath();
  console.error(`Reading CSV from: ${csvPath}`);

  let csvText: string;
  try {
    csvText = readFileSync(csvPath, "utf-8");
  } catch (err) {
    console.error(`ERROR: Could not read CSV file at ${csvPath}`);
    console.error(String(err));
    process.exit(1);
  }

  const rows = parseCgcCsv(csvText);
  console.error(`Parsed ${rows.length} rows from CSV`);

  if (DRY_RUN) {
    const duration_ms = Date.now() - startTime;
    const result = {
      dry_run: true,
      rows_parsed: rows.length,
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Connect to Supabase with service role
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  // Batch upsert — 1000 rows per batch for throughput
  const BATCH_SIZE = 1000;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("cgc_observations").upsert(batch, {
      onConflict:
        "crop_year,grain_week,worksheet,metric,period,grain,grade,region",
      ignoreDuplicates: true,
    });

    if (error) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE)} error: ${error.message}`
      );
      skipped += batch.length;
    } else {
      inserted += batch.length;
    }

    // Progress every 10 batches (10,000 rows)
    if (Math.floor(i / BATCH_SIZE) % 10 === 0) {
      console.error(`Progress: ${i + batch.length}/${rows.length} rows`);
    }
  }

  // Determine the max grain week from the parsed data for audit log
  const maxWeek = rows.reduce((max, r) => (r.grain_week > max ? r.grain_week : max), 0);
  const cropYear = rows[0]?.crop_year || "unknown";

  // Log the import in the audit table
  const { error: logError } = await supabase.from("cgc_imports").insert({
    crop_year: cropYear,
    grain_week: maxWeek,
    source_file: csvOverride
      ? `${csvOverride.split(/[\\/]/).pop()} (backfill)`
      : "gsw-shg-en.csv (backfill)",
    rows_inserted: inserted,
    rows_skipped: skipped,
    status: skipped > 0 ? "partial" : "success",
  });

  if (logError) {
    console.error(`Warning: failed to write import audit log: ${logError.message}`);
  }

  const duration_ms = Date.now() - startTime;
  const result = {
    dry_run: false,
    rows_parsed: rows.length,
    rows_inserted: inserted,
    rows_skipped: skipped,
    crop_year: cropYear,
    max_grain_week: maxWeek,
    duration_ms,
  };

  // JSON summary to stdout
  console.log(JSON.stringify(result, null, 2));
  console.error(
    `Done. Inserted: ${inserted}, Skipped: ${skipped}, Time: ${duration_ms}ms`
  );
}

backfill().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
