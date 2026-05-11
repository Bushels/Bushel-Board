import { createHash } from "node:crypto";

import {
  CANOLA_FORECAST_SCHEMA_VERSION,
  GRAIN_FORECAST_SCHEMA_VERSION,
  canolaPriceContractSchema,
  priceContractSchema,
  type PriceContract,
} from "./schema";
import {
  CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  stableStringify,
  type CanolaForecastSnapshot,
  type GrainForecastSnapshot,
} from "./snapshot";

export const CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION =
  "canola-forecast-prompt-pack-v1" as const;
export const GRAIN_FORECAST_PROMPT_PACK_SCHEMA_VERSION =
  "grain-forecast-prompt-pack-v1" as const;

export interface CanolaForecastPromptPackInput {
  snapshot: unknown;
  horizon_days: 7 | 28;
  price_contract: PriceContract;
  model_training_cutoff?: string | null;
  created_at: string;
  prompt_version?: string;
}

export interface GrainForecastPromptPackInput {
  snapshot: unknown;
  horizon_days: 7 | 28;
  price_contract?: PriceContract | null;
  model_training_cutoff?: string | null;
  created_at: string;
  prompt_version?: string;
}

export interface CanolaForecastPromptResponseContract {
  schema_version: typeof CANOLA_FORECAST_SCHEMA_VERSION;
  output: "single_json_object";
  horizon_days: 7 | 28;
  price_contract: PriceContract;
}

export interface GrainForecastPromptResponseContract {
  schema_version: typeof GRAIN_FORECAST_SCHEMA_VERSION;
  output: "single_json_object";
  horizon_days: 7 | 28;
  price_contract: PriceContract | null;
}

export interface CanolaForecastPromptPack {
  schema_version: typeof CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION;
  prompt_version: string;
  created_at: string;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_schema_version: typeof CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION;
  snapshot_hash: string;
  horizon_days: 7 | 28;
  price_contract: PriceContract;
  model_training_cutoff: string | null;
  system_prompt: string;
  user_prompt: string;
  response_contract: CanolaForecastPromptResponseContract;
  prompt_hash: string;
}

export interface GrainForecastPromptPack {
  schema_version: typeof GRAIN_FORECAST_PROMPT_PACK_SCHEMA_VERSION;
  prompt_version: string;
  created_at: string;
  grain: GrainForecastSnapshot["grain"];
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_schema_version: typeof GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION;
  snapshot_hash: string;
  horizon_days: 7 | 28;
  price_contract: PriceContract | null;
  model_training_cutoff: string | null;
  system_prompt: string;
  user_prompt: string;
  response_contract: GrainForecastPromptResponseContract;
  prompt_hash: string;
}

export function buildCanolaForecastPromptPack(
  input: CanolaForecastPromptPackInput,
): CanolaForecastPromptPack {
  const snapshot = validateSnapshot(
    input.snapshot,
    CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  ) as CanolaForecastSnapshot;
  const priceContract = requirePriceContract(input.price_contract);
  const createdAt = requireOffsetDateTime(input.created_at, "created_at");
  const modelTrainingCutoff = input.model_training_cutoff ?? null;
  const promptVersion = input.prompt_version ?? "canola-forecast-prompt-v1";

  validateHorizonContract(input.horizon_days, priceContract);
  validateTrainingCutoff(modelTrainingCutoff, snapshot.source_cutoff_at);

  const responseContract: CanolaForecastPromptResponseContract = {
    schema_version: CANOLA_FORECAST_SCHEMA_VERSION,
    output: "single_json_object",
    horizon_days: input.horizon_days,
    price_contract: priceContract,
  };
  const systemPrompt = buildSystemPrompt(snapshot.grain);
  const userPrompt = buildUserPrompt({
    snapshot,
    horizonDays: input.horizon_days,
    priceContract,
    modelTrainingCutoff,
    responseContract,
    priceBoundaryNote: null,
  });
  const packWithoutHash = {
    schema_version: CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
    prompt_version: promptVersion,
    created_at: createdAt,
    grain: snapshot.grain,
    crop_year: snapshot.crop_year,
    grain_week: snapshot.grain_week,
    as_of_date: snapshot.as_of_date,
    source_cutoff_at: snapshot.source_cutoff_at,
    snapshot_schema_version: snapshot.schema_version,
    snapshot_hash: snapshot.snapshot_hash,
    horizon_days: input.horizon_days,
    price_contract: priceContract,
    model_training_cutoff: modelTrainingCutoff,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
    response_contract: responseContract,
  } satisfies Omit<CanolaForecastPromptPack, "prompt_hash">;

  return {
    ...packWithoutHash,
    prompt_hash: `sha256:${sha256(stableStringify(packWithoutHash))}`,
  };
}

