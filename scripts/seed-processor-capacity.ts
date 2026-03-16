#!/usr/bin/env npx tsx
/**
 * Processor Capacity Seed Script
 *
 * Inserts annual crush/processing capacity data per grain into the
 * processor_capacity Supabase table.
 *
 * Usage:
 *   npm run seed-capacity              # Run the seed
 *   npm run seed-capacity -- --help    # Show help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: uses upsert with ON CONFLICT (grain, crop_year).
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
Processor Capacity Seed Script

Usage:
  npm run seed-capacity              Insert capacity data into Supabase
  npm run seed-capacity -- --help    Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)

Output:
  stdout  JSON summary { seeded, crop_year }
  stderr  Progress diagnostics
`);
  process.exit(0);
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
// Types
// ---------------------------------------------------------------------------

interface CapacityRecord {
  grain: string;
  crop_year: string;
  annual_capacity_kt: number;
  source: string;
  is_approximate: boolean;
  notes: string;
}

// ---------------------------------------------------------------------------
// Capacity data (approximate Canadian annual processing capacities, Kt/year)
// ---------------------------------------------------------------------------

const CROP_YEAR = "2025-2026";

const CAPACITY_DATA: CapacityRecord[] = [
  {
    grain: "Canola",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 12000,
    source: "Canola Council 2025",
    is_approximate: false,
    notes: "Domestic crush. Expansions at Regina, Yorkton ongoing.",
  },
  {
    grain: "Wheat",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 4200,
    source: "AAFC Feb 2026",
    is_approximate: false,
    notes: "Flour milling capacity. Food/industrial use.",
  },
  {
    grain: "Amber Durum",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 1800,
    source: "AAFC Feb 2026",
    is_approximate: false,
    notes: "Semolina milling for pasta.",
  },
  {
    grain: "Barley",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 2800,
    source: "AAFC Feb 2026",
    is_approximate: false,
    notes: "Malt + feed processing combined.",
  },
  {
    grain: "Oats",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 1200,
    source: "Industry estimate 2025",
    is_approximate: true,
    notes: "Richardson, Grain Millers. Growing demand.",
  },
  {
    grain: "Soybeans",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 2500,
    source: "AAFC Feb 2026",
    is_approximate: false,
    notes: "Bunge Hamilton, Viterra ON crush plants.",
  },
  {
    grain: "Corn",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 5000,
    source: "AAFC Feb 2026",
    is_approximate: false,
    notes: "Ethanol, starch, sweetener, feed.",
  },
  {
    grain: "Peas",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 800,
    source: "Pulse Canada 2025",
    is_approximate: true,
    notes: "Protein fractionation + food processing.",
  },
  {
    grain: "Lentils",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 400,
    source: "Pulse Canada 2025",
    is_approximate: true,
    notes: "Splitting and food processing.",
  },
  {
    grain: "Flaxseed",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 200,
    source: "Industry estimate 2025",
    is_approximate: true,
    notes: "Oil pressing, food use.",
  },
  {
    grain: "Rye",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 150,
    source: "Industry estimate 2025",
    is_approximate: true,
    notes: "Distilling, flour, animal feed.",
  },
  {
    grain: "Mustard Seed",
    crop_year: CROP_YEAR,
    annual_capacity_kt: 80,
    source: "Industry estimate 2025",
    is_approximate: true,
    notes: "Condiment manufacturing.",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`Seeding ${CAPACITY_DATA.length} processor capacity rows for ${CROP_YEAR}`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  const { error } = await supabase
    .from("processor_capacity")
    .upsert(CAPACITY_DATA, {
      onConflict: "grain,crop_year",
    });

  if (error) {
    console.error(`Upsert error: ${error.message}`);
    process.exit(1);
  }

  const result = {
    seeded: CAPACITY_DATA.length,
    crop_year: CROP_YEAR,
  };

  console.log(JSON.stringify(result, null, 2));
  console.error(`Done. Seeded ${CAPACITY_DATA.length} rows.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
