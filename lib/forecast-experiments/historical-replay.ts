import { createHash } from "node:crypto";

import { z } from "zod";

import {
  FORECAST_DIRECTIONS,
  type ForecastDirection,
} from "./schema";
import {
  buildCanolaForecastSnapshot,
  stableStringify,
  type CanolaForecastSnapshot,
  type SnapshotMode,
} from "./snapshot";
import {
  buildSnapshotSourceRecords,
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
  type ApprovedForecastSourceRow,
} from "./source-records";
import {
  EVIDENCE_MATERIALITIES,
  THESIS_EVIDENCE_TYPES,
  THESIS_REVIEW_VERDICTS,
  type ThesisReviewEvidenceRecord,
  type ThesisReviewVerdict,
} from "./thesis-review";

export const CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION =
  "canola-historical-replay-package-v1" as const;

export const CANOLA_HISTORICAL_TRAINING_EXAMPLE_SCHEMA_VERSION =
  "canola-historical-training-example-v1" as const;

export const HISTORICAL_REPLAY_LABELER_KINDS = [
  "human_review",
  "deterministic_rule",
  "model_assisted",
] as const;

export const HISTORICAL_REPLAY_LABEL_TASKS = [
  "thesis_review_label",
  "directional_outcome_label",
] as const;

export type HistoricalReplayLabelerKind =
  (typeof HISTORICAL_REPLAY_LABELER_KINDS)[number];
export type HistoricalReplayLabelTask =
  (typeof HISTORICAL_REPLAY_LABEL_TASKS)[number];

export type HistoricalReplayCandidateMode =
  | "historical_training_candidate"
  | "review_only_revision_tainted"
  | "review_only_labeler_pretraining_tainted"
  | "review_only_labeler_pretraining_unknown"
  | "review_only_no_accepted_evidence"
  | "review_only_inconclusive";

export interface HistoricalReplayLabeler {
  kind: HistoricalReplayLabelerKind;
  name: string;
  model_training_cutoff?: string | null;
}

export interface HistoricalReplayOutcomeLabel {
  label_task?: HistoricalReplayLabelTask;
  directional_outcome: ForecastDirection | "mixed";
  thesis_verdict: ThesisReviewVerdict;
  outcome_summary: string;
  supporting_evidence_keys: string[];
  contradicting_evidence_keys: string[];
  missed_signals: string[];
  adjustments_for_next_week: string[];
}

export interface HistoricalReplayWeekInput {
  period_id: string;
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
  source_rows: ApprovedForecastSourceRow[];
  review_as_of_date: string;
  review_cutoff_at: string;
  labeler: HistoricalReplayLabeler;
  outcome_label: HistoricalReplayOutcomeLabel;
  next_week_evidence: ThesisReviewEvidenceRecord[];
}

export interface CanolaHistoricalReplayPackageInput {
  replay_set_name: string;
  review_window_days: 7 | 28;
  weeks: HistoricalReplayWeekInput[];
  created_at: string;
}

export interface BlockedHistoricalReplayEvidenceRecord {
  evidence_key: string;
  source_key: string;
  observed_period: string;
  available_at: string;
  reason:
    | "already_available_at_forecast_cutoff"
    | "available_after_review_cutoff"
    | "forbidden_source";
}

export interface HistoricalReplayTrainingCandidate {
  allowed: boolean;
  mode: HistoricalReplayCandidateMode;
  reasons: string[];
}

export interface CanolaHistoricalTrainingExample {
  schema_version: typeof CANOLA_HISTORICAL_TRAINING_EXAMPLE_SCHEMA_VERSION;
  period_id: string;
  grain: "Canola";
  input_snapshot: CanolaForecastSnapshot;
  target_label: HistoricalReplayOutcomeLabel;
  accepted_evidence_keys: string[];
  guardrails: {
    generated_from_historical_replay: true;
    not_forward_calibration: true;
    review_required_before_training: true;
  };
}

export interface CanolaHistoricalReplayWeek {
  period_id: string;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  review_as_of_date: string;
  review_cutoff_at: string;
  labeler: HistoricalReplayLabeler;
  snapshot_hash: string;
  snapshot_revision_taint_status: CanolaForecastSnapshot["revision_taint_status"];
  source_record_count: number;
  accepted_evidence: ThesisReviewEvidenceRecord[];
  blocked_evidence: BlockedHistoricalReplayEvidenceRecord[];
  outcome_label: HistoricalReplayOutcomeLabel;
  training_candidate: HistoricalReplayTrainingCandidate;
  training_example: CanolaHistoricalTrainingExample | null;
}

