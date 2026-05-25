import type { CanolaMarketRead } from "../canola-market-read";
import {
  FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
  type ApprovedForecastSourceRow,
} from "./source-records";
import type { SnapshotMode, SourceRecordType } from "./snapshot";

export const CANOLA_MARKET_READ_SOURCE_ROWS_SCHEMA_VERSION =
  "canola-market-read-source-rows-v1" as const;

export const MARKET_READ_CUTOFF_PROOFS = [
  "frozen_forward_artifact",
  "current_table_replay",
] as const;

export type MarketReadCutoffProof = (typeof MARKET_READ_CUTOFF_PROOFS)[number];

export interface CanolaMarketReadSourceRowsInput {
  market_read: unknown;
  as_of_date: string;
  source_cutoff_at: string;
  cutoff_proof: MarketReadCutoffProof;
  created_at?: string;
}

export interface OmittedMarketReadSource {
  source_name: string;
  count: number;
  reason: "unadmitted_or_forbidden_source";
}

export interface CanolaMarketReadSourceRowsFile {
  schema_version: typeof CANOLA_MARKET_READ_SOURCE_ROWS_SCHEMA_VERSION;
  disclaimer: string;
  grain: "Canola";
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
  cutoff_proof: MarketReadCutoffProof;
  market_read_generated_at: string;
  packet_generated_at: string | null;
  omitted_sources: OmittedMarketReadSource[];
  rows: ApprovedForecastSourceRow[];
}

const admittedMarketReadSourceNames = new Set<string>([
  "canola_council_market_stats_inventory",
  "cftc_cot_positions",
  "cgc_observations",
  "fx_rates",
  "grain_monitor_snapshots",
  "grain_prices",
  "producer_car_allocations",
  "source_runs",
  "supply_disposition",
]);

const forbiddenMarketReadSourceNames = new Set<string>([
  ...FORBIDDEN_FORECAST_INPUT_SOURCE_KEYS,
  "crop_plan_deliveries",
  "weather_cache",
  "usda_wasde_mapped",
]);

const renderableOmittedSourceNames = new Set<string>([
  "usda_wasde_mapped",
  "usda_wasde_raw",
  "weather_cache",
]);