export function buildGrainForecastPromptPack(
  input: GrainForecastPromptPackInput,
): GrainForecastPromptPack {
  const snapshot = validateSnapshot(
    input.snapshot,
    GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  ) as GrainForecastSnapshot;
  const priceContract = optionalPriceContract(input.price_contract);
  const createdAt = requireOffsetDateTime(input.created_at, "created_at");
  const modelTrainingCutoff = input.model_training_cutoff ?? null;
  const promptVersion = input.prompt_version ?? "grain-forecast-prompt-v1";

  validateTrainingCutoff(modelTrainingCutoff, snapshot.source_cutoff_at);

  const responseContract: GrainForecastPromptResponseContract = {
    schema_version: GRAIN_FORECAST_SCHEMA_VERSION,
    output: "single_json_object",
    horizon_days: input.horizon_days,
    price_contract: priceContract,
  };
  const systemPrompt = buildSystemPrompt(snapshot.grain);
  const userPrompt = buildUserPrompt({
    snapshot,
    horizonDays: input.horizon_days,
    priceContract,
    modelTrainingCutoff,
    responseContract,
    priceBoundaryNote: priceContract
      ? "Use the declared price contract only as one admitted source, not as a replacement for CGC movement evidence."
      : "No validated price contract is supplied; do not invent futures, COT, or settlement evidence.",
  });
  const packWithoutHash = {
    schema_version: GRAIN_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
    prompt_version: promptVersion,
    created_at: createdAt,
    grain: snapshot.grain,
    crop_year: snapshot.crop_year,
    grain_week: snapshot.grain_week,
    as_of_date: snapshot.as_of_date,
    source_cutoff_at: snapshot.source_cutoff_at,
    snapshot_schema_version: snapshot.schema_version,
    snapshot_hash: snapshot.snapshot_hash,
    horizon_days: input.horizon_days,
    price_contract: priceContract,
    model_training_cutoff: modelTrainingCutoff,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
    response_contract: responseContract,
  } satisfies Omit<GrainForecastPromptPack, "prompt_hash">;

  return {
    ...packWithoutHash,
    prompt_hash: `sha256:${sha256(stableStringify(packWithoutHash))}`,
  };
}

function validateSnapshot(
  snapshot: unknown,
  expectedSchemaVersion:
    | typeof CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION
    | typeof GRAIN_FORECAST_SNAPSHOT_SCHEMA_VERSION,
): CanolaForecastSnapshot | GrainForecastSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("snapshot must be an object.");
  }

  const candidate = snapshot as CanolaForecastSnapshot | GrainForecastSnapshot;

  if (candidate.schema_version !== expectedSchemaVersion) {
    throw new Error("snapshot schema_version is unsupported.");
  }

  if (!/^sha256:[a-f0-9]{64}$/.test(candidate.snapshot_hash)) {
    throw new Error("snapshot_hash must be a sha256 hash.");
  }

  requireSnapshotText(candidate.grain, "grain");
  requireSnapshotText(candidate.crop_year, "crop_year");
  requireSnapshotNumber(candidate.grain_week, "grain_week");
  requireSnapshotText(candidate.as_of_date, "as_of_date");
  requireSnapshotText(candidate.source_cutoff_at, "source_cutoff_at");
  requireSnapshotText(candidate.snapshot_mode, "snapshot_mode");
  requireSnapshotText(
    candidate.revision_taint_status,
    "revision_taint_status",
  );

  const { snapshot_hash: _snapshotHash, ...snapshotWithoutHash } =
    candidate as unknown as Record<string, unknown>;
  const recomputedHash = `sha256:${sha256(stableStringify(snapshotWithoutHash))}`;

  if (recomputedHash !== candidate.snapshot_hash) {
    throw new Error("snapshot_hash does not match snapshot contents.");
  }

  return candidate;
}

