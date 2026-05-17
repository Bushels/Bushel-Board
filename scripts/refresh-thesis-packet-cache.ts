#!/usr/bin/env npx tsx
/**
 * Refreshes the cached Bull/Bear Thesis packet board.
 *
 * Output: machine-readable JSON to stdout; diagnostics to stderr.
 */

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

import {
  THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES,
  THESIS_BOARD_MAJOR_US_MARKET_NAMES,
} from "@/lib/queries/thesis-board";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import { writeSourceRun } from "./source-run";

const helpText = `
Refresh Thesis Packet Cache

Usage:
  npx tsx scripts/refresh-thesis-packet-cache.ts
  npm run refresh-thesis-cache
  npx tsx scripts/refresh-thesis-packet-cache.ts --crop-year 2025-2026 --market-year 2025
  npx tsx scripts/refresh-thesis-packet-cache.ts --canada-grains Canola,Wheat --us-markets Corn,Soybeans

Options:
  --crop-year <year>       Canada crop year. Default: current crop year
  --grain-week <week>      Optional CGC grain week. Default: latest packet week
  --market-year <year>     US market year. Default: current US market year
  --canada-grains <list>   Comma-separated Canada grain names. Default: V1 board source-backed Canada grains
  --us-markets <list>      Comma-separated US market names. Default: V1 board source-backed US markets
  --force                  Refresh even when cache already matches source_runs
  --help                   Show this help

Environment:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`;

const { values } = parseArgs({
  options: {
    "crop-year": { type: "string" },
    "grain-week": { type: "string" },
    "market-year": { type: "string" },
    "canada-grains": { type: "string" },
    "us-markets": { type: "string" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.error(helpText);
  process.exit(0);
}

function listValue(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateValue(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

async function readCacheState(
  supabase: SupabaseClient,
  cropYear: string,
  marketYear: number,
) {
  const { data, error } = await supabase.rpc("get_thesis_board_cached", {
    p_crop_year: cropYear,
    p_market_year: marketYear,
  });
  if (error) throw new Error(error.message);

  const cached = asRecord(data);
  const canada = Array.isArray(cached.canada) ? cached.canada.length : 0;
  const us = Array.isArray(cached.us) ? cached.us.length : 0;
  return {
    canada,
    us,
    cacheItemCount: typeof cached.cache_item_count === "number" ? cached.cache_item_count : canada + us,
    generatedAt: typeof cached.generated_at === "string" ? cached.generated_at : null,
    sourceRunWatermark:
      typeof cached.source_run_watermark === "string" ? cached.source_run_watermark : null,
  };
}

function cacheIsFresh(cache: Awaited<ReturnType<typeof readCacheState>>, expectedCount: number): boolean {
  if (cache.cacheItemCount < expectedCount) return false;
  const generatedAt = dateValue(cache.generatedAt);
  const sourceRunWatermark = dateValue(cache.sourceRunWatermark);
  if (generatedAt === null || sourceRunWatermark === null) return false;
  return generatedAt >= sourceRunWatermark;
}

async function recordRun(
  supabase: SupabaseClient,
  input: {
    status: "success" | "partial" | "failed" | "skipped";
    startedAt: string;
    rowsUpdated?: number;
    rowsSkipped?: number;
    errorMessage?: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const result = await writeSourceRun(supabase, {
    source_name: "thesis-packet-cache",
    source_lane: "system",
    collector_name: "refresh-thesis-packet-cache",
    status: input.status,
    latest_source_label: "Bull/Bear Thesis packet cache",
    rows_updated: input.rowsUpdated ?? 0,
    rows_skipped: input.rowsSkipped ?? 0,
    error_message: input.errorMessage ?? null,
    started_at: input.startedAt,
    metadata: input.metadata,
  });

  if (!result.ok) {
    console.error(`Failed to write source_runs row for thesis-packet-cache: ${result.error}`);
  }
}

async function refreshOne(
  supabase: SupabaseClient,
  params: {
    lane: "canada" | "us";
    name: string;
    cropYear: string;
    grainWeek: number | null;
    marketYear: number;
  },
) {
  const { data, error } = await supabase.rpc("refresh_thesis_packet_cache", {
    p_canada_grains: params.lane === "canada" ? [params.name] : [],
    p_us_markets: params.lane === "us" ? [params.name] : [],
    p_crop_year: params.cropYear,
    p_grain_week: params.grainWeek,
    p_market_year: params.marketYear,
  });

  return {
    lane: params.lane,
    name: params.name,
    ok: !error,
    error: error?.message ?? null,
    result: data,
  };
}

async function main() {
  loadEnvConfig(process.cwd());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const startedAt = new Date().toISOString();
  const cropYear = values["crop-year"] ?? CURRENT_CROP_YEAR;
  const grainWeekRaw = values["grain-week"];
  const grainWeek = grainWeekRaw ? Number(grainWeekRaw) : null;
  const marketYear = Number(values["market-year"] ?? CURRENT_US_MARKET_YEAR);
  const canadaGrains = listValue(
    values["canada-grains"],
    [...THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES],
  );
  const usMarkets = listValue(
    values["us-markets"],
    [...THESIS_BOARD_MAJOR_US_MARKET_NAMES],
  );
  const expectedCount = canadaGrains.length + usMarkets.length;

  if (grainWeekRaw && !Number.isInteger(grainWeek)) {
    throw new Error(`Invalid --grain-week value: ${grainWeekRaw}`);
  }
  if (!Number.isInteger(marketYear)) {
    throw new Error(`Invalid --market-year value: ${values["market-year"]}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
  const before = await readCacheState(supabase, cropYear, marketYear);
  if (!values.force && cacheIsFresh(before, expectedCount)) {
    await recordRun(supabase, {
      status: "skipped",
      startedAt,
      rowsSkipped: expectedCount,
      metadata: { reason: "cache_already_current", before, cropYear, grainWeek, marketYear },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: "skipped",
          crop_year: cropYear,
          grain_week: grainWeek,
          market_year: marketYear,
          cached: before,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(
    `Refreshing thesis packet cache one item at a time for ${canadaGrains.length} Canada grains and ${usMarkets.length} US markets...`,
  );

  const results = [];
  for (const name of canadaGrains) {
    results.push(await refreshOne(supabase, { lane: "canada", name, cropYear, grainWeek, marketYear }));
  }
  for (const name of usMarkets) {
    results.push(await refreshOne(supabase, { lane: "us", name, cropYear, grainWeek, marketYear }));
  }

  const after = await readCacheState(supabase, cropYear, marketYear);
  const failures = results.filter((result) => !result.ok);
  const okCount = results.length - failures.length;
  const status = failures.length === 0 ? "success" : okCount > 0 ? "partial" : "failed";

  await recordRun(supabase, {
    status,
    startedAt,
    rowsUpdated: okCount,
    errorMessage: failures.map((failure) => `${failure.lane}:${failure.name}: ${failure.error}`).join("; "),
    metadata: {
      cropYear,
      grainWeek,
      marketYear,
      before,
      after,
      failures,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        status,
        crop_year: cropYear,
        grain_week: grainWeek,
        market_year: marketYear,
        requested: {
          canada_grains: canadaGrains.length,
          us_markets: usMarkets.length,
        },
        refreshed: {
          ok: okCount,
          failed: failures.length,
        },
        cached: after,
        failures,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordRun(supabase, {
      status: "failed",
      startedAt,
      errorMessage: message,
      metadata: { cropYear, grainWeek, marketYear, expectedCount },
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
