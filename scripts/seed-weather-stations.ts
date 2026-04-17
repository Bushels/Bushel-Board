#!/usr/bin/env npx tsx
/**
 * Weather Station Map Seed Script — WS1 Task 1.9
 *
 * Seeds `weather_station_map` with prairie FSA → ECCC station mappings used by
 * the Bushy chat weather tool (WS4). Idempotent upsert on fsa_code.
 *
 * Source: Environment Canada weather.gc.ca city pages. Initial seed covers a
 * curated set of major prairie FSAs. Coverage can be extended as gaps surface
 * when the weather tool runs in production.
 *
 * Usage:
 *   npm run seed-weather-stations              Run the seed
 *   npm run seed-weather-stations -- --help    Show help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: upsert with ON CONFLICT (fsa_code).
 *
 * NOTE on env-var names: the plan's code references `SUPABASE_URL` directly,
 * but every existing script under scripts/ uses NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY and loads them from .env.local. We follow the
 * project convention here.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stderr.write(
    `Weather Station Map Seed Script\n\n` +
      `Usage:\n` +
      `  npm run seed-weather-stations              Insert station rows\n` +
      `  npm run seed-weather-stations -- --help    Show this help\n\n` +
      `Environment variables (from .env.local):\n` +
      `  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL\n` +
      `  SUPABASE_SERVICE_ROLE_KEY     Service role key (never expose to browser)\n\n` +
      `Output:\n` +
      `  stdout  JSON { ok, seeded }\n` +
      `  stderr  Progress diagnostics\n`,
  );
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
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip matched wrapping quotes (Vercel CLI exports quoted values).
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local may not exist — fine if env vars are already set via shell.
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  process.stderr.write(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n",
  );
  process.stderr.write("Check your .env.local file.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StationRecord {
  fsa: string;
  province: "AB" | "SK" | "MB";
  code: string;
  name: string;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Curated prairie FSA → ECCC station map
// ---------------------------------------------------------------------------
// Coverage note: WS1 seeds a minimal prairie set (~9 FSAs). WS4 will extend
// as the weather tool exposes missing postal-code coverage gaps.

const STATIONS: StationRecord[] = [
  // Alberta
  { fsa: "T0L", province: "AB", code: "ab-30", name: "Edmonton", lat: 53.5461, lon: -113.4938 },
  { fsa: "T0E", province: "AB", code: "ab-30", name: "Edmonton", lat: 53.5461, lon: -113.4938 },
  { fsa: "T1A", province: "AB", code: "ab-52", name: "Medicine Hat", lat: 50.0405, lon: -110.6764 },
  { fsa: "T2P", province: "AB", code: "ab-52", name: "Calgary", lat: 51.0447, lon: -114.0719 },
  // Saskatchewan
  { fsa: "S4P", province: "SK", code: "sk-32", name: "Regina", lat: 50.4452, lon: -104.6189 },
  { fsa: "S7K", province: "SK", code: "sk-40", name: "Saskatoon", lat: 52.1332, lon: -106.67 },
  { fsa: "S0K", province: "SK", code: "sk-32", name: "Regina", lat: 50.4452, lon: -104.6189 },
  // Manitoba
  { fsa: "R3C", province: "MB", code: "mb-38", name: "Winnipeg", lat: 49.8951, lon: -97.1384 },
  { fsa: "R0J", province: "MB", code: "mb-38", name: "Winnipeg", lat: 49.8951, lon: -97.1384 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  const rows = STATIONS.map((s) => ({
    fsa_code: s.fsa,
    province: s.province,
    station_code: s.code,
    station_name: s.name,
    lat: s.lat,
    lon: s.lon,
  }));

  process.stderr.write(`Upserting ${rows.length} weather station rows...\n`);

  const { error, count } = await supabase
    .from("weather_station_map")
    .upsert(rows, { onConflict: "fsa_code", count: "exact" });

  if (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + "\n");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, seeded: count ?? rows.length }) + "\n");
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
