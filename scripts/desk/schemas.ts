/**
 * Desk swarm headless runner — zod input schemas.
 *
 * Validates the desk chief's finalized per-grain / per-market payloads BEFORE
 * any service-role write. Loud validation here is the last gate against a
 * malformed thesis reaching the published tables.
 */

import { z } from "zod";
import { CAD_GRAINS, US_MARKETS } from "./contracts";

const stanceScore = z.number().int().min(-100).max(100);
const pct = z.number().int().min(0).max(100);
/** jsonb object column (e.g. llm_metadata, data_freshness, historical_context). */
const jsonObject = z.record(z.string(), z.unknown());
/** jsonb array column (e.g. key_signals, bull_reasoning). */
const jsonArray = z.array(z.unknown());

/** One CAD grain assessment from the desk chief. */
export const cadRowSchema = z.object({
  grain: z.enum(CAD_GRAINS),
  stance_score: stanceScore,
  confidence_score: pct.nullable().default(null),
  data_confidence: z.enum(["low", "medium", "high"]).default("medium"),
  initial_thesis: z.string().min(1),
  bull_case: z.string().min(1),
  bear_case: z.string().min(1),
  bull_reasoning: jsonArray.default([]),
  bear_reasoning: jsonArray.default([]),
  final_assessment: z.string().nullable().default(null),
  key_signals: jsonArray.default([]),
  historical_context: jsonObject.default({}),
  llm_metadata: jsonObject.default({}),
  model_used: z.string().min(1).optional(),
  // score_trajectory anchor fields:
  conviction_pct: pct.nullable().default(null),
  trigger: z.string().default(""),
  evidence: z.string().default(""), // score_trajectory.evidence is TEXT
  data_freshness: jsonObject, // score_trajectory.data_freshness is jsonb NOT NULL
});

/** One US market assessment from the US desk chief. */
export const usRowSchema = z.object({
  market_name: z.enum(US_MARKETS),
  stance_score: stanceScore,
  confidence_score: pct.nullable().default(null),
  data_confidence: z.enum(["low", "medium", "high"]).default("medium"),
  initial_thesis: z.string().min(1),
  bull_case: z.string().min(1),
  bear_case: z.string().min(1),
  final_assessment: z.string().nullable().default(null),
  recommendation: z.string().min(1), // us_market_analysis.recommendation is NOT NULL, free text
  key_signals: jsonArray.default([]),
  data_freshness: jsonObject.default({}),
  // bull_reasoning / bear_reasoning / tier / compression live INSIDE llm_metadata on the US table:
  llm_metadata: jsonObject.default({}),
  model_used: z.string().min(1).optional(),
  // us_score_trajectory anchor fields:
  conviction_pct: pct.nullable().default(null),
  trigger: z.string().nullable().default(null),
  evidence: z.unknown().optional(), // us_score_trajectory.evidence is jsonb
});

export const cadWriteEnvelope = z.object({
  side: z.literal("cad"),
  crop_year: z.string().regex(/^\d{4}-\d{4}$/, "crop_year must be long format YYYY-YYYY"),
  grain_week: z.number().int().min(1).max(53),
  grains_requested: z.array(z.string()).optional(),
  rows: z.array(cadRowSchema).min(1),
});

export const usWriteEnvelope = z.object({
  side: z.literal("us"),
  crop_year: z.string().regex(/^\d{4}-\d{4}$/, "crop_year must be long format YYYY-YYYY"),
  market_year: z.number().int().min(2020).max(2035),
  week_ending: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "week_ending must be YYYY-MM-DD"),
  grains_requested: z.array(z.string()).optional(),
  rows: z.array(usRowSchema).min(1),
});

export const writeEnvelope = z.discriminatedUnion("side", [cadWriteEnvelope, usWriteEnvelope]);

export type CadRow = z.infer<typeof cadRowSchema>;
export type UsRow = z.infer<typeof usRowSchema>;
export type CadWriteEnvelope = z.infer<typeof cadWriteEnvelope>;
export type UsWriteEnvelope = z.infer<typeof usWriteEnvelope>;
export type WriteEnvelope = z.infer<typeof writeEnvelope>;
