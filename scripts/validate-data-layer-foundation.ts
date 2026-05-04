#!/usr/bin/env npx tsx
/**
 * Validates Data Layer Foundation V1 after the migrations are applied.
 *
 * Output: machine-readable JSON to stdout; diagnostics to stderr.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Data Layer Foundation Validator

Usage:
  npm run validate-data-layer
  npm run validate-data-layer -- --grain Wheat --market Wheat --market-year 2025

Environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(0);
}

function valueAfter(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env may already be provided by the runner.
  }
}

function hasObjectKey(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && key in value;
}

async function main() {
  loadEnvFile(resolve(__dirname, "../.env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const grain = valueAfter("--grain", "Wheat");
  const market = valueAfter("--market", "Wheat");
  const marketYear = Number(valueAfter("--market-year", "2025"));
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const checks: Array<{ name: string; ok: boolean; detail: unknown }> = [];

  const { count: sourceRunCount, error: sourceRunsError } = await supabase
    .from("source_runs")
    .select("id", { count: "exact", head: true });
  checks.push({
    name: "source_runs_table",
    ok: !sourceRunsError,
    detail: sourceRunsError?.message ?? { count: sourceRunCount },
  });

  const { count: mappingCount, error: mappingError } = await supabase
    .from("grain_market_mappings")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  checks.push({
    name: "grain_market_mappings_seeded",
    ok: !mappingError && Number(mappingCount ?? 0) > 0,
    detail: mappingError?.message ?? { count: mappingCount },
  });

  const { data: freshness, error: freshnessError } = await supabase.rpc(
    "get_thesis_data_freshness",
    { p_grain: grain, p_lane: null },
  );
  checks.push({
    name: "freshness_rpc",
    ok: !freshnessError && Array.isArray(freshness) && freshness.length > 0,
    detail: freshnessError?.message ?? { rows: Array.isArray(freshness) ? freshness.length : 0 },
  });

  const { data: canadaPacket, error: canadaError } = await supabase.rpc(
    "get_canada_thesis_packet",
    { p_grain: grain, p_crop_year: "2025-2026", p_grain_week: null },
  );
  checks.push({
    name: "canada_packet_rpc",
    ok:
      !canadaError &&
      hasObjectKey(canadaPacket, "supply") &&
      hasObjectKey(canadaPacket, "demand") &&
      hasObjectKey(canadaPacket, "freshness"),
    detail: canadaError?.message ?? {
      keys: typeof canadaPacket === "object" && canadaPacket ? Object.keys(canadaPacket) : [],
    },
  });

  const { data: usPacket, error: usError } = await supabase.rpc("get_us_thesis_packet", {
    p_market_name: market,
    p_market_year: marketYear,
  });
  checks.push({
    name: "us_packet_rpc",
    ok:
      !usError &&
      hasObjectKey(usPacket, "supply") &&
      hasObjectKey(usPacket, "demand") &&
      hasObjectKey(usPacket, "freshness"),
    detail: usError?.message ?? {
      keys: typeof usPacket === "object" && usPacket ? Object.keys(usPacket) : [],
    },
  });

  const ok = checks.every((check) => check.ok);
  console.log(
    JSON.stringify(
      {
        ok,
        grain,
        market,
        market_year: marketYear,
        checks,
      },
      null,
      2,
    ),
  );

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
