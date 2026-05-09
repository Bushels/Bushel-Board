import { createHash } from "node:crypto";

import { z } from "zod";

export const CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION =
  "canola-forecast-snapshot-v1" as const;

export const SNAPSHOT_MODES = [
  "strict_artifact_mode",
  "current_table_replay_mode",
] as const;

export const RECORD_TYPES = [
  "fact",
  "interpretation",
  "proxy",
  "speculation",
  "warning",
] as const;

export const BLOCKED_FORECAST_SOURCE_KEYS = [
  "prediction_scorecard",
  "forecast_experiment_scores",
  "forecast_experiment_predictions",
  "market_analysis_after_cutoff",
  "score_trajectory_after_cutoff",
] as const;

export type SnapshotMode = (typeof SNAPSHOT_MODES)[number];
export type SourceRecordType = (typeof RECORD_TYPES)[number];
export type RevisionTaintStatus = "untainted" | "revision_tainted";
export type BlockReason =
  | "available_after_source_cutoff"
  | "published_after_source_cutoff"
  | "blocked_forecast_source";

export interface SnapshotSourceRecord {
  source_key: string;
  record_type: SourceRecordType;
  observed_period: string;
  published_at: string;
  available_at: string;
  payload: Record<string, unknown>;
}

export interface SnapshotSourceClock {
  source_key: string;
  observed_period: string;
  published_at: string;
  available_at: string;
  freshness_hours: number;
}

export interface SnapshotBlockedSource {
  source_key: string;
  observed_period: string;
  available_at: string;
  reason: BlockReason;
}

export interface SnapshotWarning {
  code: string;
  message: string;
}

export interface CanolaForecastSnapshotInput {
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
  records: SnapshotSourceRecord[];
}

