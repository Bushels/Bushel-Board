import { createHash } from "node:crypto";

import { CANOLA_FORECAST_SCHEMA_VERSION, type CanolaForecast } from "./schema";
import {
  CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
  type CanolaForecastLocalWorkflow,
} from "./local-workflow";
import {
  CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  stableStringify,
} from "./snapshot";
import { CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION } from "./prompt-pack";
import { CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION } from "./run-artifact";

export const CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION =
  "canola-forecast-sidecar-package-v1" as const;

export const FORECAST_EXPERIMENT_SIDECAR_TABLES = [
  "experimental.forecast_experiment_runs",
  "experimental.forecast_experiment_predictions",
  "experimental.forecast_experiment_scores",
] as const;

type SidecarTableName = (typeof FORECAST_EXPERIMENT_SIDECAR_TABLES)[number];

interface SidecarGuardrails {
  executes_writes: false;
  review_required_before_write: true;
  allowed_schema: "experimental";
  target_tables: SidecarTableName[];
  production_tables: [];
  forbidden_operations: string[];
}

export interface ForecastExperimentRunLookup {
  experiment_slug: string;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
}

export interface ForecastExperimentRunInsert extends ForecastExperimentRunLookup {
  model_training_cutoff: string | null;
  pretraining_taint_status: CanolaForecast["pretraining_taint_status"];
  snapshot_version: typeof CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION;
  snapshot_json: CanolaForecastLocalWorkflow["snapshot"];
  snapshot_hash: string;
  prompt_version: string;
  schema_version: typeof CANOLA_FORECAST_SCHEMA_VERSION;
  llm_provider: string;
  llm_model: string;
  repo_commit: string | null;
  run_status: "parsed";
  created_at: string;
}

export interface ForecastExperimentPredictionRow {
  horizon_days: CanolaForecast["horizon_days"];
  price_exchange: string;
  price_commodity: "Canola";
  price_contract_code: string;
  price_contract_month: string;
  price_roll_policy: CanolaForecast["price_contract"]["roll_policy"];
  direction: CanolaForecast["direction"];
  stance_score: number;
  confidence_pct: number;
  expected_move_pct_low: number;
  expected_move_pct_high: number;
  recommendation: CanolaForecast["recommendation"];
  forecast_json: CanolaForecast;
  raw_model_output: string | null;
  parse_status: "parsed";
  validation_errors: [];
  created_at: string;
}

export interface ForecastExperimentPredictionInsert {
  run_lookup: ForecastExperimentRunLookup;
  row: ForecastExperimentPredictionRow;
}

export interface CanolaForecastSidecarPackageInput {
  workflow: unknown;
  experiment_slug: string;
  repo_commit?: string | null;
  raw_model_output?: string | null;
}

export interface CanolaForecastSidecarPackage {
  schema_version: typeof CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION;
  experiment_slug: string;
  workflow_hash: string;
  guardrails: SidecarGuardrails;
  run_lookup: ForecastExperimentRunLookup;
  run_insert: ForecastExperimentRunInsert;
  prediction_inserts: ForecastExperimentPredictionInsert[];
  score_inserts: [];
  package_hash: string;
}

