/**
 * Desk swarm headless runner — pure DB row builders.
 *
 * Map validated chief payloads to the EXACT column shapes of the write targets
 * (verified against the live schema). No timestamps are set here so the builders
 * stay pure/testable; the CLI injects generated_at / pipeline timestamps at write time.
 */

import { buildWeeklyTrajectoryRow, type WeeklyTrajectoryRow } from "../../lib/trajectory-mapping";
import {
  CAD_DESK_MODEL,
  US_DESK_MODEL,
  WEEKLY_SCAN_TYPE,
  TRIGGERED_BY,
} from "./contracts";
import type { CadRow, UsRow } from "./schemas";

export interface CadContext {
  cropYear: string;
  grainWeek: number;
}

export interface UsContext {
  cropYear: string;
  marketYear: number;
  weekEnding: string;
}

/** market_analysis UPSERT row (content columns only). */
export function buildMarketAnalysisRow(row: CadRow, ctx: CadContext): Record<string, unknown> {
  return {
    grain: row.grain,
    crop_year: ctx.cropYear,
    grain_week: ctx.grainWeek,
    initial_thesis: row.initial_thesis,
    bull_case: row.bull_case,
    bear_case: row.bear_case,
    historical_context: row.historical_context, // jsonb NOT NULL (default {})
    data_confidence: row.data_confidence,
    key_signals: row.key_signals, // jsonb NOT NULL (default [])
    model_used: row.model_used ?? CAD_DESK_MODEL,
    llm_metadata: row.llm_metadata,
    confidence_score: row.confidence_score,
    final_assessment: row.final_assessment,
    stance_score: row.stance_score,
    bull_reasoning: row.bull_reasoning, // jsonb
    bear_reasoning: row.bear_reasoning, // jsonb
  };
}

/**
 * score_trajectory weekly anchor row, built via buildWeeklyTrajectoryRow so
 * recommendation / near_term / medium_term are guaranteed CHECK-constraint-valid.
 */
export function buildCadTrajectoryRow(row: CadRow, ctx: CadContext): WeeklyTrajectoryRow {
  return buildWeeklyTrajectoryRow({
    grain: row.grain,
    cropYear: ctx.cropYear,
    grainWeek: ctx.grainWeek,
    stanceScore: row.stance_score,
    confidenceScore: row.conviction_pct,
    modelSource: CAD_DESK_MODEL,
    trigger: row.trigger,
    evidence: row.evidence, // text column
    dataFreshness: row.data_freshness, // jsonb NOT NULL
  });
}

/** us_market_analysis UPSERT row (content columns only). */
export function buildUsMarketAnalysisRow(row: UsRow, ctx: UsContext): Record<string, unknown> {
  return {
    market_name: row.market_name,
    crop_year: ctx.cropYear,
    market_year: ctx.marketYear,
    initial_thesis: row.initial_thesis,
    bull_case: row.bull_case,
    bear_case: row.bear_case,
    final_assessment: row.final_assessment,
    stance_score: row.stance_score,
    confidence_score: row.confidence_score,
    recommendation: row.recommendation, // NOT NULL, free text
    data_confidence: row.data_confidence,
    key_signals: row.key_signals,
    data_freshness: row.data_freshness,
    llm_metadata: row.llm_metadata,
    model_used: row.model_used ?? US_DESK_MODEL,
  };
}

/** us_score_trajectory weekly anchor row (no near/medium term; evidence is jsonb). */
export function buildUsTrajectoryRow(row: UsRow, ctx: UsContext): Record<string, unknown> {
  return {
    market_name: row.market_name,
    crop_year: ctx.cropYear,
    market_year: ctx.marketYear,
    scan_type: WEEKLY_SCAN_TYPE,
    stance_score: row.stance_score,
    conviction_pct: row.conviction_pct,
    recommendation: row.recommendation,
    trigger: row.trigger,
    evidence: row.evidence ?? {}, // jsonb
    data_freshness: row.data_freshness,
    model_source: US_DESK_MODEL,
  };
}

export type PipelineRunStatus = "running" | "completed" | "partial" | "failed";

export interface PipelineRunInput {
  cropYear: string;
  grainWeek: number;
  status: PipelineRunStatus;
  grainsRequested: string[];
  grainsCompleted?: string[];
  grainsFailed?: string[];
  failureDetails?: Record<string, unknown>;
}

/**
 * pipeline_runs row with the ACTUAL columns (no source / no metadata; crop_year +
 * grain_week + grains_requested are NOT NULL). Fixes the broken prompt inserts.
 */
export function buildPipelineRunRow(input: PipelineRunInput): Record<string, unknown> {
  return {
    crop_year: input.cropYear,
    grain_week: input.grainWeek,
    status: input.status,
    triggered_by: TRIGGERED_BY,
    grains_requested: input.grainsRequested,
    grains_completed: input.grainsCompleted ?? [],
    grains_failed: input.grainsFailed ?? [],
    failure_details: input.failureDetails ?? {},
  };
}
