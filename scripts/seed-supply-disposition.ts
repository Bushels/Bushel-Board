#!/usr/bin/env npx tsx
/**
 * AAFC Supply & Disposition Seed Script
 *
 * Inserts AAFC and StatsCan supply & disposition data into the
 * supply_disposition Supabase table.
 *
 * Usage:
 *   npm run seed-supply              # Run the seed
 *   npm run seed-supply -- --dry-run # Parse only, do not insert
 *   npm run seed-supply -- --help    # Show help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: uses upsert with ON CONFLICT (grain_slug, crop_year, source).
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
AAFC Supply & Disposition Seed Script

Usage:
  npm run seed-supply              Insert AAFC + StatsCan data into Supabase
  npm run seed-supply -- --dry-run Build rows only, do not insert
  npm run seed-supply -- --help    Show this help

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

interface SupplyRow {
  grain_slug: string;
  crop_year: string;
  source: string;
  carry_in_kt?: number | null;
  production_kt?: number | null;
  imports_kt?: number | null;
  total_supply_kt?: number | null;
  exports_kt?: number | null;
  food_industrial_kt?: number | null;
  feed_waste_kt?: number | null;
  seed_kt?: number | null;
  total_domestic_kt?: number | null;
  carry_out_kt?: number | null;
}

// ---------------------------------------------------------------------------
// AAFC data (source: AAFC Outlook, November 24 2025)
// ---------------------------------------------------------------------------

const AAFC_SOURCE = "AAFC_2025-11-24";

interface AafcRecord {
  carry_in: number;
  production: number;
  imports: number;
  total_supply: number;
  exports: number;
  food_industrial: number;
  feed_waste: number;
  seed: number;
  total_domestic: number;
  carry_out: number;
}

const AAFC_2025_26: Record<string, AafcRecord> = {
  wheat:          { carry_in: 4112, production: 36624, imports: 105, total_supply: 40841, exports: 27700, food_industrial: 3500, feed_waste: 3481, seed: 1060, total_domestic: 8041, carry_out: 5100 },
  "amber-durum":  { carry_in: 496, production: 6535, imports: 5, total_supply: 7036, exports: 5200, food_industrial: 200, feed_waste: 302, seed: 234, total_domestic: 736, carry_out: 1100 },
  barley:         { carry_in: 1249, production: 8228, imports: 50, total_supply: 9527, exports: 2840, food_industrial: 319, feed_waste: 5155, seed: 213, total_domestic: 5687, carry_out: 1000 },
  corn:           { carry_in: 1584, production: 15500, imports: 1900, total_supply: 18984, exports: 2400, food_industrial: 5850, feed_waste: 8817, seed: 17, total_domestic: 14684, carry_out: 1900 },
  oats:           { carry_in: 507, production: 3370, imports: 20, total_supply: 3897, exports: 2420, food_industrial: 90, feed_waste: 785, seed: 102, total_domestic: 977, carry_out: 500 },
  rye:            { carry_in: 143, production: 542, imports: 1, total_supply: 686, exports: 182, food_industrial: 55, feed_waste: 241, seed: 18, total_domestic: 314, carry_out: 190 },
  canola:         { carry_in: 1597, production: 20028, imports: 101, total_supply: 21726, exports: 7000, food_industrial: 11800, feed_waste: 375, seed: 51, total_domestic: 12226, carry_out: 2500 },
  flaxseed:       { carry_in: 134, production: 365, imports: 10, total_supply: 509, exports: 225, food_industrial: 19, feed_waste: 71, seed: 0, total_domestic: 90, carry_out: 195 },
  soybeans:       { carry_in: 505, production: 7134, imports: 450, total_supply: 8089, exports: 5350, food_industrial: 1700, feed_waste: 339, seed: 200, total_domestic: 2239, carry_out: 500 },
  peas:           { carry_in: 489, production: 3563, imports: 20, total_supply: 4072, exports: 2200, food_industrial: 340, feed_waste: 232, seed: 100, total_domestic: 672, carry_out: 1200 },
  lentils:        { carry_in: 549, production: 2972, imports: 75, total_supply: 3596, exports: 2100, food_industrial: 230, feed_waste: 71, seed: 50, total_domestic: 351, carry_out: 1145 },
  beans:          { carry_in: 40, production: 352, imports: 70, total_supply: 462, exports: 380, food_industrial: 50, feed_waste: 2, seed: 10, total_domestic: 62, carry_out: 20 },
  "chick-peas":   { carry_in: 62, production: 331, imports: 40, total_supply: 433, exports: 200, food_industrial: 70, feed_waste: 8, seed: 10, total_domestic: 88, carry_out: 145 },
  "mustard-seed": { carry_in: 143, production: 141, imports: 9, total_supply: 293, exports: 95, food_industrial: 40, feed_waste: 3, seed: 10, total_domestic: 53, carry_out: 145 },
  canaryseed:     { carry_in: 84, production: 185, imports: 0, total_supply: 269, exports: 135, food_industrial: 7, feed_waste: 0, seed: 7, total_domestic: 14, carry_out: 120 },
  sunflower:      { carry_in: 151, production: 61, imports: 25, total_supply: 237, exports: 35, food_industrial: 55, feed_waste: 2, seed: 10, total_domestic: 67, carry_out: 135 },
};

const AAFC_2024_25: Record<string, AafcRecord> = {
  wheat:          { carry_in: 4609, production: 35939, imports: 754, total_supply: 41302, exports: 29220, food_industrial: 3558, feed_waste: 3305, seed: 1106, total_domestic: 7969, carry_out: 4112 },
  "amber-durum":  { carry_in: 669, production: 6380, imports: 5, total_supply: 7054, exports: 5821, food_industrial: 208, feed_waste: 277, seed: 252, total_domestic: 737, carry_out: 496 },
  barley:         { carry_in: 1152, production: 8144, imports: 168, total_supply: 9464, exports: 2843, food_industrial: 93, feed_waste: 5066, seed: 213, total_domestic: 5372, carry_out: 1249 },
  corn:           { carry_in: 1996, production: 15345, imports: 1777, total_supply: 19118, exports: 2776, food_industrial: 5848, feed_waste: 8895, seed: 16, total_domestic: 14759, carry_out: 1584 },
  oats:           { carry_in: 670, production: 3358, imports: 17, total_supply: 4045, exports: 2566, food_industrial: 77, feed_waste: 793, seed: 102, total_domestic: 972, carry_out: 507 },
  rye:            { carry_in: 91, production: 421, imports: 1, total_supply: 513, exports: 154, food_industrial: 38, feed_waste: 154, seed: 24, total_domestic: 216, carry_out: 143 },
  canola:         { carry_in: 3225, production: 19239, imports: 131, total_supply: 22595, exports: 9331, food_industrial: 11412, feed_waste: 191, seed: 64, total_domestic: 11667, carry_out: 1597 },
  flaxseed:       { carry_in: 164, production: 258, imports: 9, total_supply: 431, exports: 225, food_industrial: 11, feed_waste: 60, seed: 1, total_domestic: 71, carry_out: 134 },
  soybeans:       { carry_in: 552, production: 7568, imports: 267, total_supply: 8387, exports: 5421, food_industrial: 1678, feed_waste: 540, seed: 243, total_domestic: 2461, carry_out: 505 },
  peas:           { carry_in: 299, production: 2997, imports: 39, total_supply: 3335, exports: 2175, food_industrial: 361, feed_waste: 210, seed: 100, total_domestic: 671, carry_out: 489 },
  lentils:        { carry_in: 165, production: 2431, imports: 125, total_supply: 2721, exports: 1821, food_industrial: 230, feed_waste: 70, seed: 50, total_domestic: 350, carry_out: 549 },
  beans:          { carry_in: 20, production: 424, imports: 71, total_supply: 515, exports: 402, food_industrial: 60, feed_waste: 3, seed: 10, total_domestic: 73, carry_out: 40 },
  "chick-peas":   { carry_in: 30, production: 287, imports: 42, total_supply: 359, exports: 209, food_industrial: 70, feed_waste: 8, seed: 10, total_domestic: 88, carry_out: 62 },
  "mustard-seed": { carry_in: 88, production: 192, imports: 8, total_supply: 288, exports: 91, food_industrial: 40, feed_waste: 4, seed: 10, total_domestic: 54, carry_out: 143 },
  canaryseed:     { carry_in: 44, production: 185, imports: 0, total_supply: 229, exports: 133, food_industrial: 5, feed_waste: 0, seed: 7, total_domestic: 12, carry_out: 84 },
  sunflower:      { carry_in: 175, production: 51, imports: 26, total_supply: 252, exports: 36, food_industrial: 55, feed_waste: 0, seed: 10, total_domestic: 65, carry_out: 151 },
};

function aafcToRows(
  data: Record<string, AafcRecord>,
  cropYear: string
): SupplyRow[] {
  return Object.entries(data).map(([slug, r]) => ({
    grain_slug: slug,
    crop_year: cropYear,
    source: AAFC_SOURCE,
    carry_in_kt: r.carry_in,
    production_kt: r.production,
    imports_kt: r.imports,
    total_supply_kt: r.total_supply,
    exports_kt: r.exports,
    food_industrial_kt: r.food_industrial,
    feed_waste_kt: r.feed_waste,
    seed_kt: r.seed,
    total_domestic_kt: r.total_domestic,
    carry_out_kt: r.carry_out,
  }));
}

// ---------------------------------------------------------------------------
// StatsCan data (production only, from PrincipleFieldCrops_Nov2025.csv)
// ---------------------------------------------------------------------------

const STATSCAN_SOURCE = "StatsCan_Nov2025";

const STATSCAN_NAME_MAP: Record<string, string> = {
  'Total  wheat{1}': "wheat",
  "Durum wheat": "amber-durum",
  "Barley": "barley",
  "Canola": "canola",
  "Oats": "oats",
  "Corn for grain": "corn",
  "Dry field peas": "peas",
  "Lentils": "lentils",
  "Flaxseed": "flaxseed",
  "Soybeans": "soybeans",
  "Dry beans": "beans",
  "Chick peas": "chick-peas",
  "Mustard seed": "mustard-seed",
  "Canary seed": "canaryseed",
  "Sunflower seed": "sunflower",
  "Fall rye": "rye",
};

function parseStatsCanCsv(csvPath: string): SupplyRow[] {
  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");
  const rows: SupplyRow[] = [];

  // The CSV has a header row with year columns. Column index 3 is " 2025".
  // Data rows start at line index 3 (0-indexed).
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV fields — values are quoted with commas between them
    const fields = line.split(",").map((f) => f.replace(/"/g, "").trim());
    const cropName = fields[0];
    const production2025 = fields[3]; // " 2025" column

    const slug = STATSCAN_NAME_MAP[cropName];
    if (!slug) continue;

    const prodValue = parseFloat(production2025);
    if (isNaN(prodValue)) continue;

    rows.push({
      grain_slug: slug,
      crop_year: "2025-26",
      source: STATSCAN_SOURCE,
      production_kt: prodValue,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  // Build all rows
  const aafcRows = [
    ...aafcToRows(AAFC_2025_26, "2025-26"),
    ...aafcToRows(AAFC_2024_25, "2024-25"),
  ];
  console.error(`Built ${aafcRows.length} AAFC rows (2 crop years x 16 grains)`);

  // Parse StatsCan CSV
  const statsCanCsvPath = resolve(
    __dirname,
    "../../Bushel Board/data/PrincipleFieldCrops_Nov2025.csv"
  );
  let statsCanRows: SupplyRow[] = [];
  try {
    statsCanRows = parseStatsCanCsv(statsCanCsvPath);
    console.error(`Parsed ${statsCanRows.length} StatsCan production rows from CSV`);
  } catch (err) {
    console.error(`Warning: Could not read StatsCan CSV at ${statsCanCsvPath}`);
    console.error(String(err));
  }

  const allRows = [...aafcRows, ...statsCanRows];
  console.error(`Total rows to upsert: ${allRows.length}`);

  if (DRY_RUN) {
    const duration_ms = Date.now() - startTime;
    console.log(
      JSON.stringify(
        { dry_run: true, rows_built: allRows.length, rows_upserted: 0, errors: 0, duration_ms },
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

    const { error } = await supabase
      .from("supply_disposition")
      .upsert(batch, {
        onConflict: "grain_slug,crop_year,source",
      });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE)} error: ${error.message}`);
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