export function buildCanolaMarketReadSourceRows(
  input: CanolaMarketReadSourceRowsInput,
): CanolaMarketReadSourceRowsFile {
  const marketRead = validateMarketRead(input.market_read);
  const cropYear = requireMarketReadCropYear(marketRead.crop_year);
  const grainWeek = requireMarketReadGrainWeek(marketRead.grain_week);
  const asOfDate = requireIsoDate(input.as_of_date, "as_of_date");
  const sourceCutoffAt = requireOffsetDateTime(
    input.source_cutoff_at,
    "source_cutoff_at",
  );
  const createdAt = requireOffsetDateTime(
    input.created_at ?? marketRead.generated_at,
    "created_at",
  );
  const cutoffProof = validateCutoffProof(input.cutoff_proof);

  validateSourceCutoffDate(sourceCutoffAt, asOfDate);
  validateMarketReadClock(marketRead, sourceCutoffAt, cutoffProof);

  const omittedCounts = new Map<string, number>();
  const snapshotMode: SnapshotMode =
    cutoffProof === "frozen_forward_artifact"
      ? "strict_artifact_mode"
      : "current_table_replay_mode";
  const sourceCutoffSupported = cutoffProof === "frozen_forward_artifact";
  const base = {
    observedPeriod: `crop_year ${cropYear}, grain_week ${grainWeek}`,
    publishedAt: marketRead.packet_generated_at ?? marketRead.generated_at,
    availableAt: marketRead.generated_at,
    createdAt,
    sourceCutoffSupported,
    marketRead,
  };
  const rows: ApprovedForecastSourceRow[] = [
    sourceRow(base, "interpretation", base.observedPeriod, {
      row_kind: "market_read_summary",
      headline: marketRead.headline,
      bottom_line: marketRead.bottom_line,
      status: marketRead.status,
    }),
  ];

  marketRead.facts.forEach((fact, index) => {
    if (!isAdmittedSourceItem(fact, omittedCounts)) return;
    rows.push(
      sourceRow(base, "fact", optionalText(fact.period) ?? base.observedPeriod, {
        row_kind: "fact",
        item_index: index,
        ...pickRecord(fact, [
          "label",
          "value",
          "unit",
          "period",
          "source_name",
          "source_table",
          "source_row_key",
          "scope",
          "confidence",
          "quality_flags",
          "notes",
        ]),
      }),
    );
  });

  marketRead.what_changed.forEach((change, index) => {
    if (!isAdmittedSourceItem(change, omittedCounts)) return;
    rows.push(
      sourceRow(base, "interpretation", observedPeriodForChange(change, base), {
        row_kind: "change",
        item_index: index,
        ...pickRecord(change, [
          "label",
          "current_value",
          "previous_value",
          "change_value",
          "change_pct",
          "unit",
          "current_period",
          "previous_period",
          "source_name",
          "source_table",
        ]),
      }),
    );
  });

  marketRead.interpretation.forEach((interpretation, index) => {
    if (!isAdmittedSourceItem(interpretation, omittedCounts)) return;
    rows.push(
      sourceRow(base, "interpretation", base.observedPeriod, {
        row_kind: "interpretation",
        item_index: index,
        ...pickRecord(interpretation, [
          "title",
          "body",
          "source_names",
          "confidence",
        ]),
      }),
    );
  });

  marketRead.farmer_watch_items.forEach((watchItem, index) => {
    if (!isAdmittedSourceItem(watchItem, omittedCounts)) return;
    rows.push(
      sourceRow(base, "warning", base.observedPeriod, {
        row_kind: "watch_item",
        item_index: index,
        ...pickRecord(watchItem, [
          "label",
          "watch_for",
          "why_it_matters",
          "source_names",
        ]),
      }),
    );
  });

  marketRead.freshness.forEach((freshness, index) => {
    if (!isAdmittedSourceItem(freshness, omittedCounts)) return;
    rows.push(
      sourceRow(base, "warning", base.observedPeriod, {
        row_kind: "freshness",
        item_index: index,
        ...pickRecord(freshness, [
          "source_name",
          "source_lane",
          "expected_cadence",
          "latest_period",
          "latest_period_end",
          "rows_available",
          "freshness_status",
          "thesis_use",
          "action_hint",
          "quality_flags",
        ]),
      }),
    );
  });

  marketRead.quality_warnings.forEach((warning, index) => {
    if (!isAdmittedSourceItem(warning, omittedCounts)) return;
    rows.push(
      sourceRow(base, "warning", base.observedPeriod, {
        row_kind: "quality_warning",
        item_index: index,
        ...pickRecord(warning, [
          "source_name",
          "status",
          "message",
          "action_hint",
          "severity",
        ]),
      }),
    );
  });

  const omittedSources = toOmittedSources(omittedCounts);
  if (omittedSources.length > 0) {
    rows.push(
      sourceRow(base, "warning", base.observedPeriod, {
        row_kind: "omitted_sources",
        message:
          "Forbidden or unadmitted market-read source lanes were omitted from forecast input.",
        omitted_sources: omittedSources,
      }),
    );
  }

  return {
    schema_version: CANOLA_MARKET_READ_SOURCE_ROWS_SCHEMA_VERSION,
    disclaimer:
      "Experimental forecast-evaluation source artifact only. Do not use as model training data, market-skill proof, production dashboard output, or a trading recommendation.",
    grain: "Canola",
    crop_year: cropYear,
    grain_week: grainWeek,
    as_of_date: asOfDate,
    source_cutoff_at: sourceCutoffAt,
    snapshot_mode: snapshotMode,
    cutoff_proof: cutoffProof,
    market_read_generated_at: marketRead.generated_at,
    packet_generated_at: marketRead.packet_generated_at,
    omitted_sources: omittedSources,
    rows,
  };
}

function sourceRow(
  base: {
    publishedAt: string;
    availableAt: string;
    createdAt: string;
    sourceCutoffSupported: boolean;
    marketRead: Pick<CanolaMarketRead, "version" | "generated_at" | "packet_generated_at">;
  },
  recordType: SourceRecordType,
  observedPeriod: string,
  payload: Record<string, unknown>,
): ApprovedForecastSourceRow {
  return {
    source_key: "canola_market_read",
    record_type: recordType,
    observed_period: observedPeriod,
    published_at: base.publishedAt,
    available_at: base.availableAt,
    created_at: base.createdAt,
    source_cutoff_supported: base.sourceCutoffSupported,
    payload: {
      market_read_version: base.marketRead.version,
      market_read_generated_at: base.marketRead.generated_at,
      packet_generated_at: base.marketRead.packet_generated_at,
      ...sanitizeRecord(payload),
    },
  };
}

function validateMarketRead(value: unknown): CanolaMarketRead {
  if (!isRecord(value)) {
    throw new Error("market_read must be an object.");
  }

  if (value.version !== "canola-market-read-v1") {
    throw new Error("market_read.version is unsupported.");
  }

  if (value.status !== "available") {
    throw new Error("market_read.status must be available.");
  }

  if (value.grain !== "Canola") {
    throw new Error("market_read.grain must be Canola.");
  }

  const cropYear = optionalText(value.crop_year);
  if (!cropYear || !/^\d{4}-\d{4}$/.test(cropYear)) {
    throw new Error("market_read.crop_year must use YYYY-YYYY.");
  }

  const grainWeek = value.grain_week;
  if (
    typeof grainWeek !== "number" ||
    !Number.isInteger(grainWeek) ||
    grainWeek < 1 ||
    grainWeek > 53
  ) {
    throw new Error("market_read.grain_week must be an integer from 1 to 53.");
  }

  requireOffsetDateTime(value.generated_at, "market_read.generated_at");
  if (value.packet_generated_at !== null) {
    requireOffsetDateTime(
      value.packet_generated_at,
      "market_read.packet_generated_at",
    );
  }

  return {
    ...(value as unknown as CanolaMarketRead),
    crop_year: cropYear,
    grain_week: grainWeek,
    facts: readArray(value.facts),
    what_changed: readArray(value.what_changed),
    interpretation: readArray(value.interpretation),
    farmer_watch_items: readArray(value.farmer_watch_items),
    freshness: readArray(value.freshness),
    quality_warnings: readArray(value.quality_warnings),
  };
}

