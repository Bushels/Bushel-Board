import { createHash } from "node:crypto";

import { z } from "zod";

import {
  CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
  type CanolaForecastRunArtifact,
} from "./run-artifact";
import {
  DRIVER_CONFIDENCES,
  FORECAST_DIRECTIONS,
  FORECAST_RECOMMENDATIONS,
  type ForecastDirection,
} from "./schema";
import {
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
} from "./source-records";
import { stableStringify } from "./snapshot";
import {
  ADJUSTMENT_PRIORITIES,
  DRIVER_REVIEW_VERDICTS,
  EVIDENCE_MATERIALITIES,
  THESIS_EVIDENCE_TYPES,
  THESIS_REVIEW_VERDICTS,
  type BlockedThesisReviewEvidenceRecord,
  type ThesisReviewEvidenceRecord,
} from "./thesis-review";

export const CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION =
  "canola-thesis-review-prompt-pack-v1" as const;

export const CANOLA_THESIS_REVIEW_RESPONSE_CONTRACT_VERSION =
  "canola-thesis-review-json-v1" as const;

export interface CanolaThesisReviewPromptPackInput {
  run_artifact: unknown;
  review_as_of_date: string;
  review_cutoff_at: string;
  next_week_evidence: ThesisReviewEvidenceRecord[];
  reviewer?: string;
  created_at: string;
  prompt_version?: string;
}

export interface CanolaThesisReviewResponseContract {
  schema_version: typeof CANOLA_THESIS_REVIEW_RESPONSE_CONTRACT_VERSION;
  output: "single_json_object";
  target_cli: "review-canola-thesis-week --review";
  required_fields: string[];
  review_as_of_date: string;
  review_cutoff_at: string;
  reviewer: string;
  allowed_thesis_verdicts: typeof THESIS_REVIEW_VERDICTS;
  allowed_driver_verdicts: typeof DRIVER_REVIEW_VERDICTS;
  allowed_adjustment_priorities: typeof ADJUSTMENT_PRIORITIES;
  allowed_evidence_keys: string[];
  required_driver_indexes: number[];
}

export interface CanolaThesisReviewPromptPack {
  schema_version: typeof CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION;
  prompt_version: string;
  created_at: string;
  grain: "Canola";
  crop_year: string;
  forecast_grain_week: number;
  forecast_as_of_date: string;
  forecast_source_cutoff_at: string;
  review_as_of_date: string;
  review_cutoff_at: string;
  reviewer: string;
  run_hash: string;
  forecast_summary: {
    direction: ForecastDirection;
    stance_score: number;
    confidence_pct: number;
    recommendation: (typeof FORECAST_RECOMMENDATIONS)[number];
    top_drivers: Array<{
      driver_index: number;
      driver: string;
      directional_effect: ForecastDirection;
      evidence_source: string;
      confidence: (typeof DRIVER_CONFIDENCES)[number];
    }>;
  };
  accepted_evidence: ThesisReviewEvidenceRecord[];
  blocked_evidence: BlockedThesisReviewEvidenceRecord[];
  system_prompt: string;
  user_prompt: string;
  response_contract: CanolaThesisReviewResponseContract;
  prompt_hash: string;
}

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

const evidenceRecordSchema = z.object({
  evidence_key: z.string().min(1),
  source_key: z.string().min(1),
  evidence_type: z.enum(THESIS_EVIDENCE_TYPES),
  observed_period: z.string().min(1),
  published_at: offsetDateTimeStringSchema,
  available_at: offsetDateTimeStringSchema,
  summary: z.string().min(1),
  directional_effect: z.union([z.enum(FORECAST_DIRECTIONS), z.literal("mixed")]),
  materiality: z.enum(EVIDENCE_MATERIALITIES),
  payload: z.record(z.string(), z.unknown()),
});

const promptPackInputSchema = z.object({
  review_as_of_date: isoDateStringSchema,
  review_cutoff_at: offsetDateTimeStringSchema,
  next_week_evidence: z.array(evidenceRecordSchema).min(1),
  reviewer: z.string().min(1).optional(),
  created_at: offsetDateTimeStringSchema,
  prompt_version: z.string().min(1).optional(),
});

const forbiddenEvidenceSourceSet = new Set<string>(
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
);

