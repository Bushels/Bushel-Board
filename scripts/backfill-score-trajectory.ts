#!/usr/bin/env npx tsx
/**
 * Backfill weekly score_trajectory rows from market_analysis.
 *
 * This repairs missing weekly anchor rows so prediction scorecard evaluation and
 * future daily modifier logic can compare against an explicit weekly thesis.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

import { buildWeeklyTrajectoryRow } from "@/lib/trajectory-mapping";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const weekIndex = args.indexOf("--week");
const WEEK = weekIndex !== -1 && args[weekIndex + 1] ? parseInt(args[weekIndex + 1], 10) : null;
const cropYearIndex = args.indexOf("--crop-year");
const CROP_YEAR = cropYearIndex !== -1 && args[cropYearIndex + 1] ? args[cropYearIndex + 1] : "2025-2026";

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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  let query = supabase
    .from("market_analysis")
    .select("grain,crop_year,grain_week,generated_at,stance_score,confidence_score,final_assessment,llm_metadata")
    .eq("crop_year", CROP_YEAR)
    .order("generated_at", { ascending: false });

  if (WEEK != null) {
    query = query.eq("grain_week", WEEK);
  }

  const { data: analyses, error } = await query;
  if (error) throw new Error(`Failed to load market_analysis: ${error.message}`);

  const latestPerGrain = new Map<string, Record<string, unknown>>();
  for (const row of analyses ?? []) {
    const grain = String(row.grain);
    if (!latestPerGrain.has(grain)) latestPerGrain.set(grain, row as Record<string, unknown>);
  }

  const rows = [...latestPerGrain.values()].map((row) => {
    const llmMetadata = (row.llm_metadata as Record<string, unknown> | null) ?? null;
    const priceVerification = (llmMetadata?.price_verification as Record<string, unknown> | null) ?? null;
    const generatedAt = String(row.generated_at);
    const priceDate = typeof priceVerification?.priceDate === "string"
      ? priceVerification.priceDate
      : typeof priceVerification?.price_date === "string"
        ? priceVerification.price_date
        : generatedAt.slice(0, 10);

    return buildWeeklyTrajectoryRow({
      grain: String(row.grain),
      cropYear: String(row.crop_year),
      grainWeek: Number(row.grain_week),
      stanceScore: Number(row.stance_score ?? 0),
      confidenceScore: typeof row.confidence_score === "number" ? row.confidence_score : null,
      modelSource: "market_analysis_backfill",
      trigger: "weekly thesis anchor backfill",
      evidence: typeof row.final_assessment === "string" ? row.final_assessment : "Backfilled from market_analysis weekly thesis.",
      dataFreshness: {
        market_analysis_generated_at: generatedAt,
        prices: priceDate,
        source: "backfill-score-trajectory",
      },
    });
  });

  if (DRY_RUN) {
    console.log(JSON.stringify({ dry_run: true, rows_built: rows.length, rows }, null, 2));
    return;
  }

  const { error: insertError } = await supabase.from("score_trajectory").insert(rows);
  if (insertError) throw new Error(`Failed to insert score_trajectory rows: ${insertError.message}`);

  console.log(JSON.stringify({ dry_run: false, rows_inserted: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