function validateMarketReadClock(
  marketRead: CanolaMarketRead,
  sourceCutoffAt: string,
  cutoffProof: MarketReadCutoffProof,
): void {
  if (cutoffProof === "current_table_replay") {
    return;
  }

  const cutoffMs = Date.parse(sourceCutoffAt);
  const generatedMs = Date.parse(marketRead.generated_at);

  if (generatedMs > cutoffMs) {
    throw new Error("market_read.generated_at is after source_cutoff_at.");
  }

  if (
    marketRead.packet_generated_at &&
    Date.parse(marketRead.packet_generated_at) > cutoffMs
  ) {
    throw new Error("market_read.packet_generated_at is after source_cutoff_at.");
  }
}

function isAdmittedSourceItem(
  item: unknown,
  omittedCounts: Map<string, number>,
): boolean {
  const sourceNames = sourceNamesForItem(item);

  if (sourceNames.length === 0) {
    addOmitted(omittedCounts, "missing_source_name");
    return false;
  }

  const blocked = sourceNames.filter(
    (sourceName) =>
      forbiddenMarketReadSourceNames.has(sourceName) ||
      !admittedMarketReadSourceNames.has(sourceName),
  );

  for (const sourceName of blocked) {
    addOmitted(omittedCounts, renderedOmittedSourceName(sourceName));
  }

  return blocked.length === 0;
}

function renderedOmittedSourceName(sourceName: string): string {
  if (renderableOmittedSourceNames.has(sourceName)) {
    return sourceName;
  }

  return "redacted_unadmitted_or_forbidden_source";
}

function sourceNamesForItem(item: unknown): string[] {
  if (!isRecord(item)) {
    return [];
  }

  const sourceNames = item.source_names;
  if (Array.isArray(sourceNames)) {
    return sourceNames.flatMap((value) => {
      const text = optionalText(value);
      return text ? [text] : [];
    });
  }

  const sourceName = optionalText(item.source_name);
  return sourceName ? [sourceName] : [];
}

function observedPeriodForChange(
  change: unknown,
  base: { observedPeriod: string },
): string {
  if (!isRecord(change)) {
    return base.observedPeriod;
  }

  return optionalText(change.current_period) ?? base.observedPeriod;
}

function pickRecord(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = keys.flatMap((key) =>
    key in value ? [[key, value[key]] as const] : [],
  );

  return Object.fromEntries(entries);
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeJsonValue(value) as Record<string, unknown>;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeJsonValue(entry)]),
    );
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  return String(value);
}

function toOmittedSources(
  omittedCounts: Map<string, number>,
): OmittedMarketReadSource[] {
  return [...omittedCounts.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([sourceName, count]) => ({
      source_name: sourceName,
      count,
      reason: "unadmitted_or_forbidden_source",
    }));
}

function addOmitted(omittedCounts: Map<string, number>, sourceName: string): void {
  omittedCounts.set(sourceName, (omittedCounts.get(sourceName) ?? 0) + 1);
}

function validateCutoffProof(value: string): MarketReadCutoffProof {
  if (MARKET_READ_CUTOFF_PROOFS.includes(value as MarketReadCutoffProof)) {
    return value as MarketReadCutoffProof;
  }

  throw new Error(`Unsupported cutoff_proof: ${value}.`);
}

function validateSourceCutoffDate(sourceCutoffAt: string, asOfDate: string): void {
  const declaredDate = sourceCutoffAt.slice(0, 10);
  const utcDate = new Date(Date.parse(sourceCutoffAt)).toISOString().slice(0, 10);

  if (declaredDate !== asOfDate && utcDate !== asOfDate) {
    throw new Error("source_cutoff_at must use the same calendar date as as_of_date.");
  }
}

function requireIsoDate(value: unknown, fieldName: string): string {
  const text = optionalText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD.`);
  }

  return text;
}

function requireMarketReadCropYear(value: string | null): string {
  if (!value || !/^\d{4}-\d{4}$/.test(value)) {
    throw new Error("market_read.crop_year must use YYYY-YYYY.");
  }

  return value;
}

function requireMarketReadGrainWeek(value: number | null): number {
  if (!Number.isInteger(value) || value === null || value < 1 || value > 53) {
    throw new Error("market_read.grain_week must be an integer from 1 to 53.");
  }

  return value;
}

function requireOffsetDateTime(value: unknown, fieldName: string): string {
  const text = optionalText(value);

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${fieldName} must be an ISO timestamp with timezone offset.`);
  }

  return text;
}

function readArray(value: unknown): never[] {
  return Array.isArray(value) ? (value as never[]) : [];
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
