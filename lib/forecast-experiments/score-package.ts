import { createHash } from "node:crypto";

import {
  scoreForecastOutcome,
  type ConfidenceBucket,
  type DirectionResult,
} from "./scoring";
import { stableStringify } from "./snapshot";
import {
  CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION,
  FORECAST_EXPERIMENT_SIDECAR_TABLES,
  type CanolaForecastSidecarPackage,
  type ForecastExperimentRunLookup,
} from "./sidecar-package";
import type { PriceRollPolicy } from "./schema";

export const CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION =
  "canola-forecast-score-package-v1" as const;

interface ScorePackageGuardrails {
  executes_writes: false;
  review_required_before_write: true;
  allowed_schema: "experimental";
  target_table: "experimental.forecast_experiment_scores";
  production_tables: [];
  forbidden_operations: string[];
}

export interface ForecastExperimentPredictionLookup {
  run_lookup: ForecastExperimentRunLookup;
  horizon_days: 7 | 28;
  price_contract_code: string;
  price_roll_policy: PriceRollPolicy;
}

export interface ForecastExperimentScoreInsert {
  eval_window_days: 7 | 28;
  price_contract_code: string;
  price_roll_policy: PriceRollPolicy;
  start_price: number;
  end_price: number;
  start_price_at: string;
  end_price_at: string;
  market_close_at: string;
  price_change_pct: number;
  direction_result: DirectionResult;
  magnitude_error_pct: number;
  brier_score: number;
  confidence_bucket: ConfidenceBucket;
  baseline_results: Record<string, unknown>;
  source_snapshot_hash: string;
  score_notes: string | null;
  evaluated_at: string;
}

export interface CanolaForecastScorePackageInput {
  sidecar_package: unknown;
  eval_window_days: 7 | 28;
  start_price: number;
  end_price: number;
  start_price_at: string;
  end_price_at: string;
  market_close_at: string;
  evaluated_at: string;
  baseline_results?: Record<string, unknown>;
  score_notes?: string | null;
}

export interface CanolaForecastScorePackage {
  schema_version: typeof CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION;
  sidecar_package_hash: string;
  guardrails: ScorePackageGuardrails;
  run_lookup: ForecastExperimentRunLookup;
  prediction_lookup: ForecastExperimentPredictionLookup;
  score_insert: ForecastExperimentScoreInsert;
  score_hash: string;
}

export function buildCanolaForecastScorePackage(
  input: CanolaForecastScorePackageInput,
): CanolaForecastScorePackage {
  const sidecarPackage = validateSidecarPackage(input.sidecar_package);
  const predictionInsert = sidecarPackage.prediction_inserts.find(
    (candidate) => candidate.row.horizon_days === input.eval_window_days,
  );

  if (!predictionInsert) {
    throw new Error(
      `No prediction row found for eval_window_days=${input.eval_window_days}.`,
    );
  }

  validateOutcomeTiming(input);

  const forecast = predictionInsert.row.forecast_json;
  const outcomeScore = scoreForecastOutcome({
    direction: forecast.direction,
    confidencePct: forecast.confidence_pct,
    expectedMovePctRange: forecast.expected_move_pct_range,
    horizonDays: input.eval_window_days,
    priceContractCode: predictionInsert.row.price_contract_code,
    priceRollPolicy: predictionInsert.row.price_roll_policy,
    forecastTimestamp: forecast.source_cutoff_at,
    marketCloseTimestamp: input.market_close_at,
    startPriceTimestamp: input.start_price_at,
    startPrice: input.start_price,
    endPrice: input.end_price,
  });
  const baselineResults = validateBaselineResults(input.baseline_results ?? {});
  const predictionLookup: ForecastExperimentPredictionLookup = {
    run_lookup: predictionInsert.run_lookup,
    horizon_days: predictionInsert.row.horizon_days,
    price_contract_code: predictionInsert.row.price_contract_code,
    price_roll_policy: predictionInsert.row.price_roll_policy,
  };
  const scoreInsert: ForecastExperimentScoreInsert = {
    eval_window_days: input.eval_window_days,
    price_contract_code: predictionInsert.row.price_contract_code,
    price_roll_policy: predictionInsert.row.price_roll_policy,
    start_price: input.start_price,
    end_price: input.end_price,
    start_price_at: input.start_price_at,
    end_price_at: input.end_price_at,
    market_close_at: input.market_close_at,
    price_change_pct: outcomeScore.priceChangePct,
    direction_result: outcomeScore.directionResult,
    magnitude_error_pct: outcomeScore.magnitudeErrorPct,
    brier_score: outcomeScore.brierScore,
    confidence_bucket: outcomeScore.confidenceBucket,
    baseline_results: baselineResults,
    source_snapshot_hash: sidecarPackage.run_insert.snapshot_hash,
    score_notes: optionalText(input.score_notes),
    evaluated_at: input.evaluated_at,
  };
  const packageWithoutHash = {
    schema_version: CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION,
    sidecar_package_hash: sidecarPackage.package_hash,
    guardrails: {
      executes_writes: false,
      review_required_before_write: true,
      allowed_schema: "experimental",
      target_table: "experimental.forecast_experiment_scores",
      production_tables: [],
      forbidden_operations: [
        "sql_execute",
        "supabase_client_write",
        "production_table_write",
        "dashboard_import",
        "hermes_automation_start",
        "model_api_call",
      ],
    },
    run_lookup: sidecarPackage.run_lookup,
    prediction_lookup: predictionLookup,
    score_insert: scoreInsert,
  } satisfies Omit<CanolaForecastScorePackage, "score_hash">;

  return {
    ...packageWithoutHash,
    score_hash: `sha256:${sha256(stableStringify(packageWithoutHash))}`,
  };
}

