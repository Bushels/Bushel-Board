#!/usr/bin/env npx tsx
/**
 * Prediction Scorecard Evaluator
 *
 * Evaluates weekly thesis anchors and daily modifier calls from score_trajectory
 * against realized grain_prices follow-through over 7, 14, and 28 day windows.
 *
 * Usage:
 *   npx tsx scripts/evaluate-predictions.ts
 *   npx tsx scripts/evaluate-predictions.ts --limit 50
 *   npx tsx scripts/evaluate-predictions.ts --dry-run
 *   npx tsx scripts/evaluate-predictions.ts --help
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildPredictionScorecardRow,
  type PredictionCall,
  type PredictionRecommendation,
  type PriceWindow,
} from "@/lib/prediction-scorecard";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Prediction Scorecard Evaluator

Usage:
  npx tsx scripts/evaluate-predictions.ts             Evaluate recent score_trajectory calls
  npx tsx scripts/evaluate-predictions.ts --limit 50  Evaluate at most 50 calls
  npx tsx scripts/evaluate-predictions.ts --dry-run   Build rows only, do not write
  npx tsx scripts/evaluate-predictions.ts --help      Show this help
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const limitIndex = args.indexOf("--limit");
const LIMIT =
  limitIndex !== -1 && args[limitIndex + 1]
    ? parseInt(args[limitIndex + 1], 10)
    : 100;

if (Number.isNaN(LIMIT) || LIMIT < 1 || LIMIT > 1000) {
  console.error("ERROR: --limit must be a number between 1 and 1000.");
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
    // ignore
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const EVAL_WINDOWS = [7, 14, 28] as const;

type ScoreTrajectoryRow = {
  grain: string;
  crop_year: string;
  grain_week: number;
  recorded_at: string;
  scan_type: string;
  stance_score: number;
  recommendation: PredictionRecommendation;
  model_source: string | null;
  data_freshness?: Record<string, unknown> | null;
};

type GrainPriceRow = {
  grain: string;
  price_date: string;
  settlement_price: number;
};

type MarketAnalysisRow = {
  grain: string;
  crop_year: string;
  grain_week: number;
  llm_metadata?: {
    price_verification?: Record<string, unknown> | null;
  } | null;
};

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const dt = new Date(`${dateString}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDate(dt);
}

function findFirstPriceOnOrAfter(rows: GrainPriceRow[], targetDate: string): GrainPriceRow | null {
  for (const row of rows) {
    if (row.price_date >= targetDate) return row;
  }
  return null;
}

function buildPriceWindow(rows: GrainPriceRow[], recordedAt: string, evalWindowDays: number): PriceWindow {
  const callDate = recordedAt.slice(0, 10);
  const start = findFirstPriceOnOrAfter(rows, callDate);
  if (!start) {
    return {
      evalWindowDays,
      startPriceDate: null,
      startSettlementPrice: null,
      endPriceDate: null,
      endSettlementPrice: null,
      priceChangePct: null,
      pathChangePcts: [],
    };
  }

  const targetDate = addDays(start.price_date, evalWindowDays);
  const end = findFirstPriceOnOrAfter(rows, targetDate);
  if (!end) {
    return {
      evalWindowDays,
      startPriceDate: start.price_date,
      startSettlementPrice: start.settlement_price,
      endPriceDate: null,
      endSettlementPrice: null,
      priceChangePct: null,
      pathChangePcts: [],
    };
  }

  const checkpoints = [
    addDays(start.price_date, Math.max(1, Math.floor(evalWindowDays / 3))),
    addDays(start.price_date, Math.max(2, Math.floor((2 * evalWindowDays) / 3))),
    end.price_date,
  ];

  const pathChangePcts = checkpoints.map((checkpoint) => {
    const checkpointRow = findFirstPriceOnOrAfter(rows, checkpoint) ?? end;
    return Number((((checkpointRow.settlement_price - start.settlement_price) / start.settlement_price) * 100).toFixed(3));
  });

  return {
    evalWindowDays,
    startPriceDate: start.price_date,
    startSettlementPrice: start.settlement_price,
    endPriceDate: end.price_date,
    endSettlementPrice: end.settlement_price,
    priceChangePct: Number((((end.settlement_price - start.settlement_price) / start.settlement_price) * 100).toFixed(3)),
    pathChangePcts,
  };
}

async function main() {
  const startTime = Date.now();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

  const { data: calls, error: callsError } = await supabase
    .from("score_trajectory")
    .select("grain,crop_year,grain_week,recorded_at,scan_type,stance_score,recommendation,model_source,data_freshness")
    .order("recorded_at", { ascending: false })
    .limit(LIMIT);

  if (callsError) {
    throw new Error(`Failed to load score_trajectory: ${callsError.message}`);
  }

  const callRows = (calls ?? []) as ScoreTrajectoryRow[];
  if (callRows.length === 0) {
    console.log(JSON.stringify({ dry_run: DRY_RUN, calls_loaded: 0, rows_built: 0, rows_written: 0, duration_ms: Date.now() - startTime }, null, 2));
    return;
  }

  const earliestRecordedAt = callRows[callRows.length - 1]?.recorded_at.slice(0, 10);
  const { data: prices, error: pricesError } = await supabase
    .from("grain_prices")
    .select("grain,price_date,settlement_price")
    .gte("price_date", earliestRecordedAt)
    .order("price_date", { ascending: true });

  if (pricesError) {
    throw new Error(`Failed to load grain_prices: ${pricesError.message}`);
  }

  const { data: analyses, error: analysisError } = await supabase
    .from("market_analysis")
    .select("grain,crop_year,grain_week,llm_metadata")
    .in("grain", [...new Set(callRows.map((row) => row.grain))])
    .in("crop_year", [...new Set(callRows.map((row) => row.crop_year))]);

  if (analysisError) {
    throw new Error(`Failed to load market_analysis: ${analysisError.message}`);
  }

  const pricesByGrain = new Map<string, GrainPriceRow[]>();
  for (const row of (prices ?? []) as GrainPriceRow[]) {
    const list = pricesByGrain.get(row.grain) ?? [];
    list.push(row);
    pricesByGrain.set(row.grain, list);
  }

  const analysisMap = new Map<string, MarketAnalysisRow>();
  for (const row of (analyses ?? []) as MarketAnalysisRow[]) {
    analysisMap.set(`${row.grain}|${row.crop_year}|${row.grain_week}`, row);
  }

  const scorecardRows = callRows.flatMap((callRow) => {
    const priceRows = pricesByGrain.get(callRow.grain) ?? [];
    const predictionCall: PredictionCall = {
      grain: callRow.grain,
      cropYear: callRow.crop_year,
      grainWeek: callRow.grain_week,
      recordedAt: callRow.recorded_at,
      scanType: callRow.scan_type,
      stanceScore: Number(callRow.stance_score),
      recommendation: callRow.recommendation,
      modelSource: callRow.model_source,
    };

    const analysis = analysisMap.get(`${callRow.grain}|${callRow.crop_year}|${callRow.grain_week}`);

    return EVAL_WINDOWS.map((windowDays) => {
      const row = buildPredictionScorecardRow(
        predictionCall,
        buildPriceWindow(priceRows, callRow.recorded_at, windowDays),
      );

      return {
        grain: row.grain,
        crop_year: row.cropYear,
        grain_week: row.grainWeek,
        source_recorded_at: row.sourceRecordedAt,
        scan_type: row.scanType,
        stance_score: row.stanceScore,
        recommendation: row.recommendation,
        model_source: row.modelSource,
        eval_window_days: row.evalWindowDays,
        start_price_date: row.startPriceDate,
        start_settlement_price: row.startSettlementPrice,
        end_price_date: row.endPriceDate,
        end_settlement_price: row.endSettlementPrice,
        price_change_pct: row.priceChangePct,
        direction_result: row.directionResult,
        action_result: row.actionResult,
        timing_result: row.timingResult,
        score_bias: row.scoreBias,
        data_freshness: callRow.data_freshness ?? null,
        price_verification: analysis?.llm_metadata?.price_verification ?? null,
        notes: row.notes,
      };
    });
  });

  if (DRY_RUN) {
    console.log(JSON.stringify({
      dry_run: true,
      calls_loaded: callRows.length,
      rows_built: scorecardRows.length,
      sample: scorecardRows.slice(0, 5),
      duration_ms: Date.now() - startTime,
    }, null, 2));
    return;
  }

  const { error: upsertError } = await supabase
    .from("prediction_scorecard")
    .upsert(scorecardRows, {
      onConflict: "grain,crop_year,grain_week,source_recorded_at,eval_window_days",
    });

  if (upsertError) {
    throw new Error(`Failed to upsert prediction_scorecard: ${upsertError.message}`);
  }

  console.log(JSON.stringify({
    dry_run: false,
    calls_loaded: callRows.length,
    rows_built: scorecardRows.length,
    rows_written: scorecardRows.length,
    duration_ms: Date.now() - startTime,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