export function buildCanolaThesisReviewPromptPack(
  input: CanolaThesisReviewPromptPackInput,
): CanolaThesisReviewPromptPack {
  const runArtifact = validateRunArtifact(input.run_artifact);
  const parsed = promptPackInputSchema.parse(input);
  const reviewer = parsed.reviewer ?? "manual";
  const promptVersion =
    parsed.prompt_version ?? "canola-thesis-review-prompt-v1";

  validateReviewClock(runArtifact, parsed.review_as_of_date, parsed.review_cutoff_at);

  const { acceptedEvidence, blockedEvidence } = filterEvidence(
    parsed.next_week_evidence,
    runArtifact.source_cutoff_at,
    parsed.review_cutoff_at,
  );

  if (acceptedEvidence.length === 0) {
    throw new Error("At least one next-week evidence record must be accepted.");
  }

  validateEvidenceKeysAreUnique(acceptedEvidence);

  const forecast = runArtifact.forecast;
  const forecastSummary = {
    direction: forecast.direction,
    stance_score: forecast.stance_score,
    confidence_pct: forecast.confidence_pct,
    recommendation: forecast.recommendation,
    top_drivers: forecast.top_drivers.map((driver, index) => ({
      driver_index: index,
      driver: driver.driver,
      directional_effect: driver.directional_effect,
      evidence_source: driver.evidence_source,
      confidence: driver.confidence,
    })),
  };
  const responseContract: CanolaThesisReviewResponseContract = {
    schema_version: CANOLA_THESIS_REVIEW_RESPONSE_CONTRACT_VERSION,
    output: "single_json_object",
    target_cli: "review-canola-thesis-week --review",
    required_fields: [
      "review_as_of_date",
      "review_cutoff_at",
      "reviewer",
      "thesis_verdict",
      "verdict_notes",
      "next_week_evidence",
      "driver_reviews",
      "missed_signals",
      "adjustments_for_next_week",
      "created_at",
    ],
    review_as_of_date: parsed.review_as_of_date,
    review_cutoff_at: parsed.review_cutoff_at,
    reviewer,
    allowed_thesis_verdicts: THESIS_REVIEW_VERDICTS,
    allowed_driver_verdicts: DRIVER_REVIEW_VERDICTS,
    allowed_adjustment_priorities: ADJUSTMENT_PRIORITIES,
    allowed_evidence_keys: sortEvidence(acceptedEvidence).map(
      (record) => record.evidence_key,
    ),
    required_driver_indexes: forecast.top_drivers.map((_driver, index) => index),
  };
  const accepted_evidence = sortEvidence(acceptedEvidence);
  const blocked_evidence = sortBlockedEvidence(blockedEvidence);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    runArtifact,
    forecastSummary,
    acceptedEvidence: accepted_evidence,
    blockedEvidence: blocked_evidence,
    responseContract,
  });
  const packWithoutHash = {
    schema_version: CANOLA_THESIS_REVIEW_PROMPT_PACK_SCHEMA_VERSION,
    prompt_version: promptVersion,
    created_at: parsed.created_at,
    grain: runArtifact.grain,
    crop_year: runArtifact.crop_year,
    forecast_grain_week: runArtifact.grain_week,
    forecast_as_of_date: runArtifact.as_of_date,
    forecast_source_cutoff_at: runArtifact.source_cutoff_at,
    review_as_of_date: parsed.review_as_of_date,
    review_cutoff_at: parsed.review_cutoff_at,
    reviewer,
    run_hash: runArtifact.run_hash,
    forecast_summary: forecastSummary,
    accepted_evidence,
    blocked_evidence,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
    response_contract: responseContract,
  } satisfies Omit<CanolaThesisReviewPromptPack, "prompt_hash">;

  return {
    ...packWithoutHash,
    prompt_hash: `sha256:${sha256(stableStringify(packWithoutHash))}`,
  };
}

function buildSystemPrompt(): string {
  return [
    "You are reviewing a frozen Canola bull/bear thesis for Bushel Board.",
    "Use only the accepted next-week evidence supplied in this prompt.",
    "Do not use blocked evidence, later news, later prices, price-only logic, private farmer data, production dashboard data, model memory, or outside market facts.",
    "Do not claim model training occurred. This is a review-labeling packet only.",
    "Return one JSON object only. Do not wrap it in Markdown.",
  ].join("\n");
}

function buildUserPrompt(input: {
  runArtifact: CanolaForecastRunArtifact;
  forecastSummary: CanolaThesisReviewPromptPack["forecast_summary"];
  acceptedEvidence: ThesisReviewEvidenceRecord[];
  blockedEvidence: BlockedThesisReviewEvidenceRecord[];
  responseContract: CanolaThesisReviewResponseContract;
}): string {
  return [
    `Run hash: ${input.runArtifact.run_hash}`,
    `Forecast source cutoff: ${input.runArtifact.source_cutoff_at}`,
    `Review cutoff: ${input.responseContract.review_cutoff_at}`,
    "",
    "Task:",
    "Judge whether the frozen thesis held up against only the accepted next-week evidence.",
    "Review every original driver exactly once.",
    "Use evidence_keys only from allowed_evidence_keys.",
    "If thesis_verdict is missed, include at least one adjustments_for_next_week item.",
    "",
    "Response contract:",
    stableStringify(input.responseContract),
    "",
    "Frozen forecast summary:",
    stableStringify(input.forecastSummary),
    "",
    "Accepted next-week evidence:",
    stableStringify(input.acceptedEvidence),
    "",
    "Blocked evidence for audit only - do not cite in driver_reviews:",
    stableStringify(input.blockedEvidence),
  ].join("\n");
}

