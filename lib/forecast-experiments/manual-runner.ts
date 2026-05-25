import { createHash } from "node:crypto";

import {
  buildCanolaForecastRunArtifact,
  FORECAST_RUNNER_MODES,
  type CanolaForecastRunArtifact,
  type ForecastRunnerMode,
} from "./run-artifact";
import {
  CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
  type CanolaForecastPromptPack,
} from "./prompt-pack";
import {
  CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  stableStringify,
  type CanolaForecastSnapshot,
} from "./snapshot";

export const CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION =
  "canola-forecast-manual-runner-v1" as const;

export interface CanolaForecastManualRunResultInput {
  snapshot: unknown;
  prompt_pack: unknown;
  raw_model_output: string;
  provider: string;
  model: string;
  runner_mode: ForecastRunnerMode;
  created_at: string;
}

export interface CanolaForecastManualRunResult {
  schema_version: typeof CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_hash: string;
  prompt_hash: string;
  raw_model_output: string;
  raw_output_hash: string;
  parse_status: "parsed";
  run_artifact: CanolaForecastRunArtifact;
  result_hash: string;
}

const runnerModeSet = new Set<string>(FORECAST_RUNNER_MODES);

export function buildCanolaForecastManualRunResult(
  input: CanolaForecastManualRunResultInput,
): CanolaForecastManualRunResult {
  const snapshot = validateSnapshot(input.snapshot);
  const promptPack = validatePromptPack(input.prompt_pack, snapshot);
  const forecastJson = parseStrictJsonObject(input.raw_model_output);
  const runnerMode = validateRunnerMode(input.runner_mode);
  const runArtifact = buildCanolaForecastRunArtifact({
    snapshot,
    forecast: forecastJson,
    metadata: {
      provider: input.provider,
      model: input.model,
      runner_mode: runnerMode,
      prompt_version: promptPack.prompt_version,
      prompt_hash: promptPack.prompt_hash,
      model_training_cutoff: promptPack.model_training_cutoff,
      created_at: input.created_at,
    },
  });

  validateForecastMatchesPromptPack(runArtifact, promptPack);

  const rawOutputHash = `sha256:${sha256(input.raw_model_output)}`;
  const resultWithoutHash = {
    schema_version: CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION,
    grain: runArtifact.grain,
    crop_year: runArtifact.crop_year,
    grain_week: runArtifact.grain_week,
    as_of_date: runArtifact.as_of_date,
    source_cutoff_at: runArtifact.source_cutoff_at,
    snapshot_hash: runArtifact.snapshot_hash,
    prompt_hash: promptPack.prompt_hash,
    raw_model_output: input.raw_model_output,
    raw_output_hash: rawOutputHash,
    parse_status: "parsed",
    run_artifact: runArtifact,
  } satisfies Omit<CanolaForecastManualRunResult, "result_hash">;

  return {
    ...resultWithoutHash,
    result_hash: `sha256:${sha256(stableStringify(resultWithoutHash))}`,
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

  assertHashMatches(
    candidate as unknown as Record<string, unknown>,
    "snapshot_hash",
    "snapshot",
  );

  return candidate;
}

function validatePromptPack(
  promptPack: unknown,
  snapshot: CanolaForecastSnapshot,
): CanolaForecastPromptPack {
  if (!promptPack || typeof promptPack !== "object") {
    throw new Error("prompt_pack must be an object.");
  }

  const candidate = promptPack as CanolaForecastPromptPack;

  if (candidate.schema_version !== CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION) {
    throw new Error("prompt_pack schema_version is unsupported.");
  }

  assertHashMatches(
    candidate as unknown as Record<string, unknown>,
    "prompt_hash",
    "prompt_pack",
  );

  if (candidate.snapshot_hash !== snapshot.snapshot_hash) {
    throw new Error("prompt_pack snapshot_hash must match snapshot.");
  }

  if (
    candidate.snapshot_schema_version !== CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new Error("prompt_pack snapshot_schema_version is unsupported.");
  }

  return candidate;
}

function parseStrictJsonObject(rawModelOutput: string): Record<string, unknown> {
  if (typeof rawModelOutput !== "string" || !rawModelOutput.trim()) {
    throw new Error("raw_model_output is required.");
  }

  const payload = extractJsonPayload(rawModelOutput);

  if (!payload.startsWith("{") || !payload.endsWith("}")) {
    throw new Error(
      "raw_model_output must be a single JSON object or a single fenced JSON block.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw new Error(
      "raw_model_output must be a single JSON object or a single fenced JSON block.",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "raw_model_output must be a single JSON object or a single fenced JSON block.",
    );
  }

  return parsed as Record<string, unknown>;
}

function extractJsonPayload(rawModelOutput: string): string {
  const trimmed = rawModelOutput.trim();
  const fencedJsonMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(
    trimmed,
  );

  if (fencedJsonMatch) {
    return fencedJsonMatch[1].trim();
  }

  return trimmed;
}

function validateRunnerMode(runnerMode: ForecastRunnerMode): ForecastRunnerMode {
  if (!runnerModeSet.has(runnerMode)) {
    throw new Error(`Unsupported runner_mode: ${runnerMode}.`);
  }

  return runnerMode;
}

function validateForecastMatchesPromptPack(
  runArtifact: CanolaForecastRunArtifact,
  promptPack: CanolaForecastPromptPack,
): void {
  if (runArtifact.forecast.horizon_days !== promptPack.horizon_days) {
    throw new Error("forecast horizon_days must match prompt_pack.");
  }

  if (
    stableStringify(runArtifact.forecast.price_contract) !==
    stableStringify(promptPack.price_contract)
  ) {
    throw new Error("forecast price_contract must match prompt_pack.");
  }
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

  const { [hashField]: _hash, ...withoutHash } = value;
  const actualHash = `sha256:${sha256(stableStringify(withoutHash))}`;

  if (actualHash !== expectedHash) {
    throw new Error(`${hashField} does not match ${label} contents.`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