export interface CanolaForecastSnapshot {
  schema_version: typeof CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
  revision_taint_status: RevisionTaintStatus;
  source_clocks: SnapshotSourceClock[];
  records: SnapshotSourceRecord[];
  warnings: SnapshotWarning[];
  blocked_sources: SnapshotBlockedSource[];
  snapshot_hash: string;
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

const sourceRecordSchema = z.object({
  source_key: z.string().min(1),
  record_type: z.enum(RECORD_TYPES),
  observed_period: z.string().min(1),
  published_at: offsetDateTimeStringSchema,
  available_at: offsetDateTimeStringSchema,
  payload: z
    .record(z.string(), z.unknown())
    .refine(isJsonSerializable, "Payload must be JSON-serializable."),
});

const canolaForecastSnapshotInputSchema = z
  .object({
    grain: z.literal("Canola"),
    crop_year: z
      .string()
      .regex(/^\d{4}-\d{4}$/, "Expected crop year like 2026-2027."),
    grain_week: z.number().int().min(1).max(53),
    as_of_date: isoDateStringSchema,
    source_cutoff_at: offsetDateTimeStringSchema,
    snapshot_mode: z.enum(SNAPSHOT_MODES),
    records: z.array(sourceRecordSchema).min(1),
  })
  .superRefine((value, context) => {
    if (value.source_cutoff_at.slice(0, 10) !== value.as_of_date) {
      context.addIssue({
        code: "custom",
        message: "source_cutoff_at must use the same calendar date as as_of_date.",
        path: ["source_cutoff_at"],
      });
    }
  });

const blockedSourceKeySet = new Set<string>(BLOCKED_FORECAST_SOURCE_KEYS);

export function buildCanolaForecastSnapshot(
  input: unknown,
): CanolaForecastSnapshot {
  const parsed = canolaForecastSnapshotInputSchema.parse(input);
  const sourceCutoffTime = Date.parse(parsed.source_cutoff_at);
  const acceptedRecords: SnapshotSourceRecord[] = [];
  const blockedSources: SnapshotBlockedSource[] = [];

  for (const record of parsed.records) {
    if (blockedSourceKeySet.has(record.source_key)) {
      blockedSources.push(toBlockedSource(record, "blocked_forecast_source"));
      continue;
    }

    if (Date.parse(record.available_at) > sourceCutoffTime) {
      blockedSources.push(
        toBlockedSource(record, "available_after_source_cutoff"),
      );
      continue;
    }

    if (Date.parse(record.published_at) > sourceCutoffTime) {
      blockedSources.push(
        toBlockedSource(record, "published_after_source_cutoff"),
      );
      continue;
    }

    acceptedRecords.push(toCanonicalRecord(record));
  }

  if (acceptedRecords.length === 0) {
    throw new Error("At least one source record must be available before cutoff.");
  }

  const records = sortRecords(acceptedRecords);
  const sourceClocks = sortSourceClocks(
    records.map((record) => ({
      source_key: record.source_key,
      observed_period: record.observed_period,
      published_at: record.published_at,
      available_at: record.available_at,
      freshness_hours: roundToTwoDecimals(
        (sourceCutoffTime - Date.parse(record.available_at)) / 3_600_000,
      ),
    })),
  );
  const warnings = buildWarnings(parsed.snapshot_mode);
  const blocked_sources = sortBlockedSources(blockedSources);
  const revision_taint_status: RevisionTaintStatus =
    parsed.snapshot_mode === "current_table_replay_mode"
      ? "revision_tainted"
      : "untainted";

  const snapshotWithoutHash = {
    schema_version: CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
    grain: parsed.grain,
    crop_year: parsed.crop_year,
    grain_week: parsed.grain_week,
    as_of_date: parsed.as_of_date,
    source_cutoff_at: parsed.source_cutoff_at,
    snapshot_mode: parsed.snapshot_mode,
    revision_taint_status,
    source_clocks: sourceClocks,
    records,
    warnings,
    blocked_sources,
  } satisfies Omit<CanolaForecastSnapshot, "snapshot_hash">;

  return {
    ...snapshotWithoutHash,
    snapshot_hash: `sha256:${sha256(stableStringify(snapshotWithoutHash))}`,
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(toStableValue(value));
}

function buildWarnings(snapshotMode: SnapshotMode): SnapshotWarning[] {
  if (snapshotMode !== "current_table_replay_mode") {
    return [];
  }

  return [
    {
      code: "revision_tainted",
      message:
        "current_table_replay_mode uses mutable current rows and cannot support public skill claims.",
    },
  ];
}

function toCanonicalRecord(record: SnapshotSourceRecord): SnapshotSourceRecord {
  return {
    source_key: record.source_key,
    record_type: record.record_type,
    observed_period: record.observed_period,
    published_at: record.published_at,
    available_at: record.available_at,
    payload: toStableValue(record.payload) as Record<string, unknown>,
  };
}

function toBlockedSource(
  record: SnapshotSourceRecord,
  reason: BlockReason,
): SnapshotBlockedSource {
  return {
    source_key: record.source_key,
    observed_period: record.observed_period,
    available_at: record.available_at,
    reason,
  };
}

function sortRecords(records: SnapshotSourceRecord[]): SnapshotSourceRecord[] {
  return [...records].sort((left, right) =>
    compareStrings(
      [
        left.available_at,
        left.source_key,
        left.record_type,
        left.observed_period,
        left.published_at,
        sha256(stableStringify(left.payload)),
        sha256(stableStringify(left)),
      ].join("|"),
      [
        right.available_at,
        right.source_key,
        right.record_type,
        right.observed_period,
        right.published_at,
        sha256(stableStringify(right.payload)),
        sha256(stableStringify(right)),
      ].join("|"),
    ),
  );
}

function sortSourceClocks(
  sourceClocks: SnapshotSourceClock[],
): SnapshotSourceClock[] {
  return [...sourceClocks].sort((left, right) =>
    compareStrings(
      [
        left.available_at,
        left.source_key,
        left.observed_period,
        left.published_at,
        String(left.freshness_hours),
      ].join("|"),
      [
        right.available_at,
        right.source_key,
        right.observed_period,
        right.published_at,
        String(right.freshness_hours),
      ].join("|"),
    ),
  );
}

function sortBlockedSources(
  blockedSources: SnapshotBlockedSource[],
): SnapshotBlockedSource[] {
  return [...blockedSources].sort((left, right) =>
    compareStrings(
      [left.available_at, left.source_key, left.observed_period, left.reason].join(
        "|",
      ),
      [
        right.available_at,
        right.source_key,
        right.observed_period,
        right.reason,
      ].join("|"),
    ),
  );
}

function toStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableValue);
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(input).sort()) {
      output[key] = toStableValue(input[key]);
    }

    return output;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("JSON payload numbers must be finite.");
  }

  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new Error("Snapshot values must be JSON-serializable.");
  }

  return value;
}

function isJsonSerializable(value: unknown): boolean {
  try {
    stableStringify(value);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}