function filterEvidence(
  records: ThesisReviewEvidenceRecord[],
  forecastCutoffAt: string,
  reviewCutoffAt: string,
): {
  acceptedEvidence: ThesisReviewEvidenceRecord[];
  blockedEvidence: BlockedThesisReviewEvidenceRecord[];
} {
  const forecastCutoffMs = Date.parse(forecastCutoffAt);
  const reviewCutoffMs = Date.parse(reviewCutoffAt);
  const acceptedEvidence: ThesisReviewEvidenceRecord[] = [];
  const blockedEvidence: BlockedThesisReviewEvidenceRecord[] = [];

  for (const record of records) {
    const availableAtMs = Date.parse(record.available_at);

    if (forbiddenEvidenceSourceSet.has(record.source_key)) {
      blockedEvidence.push(toBlockedEvidence(record, "forbidden_source"));
      continue;
    }

    if (availableAtMs <= forecastCutoffMs) {
      blockedEvidence.push(
        toBlockedEvidence(record, "already_available_at_forecast_cutoff"),
      );
      continue;
    }

    if (availableAtMs > reviewCutoffMs) {
      blockedEvidence.push(
        toBlockedEvidence(record, "available_after_review_cutoff"),
      );
      continue;
    }

    acceptedEvidence.push(toCanonicalEvidence(record));
  }

  return { acceptedEvidence, blockedEvidence };
}

function validateRunArtifact(value: unknown): CanolaForecastRunArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("run_artifact must be an object.");
  }

  const candidate = value as CanolaForecastRunArtifact;

  if (candidate.schema_version !== CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION) {
    throw new Error("run_artifact schema_version is unsupported.");
  }

  assertHashMatches(
    candidate as unknown as Record<string, unknown>,
    "run_hash",
    "run_artifact",
  );

  return candidate;
}

function validateReviewClock(
  runArtifact: CanolaForecastRunArtifact,
  reviewAsOfDate: string,
  reviewCutoffAt: string,
): void {
  const reviewCutoffMs = Date.parse(reviewCutoffAt);
  const forecastCutoffMs = Date.parse(runArtifact.source_cutoff_at);

  if (reviewCutoffMs <= forecastCutoffMs) {
    throw new Error("review_cutoff_at must be after forecast source_cutoff_at.");
  }

  if (!declaredOrUtcDateMatches(reviewCutoffAt, reviewAsOfDate)) {
    throw new Error("review_cutoff_at must use the same calendar date as review_as_of_date.");
  }
}

function validateEvidenceKeysAreUnique(
  acceptedEvidence: ThesisReviewEvidenceRecord[],
): void {
  const keys = new Set<string>();

  for (const evidence of acceptedEvidence) {
    if (keys.has(evidence.evidence_key)) {
      throw new Error(`Duplicate evidence_key: ${evidence.evidence_key}.`);
    }
    keys.add(evidence.evidence_key);
  }
}

function toCanonicalEvidence(
  record: ThesisReviewEvidenceRecord,
): ThesisReviewEvidenceRecord {
  return {
    evidence_key: record.evidence_key,
    source_key: record.source_key,
    evidence_type: record.evidence_type,
    observed_period: record.observed_period,
    published_at: record.published_at,
    available_at: record.available_at,
    summary: record.summary,
    directional_effect: record.directional_effect,
    materiality: record.materiality,
    payload: toStableValue(record.payload) as Record<string, unknown>,
  };
}

function toBlockedEvidence(
  record: ThesisReviewEvidenceRecord,
  reason: BlockedThesisReviewEvidenceRecord["reason"],
): BlockedThesisReviewEvidenceRecord {
  return {
    evidence_key: record.evidence_key,
    source_key: record.source_key,
    observed_period: record.observed_period,
    available_at: record.available_at,
    reason,
  };
}

function assertHashMatches(
  value: Record<string, unknown>,
  hashField: string,
  label: string,
): void {
  const hash = value[hashField];

  if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`${hashField} must be a sha256 hash.`);
  }

  const withoutHash = { ...value };
  delete withoutHash[hashField];

  const expectedHash = `sha256:${sha256(stableStringify(withoutHash))}`;

  if (hash !== expectedHash) {
    throw new Error(`${label} hash does not match contents.`);
  }
}

function sortEvidence(
  evidence: ThesisReviewEvidenceRecord[],
): ThesisReviewEvidenceRecord[] {
  return [...evidence].sort((left, right) =>
    compareStrings(
      [
        left.available_at,
        left.source_key,
        left.evidence_key,
        left.observed_period,
      ].join("|"),
      [
        right.available_at,
        right.source_key,
        right.evidence_key,
        right.observed_period,
      ].join("|"),
    ),
  );
}

function sortBlockedEvidence(
  evidence: BlockedThesisReviewEvidenceRecord[],
): BlockedThesisReviewEvidenceRecord[] {
  return [...evidence].sort((left, right) =>
    compareStrings(
      [
        left.available_at,
        left.source_key,
        left.evidence_key,
        left.reason,
      ].join("|"),
      [
        right.available_at,
        right.source_key,
        right.evidence_key,
        right.reason,
      ].join("|"),
    ),
  );
}

function declaredOrUtcDateMatches(timestamp: string, date: string): boolean {
  return (
    timestamp.slice(0, 10) === date ||
    new Date(Date.parse(timestamp)).toISOString().slice(0, 10) === date
  );
}

function toStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toStableValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, entry]) => [key, toStableValue(entry)]),
    );
  }

  return value;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
