import {
  BLOCKED_FORECAST_SOURCE_KEYS,
  RECORD_TYPES,
  SNAPSHOT_MODES,
  type SnapshotMode,
  type SnapshotSourceRecord,
  type SourceRecordType,
} from "./snapshot";

export const APPROVED_FORECAST_SOURCE_KEYS = [
  "canola_market_read",
  "cgc_weekly",
  "grain_prices",
  "source_runs",
] as const;

export const FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS = [
  ...BLOCKED_FORECAST_SOURCE_KEYS,
  "market_analysis",
  "score_trajectory",
  "grain_intelligence",
  "farm_summaries",
  "posted_prices",
  "crop_plans",
  "chat_extractions",
  "knowledge_state",
  "private_farmer_data",
  "private_operator_data",
  "private_chat_data",
  "dashboard_components",
  "dashboard_routes",
] as const;

export type ApprovedForecastSourceKey =
  (typeof APPROVED_FORECAST_SOURCE_KEYS)[number];

export interface ApprovedForecastSourceRow {
  source_key?: string;
  record_type?: SourceRecordType;
  observed_period?: string;
  published_at?: string;
  available_at?: string;
  updated_at?: string | null;
  imported_at?: string | null;
  created_at?: string | null;
  source_cutoff_supported?: boolean;
  payload?: Record<string, unknown>;
}

export interface SourceRecordBuildOptions {
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
}

const approvedSourceKeySet = new Set<string>(APPROVED_FORECAST_SOURCE_KEYS);
const forbiddenSourceKeySet = new Set<string>(
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
);
const mutableSourceKeySet = new Set<string>(["cgc_weekly", "grain_prices"]);
const recordTypeSet = new Set<string>(RECORD_TYPES);
const snapshotModeSet = new Set<string>(SNAPSHOT_MODES);

export function buildSnapshotSourceRecords(
  rows: ApprovedForecastSourceRow[],
  options: SourceRecordBuildOptions,
): SnapshotSourceRecord[] {
  validateBuildOptions(options);
  return rows.flatMap((row) => buildSnapshotSourceRecord(row, options));
}

export function buildSnapshotSourceRecord(
  row: ApprovedForecastSourceRow,
  options: SourceRecordBuildOptions,
): SnapshotSourceRecord[] {
  const sourceKey = requireText(row.source_key, "source_key");
  assertAllowedSourceKey(sourceKey);

  const recordType = requireRecordType(row.record_type);
  const observedPeriod = requireText(row.observed_period, "observed_period");
  const publishedAt = requireClock(row.published_at, "published_at");
  const availableAt = requireClock(
    row.available_at,
    "available_at",
    "available_at is required; observed_period and week-ending dates cannot substitute for source availability.",
  );
  const payload = requirePayload(row.payload);
  const cutoffMs = requireClock(options.source_cutoff_at, "source_cutoff_at").ms;
  const cutoffSupported =
    row.source_cutoff_supported === true ||
    payload.source_cutoff_supported === true;
  const canolaMarketReadReplay =
    sourceKey === "canola_market_read" &&
    !cutoffSupported &&
    options.snapshot_mode === "current_table_replay_mode";

  if (!canolaMarketReadReplay) {
    assertObservedDatesNotAfterAsOf(observedPeriod, payload, options.as_of_date);
    assertNotAfter("published_at", publishedAt.ms, cutoffMs);
    assertNotAfter("available_at", availableAt.ms, cutoffMs);
    assertMutableSourceHasClock(sourceKey, row);
    assertMutableClockBeforeCutoff(row.updated_at, "updated_at", cutoffMs);
    assertMutableClockBeforeCutoff(row.imported_at, "imported_at", cutoffMs);
    assertMutableClockBeforeCutoff(row.created_at, "created_at", cutoffMs);
  }

  if (sourceKey === "canola_market_read") {
    return buildCanolaMarketReadRecord(row, options, {
      sourceKey,
      observedPeriod,
      publishedAt: publishedAt.value,
      availableAt: availableAt.value,
      payload,
    });
  }

  if (sourceKey === "grain_prices") {
    return buildGrainPriceRecord(options, {
      sourceKey,
      recordType,
      observedPeriod,
      publishedAt: publishedAt.value,
      availableAt: availableAt.value,
      payload,
      cutoffMs,
    });
  }

  return [
    {
      source_key: sourceKey,
      record_type: recordType,
      observed_period: observedPeriod,
      published_at: publishedAt.value,
      available_at: availableAt.value,
      payload,
    },
  ];
}

