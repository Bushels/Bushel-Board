import { createHash } from "node:crypto";

import { z } from "zod";

import {
  CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
  type CanolaForecastRunArtifact,
} from "./run-artifact";
import {
  CANOLA_FORECAST_SCHEMA_VERSION,
  DRIVER_CONFIDENCES,
  FORECAST_DIRECTIONS,
  FORECAST_RECOMMENDATIONS,
  type ForecastDirection,
} from "./schema";
import {
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
} from "./source-records";
import { stableStringify } from "./snapshot";

export const CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION =
  "canola-thesis-review-package-v1" as const;

export const THESIS_REVIEW_VERDICTS = [
  "held",
  "partly_held",
  "missed",
  "inconclusive",
] as const;

export const DRIVER_REVIEW_VERDICTS = [
  "supported",
  "partially_supported",
  "contradicted",
  "not_tested",
] as const;

export const THESIS_EVIDENCE_TYPES = [
  "official_data",
  "public_news",
  "market_context",
  "analyst_interpretation",
  "warning",
] as const;

export const EVIDENCE_MATERIALITIES = ["high", "medium", "low"] as const;
export const ADJUSTMENT_PRIORITIES = ["high", "medium", "low"] as const;

export type ThesisReviewVerdict = (typeof THESIS_REVIEW_VERDICTS)[number];
export type DriverReviewVerdict = (typeof DRIVER_REVIEW_VERDICTS)[number];
export type ThesisEvidenceType = (typeof THESIS_EVIDENCE_TYPES)[number];
export type EvidenceMateriality = (typeof EVIDENCE_MATERIALITIES)[number];
export type AdjustmentPriority = (typeof ADJUSTMENT_PRIORITIES)[number];

export interface ThesisReviewEvidenceRecord {
  evidence_key: string;
  source_key: string;
  evidence_type: ThesisEvidenceType;
  observed_period: string;
  published_at: string;
  available_at: string;
  summary: string;
  directional_effect: ForecastDirection | "mixed";
  materiality: EvidenceMateriality;
  payload: Record<string, unknown>;
}

export interface BlockedThesisReviewEvidenceRecord {
  evidence_key: string;
  source_key: string;
  observed_period: string;
  available_at: string;
  reason:
    | "already_available_at_forecast_cutoff"
    | "available_after_review_cutoff"
    | "forbidden_source";
}

export interface ThesisDriverReview {
  driver_index: number;
  verdict: DriverReviewVerdict;
  evidence_keys: string[];
  notes: string;
}

export interface ThesisAdjustment {
  adjustment: string;
  reason: string;
  priority: AdjustmentPriority;
}

export interface LearningCandidate {
  allowed: boolean;
  mode:
    | "forward_calibration_candidate"
    | "review_only_revision_tainted"
    | "review_only_pretraining_tainted"
    | "review_only_pretraining_unknown"
    | "review_only_fixture"
    | "review_only_inconclusive";
  reasons: string[];
}

export interface CanolaThesisReviewPackageInput {
  run_artifact: unknown;
  review_as_of_date: string;
  review_cutoff_at: string;
  reviewer: string;
  thesis_verdict: ThesisReviewVerdict;
  verdict_notes: string;
  next_week_evidence: ThesisReviewEvidenceRecord[];
  driver_reviews: ThesisDriverReview[];
  missed_signals: string[];
  adjustments_for_next_week: ThesisAdjustment[];
  created_at: string;
}