export function buildCanolaForecastSidecarPackage(
  input: CanolaForecastSidecarPackageInput,
): CanolaForecastSidecarPackage {
  const experimentSlug = requireExperimentSlug(input.experiment_slug);
  const workflow = validateWorkflow(input.workflow);
  const forecast = workflow.run_artifact.forecast;
  const createdAt = workflow.run_artifact.metadata.created_at;
  const runLookup: ForecastExperimentRunLookup = {
    experiment_slug: experimentSlug,
    grain: workflow.grain,
    crop_year: workflow.crop_year,
    grain_week: workflow.grain_week,
    as_of_date: workflow.as_of_date,
    source_cutoff_at: workflow.source_cutoff_at,
  };
  const runInsert: ForecastExperimentRunInsert = {
    ...runLookup,
    model_training_cutoff: forecast.model_training_cutoff ?? null,
    pretraining_taint_status: forecast.pretraining_taint_status,
    snapshot_version: workflow.snapshot.schema_version,
    snapshot_json: workflow.snapshot,
    snapshot_hash: workflow.snapshot.snapshot_hash,
    prompt_version: workflow.prompt_pack.prompt_version,
    schema_version: forecast.schema_version,
    llm_provider: workflow.run_artifact.metadata.provider,
    llm_model: workflow.run_artifact.metadata.model,
    repo_commit: optionalText(input.repo_commit),
    run_status: "parsed",
    created_at: createdAt,
  };
  const predictionInsert: ForecastExperimentPredictionInsert = {
    run_lookup: runLookup,
    row: {
      horizon_days: forecast.horizon_days,
      price_exchange: forecast.price_contract.exchange,
      price_commodity: forecast.price_contract.commodity,
      price_contract_code: forecast.price_contract.contract_code,
      price_contract_month: forecast.price_contract.contract_month,
      price_roll_policy: forecast.price_contract.roll_policy,
      direction: forecast.direction,
      stance_score: forecast.stance_score,
      confidence_pct: forecast.confidence_pct,
      expected_move_pct_low: forecast.expected_move_pct_range.low,
      expected_move_pct_high: forecast.expected_move_pct_range.high,
      recommendation: forecast.recommendation,
      forecast_json: forecast,
      raw_model_output: optionalText(input.raw_model_output),
      parse_status: "parsed",
      validation_errors: [],
      created_at: createdAt,
    },
  };
  const packageWithoutHash = {
    schema_version: CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION,
    experiment_slug: experimentSlug,
    workflow_hash: workflow.workflow_hash,
    guardrails: {
      executes_writes: false,
      review_required_before_write: true,
      allowed_schema: "experimental",
      target_tables: [...FORECAST_EXPERIMENT_SIDECAR_TABLES],
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
    run_lookup: runLookup,
    run_insert: runInsert,
    prediction_inserts: [predictionInsert],
    score_inserts: [],
  } satisfies Omit<CanolaForecastSidecarPackage, "package_hash">;

  return {
    ...packageWithoutHash,
    package_hash: `sha256:${sha256(stableStringify(packageWithoutHash))}`,
  };
}

function validateWorkflow(workflow: unknown): CanolaForecastLocalWorkflow {
  if (!workflow || typeof workflow !== "object") {
    throw new Error("workflow must be an object.");
  }

  const candidate = workflow as CanolaForecastLocalWorkflow;

  if (candidate.schema_version !== CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION) {
    throw new Error("workflow schema_version is unsupported.");
  }

  if (candidate.snapshot.schema_version !== CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("snapshot schema_version is unsupported.");
  }

  if (
    candidate.prompt_pack.schema_version !==
    CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION
  ) {
    throw new Error("prompt_pack schema_version is unsupported.");
  }

  if (
    candidate.run_artifact.schema_version !==
    CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION
  ) {
    throw new Error("run_artifact schema_version is unsupported.");
  }

  if (candidate.run_artifact.forecast_schema_version !== CANOLA_FORECAST_SCHEMA_VERSION) {
    throw new Error("run_artifact forecast_schema_version is unsupported.");
  }

  assertHashMatches(
    candidate.snapshot as unknown as Record<string, unknown>,
    "snapshot_hash",
    "snapshot",
  );
  assertHashMatches(
    candidate.prompt_pack as unknown as Record<string, unknown>,
    "prompt_hash",
    "prompt_pack",
  );
  assertHashMatches(
    candidate.run_artifact as unknown as Record<string, unknown>,
    "run_hash",
    "run_artifact",
  );
  assertHashMatches(
    candidate as unknown as Record<string, unknown>,
    "workflow_hash",
    "workflow",
  );

  if (candidate.prompt_pack.snapshot_hash !== candidate.snapshot.snapshot_hash) {
    throw new Error("prompt_pack snapshot_hash must match snapshot.");
  }

  if (candidate.run_artifact.snapshot_hash !== candidate.snapshot.snapshot_hash) {
    throw new Error("run_artifact snapshot_hash must match snapshot.");
  }

  if (candidate.run_artifact.metadata.prompt_hash !== candidate.prompt_pack.prompt_hash) {
    throw new Error("run_artifact prompt_hash must match prompt_pack.");
  }

  if (candidate.run_artifact.forecast.horizon_days !== candidate.prompt_pack.horizon_days) {
    throw new Error("forecast horizon_days must match prompt_pack.");
  }

  if (
    stableStringify(candidate.run_artifact.forecast.price_contract) !==
    stableStringify(candidate.prompt_pack.price_contract)
  ) {
    throw new Error("forecast price_contract must match prompt_pack.");
  }

  return candidate;
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

function requireExperimentSlug(value: unknown): string {
  const text = optionalText(value);

  if (!text || !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(text)) {
    throw new Error(
      "experiment_slug must match /^[a-z0-9][a-z0-9_-]{2,80}$.",
    );
  }

  return text;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
