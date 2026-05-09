import { z } from "zod";

export const CANOLA_FORECAST_SCHEMA_VERSION = "canola-forecast-v1" as const;

export const FORECAST_DIRECTIONS = ["bullish", "bearish", "neutral"] as const;
export const FORECAST_RECOMMENDATIONS = [
  "PATIENCE",
  "WATCH",
  "SCALE_IN",
  "ACCELERATE",
  "HOLD_FIRM",
  "PRICE",
] as const;
export const PRICE_ROLL_POLICIES = [
  "fixed_contract_no_roll",
  "front_month_with_declared_roll",
  "continuous_adjusted_series",
] as const;
export const PRETRAINING_TAINT_STATUSES = [
  "not_applicable",
  "untainted",
  "tainted",
  "unknown",
] as const;
export const DRIVER_CONFIDENCES = ["high", "medium", "low"] as const;

const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date.");

const offsetDateTimeStringSchema = z
  .string()
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) && /(Z|[+-]\d{2}:\d{2})$/.test(value),
    "Expected ISO datetime with timezone offset.",
  );

const finiteNumberSchema = z
  .number()
  .refine(Number.isFinite, "Expected a finite number.");

export const priceContractSchema = z.object({
  exchange: z.string().min(1),
  commodity: z.literal("Canola"),
  contract_code: z.string().min(1),
  contract_month: z.string().min(1),
  roll_policy: z.enum(PRICE_ROLL_POLICIES),
});

export const forecastDriverSchema = z.object({
  driver: z.string().min(1),
  directional_effect: z.enum(FORECAST_DIRECTIONS),
  evidence_source: z.string().min(1),
  evidence_clock: offsetDateTimeStringSchema,
  confidence: z.enum(DRIVER_CONFIDENCES),
});

export const sourceWarningSchema = z.object({
  source: z.string().min(1),
  warning: z.string().min(1),
});

export const expectedMovePctRangeSchema = z
  .object({
    low: finiteNumberSchema,
    high: finiteNumberSchema,
  })
  .refine((value) => value.low <= value.high, {
    message: "Expected move low must be less than or equal to high.",
  });

export const canolaForecastSchema = z
  .object({
    schema_version: z.literal(CANOLA_FORECAST_SCHEMA_VERSION),
    grain: z.literal("Canola"),
    crop_year: z
      .string()
      .regex(/^\d{4}-\d{4}$/, "Expected crop year like 2026-2027."),
    grain_week: z.number().int().min(1).max(53),
    as_of_date: isoDateStringSchema,
    source_cutoff_at: offsetDateTimeStringSchema,
    model_training_cutoff: isoDateStringSchema.nullable().optional(),
    pretraining_taint_status: z.enum(PRETRAINING_TAINT_STATUSES),
    horizon_days: z.union([z.literal(7), z.literal(28)]),
    price_contract: priceContractSchema,
    direction: z.enum(FORECAST_DIRECTIONS),
    stance_score: z.number().int().min(-100).max(100),
    confidence_pct: z.number().int().min(0).max(100),
    expected_move_pct_range: expectedMovePctRangeSchema,
    recommendation: z.enum(FORECAST_RECOMMENDATIONS),
    top_drivers: z.array(forecastDriverSchema).min(1).max(5),
    invalidating_triggers: z.array(z.string().min(1)).min(1),
    known_blind_spots: z.array(z.string().min(1)).min(1),
    source_warnings: z.array(sourceWarningSchema).default([]),
  })
  .superRefine((value, context) => {
    if (
      value.model_training_cutoff &&
      value.as_of_date <= value.model_training_cutoff &&
      value.pretraining_taint_status !== "tainted"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Historical forecasts at or before the model training cutoff must be marked tainted.",
        path: ["pretraining_taint_status"],
      });
    }
  });

export type CanolaForecast = z.infer<typeof canolaForecastSchema>;
export type PriceContract = z.infer<typeof priceContractSchema>;
export type ForecastDirection = (typeof FORECAST_DIRECTIONS)[number];
export type ForecastRecommendation = (typeof FORECAST_RECOMMENDATIONS)[number];
export type PriceRollPolicy = (typeof PRICE_ROLL_POLICIES)[number];
export type PretrainingTaintStatus =
  (typeof PRETRAINING_TAINT_STATUSES)[number];

export function parseCanolaForecast(input: unknown): CanolaForecast {
  return canolaForecastSchema.parse(input);
}

export function safeParseCanolaForecast(input: unknown) {
  return canolaForecastSchema.safeParse(input);
}