export interface CanolaThesisReviewPackage {
  schema_version: typeof CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION;
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
  driver_reviews: ThesisDriverReview[];
  thesis_verdict: ThesisReviewVerdict;
  verdict_notes: string;
  missed_signals: string[];
  adjustments_for_next_week: ThesisAdjustment[];
  learning_candidate: LearningCandidate;
  guardrails: {
    executes_writes: false;
    requires_prices: false;
    calls_model_api: false;
    reads_supabase: false;
    review_required_before_training: true;
    review_required_before_sidecar_write: true;
    forbidden_operations: string[];
  };
  created_at: string;
  package_hash: string;
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

const driverReviewSchema = z.object({
  driver_index: z.number().int().min(0),
  verdict: z.enum(DRIVER_REVIEW_VERDICTS),
  evidence_keys: z.array(z.string().min(1)),
  notes: z.string().min(1),
});

const adjustmentSchema = z.object({
  adjustment: z.string().min(1),
  reason: z.string().min(1),
  priority: z.enum(ADJUSTMENT_PRIORITIES),
});

const reviewInputSchema = z.object({
  review_as_of_date: isoDateStringSchema,
  review_cutoff_at: offsetDateTimeStringSchema,
  reviewer: z.string().min(1),
  thesis_verdict: z.enum(THESIS_REVIEW_VERDICTS),
  verdict_notes: z.string().min(1),
  next_week_evidence: z.array(evidenceRecordSchema).min(1),
  driver_reviews: z.array(driverReviewSchema).min(1),
  missed_signals: z.array(z.string().min(1)).default([]),
  adjustments_for_next_week: z.array(adjustmentSchema).default([]),
  created_at: offsetDateTimeStringSchema,
});

const forbiddenEvidenceSourceSet = new Set<string>(
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
);

export function buildCanolaThesisReviewPackage(
  input: CanolaThesisReviewPackageInput,
): CanolaThesisReviewPackage {
  const runArtifact = validateRunArtifact(input.run_artifact);
  const parsed = reviewInputSchema.parse(input);

  validateReviewClock(runArtifact, parsed.review_as_of_date, parsed.review_cutoff_at);

  const { acceptedEvidence, blockedEvidence } = filterEvidence(
    parsed.next_week_evidence,
    runArtifact.source_cutoff_at,
    parsed.review_cutoff_at,
  );

  if (acceptedEvidence.length === 0) {
    throw new Error("At least one next-week evidence record must be accepted.");
  }

  const acceptedEvidenceKeys = new Set(
    acceptedEvidence.map((record) => record.evidence_key),
  );
  validateEvidenceKeysAreUnique(acceptedEvidence);
  validateDriverReviews(
    parsed.driver_reviews,
    runArtifact.forecast.top_drivers.length,
    acceptedEvidenceKeys,
  );
  validateMissedThesisHasAdjustment(
    parsed.thesis_verdict,
    parsed.adjustments_for_next_week,
  );

  const forecast = runArtifact.forecast;
  const packageWithoutHash = {
    schema_version: CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION,
    grain: runArtifact.grain,
    crop_year: runArtifact.crop_year,
    forecast_grain_week: runArtifact.grain_week,
    forecast_as_of_date: runArtifact.as_of_date,
    forecast_source_cutoff_at: runArtifact.source_cutoff_at,
    review_as_of_date: parsed.review_as_of_date,
    review_cutoff_at: parsed.review_cutoff_at,
    reviewer: parsed.reviewer,
    run_hash: runArtifact.run_hash,
    forecast_summary: {
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
    },
    accepted_evidence: sortEvidence(acceptedEvidence),
    blocked_evidence: sortBlockedEvidence(blockedEvidence),
    driver_reviews: sortDriverReviews(parsed.driver_reviews),
    thesis_verdict: parsed.thesis_verdict,
    verdict_notes: parsed.verdict_notes,
    missed_signals: [...parsed.missed_signals].sort(compareStrings),
    adjustments_for_next_week: sortAdjustments(parsed.adjustments_for_next_week),
    learning_candidate: classifyLearningCandidate(runArtifact, parsed.thesis_verdict),
    guardrails: {
      executes_writes: false,
      requires_prices: false,
      calls_model_api: false,
      reads_supabase: false,
      review_required_before_training: true,
      review_required_before_sidecar_write: true,
      forbidden_operations: [
        "model_fine_tune",
        "model_api_call",
        "supabase_read",
        "supabase_write",
        "sidecar_table_write",
        "production_table_write",
        "dashboard_import",
        "private_farmer_data",
        "private_operator_data",
        "private_chat_data",
        "hermes_automation_start",
      ],
    },
    created_at: parsed.created_at,
  } satisfies Omit<CanolaThesisReviewPackage, "package_hash">;

  return {
    ...packageWithoutHash,
    package_hash: `sha256:${sha256(stableStringify(packageWithoutHash))}`,
  };
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

  if (candidate.forecast_schema_version !== CANOLA_FORECAST_SCHEMA_VERSION) {
    throw new Error("run_artifact forecast_schema_version is unsupported.");
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

function validateDriverReviews(
  reviews: ThesisDriverReview[],
  driverCount: number,
  acceptedEvidenceKeys: Set<string>,
): void {
  const reviewedDrivers = new Set<number>();

  for (const review of reviews) {
    if (review.driver_index >= driverCount) {
      throw new Error(`driver_index ${review.driver_index} is out of range.`);
    }

    reviewedDrivers.add(review.driver_index);

    for (const evidenceKey of review.evidence_keys) {
      if (!acceptedEvidenceKeys.has(evidenceKey)) {
        throw new Error(
          `driver review references unavailable evidence_key: ${evidenceKey}.`,
        );
      }
    }
  }

  for (let index = 0; index < driverCount; index += 1) {
    if (!reviewedDrivers.has(index)) {
      throw new Error(`driver_index ${index} must be reviewed.`);
    }
  }
}

function validateMissedThesisHasAdjustment(
  thesisVerdict: ThesisReviewVerdict,
  adjustments: ThesisAdjustment[],
): void {
  if (thesisVerdict === "missed" && adjustments.length === 0) {
    throw new Error("missed thesis reviews require at least one next-week adjustment.");
  }
}

function classifyLearningCandidate(
  runArtifact: CanolaForecastRunArtifact,
  thesisVerdict: ThesisReviewVerdict,
): LearningCandidate {
  const reasons: string[] = [];

  if (runArtifact.snapshot_revision_taint_status === "revision_tainted") {
    reasons.push("snapshot is revision-tainted");
  }

  if (runArtifact.forecast.pretraining_taint_status === "tainted") {
    reasons.push("forecast is pretraining-tainted");
  }

  if (
    runArtifact.forecast.pretraining_taint_status === "unknown" ||
    runArtifact.forecast.pretraining_taint_status === "not_applicable"
  ) {
    reasons.push("forecast pretraining status is not proven untainted");
  }

  if (isFixtureRun(runArtifact)) {
    reasons.push("forecast run is a synthetic fixture");
  }

  if (thesisVerdict === "inconclusive") {
    reasons.push("review verdict is inconclusive");
  }

  if (reasons.length === 0) {
    return {
      allowed: true,
      mode: "forward_calibration_candidate",
      reasons: [],
    };
  }

  if (runArtifact.snapshot_revision_taint_status === "revision_tainted") {
    return {
      allowed: false,
      mode: "review_only_revision_tainted",
      reasons,
    };
  }

  if (runArtifact.forecast.pretraining_taint_status === "tainted") {
    return {
      allowed: false,
      mode: "review_only_pretraining_tainted",
      reasons,
    };
  }

  if (
    runArtifact.forecast.pretraining_taint_status === "unknown" ||
    runArtifact.forecast.pretraining_taint_status === "not_applicable"
  ) {
    return {
      allowed: false,
      mode: "review_only_pretraining_unknown",
      reasons,
    };
  }

  if (isFixtureRun(runArtifact)) {
    return {
      allowed: false,
      mode: "review_only_fixture",
      reasons,
    };
  }

  return {
    allowed: false,
    mode: "review_only_inconclusive",
    reasons,
  };
}

function isFixtureRun(runArtifact: CanolaForecastRunArtifact): boolean {
  const provider = runArtifact.metadata.provider.toLowerCase();
  const model = runArtifact.metadata.model.toLowerCase();

  return provider.includes("fixture") || model.includes("fixture");
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

function sortDriverReviews(reviews: ThesisDriverReview[]): ThesisDriverReview[] {
  return [...reviews].sort((left, right) =>
    left.driver_index - right.driver_index ||
    compareStrings(left.verdict, right.verdict),
  );
}

function sortAdjustments(adjustments: ThesisAdjustment[]): ThesisAdjustment[] {
  return [...adjustments].sort((left, right) =>
    compareStrings(
      [left.priority, left.adjustment, left.reason].join("|"),
      [right.priority, right.adjustment, right.reason].join("|"),
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