function validateSidecarPackage(
  sidecarPackage: unknown,
): CanolaForecastSidecarPackage {
  if (!sidecarPackage || typeof sidecarPackage !== "object") {
    throw new Error("sidecar_package must be an object.");
  }

  const candidate = sidecarPackage as CanolaForecastSidecarPackage;

  if (candidate.schema_version !== CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION) {
    throw new Error("sidecar_package schema_version is unsupported.");
  }

  assertHashMatches(
    candidate as unknown as Record<string, unknown>,
    "package_hash",
    "sidecar_package",
  );

  if (!candidate.guardrails.review_required_before_write) {
    throw new Error("sidecar_package must require review before write.");
  }

  if (candidate.guardrails.executes_writes !== false) {
    throw new Error("sidecar_package must not execute writes.");
  }

  if (
    !candidate.guardrails.target_tables.includes(
      FORECAST_EXPERIMENT_SIDECAR_TABLES[2],
    )
  ) {
    throw new Error("sidecar_package must target forecast_experiment_scores.");
  }

  return candidate;
}

function validateOutcomeTiming(input: CanolaForecastScorePackageInput): void {
  const startTime = parseRequiredTimestamp(input.start_price_at, "start_price_at");
  const endTime = parseRequiredTimestamp(input.end_price_at, "end_price_at");
  parseRequiredTimestamp(input.market_close_at, "market_close_at");
  parseRequiredTimestamp(input.evaluated_at, "evaluated_at");

  if (endTime < startTime) {
    throw new Error("end_price_at must be at or after start_price_at.");
  }
}

function validateBaselineResults(
  baselineResults: Record<string, unknown>,
): Record<string, unknown> {
  if (!baselineResults || typeof baselineResults !== "object" || Array.isArray(baselineResults)) {
    throw new Error("baseline_results must be an object.");
  }

  stableStringify(baselineResults);

  return baselineResults;
}

function assertHashMatches(
  value: Record<string, unknown>,
  hashField: string,
  label: string,
): void {
  const expectedHash = value[hashField];

  if (typeof expectedHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error(`${hashField} must be a sha256 hash.`);
  }

  const withoutHash = { ...value };
  delete withoutHash[hashField];
  const actualHash = `sha256:${sha256(stableStringify(withoutHash))}`;

  if (actualHash !== expectedHash) {
    throw new Error(`${hashField} does not match ${label} contents.`);
  }
}

function parseRequiredTimestamp(value: string, fieldName: string): number {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`${fieldName} must include a timezone offset.`);
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }

  return timestamp;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