function requirePriceContract(priceContract: PriceContract): PriceContract {
  if (!priceContract?.contract_code?.trim()) {
    throw new Error("price_contract.contract_code is required.");
  }

  return canolaPriceContractSchema.parse(priceContract);
}

function optionalPriceContract(
  priceContract: PriceContract | null | undefined,
): PriceContract | null {
  if (priceContract === null || priceContract === undefined) {
    return null;
  }

  return priceContractSchema.parse(priceContract);
}

function validateHorizonContract(
  horizonDays: 7 | 28,
  priceContract: PriceContract,
): void {
  if (horizonDays === 28 && !priceContract.contract_code.trim()) {
    throw new Error("price_contract.contract_code is required for 28-day prompts.");
  }
}

function validateTrainingCutoff(
  modelTrainingCutoff: string | null,
  sourceCutoffAt: string,
): void {
  if (!modelTrainingCutoff) {
    throw new Error("model_training_cutoff is required before prompt generation.");
  }

  const trainingCutoffMs = parseRequiredTimestamp(
    modelTrainingCutoff,
    "model_training_cutoff",
  );
  const sourceCutoffMs = parseRequiredTimestamp(sourceCutoffAt, "source_cutoff_at");

  if (trainingCutoffMs > sourceCutoffMs) {
    throw new Error("model_training_cutoff is after source_cutoff_at.");
  }
}

function requireSnapshotText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`snapshot.${fieldName} is required.`);
  }

  return value;
}

function requireSnapshotNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`snapshot.${fieldName} is required.`);
  }

  return value;
}

function buildSystemPrompt(grain: string): string {
  return [
    `You are generating a ${grain} forecast experiment output for Bushel Board.`,
    "Use only the supplied snapshot records and source clocks.",
    "Do not use private farmer data, production dashboard data, model memory, or outside market facts.",
    "Return one JSON object only. Do not wrap it in Markdown.",
  ].join("\n");
}

function buildUserPrompt(input: {
  snapshot: CanolaForecastSnapshot | GrainForecastSnapshot;
  horizonDays: 7 | 28;
  priceContract: PriceContract | null;
  modelTrainingCutoff: string | null;
  responseContract:
    | CanolaForecastPromptResponseContract
    | GrainForecastPromptResponseContract;
  priceBoundaryNote?: string | null;
}): string {
  return [
    `Snapshot hash: ${input.snapshot.snapshot_hash}`,
    `Source cutoff: ${input.snapshot.source_cutoff_at}`,
    `As-of date: ${input.snapshot.as_of_date}`,
    `Forecast horizon days: ${input.horizonDays}`,
    `Price contract: ${
      input.priceContract ? stableStringify(input.priceContract) : "null"
    }`,
    ...(input.priceBoundaryNote ? [input.priceBoundaryNote] : []),
    `Model training cutoff: ${input.modelTrainingCutoff ?? "null"}`,
    "",
    "Output contract:",
    stableStringify(input.responseContract),
    "",
    "Snapshot JSON:",
    stableStringify(input.snapshot),
  ].join("\n");
}

function requireOffsetDateTime(value: unknown, fieldName: string): string {
  const text = typeof value === "string" && value.trim() ? value : null;

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

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