export interface CanolaHistoricalReplayPackage {
  schema_version: typeof CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION;
  replay_set_name: string;
  grain: "Canola";
  review_window_days: 7 | 28;
  weeks: CanolaHistoricalReplayWeek[];
  summary: {
    total_weeks: number;
    candidate_weeks: number;
    review_only_weeks: number;
    accepted_evidence_count: number;
    blocked_evidence_count: number;
  };
  guardrails: {
    executes_writes: false;
    calls_model_api: false;
    reads_supabase: false;
    review_required_before_training: true;
    candidate_mode: "historical_training_candidate";
    not_forward_calibration: true;
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

const labelerSchema = z
  .object({
    kind: z.enum(HISTORICAL_REPLAY_LABELER_KINDS),
    name: z.string().min(1),
    model_training_cutoff: isoDateStringSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind !== "model_assisted" && value.model_training_cutoff) {
      context.addIssue({
        code: "custom",
        message: "model_training_cutoff is only valid for model_assisted labels.",
        path: ["model_training_cutoff"],
      });
    }
  });

const outcomeLabelSchema = z.object({
  label_task: z.enum(HISTORICAL_REPLAY_LABEL_TASKS).default("thesis_review_label"),
  directional_outcome: z.union([z.enum(FORECAST_DIRECTIONS), z.literal("mixed")]),
  thesis_verdict: z.enum(THESIS_REVIEW_VERDICTS),
  outcome_summary: z.string().min(1),
  supporting_evidence_keys: z.array(z.string().min(1)).default([]),
  contradicting_evidence_keys: z.array(z.string().min(1)).default([]),
  missed_signals: z.array(z.string().min(1)).default([]),
  adjustments_for_next_week: z.array(z.string().min(1)).default([]),
});

const replayWeekInputSchema = z.object({
  period_id: z.string().min(1),
  crop_year: z
    .string()
    .regex(/^\d{4}-\d{4}$/, "Expected crop year like 2026-2027."),
  grain_week: z.number().int().min(1).max(53),
  as_of_date: isoDateStringSchema,
  source_cutoff_at: offsetDateTimeStringSchema,
  snapshot_mode: z.enum(["strict_artifact_mode", "current_table_replay_mode"]),
  source_rows: z.array(z.unknown()).min(1),
  review_as_of_date: isoDateStringSchema,
  review_cutoff_at: offsetDateTimeStringSchema,
  labeler: labelerSchema,
  outcome_label: outcomeLabelSchema,
  next_week_evidence: z.array(evidenceRecordSchema).default([]),
});

const replayInputSchema = z.object({
  replay_set_name: z.string().min(1),
  review_window_days: z.union([z.literal(7), z.literal(28)]),
  weeks: z.array(replayWeekInputSchema).min(1),
  created_at: offsetDateTimeStringSchema,
});

const forbiddenEvidenceSourceSet = new Set<string>(
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
);

export function buildCanolaHistoricalReplayPackage(
  input: CanolaHistoricalReplayPackageInput,
): CanolaHistoricalReplayPackage {
  const parsed = replayInputSchema.parse(input);
  const weeks = parsed.weeks.map((week) =>
    buildHistoricalReplayWeek(week as HistoricalReplayWeekInput, parsed.review_window_days),
  );
  const candidateWeeks = weeks.filter((week) => week.training_candidate.allowed);
  const acceptedEvidenceCount = weeks.reduce(
    (total, week) => total + week.accepted_evidence.length,
    0,
  );
  const blockedEvidenceCount = weeks.reduce(
    (total, week) => total + week.blocked_evidence.length,
    0,
  );
  const packageWithoutHash = {
    schema_version: CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION,
    replay_set_name: parsed.replay_set_name,
    grain: "Canola",
    review_window_days: parsed.review_window_days,
    weeks: sortWeeks(weeks),
    summary: {
      total_weeks: weeks.length,
      candidate_weeks: candidateWeeks.length,
      review_only_weeks: weeks.length - candidateWeeks.length,
      accepted_evidence_count: acceptedEvidenceCount,
      blocked_evidence_count: blockedEvidenceCount,
    },
    guardrails: {
      executes_writes: false,
      calls_model_api: false,
      reads_supabase: false,
      review_required_before_training: true,
      candidate_mode: "historical_training_candidate",
      not_forward_calibration: true,
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
  } satisfies Omit<CanolaHistoricalReplayPackage, "package_hash">;

  return {
    ...packageWithoutHash,
    package_hash: `sha256:${sha256(stableStringify(packageWithoutHash))}`,
  };
}

function buildHistoricalReplayWeek(
  week: HistoricalReplayWeekInput,
  reviewWindowDays: 7 | 28,
): CanolaHistoricalReplayWeek {
  validateReviewWindow(week, reviewWindowDays);

  const records = buildSnapshotSourceRecords(week.source_rows, {
    as_of_date: week.as_of_date,
    source_cutoff_at: week.source_cutoff_at,
    snapshot_mode: week.snapshot_mode,
  });
  const snapshot = buildCanolaForecastSnapshot({
    grain: "Canola",
    crop_year: week.crop_year,
    grain_week: week.grain_week,
    as_of_date: week.as_of_date,
    source_cutoff_at: week.source_cutoff_at,
    snapshot_mode: week.snapshot_mode,
    records,
  });
  const { acceptedEvidence, blockedEvidence } = filterEvidence(
    week.next_week_evidence,
    week.source_cutoff_at,
    week.review_cutoff_at,
  );
  validateEvidenceKeysAreUnique(acceptedEvidence);
  validateOutcomeEvidenceReferences(week.outcome_label, acceptedEvidence);

  const trainingCandidate = classifyTrainingCandidate(
    snapshot,
    acceptedEvidence,
    week.labeler,
    week.outcome_label,
    week.review_cutoff_at,
  );
  const trainingExample = trainingCandidate.allowed
    ? buildTrainingExample(week, snapshot, acceptedEvidence)
    : null;

  return {
    period_id: week.period_id,
    grain: "Canola",
    crop_year: week.crop_year,
    grain_week: week.grain_week,
    as_of_date: week.as_of_date,
    source_cutoff_at: week.source_cutoff_at,
    review_as_of_date: week.review_as_of_date,
    review_cutoff_at: week.review_cutoff_at,
    labeler: canonicalLabeler(week.labeler),
    snapshot_hash: snapshot.snapshot_hash,
    snapshot_revision_taint_status: snapshot.revision_taint_status,
    source_record_count: snapshot.records.length,
    accepted_evidence: sortEvidence(acceptedEvidence),
    blocked_evidence: sortBlockedEvidence(blockedEvidence),
    outcome_label: canonicalOutcomeLabel(week.outcome_label),
    training_candidate: trainingCandidate,
    training_example: trainingExample,
  };
}

function validateReviewWindow(
  week: HistoricalReplayWeekInput,
  reviewWindowDays: 7 | 28,
): void {
  const sourceCutoffMs = Date.parse(week.source_cutoff_at);
  const reviewCutoffMs = Date.parse(week.review_cutoff_at);

  if (reviewCutoffMs <= sourceCutoffMs) {
    throw new Error("review_cutoff_at must be after source_cutoff_at.");
  }

  if (
    reviewCutoffMs >
    sourceCutoffMs + reviewWindowDays * 24 * 60 * 60 * 1000
  ) {
    throw new Error("review_cutoff_at exceeds the declared review window.");
  }

  if (!declaredOrUtcDateMatches(week.review_cutoff_at, week.review_as_of_date)) {
    throw new Error("review_cutoff_at must use the same calendar date as review_as_of_date.");
  }
}

function filterEvidence(
  records: ThesisReviewEvidenceRecord[],
  forecastCutoffAt: string,
  reviewCutoffAt: string,
): {
  acceptedEvidence: ThesisReviewEvidenceRecord[];
  blockedEvidence: BlockedHistoricalReplayEvidenceRecord[];
} {
  const forecastCutoffMs = Date.parse(forecastCutoffAt);
  const reviewCutoffMs = Date.parse(reviewCutoffAt);
  const acceptedEvidence: ThesisReviewEvidenceRecord[] = [];
  const blockedEvidence: BlockedHistoricalReplayEvidenceRecord[] = [];

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

function validateOutcomeEvidenceReferences(
  label: HistoricalReplayOutcomeLabel,
  acceptedEvidence: ThesisReviewEvidenceRecord[],
): void {
  const acceptedEvidenceKeys = new Set(
    acceptedEvidence.map((record) => record.evidence_key),
  );

  for (const evidenceKey of [
    ...label.supporting_evidence_keys,
    ...label.contradicting_evidence_keys,
  ]) {
    if (!acceptedEvidenceKeys.has(evidenceKey)) {
      throw new Error(
        `target label references unavailable evidence_key: ${evidenceKey}.`,
      );
    }
  }
}

function classifyTrainingCandidate(
  snapshot: CanolaForecastSnapshot,
  acceptedEvidence: ThesisReviewEvidenceRecord[],
  labeler: HistoricalReplayLabeler,
  label: HistoricalReplayOutcomeLabel,
  reviewCutoffAt: string,
): HistoricalReplayTrainingCandidate {
  const reasons: string[] = [];

  if (snapshot.revision_taint_status === "revision_tainted") {
    reasons.push("snapshot is revision-tainted");
  }

  const labelerPretrainingReason = classifyLabelerPretraining(
    labeler,
    reviewCutoffAt,
  );
  if (labelerPretrainingReason) {
    reasons.push(labelerPretrainingReason);
  }

  if (acceptedEvidence.length === 0) {
    reasons.push("no accepted next-week evidence");
  }

  const labelTask = label.label_task ?? "thesis_review_label";
  if (
    labelTask === "directional_outcome_label" &&
    label.directional_outcome === "mixed"
  ) {
    reasons.push("directional outcome label is mixed");
  }

  if (
    labelTask === "thesis_review_label" &&
    label.thesis_verdict === "inconclusive"
  ) {
    reasons.push("historical label verdict is inconclusive");
  }

  if (reasons.length === 0) {
    return {
      allowed: true,
      mode: "historical_training_candidate",
      reasons: [],
    };
  }

  if (snapshot.revision_taint_status === "revision_tainted") {
    return {
      allowed: false,
      mode: "review_only_revision_tainted",
      reasons,
    };
  }

  if (reasons.includes("labeler model training cutoff is after the review cutoff")) {
    return {
      allowed: false,
      mode: "review_only_labeler_pretraining_tainted",
      reasons,
    };
  }

  if (reasons.includes("labeler model training cutoff is unknown")) {
    return {
      allowed: false,
      mode: "review_only_labeler_pretraining_unknown",
      reasons,
    };
  }

  if (acceptedEvidence.length === 0) {
    return {
      allowed: false,
      mode: "review_only_no_accepted_evidence",
      reasons,
    };
  }

  return {
    allowed: false,
    mode: "review_only_inconclusive",
    reasons,
  };
}

function classifyLabelerPretraining(
  labeler: HistoricalReplayLabeler,
  reviewCutoffAt: string,
): string | null {
  if (labeler.kind !== "model_assisted") {
    return null;
  }

  if (!labeler.model_training_cutoff) {
    return "labeler model training cutoff is unknown";
  }

  if (labeler.model_training_cutoff > reviewCutoffAt.slice(0, 10)) {
    return "labeler model training cutoff is after the review cutoff";
  }

  return null;
}

function buildTrainingExample(
  week: HistoricalReplayWeekInput,
  snapshot: CanolaForecastSnapshot,
  acceptedEvidence: ThesisReviewEvidenceRecord[],
): CanolaHistoricalTrainingExample {
  return {
    schema_version: CANOLA_HISTORICAL_TRAINING_EXAMPLE_SCHEMA_VERSION,
    period_id: week.period_id,
    grain: "Canola",
    input_snapshot: snapshot,
    target_label: canonicalOutcomeLabel(week.outcome_label),
    accepted_evidence_keys: acceptedEvidence
      .map((record) => record.evidence_key)
      .sort(compareStrings),
    guardrails: {
      generated_from_historical_replay: true,
      not_forward_calibration: true,
      review_required_before_training: true,
    },
  };
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
  reason: BlockedHistoricalReplayEvidenceRecord["reason"],
): BlockedHistoricalReplayEvidenceRecord {
  return {
    evidence_key: record.evidence_key,
    source_key: record.source_key,
    observed_period: record.observed_period,
    available_at: record.available_at,
    reason,
  };
}

function canonicalOutcomeLabel(
  label: HistoricalReplayOutcomeLabel,
): HistoricalReplayOutcomeLabel {
  return {
    label_task: label.label_task ?? "thesis_review_label",
    directional_outcome: label.directional_outcome,
    thesis_verdict: label.thesis_verdict,
    outcome_summary: label.outcome_summary,
    supporting_evidence_keys: [...label.supporting_evidence_keys].sort(
      compareStrings,
    ),
    contradicting_evidence_keys: [...label.contradicting_evidence_keys].sort(
      compareStrings,
    ),
    missed_signals: [...label.missed_signals].sort(compareStrings),
    adjustments_for_next_week: [...label.adjustments_for_next_week].sort(
      compareStrings,
    ),
  };
}

function canonicalLabeler(labeler: HistoricalReplayLabeler): HistoricalReplayLabeler {
  if (labeler.model_training_cutoff === undefined) {
    return {
      kind: labeler.kind,
      name: labeler.name,
    };
  }

  return {
    kind: labeler.kind,
    name: labeler.name,
    model_training_cutoff: labeler.model_training_cutoff,
  };
}

function sortWeeks(
  weeks: CanolaHistoricalReplayWeek[],
): CanolaHistoricalReplayWeek[] {
  return [...weeks].sort((left, right) =>
    compareStrings(
      [left.as_of_date, left.crop_year, String(left.grain_week), left.period_id].join(
        "|",
      ),
      [
        right.as_of_date,
        right.crop_year,
        String(right.grain_week),
        right.period_id,
      ].join("|"),
    ),
  );
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
  evidence: BlockedHistoricalReplayEvidenceRecord[],
): BlockedHistoricalReplayEvidenceRecord[] {
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