export function assertAllowedSourceKey(sourceKey: string): void {
  if (forbiddenSourceKeySet.has(sourceKey)) {
    throw new Error(`Forbidden forecast input source: ${sourceKey}.`);
  }

  if (!approvedSourceKeySet.has(sourceKey)) {
    throw new Error(`Unapproved forecast source: ${sourceKey}.`);
  }
}

function buildCanolaMarketReadRecord(
  row: ApprovedForecastSourceRow,
  options: SourceRecordBuildOptions,
  base: {
    sourceKey: string;
    observedPeriod: string;
    publishedAt: string;
    availableAt: string;
    payload: Record<string, unknown>;
  },
): SnapshotSourceRecord[] {
  const cutoffSupported =
    row.source_cutoff_supported === true ||
    base.payload.source_cutoff_supported === true;

  if (cutoffSupported) {
    return [
      {
        source_key: base.sourceKey,
        record_type: requireRecordType(row.record_type),
        observed_period: base.observedPeriod,
        published_at: base.publishedAt,
        available_at: base.availableAt,
        payload: base.payload,
      },
    ];
  }

  if (options.snapshot_mode !== "current_table_replay_mode") {
    throw new Error(
      "canola_market_read cannot be used as a strict source unless it natively enforces source_cutoff_at.",
    );
  }

  return [
    currentStateReplayWarningRecord(base),
  ];
}

function currentStateReplayWarningRecord(base: {
  sourceKey: string;
  observedPeriod: string;
  publishedAt: string;
  availableAt: string;
  payload: Record<string, unknown>;
}): SnapshotSourceRecord {
  return {
    source_key: base.sourceKey,
    record_type: "warning",
    observed_period: base.observedPeriod,
    published_at: base.publishedAt,
    available_at: base.availableAt,
    payload: {
      code: "current_state_without_cutoff",
      message:
        "canola_market_read did not prove source_cutoff_at enforcement and is revision-tainted replay evidence only.",
      original_row_kind: optionalText(base.payload.row_kind),
      original_payload_omitted: true,
    },
  };
}

function buildGrainPriceRecord(
  options: SourceRecordBuildOptions,
  base: {
    sourceKey: string;
    recordType: SourceRecordType;
    observedPeriod: string;
    publishedAt: string;
    availableAt: string;
    payload: Record<string, unknown>;
    cutoffMs: number;
  },
): SnapshotSourceRecord[] {
  const priceDate = requireText(base.payload.price_date, "payload.price_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(priceDate)) {
    throw new Error("payload.price_date must use YYYY-MM-DD.");
  }

  if (priceDate > options.as_of_date) {
    throw new Error("payload.price_date is after as_of_date.");
  }

  const settlementAt = optionalText(
    base.payload.settlement_at ?? base.payload.price_observed_at,
  );
  if (settlementAt) {
    const parsed = requireClock(settlementAt, "settlement_at");
    assertNotAfter("settlement_at", parsed.ms, base.cutoffMs);
  }

  if (!isTrustedContractMapping(base.payload)) {
    return [
      warningRecord(base, "untrusted_contract_mapping", {
        message:
          "grain_prices row lacks trusted contract mapping, so it cannot be emitted as a clean price fact.",
      }),
    ];
  }

  if (priceDate === options.as_of_date) {
    const marketClosedAt = optionalText(base.payload.market_closed_at);

    if (!marketClosedAt) {
      return [
        warningRecord(base, "market_close_unproven", {
          message:
            "Same-day settlement cannot be used because market close was not proven before the forecast cutoff.",
        }),
      ];
    }

    const parsedMarketClose = requireClock(marketClosedAt, "market_closed_at");
    if (parsedMarketClose.ms > base.cutoffMs) {
      return [
        warningRecord(base, "market_close_after_cutoff", {
          message:
            "Same-day settlement cannot be used because market close is after the forecast cutoff.",
        }),
      ];
    }
  }

  return [
    {
      source_key: base.sourceKey,
      record_type: base.recordType,
      observed_period: base.observedPeriod,
      published_at: base.publishedAt,
      available_at: base.availableAt,
      payload: base.payload,
    },
  ];
}

