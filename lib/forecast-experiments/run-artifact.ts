import { createHash } from "node:crypto";

import {
  CANOLA_FORECAST_SCHEMA_VERSION,
  parseCanolaForecast,
  type CanolaForecast,
} from "./schema";
import {
  CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  stableStringify,
  type CanolaForecastSnapshot,
} from "./snapshot";

export const CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION =
  "canola-forecast-run-artifact-v1" as const;

export const FORECAST_RUNNER_MODES = [
  "manual_model_output",
  "dry_run_model_output",
] as const;

export type ForecastRunnerMode = (typeof FORECAST_RUNNER_MODES)[number];

export interface ForecastRunMetadata {
  provider: string;
  model: string;
  runner_mode: ForecastRunnerMode;
  prompt_version?: string;
  prompt_hash?: string;
  model_training_cutoff?: string | null;
  created_at: string;
}

export interface CanolaForecastRunArtifactInput {
  snapshot: unknown;
  forecast: unknown;
  metadata: ForecastRunMetadata;
}

export interface CanolaForecastRunArtifact {
  schema_version: typeof CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_schema_version: typeof CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION;
  forecast_schema_version: typeof CANOLA_FORECAST_SCHEMA_VERSION;
  snapshot_hash: string;
  snapshot_mode: CanolaForecastSnapshot["snapshot_mode"];
  snapshot_revision_taint_status: CanolaForecastSnapshot["revision_taint_status"];
  metadata: ForecastRunMetadata;
  forecast: CanolaForecast;
  run_hash: string;
}

const runnerModeSet = new Set<string>(FORECAST_RUNNER_MODES);

export function buildCanolaForecastRunArtifact(
  input: CanolaForecastRunArtifactInput,
): CanolaForecastRunArtifact {
  const snapshot = validateSnapshot(input.snapshot);
  const forecast = parseCanolaForecast(input.forecast);
  const metadata = validateMetadata(input.metadata);

  validateForecastMatchesSnapshot(forecast, snapshot);
  validateForecastEvidenceClocks(forecast);
  validateTrainingCutoff(forecast, metadata);

  const artifactWithoutHash = {
    schema_version: CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
    grain: forecast.grain,
    crop_year: forecast.crop_year,
    grain_week: forecast.grain_week,
    as_of_date: forecast.as_of_date,
    source_cutoff_at: forecast.source_cutoff_at,
    snapshot_schema_version: snapshot.schema_version,
    forecast_schema_version: forecast.schema_version,
    snapshot_hash: snapshot.snapshot_hash,
    snapshot_mode: snapshot.snapshot_mode,
    snapshot_revision_taint_status: snapshot.revision_taint_status,
    metadata,
    forecast,
  } satisfies Omit<CanolaForecastRunArtifact, "run_hash">;

  return {
    ...artifactWithoutHash,
    run_hash: `sha256:${sha256(stableStringify(artifactWithoutHash))}`,
  };
}

function validateSnapshot(snapshot: unknown): CanolaForecastSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("snapshot must be an object.");
  }

  const candidate = snapshot as CanolaForecastSnapshot;

  if (candidate.schema_version !== CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("snapshot schema_version is unsupported.");
  }

  if (!/^sha256:[a-f0-9]{64}$/.test(candidate.snapshot_hash)) {
    throw new Error("snapshot_hash must be a sha256 hash.");
  }

  return candidate;
}

function validateMetadata(metadata: ForecastRunMetadata): ForecastRunMetadata {
  const provider = requireText(metadata.provider, "metadata.provider");
  const model = requireText(metadata.model, "metadata.model");
  const createdAt = requireOffsetDateTime(metadata.created_at, "metadata.created_at");
  const runnerMode = requireText(metadata.runner_mode, "metadata.runner_mode");

  if (!runnerModeSet.has(runnerMode)) {
    throw new Error(`Unsupported runner_mode: ${runnerMode}.`);
  }

  if (
    metadata.prompt_hash &&
    !/^sha256:[a-f0-9]{64}$/.test(metadata.prompt_hash)
  ) {
    throw new Error("metadata.prompt_hash must be a sha256 hash.");
  }

  const validated: ForecastRunMetadata = {
    provider,
    model,
    runner_mode: runnerMode as ForecastRunnerMode,
    model_training_cutoff: metadata.model_training_cutoff ?? null,
    created_at: createdAt,
  };

  const promptVersion = optionalText(metadata.prompt_version);
  const promptHash = optionalText(metadata.prompt_hash);

  if (promptVersion) {
    validated.prompt_version = promptVersion;
  }

  if (promptHash) {
    validated.prompt_hash = promptHash;
  }

  return validated;
}

function validateForecastMatchesSnapshot(
  forecast: CanolaForecast,
  snapshot: CanolaForecastSnapshot,
): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["grain", forecast.grain, snapshot.grain],
    ["crop_year", forecast.crop_year, snapshot.crop_year],
    ["grain_week", forecast.grain_week, snapshot.grain_week],
    ["as_of_date", forecast.as_of_date, snapshot.as_of_date],
    ["source_cutoff_at", forecast.source_cutoff_at, snapshot.source_cutoff_at],
  ];

  for (const [field, forecastValue, snapshotValue] of checks) {
    if (forecastValue !== snapshotValue) {
      throw new Error(`${field} must match snapshot.`);
    }
  }
}

function validateForecastEvidenceClocks(forecast: CanolaForecast): void {
  const cutoffMs = parseRequiredTimestamp(
    forecast.source_cutoff_at,
    "source_cutoff_at",
  );

  for (const driver of forecast.top_drivers) {
    const evidenceClockMs = parseRequiredTimestamp(
      driver.evidence_clock,
      "evidence_clock",
    );

    if (evidenceClockMs > cutoffMs) {
      throw new Error("evidence_clock is after source_cutoff_at.");
    }
  }
}

function validateTrainingCutoff(
  forecast: CanolaForecast,
  metadata: ForecastRunMetadata,
): void {
  if (
    metadata.model_training_cutoff !== null &&
    metadata.model_training_cutoff !== undefined &&
    forecast.model_training_cutoff !== metadata.model_training_cutoff
  ) {
    throw new Error("model_training_cutoff must match metadata.");
  }

  if (
    metadata.model_training_cutoff !== null &&
    metadata.model_training_cutoff !== undefined
  ) {
    const trainingCutoffMs = parseRequiredTimestamp(
      metadata.model_training_cutoff,
      "model_training_cutoff",
    );
    const sourceCutoffMs = parseRequiredTimestamp(
      forecast.source_cutoff_at,
      "source_cutoff_at",
    );

    if (trainingCutoffMs > sourceCutoffMs) {
      throw new Error("model_training_cutoff is after source_cutoff_at.");
    }
  }
}

function requireText(value: unknown, fieldName: string): string {
  const text = optionalText(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requireOffsetDateTime(value: unknown, fieldName: string): string {
  const text = requireText(value, fieldName);

  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${fieldName} must be an ISO timestamp with timezone offset.`);
  }

  return text;
}

function parseRequiredTimestamp(value: string, fieldName: string): number {
  const ms = Date.parse(value);

  if (Number.isNaN(ms)) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }

  return ms;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
