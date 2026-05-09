#!/usr/bin/env npx tsx
/**
 * Deterministic Canola Market Read V1.
 *
 * Reads facts from get_canada_thesis_packet('Canola', ...) and formats a
 * source-traceable market read. It does not call an LLM and does not fall back
 * to market_analysis prose.
 *
 * Output: JSON by default; markdown with --format markdown.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildCanolaMarketRead,
  buildUnavailableCanolaMarketRead,
  renderCanolaMarketReadMarkdown,
} from "@/lib/canola-market-read";
import { getCurrentCropYear } from "@/lib/utils/crop-year";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Deterministic Canola Market Read V1

Usage:
  npx tsx scripts/generate-canola-market-read.ts
  npx tsx scripts/generate-canola-market-read.ts --format markdown
  npm run canola-market-read -- markdown
  npx tsx scripts/generate-canola-market-read.ts --crop-year 2025-2026 --grain-week 38

Options:
  --grain <name>       Only Canola is supported in V1. Default: Canola
  --crop-year <year>   CGC crop year. Default: current crop year
  --grain-week <week>  Optional CGC grain week. Default: latest available in packet RPC
  --format <format>    json or markdown. Default: json
  --help               Show this help

Environment:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(0);
}

function valueAfter(flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

function positionalFormat(): string | null {
  const candidate = args.find((arg) => arg === "json" || arg === "markdown");
  return candidate ?? null;
}

function loadEnvFile(filePath: string): void {
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

const grain = valueAfter("--grain") ?? "Canola";
const cropYear = valueAfter("--crop-year") ?? getCurrentCropYear();
const grainWeekArg = valueAfter("--grain-week");
const format = valueAfter("--format") ?? positionalFormat() ?? "json";

if (grain.toLowerCase() !== "canola") {
  console.error("ERROR: Canola Market Read V1 only supports --grain Canola.");
  process.exit(1);
}

if (!["json", "markdown"].includes(format)) {
  console.error("ERROR: --format must be json or markdown.");
  process.exit(1);
}

const grainWeek = grainWeekArg ? Number(grainWeekArg) : null;
if (grainWeekArg && (!Number.isInteger(grainWeek) || Number(grainWeek) < 1 || Number(grainWeek) > 53)) {
  console.error("ERROR: --grain-week must be an integer between 1 and 53.");
  process.exit(1);
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getPacket(targetWeek: number | null): Promise<unknown> {
  const { data, error } = await supabase.rpc("get_canada_thesis_packet", {
    p_grain: "Canola",
    p_crop_year: cropYear,
    p_grain_week: targetWeek,
  });

  if (error) {
    const reason = error.code === "PGRST202" ? "data_layer_not_deployed" : "packet_rpc_failed";
    throw new Error(`${reason}: ${error.message}`);
  }

  return data;
}

async function main(): Promise<void> {
  let read;

  try {
    console.error(
      `Reading get_canada_thesis_packet('Canola', '${cropYear}', ${grainWeek ?? "latest"})...`,
    );
    const packet = await getPacket(grainWeek);
    const packetRecord = typeof packet === "object" && packet !== null ? (packet as Record<string, unknown>) : {};
    const currentWeek = typeof packetRecord.grain_week === "number" ? packetRecord.grain_week : null;
    let previousPacket: unknown = null;

    if (currentWeek !== null && currentWeek > 1) {
      try {
        previousPacket = await getPacket(currentWeek - 1);
      } catch (error) {
        console.error(
          `Warning: prior-week packet unavailable; week-over-week deltas will be empty. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    read = buildCanolaMarketRead(packet, previousPacket);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.startsWith("data_layer_not_deployed")
      ? "data_layer_not_deployed"
      : "packet_rpc_failed";
    read = buildUnavailableCanolaMarketRead(reason, message);
    process.exitCode = 1;
  }

  if (format === "markdown") {
    console.log(renderCanolaMarketReadMarkdown(read));
    return;
  }

  console.log(JSON.stringify(read, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