function warningRecord(
  base: {
    sourceKey: string;
    observedPeriod: string;
    publishedAt: string;
    availableAt: string;
    payload: Record<string, unknown>;
  },
  code: string,
  details: { message: string },
): SnapshotSourceRecord {
  return {
    source_key: base.sourceKey,
    record_type: "warning",
    observed_period: base.observedPeriod,
    published_at: base.publishedAt,
    available_at: base.availableAt,
    payload: {
      code,
      message: details.message,
      original_payload: sanitizeJsonValue(base.payload),
    },
  };
}

function validateBuildOptions(options: SourceRecordBuildOptions): void {
  requireText(options.as_of_date, "as_of_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.as_of_date)) {
    throw new Error("as_of_date must use YYYY-MM-DD.");
  }

  if (!snapshotModeSet.has(options.snapshot_mode)) {
    throw new Error(`Unsupported snapshot_mode: ${options.snapshot_mode}.`);
  }

  requireClock(options.source_cutoff_at, "source_cutoff_at");
  if (!sourceCutoffDateMatchesAsOf(options.source_cutoff_at, options.as_of_date)) {
    throw new Error("source_cutoff_at must use the same calendar date as as_of_date.");
  }
}

function sourceCutoffDateMatchesAsOf(
  sourceCutoffAt: string,
  asOfDate: string,
): boolean {
  const declaredDate = sourceCutoffAt.slice(0, 10);
  const utcDate = new Date(Date.parse(sourceCutoffAt)).toISOString().slice(0, 10);

  return declaredDate === asOfDate || utcDate === asOfDate;
}

function assertMutableClockBeforeCutoff(
  value: string | null | undefined,
  fieldName: string,
  cutoffMs: number,
): void {
  if (value === null || value === undefined) {
    return;
  }

  const parsed = requireClock(value, fieldName);
  assertNotAfter(fieldName, parsed.ms, cutoffMs);
}

function assertMutableSourceHasClock(
  sourceKey: string,
  row: ApprovedForecastSourceRow,
): void {
  if (!mutableSourceKeySet.has(sourceKey)) {
    return;
  }

  if (row.updated_at ?? row.imported_at ?? row.created_at) {
    return;
  }

  throw new Error(
    `revision_risk: ${sourceKey} requires an ingestion or update clock before it can be replayed.`,
  );
}

function assertObservedDatesNotAfterAsOf(
  observedPeriod: string,
  payload: Record<string, unknown>,
  asOfDate: string,
): void {
  const observedDates = [...observedPeriod.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)]
    .map((match) => match[0])
    .filter((value) => value > asOfDate);
  const payloadPeriodDate = optionalText(
    payload.week_ending_date ?? payload.period_end ?? payload.observed_period_end,
  );

  if (
    payloadPeriodDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(payloadPeriodDate) &&
    payloadPeriodDate > asOfDate
  ) {
    observedDates.push(payloadPeriodDate);
  }

  if (observedDates.length > 0) {
    throw new Error(
      `observed_period contains a date after as_of_date: ${observedDates[0]}.`,
    );
  }
}

function assertNotAfter(fieldName: string, valueMs: number, cutoffMs: number): void {
  if (valueMs > cutoffMs) {
    throw new Error(`${fieldName} is after source_cutoff_at.`);
  }
}

function requireClock(
  value: unknown,
  fieldName: string,
  missingMessage?: string,
): { value: string; ms: number } {
  const text = optionalText(value);

  if (!text) {
    throw new Error(missingMessage ?? `${fieldName} is required.`);
  }

  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(`${fieldName} must include a timezone offset.`);
  }

  const ms = Date.parse(text);
  if (Number.isNaN(ms)) {
    throw new Error(`${fieldName} must be a valid ISO timestamp.`);
  }

  return { value: text, ms };
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

function requireRecordType(value: unknown): SourceRecordType {
  const text = requireText(value, "record_type");
  if (!recordTypeSet.has(text)) {
    throw new Error(`Unsupported record_type: ${text}.`);
  }

  return text as SourceRecordType;
}

function requirePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("payload is required.");
  }

  return sanitizeJsonValue(value) as Record<string, unknown>;
}

function isTrustedContractMapping(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.contract_code === "string" &&
    payload.contract_code.trim() !== "" &&
    payload.contract_mapping_trusted === true
  );
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => sanitizeJsonValue(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        output[key] = sanitizeJsonValue(child);
      }
    }

    return output;
  }

  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new Error("payload must be JSON-serializable.");
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("payload numbers must be finite.");
  }

  return value;
}
