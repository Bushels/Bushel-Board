import { ALL_GRAINS, type GrainDef } from "@/lib/constants/grains";
import { US_OVERVIEW_MARKETS, type UsMarketDef } from "@/lib/constants/us-markets";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import type { ThesisArtifactV1 } from "@/lib/thesis/artifact-contract";
import { getVikingL2Context, type VikingL2Chunk } from "@/lib/knowledge/viking-l2";

type JsonRecord = Record<string, unknown>;
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ThesisLane = "canada" | "us";
export type ThesisConfidence = "high" | "medium" | "low";
export type ThesisDriverTone = "bull" | "bear";
export type ThesisCountryCode = "CA" | "US";
export type ThesisComparisonStatus =
  | "aligned_bullish"
  | "aligned_bearish"
  | "aligned_balanced"
  | "mixed"
  | "mapping_needed"
  | "canada_only"
  | "us_only";

export interface ThesisDriver {
  tone: ThesisDriverTone;
  title: string;
  body: string;
  sourceName: string;
  confidence: ThesisConfidence;
  metricLabel: string;
}

export interface ThesisFreshnessRow {
  sourceName: string;
  sourceLane: string | null;
  expectedCadence: string | null;
  latestPeriod: string | null;
  latestPeriodEnd: string | null;
  rowsAvailable: number | null;
  freshnessStatus: string;
  thesisUse: string | null;
  lastSuccessAt: string | null;
  lastRunStatus: string | null;
  actionHint: string | null;
}

export interface ThesisWarning {
  sourceName: string;
  status: string;
  actionHint: string | null;
  severity: "info" | "watch" | "blocker";
}

export type ThesisSourceHealthCategory = "core_public" | "optional_local";

export interface ThesisSourceHealthEntry {
  sourceName: string;
  category: ThesisSourceHealthCategory;
  statuses: string[];
  itemCount: number;
}

export interface ThesisSourceHealthSummary {
  strongSourceCount: number;
  watchSourceInstanceCount: number;
  uniqueWatchSourceCount: number;
  optionalSourceCount: number;
  uniqueWatchSources: ThesisSourceHealthEntry[];
  optionalSources: ThesisSourceHealthEntry[];
}

export interface ThesisSourceHealthReadInput {
  blockerCount: number;
  uniqueWatchSourceCount: number;
  watchSourceInstanceCount: number;
}

export interface ThesisSourceHealthRead {
  title: string;
  description: string;
  tone: "clean" | "watch" | "blocker";
}

export interface ThesisBoardItem {
  id: string;
  lane: ThesisLane;
  name: string;
  slug: string;
  cropYear: string | null;
  grainWeek: number | null;
  marketYear: number | null;
  packetGeneratedAt: string | null;
  stanceScore: number;
  stanceLabel: string;
  confidence: ThesisConfidence;
  confidenceScore: number;
  bullCase: string;
  bearCase: string;
  bullDrivers: ThesisDriver[];
  bearDrivers: ThesisDriver[];
  freshness: ThesisFreshnessRow[];
  warnings: ThesisWarning[];
  sourceCount: number;
  strongSourceCount: number;
  staleSourceCount: number;
  optionalSourceCount: number;
  vikingL2Chunks: VikingL2Chunk[];
}

export interface ThesisComparisonPoint {
  country: ThesisCountryCode;
  tone: ThesisDriverTone;
  title: string;
  body: string;
  sourceName: string;
  confidence: ThesisConfidence;
  metricLabel: string;
}

export interface ThesisComparisonRow {
  grain: string;
  canada: ThesisBoardItem | null;
  us: ThesisBoardItem | null;
  status: ThesisComparisonStatus;
  statusLabel: string;
  readinessLabel: string;
  readinessDetail: string;
  explanation: string;
  strongestBullPoints: ThesisComparisonPoint[];
  strongestBearPoints: ThesisComparisonPoint[];
}

export interface ThesisBoardData {
  generatedAt: string;
  packetMode: "cached" | "live_rpc_fallback";
  cacheStatus: "fresh" | "stale" | "fallback";
  sourceRunWatermark: string | null;
  latestAvailableSourceRunAt: string | null;
  cacheItemCount: number;
  canadaItems: ThesisBoardItem[];
  usItems: ThesisBoardItem[];
  comparisonRows: ThesisComparisonRow[];
  totals: {
    itemCount: number;
    strongSourceCount: number;
    staleSourceCount: number;
    watchSourceInstanceCount: number;
    uniqueWatchSourceCount: number;
    optionalSourceCount: number;
    blockerCount: number;
  };
  sourceHealth: ThesisSourceHealthSummary;
}

// Canonical frozen artifact contract alignment for upcoming roundtable publish path.
// The thesis board view remains packet-derived today, but this alias keeps both lanes type-linked.
export type CanonicalThesisArtifact = ThesisArtifactV1;

export const THESIS_BOARD_V1_GRAIN_LANES = [
  "Corn",
  "Soybeans",
  "Wheat",
  "Spring Wheat",
  "Winter Wheat",
  "Durum",
  "Canola",
  "Barley",
  "Oats",
] as const;

type ThesisBoardV1LaneSource = {
  lane: (typeof THESIS_BOARD_V1_GRAIN_LANES)[number];
  canadaSourceName?: string;
  usSourceName?: string;
  placeholderReason?: "source mapping needed";
};

const THESIS_BOARD_V1_LANE_SOURCE_MAP: readonly ThesisBoardV1LaneSource[] = [
  { lane: "Corn", canadaSourceName: "Corn", usSourceName: "Corn" },
  { lane: "Soybeans", canadaSourceName: "Soybeans", usSourceName: "Soybeans" },
  { lane: "Wheat", canadaSourceName: "Wheat", usSourceName: "Wheat" },
  { lane: "Spring Wheat", placeholderReason: "source mapping needed" },
  { lane: "Winter Wheat", placeholderReason: "source mapping needed" },
  { lane: "Durum", canadaSourceName: "Amber Durum" },
  { lane: "Canola", canadaSourceName: "Canola" },
  { lane: "Barley", canadaSourceName: "Barley", usSourceName: "Barley" },
  { lane: "Oats", canadaSourceName: "Oats", usSourceName: "Oats" },
];

export const THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES = THESIS_BOARD_V1_LANE_SOURCE_MAP.map(
  (lane) => lane.canadaSourceName,
).filter((name): name is string => Boolean(name));

export const THESIS_BOARD_MAJOR_US_MARKET_NAMES = THESIS_BOARD_V1_LANE_SOURCE_MAP.map(
  (lane) => lane.usSourceName,
).filter((name): name is string => Boolean(name));

const MAJOR_CANADA_GRAIN_NAMES = new Set<string>(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES);
const MAJOR_US_MARKET_NAMES = new Set<string>(THESIS_BOARD_MAJOR_US_MARKET_NAMES);
const SOURCE_MAPPING_NEEDED_LANES = new Set<string>(
  THESIS_BOARD_V1_LANE_SOURCE_MAP.filter((lane) => lane.placeholderReason).map((lane) => lane.lane),
);

const OPTIONAL_LOCAL_THESIS_SOURCES = new Set([
  "crop_plan_deliveries",
  "crop_plans",
  "posted_prices",
  "weather_cache",
]);

function sourceHealthCategory(sourceName: string): ThesisSourceHealthCategory {
  return OPTIONAL_LOCAL_THESIS_SOURCES.has(sourceName) ? "optional_local" : "core_public";
}

function isOptionalLocalSource(sourceName: string): boolean {
  return sourceHealthCategory(sourceName) === "optional_local";
}

function isStrongStatus(status: string): boolean {
  return status.toLowerCase() === "strong";
}

function isWatchStatus(status: string): boolean {
  return !isStrongStatus(status);
}

export const EXPECTED_THESIS_BOARD_PACKET_COUNT =
  THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES.length + THESIS_BOARD_MAJOR_US_MARKET_NAMES.length;

export function isMajorCanadaThesisGrain(name: string): boolean {
  return MAJOR_CANADA_GRAIN_NAMES.has(name);
}

export function isMajorUsThesisMarket(name: string): boolean {
  return MAJOR_US_MARKET_NAMES.has(name);
}

export function getMajorCanadaThesisGrains(): GrainDef[] {
  return THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES.map((name) =>
    ALL_GRAINS.find((grain) => grain.name === name),
  ).filter((grain): grain is GrainDef => Boolean(grain));
}

export function getMajorUsThesisMarkets(): UsMarketDef[] {
  return US_OVERVIEW_MARKETS.filter((market) => isMajorUsThesisMarket(market.name));
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function textValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatKt(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toLocaleString("en-CA", {
    maximumFractionDigits: 1,
  })} kt`;
}

function formatMt(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })} mt`;
}

function formatPct(value: number | null): string {
  if (value === null) return "not available";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatMillionAcres(value: number | null): string {
  if (value === null) return "not available";
  return `${(value / 1_000_000).toFixed(1)}M ac`;
}

function formatKtDelta(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toLocaleString("en-CA", {
    maximumFractionDigits: 0,
  })} kt`;
}

function formatMtDelta(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })} mt`;
}

function wasdeRevisionWindow(wasde: JsonRecord): string {
  const previous = textValue(wasde, "previous_report_month");
  const current = textValue(wasde, "report_month");
  if (previous && current) return ` from ${previous} to ${current}`;
  if (current) return ` in the ${current} WASDE row`;
  return " in the latest mapped WASDE rows";
}

function formatPrice(value: number | null, currency: string | null, unit: string | null): string {
  if (value === null) return "not available";
  const prefix = currency === "USD" || currency === "CAD" ? `${currency} ` : "";
  const suffix = unit ? `/${unit}` : "";
  return `${prefix}${value.toLocaleString("en-CA", {
    maximumFractionDigits: 2,
  })}${suffix}`;
}

function statusSeverity(sourceName: string, status: string): "info" | "watch" | "blocker" {
  if (isOptionalLocalSource(sourceName)) return "info";
  const normalized = status.toLowerCase();
  if (normalized === "broken" || normalized === "empty") return "blocker";
  if (normalized.includes("stale") || normalized === "legacy" || normalized === "failed") {
    return "watch";
  }
  return "info";
}

function sourceFreshnessThresholdDays(sourceName: string): { strong: number; stale: number } {
  switch (sourceName) {
    case "cgc_observations":
    case "cgc_imports":
      return { strong: 10, stale: 17 };
    case "usda_crop_progress":
    case "canada_crop_progress":
    case "cftc_cot_positions":
      return { strong: 10, stale: 17 };
    case "usda_export_sales":
      return { strong: 14, stale: 21 };
    case "usda_wasde_mapped":
    case "usda_wasde_raw":
      return { strong: 45, stale: 75 };
    case "usda_quarterly_stocks":
      return { strong: 100, stale: 125 };
    case "crop_acreage_estimates":
      return { strong: 365, stale: 455 };
    case "grain_prices":
      return { strong: 3, stale: 7 };
    default:
      return { strong: 30, stale: 60 };
  }
}

function coerceFreshnessStatus(row: ThesisFreshnessRow): ThesisFreshnessRow {
  if (row.freshnessStatus !== "empty" || !row.latestPeriodEnd) return row;

  const periodEnd = new Date(`${row.latestPeriodEnd}T00:00:00Z`);
  if (Number.isNaN(periodEnd.getTime())) return row;

  const now = new Date();
  const ageDays = Math.max(
    0,
    Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - periodEnd.getTime()) / 86_400_000),
  );
  const thresholds = sourceFreshnessThresholdDays(row.sourceName);
  const freshnessStatus =
    ageDays <= thresholds.strong
      ? "strong"
      : ageDays <= thresholds.stale
        ? "usable but stale-risk"
        : "usable but stale-risk";

  return {
    ...row,
    freshnessStatus,
    actionHint:
      freshnessStatus === "strong"
        ? "No immediate action."
        : "Latest row exists, but source age should be reviewed before thesis generation.",
  };
}

function normalizeFreshness(packet: JsonRecord): ThesisFreshnessRow[] {
  return asArray(packet.freshness)
    .map((row) => ({
      sourceName: textValue(row, "source_name") ?? "unknown",
      sourceLane: textValue(row, "source_lane"),
      expectedCadence: textValue(row, "expected_cadence"),
      latestPeriod: textValue(row, "latest_period"),
      latestPeriodEnd: textValue(row, "latest_period_end"),
      rowsAvailable: numberValue(row, "rows_available"),
      freshnessStatus: textValue(row, "freshness_status") ?? "unknown",
      thesisUse: textValue(row, "thesis_use"),
      lastSuccessAt: textValue(row, "last_success_at"),
      lastRunStatus: textValue(row, "last_run_status"),
      actionHint: textValue(row, "action_hint"),
    }))
    .map(coerceFreshnessStatus);
}

function normalizeWarnings(packet: JsonRecord, freshness: ThesisFreshnessRow[]): ThesisWarning[] {
  return asArray(packet.quality_warnings)
    .map((row) => {
      const sourceName = textValue(row, "source_name") ?? "unknown";
      const freshnessRow = freshness.find((source) => source.sourceName === sourceName);
      const status = freshnessRow?.freshnessStatus ?? textValue(row, "status") ?? "unknown";
      return {
        sourceName,
        status,
        actionHint: freshnessRow?.actionHint ?? textValue(row, "action_hint"),
        severity: statusSeverity(sourceName, status),
      };
    })
    .filter((warning) => !isStrongStatus(warning.status));
}

function confidenceFromFreshness(
  freshness: ThesisFreshnessRow[],
  warnings: ThesisWarning[],
): { confidence: ThesisConfidence; score: number } {
  const blockers = warnings.filter((warning) => warning.severity === "blocker").length;
  const watch = warnings.filter((warning) => warning.severity === "watch").length;
  const stale = freshness.filter(
    (row) => !isOptionalLocalSource(row.sourceName) && isWatchStatus(row.freshnessStatus),
  ).length;
  const score = Math.max(20, Math.min(90, 82 - blockers * 22 - watch * 10 - stale * 4));
  if (score >= 70) return { confidence: "high", score };
  if (score >= 45) return { confidence: "medium", score };
  return { confidence: "low", score };
}

function sourceConfidence(
  requested: ThesisConfidence,
  sourceName: string,
  freshness: ThesisFreshnessRow[],
): ThesisConfidence {
  const status = freshness
    .find((row) => row.sourceName === sourceName)
    ?.freshnessStatus.toLowerCase();
  return status === "strong" ? requested : "low";
}

function latestNationalAcreage(acreageRows: JsonRecord[]): JsonRecord | null {
  const rows = acreageRows
    .filter((row) => textValue(row, "region_code")?.toUpperCase() === "US TOTAL")
    .filter((row) => numberValue(row, "planted_acres") !== null)
    .sort((a, b) => {
      const dateCompare = String(textValue(b, "source_release_date") ?? "").localeCompare(
        String(textValue(a, "source_release_date") ?? ""),
      );
      if (dateCompare !== 0) return dateCompare;
      return String(textValue(b, "source_program") ?? "").localeCompare(
        String(textValue(a, "source_program") ?? ""),
      );
    });
  return rows[0] ?? null;
}

function acreagePlantingContext(
  acreageRow: JsonRecord | null,
  plantedVsAvg: number,
): { sourceName: string; metricLabel: string; bodySuffix: string } {
  const plantedAcres = acreageRow ? numberValue(acreageRow, "planted_acres") : null;
  const releaseDate = acreageRow ? textValue(acreageRow, "source_release_date") : null;
  if (plantedAcres === null) {
    return {
      sourceName: "usda_crop_progress",
      metricLabel: `${formatPct(plantedVsAvg)} versus average`,
      bodySuffix: "",
    };
  }

  return {
    sourceName: "usda_crop_progress + crop_acreage_estimates",
    metricLabel: `${formatMillionAcres(plantedAcres)}; ${formatPct(plantedVsAvg)} vs avg`,
    bodySuffix: ` against a ${formatMillionAcres(plantedAcres).replace(" ac", "")} planted acre base${
      releaseDate ? ` from ${releaseDate}` : ""
    }`,
  };
}

function latestCanadaProvinceSeededRows(rows: JsonRecord[]): JsonRecord[] {
  const byProvince = new Map<string, JsonRecord>();
  for (const row of rows) {
    if (textValue(row, "metric") !== "seeded_pct") continue;
    if (textValue(row, "region_scope") !== "province") continue;
    if (numberValue(row, "value_pct") === null) continue;
    const province = textValue(row, "province_code");
    if (!province) continue;
    const existing = byProvince.get(province);
    if (!existing) {
      byProvince.set(province, row);
      continue;
    }
    const existingDate = textValue(existing, "report_date") ?? "";
    const rowDate = textValue(row, "report_date") ?? "";
    if (rowDate.localeCompare(existingDate) > 0) byProvince.set(province, row);
  }
  return Array.from(byProvince.values());
}

function averageCanadaSeededPct(rows: JsonRecord[]): number | null {
  const seeded = rows
    .map((row) => numberValue(row, "value_pct"))
    .filter((value): value is number => value !== null);
  if (seeded.length === 0) return null;
  return seeded.reduce((sum, value) => sum + value, 0) / seeded.length;
}

function latestCanadaCropProgressDate(rows: JsonRecord[]): string | null {
  return rows
    .map((row) => textValue(row, "report_date"))
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function canadaCropProgressSummary(rows: JsonRecord[]): string {
  return rows
    .map((row) => {
      const province = textValue(row, "province_code") ?? "?";
      const value = numberValue(row, "value_pct");
      return `${province} ${value !== null ? value.toFixed(1) : "n/a"}%`;
    })
    .join(", ");
}

function ratioPct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function exportProjectionPacePct(exportSales: JsonRecord): number | null {
  // Projection pace is an importer-admitted field. Do not recompute it in the UI
  // from total commitments and a projection value, because that bypasses the
  // commodity/year/report-month/unit/60-140% guardrails in import-usda-export-sales.py.
  return numberValue(exportSales, "export_pace_pct");
}

function addDriver(
  drivers: ThesisDriver[],
  driver: Omit<ThesisDriver, "confidence"> & { confidence?: ThesisConfidence },
): void {
  drivers.push({
    confidence: driver.confidence ?? "medium",
    ...driver,
  });
}

function stanceLabel(score: number): string {
  if (score >= 60) return "Strong bull tilt";
  if (score >= 20) return "Bull tilt";
  if (score > 0) return "Lean bull";
  if (score <= -60) return "Strong bear tilt";
  if (score <= -20) return "Bear tilt";
  if (score < 0) return "Lean bear";
  return "Balanced";
}

function scoreDrivers(bullDrivers: ThesisDriver[], bearDrivers: ThesisDriver[]): number {
  const weight = (driver: ThesisDriver) =>
    driver.confidence === "high" ? 18 : driver.confidence === "medium" ? 12 : 7;
  const bull = bullDrivers.reduce((total, driver) => total + weight(driver), 0);
  const bear = bearDrivers.reduce((total, driver) => total + weight(driver), 0);
  return Math.max(-100, Math.min(100, bull - bear));
}

function caseSummary(label: string, drivers: ThesisDriver[]): string {
  if (drivers.length === 0) {
    return `No clear ${label.toLowerCase()} driver in the current packet.`;
  }
  return drivers
    .slice(0, 2)
    .map((driver) => `${driver.title}: ${driver.metricLabel}`)
    .join(" | ");
}

function sourceCounts(freshness: ThesisFreshnessRow[]) {
  const publicRows = freshness.filter((row) => !isOptionalLocalSource(row.sourceName));
  const optionalSourceCount = freshness.filter((row) => isOptionalLocalSource(row.sourceName)).length;
  const strongSourceCount = publicRows.filter((row) => isStrongStatus(row.freshnessStatus)).length;
  const staleSourceCount = publicRows.filter((row) => isWatchStatus(row.freshnessStatus)).length;
  return {
    sourceCount: freshness.length,
    strongSourceCount,
    staleSourceCount,
    optionalSourceCount,
  };
}

export function buildSourceHealthRead(totals: ThesisSourceHealthReadInput): ThesisSourceHealthRead {
  if (totals.blockerCount > 0) {
    return {
      title: "Source blockers need repair before a clean read",
      description: `${totals.blockerCount} blocker${totals.blockerCount === 1 ? "" : "s"} need repair before treating this as a source-clean read.`,
      tone: "blocker",
    };
  }
  if (totals.uniqueWatchSourceCount === 0) {
    return {
      title: "Source health is clean for this board",
      description: "All rendered public source groups are currently clean.",
      tone: "clean",
    };
  }
  return {
    title: "Usable board with cadence-lagged sources",
    description: `No source blockers; ${totals.uniqueWatchSourceCount} source group${totals.uniqueWatchSourceCount === 1 ? " is" : "s are"} cadence-lagged or stale-risk across ${totals.watchSourceInstanceCount} packet rows.`,
    tone: "watch",
  };
}

export function buildSourceHealthSummary(items: ThesisBoardItem[]): ThesisSourceHealthSummary {
  const watchBySource = new Map<string, ThesisSourceHealthEntry>();
  const optionalBySource = new Map<string, ThesisSourceHealthEntry>();
  let strongSourceCount = 0;
  let watchSourceInstanceCount = 0;
  let optionalSourceCount = 0;

  const addEntry = (
    map: Map<string, ThesisSourceHealthEntry>,
    sourceName: string,
    category: ThesisSourceHealthCategory,
    status: string,
  ) => {
    const current = map.get(sourceName) ?? {
      sourceName,
      category,
      statuses: [],
      itemCount: 0,
    };
    current.itemCount += 1;
    if (!current.statuses.includes(status)) {
      current.statuses = [...current.statuses, status].sort();
    }
    map.set(sourceName, current);
  };

  for (const item of items) {
    for (const row of item.freshness) {
      if (isOptionalLocalSource(row.sourceName)) {
        optionalSourceCount += 1;
        addEntry(optionalBySource, row.sourceName, "optional_local", row.freshnessStatus);
        continue;
      }
      if (isStrongStatus(row.freshnessStatus)) {
        strongSourceCount += 1;
      } else {
        watchSourceInstanceCount += 1;
        addEntry(watchBySource, row.sourceName, "core_public", row.freshnessStatus);
      }
    }
  }

  const sortEntries = (entries: ThesisSourceHealthEntry[]) =>
    entries.sort((a, b) => b.itemCount - a.itemCount || a.sourceName.localeCompare(b.sourceName));

  const uniqueWatchSources = sortEntries([...watchBySource.values()]);
  return {
    strongSourceCount,
    watchSourceInstanceCount,
    uniqueWatchSourceCount: uniqueWatchSources.length,
    optionalSourceCount,
    uniqueWatchSources,
    optionalSources: sortEntries([...optionalBySource.values()]),
  };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryStatementTimeout<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let lastResult: { data: T | null; error: { message: string } | null } | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await operation();
    lastResult = result;
    const message = result.error?.message ?? "";
    if (!message.includes("statement timeout")) return result;
    await wait(250);
  }

  return lastResult ?? { data: null, error: { message: "Unknown packet RPC failure" } };
}

export function buildCanadaThesisBoardItem(
  grain: GrainDef,
  packetInput: unknown,
): ThesisBoardItem {
  const packet = asRecord(packetInput);
  const demand = asRecord(packet.demand);
  const currentDelivery = asRecord(demand.producer_deliveries_current_week);
  const exports = asRecord(demand.exports);
  const supply = asRecord(packet.supply);
  const cropProgressRows = latestCanadaProvinceSeededRows(asArray(supply.canada_crop_progress));
  const logistics = asRecord(packet.logistics);
  const grainMonitor = asRecord(logistics.grain_monitor);
  const prices = asArray(packet.prices);
  const positioning = asArray(packet.positioning);
  const freshness = normalizeFreshness(packet);

  const bullDrivers: ThesisDriver[] = [];
  const bearDrivers: ThesisDriver[] = [];

  const deliveryKt = numberValue(currentDelivery, "total_kt");
  const exportKt = numberValue(exports, "current_week_kt");
  const processKt = numberValue(currentDelivery, "process_deliveries_kt");
  const exportShare = ratioPct(exportKt, deliveryKt);
  const processShare = ratioPct(processKt, deliveryKt);

  if (exportShare !== null) {
    if (exportShare >= 45) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Export pull visible",
        body: `Current-week exports are ${formatKt(exportKt)} against ${formatKt(deliveryKt)} of producer deliveries.`,
        sourceName: "cgc_observations",
        metricLabel: `${formatPct(exportShare)} of weekly deliveries`,
        confidence: sourceConfidence("high", "cgc_observations", freshness),
      });
    } else if (exportShare <= 20) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Export pull light",
        body: `Current-week exports are only ${formatKt(exportKt)} against ${formatKt(deliveryKt)} of producer deliveries.`,
        sourceName: "cgc_observations",
        metricLabel: `${formatPct(exportShare)} of weekly deliveries`,
        confidence: sourceConfidence("high", "cgc_observations", freshness),
      });
    }
  }

  if (processShare !== null) {
    if (processShare >= 30) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Domestic processing support",
        body: `Process deliveries are ${formatKt(processKt)} in the packet, keeping domestic demand visible beside exports.`,
        sourceName: "cgc_observations",
        metricLabel: `${formatPct(processShare)} of weekly deliveries`,
        confidence: sourceConfidence("high", "cgc_observations", freshness),
      });
    } else if (processShare <= 10) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Domestic processing thin",
        body: `Process deliveries are ${formatKt(processKt)} in the packet, so domestic demand is not offsetting weak export pull in this read.`,
        sourceName: "cgc_observations",
        metricLabel: `${formatPct(processShare)} of weekly deliveries`,
        confidence: sourceConfidence("medium", "cgc_observations", freshness),
      });
    }
  }

  const totalSupply = numberValue(supply, "total_supply_kt");
  const carryOut = numberValue(supply, "carry_out_kt");
  const carryOutShare = ratioPct(carryOut, totalSupply);
  if (carryOutShare !== null) {
    if (carryOutShare <= 8) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Tight carryout context",
        body: `Carryout is ${formatKt(carryOut)} against ${formatKt(totalSupply)} of total supply in the supply-disposition row.`,
        sourceName: "supply_disposition",
        metricLabel: `${formatPct(carryOutShare)} of total supply`,
        confidence: sourceConfidence("medium", "supply_disposition", freshness),
      });
    } else if (carryOutShare >= 18) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Heavy carryout context",
        body: `Carryout is ${formatKt(carryOut)} against ${formatKt(totalSupply)} of total supply in the supply-disposition row.`,
        sourceName: "supply_disposition",
        metricLabel: `${formatPct(carryOutShare)} of total supply`,
        confidence: sourceConfidence("medium", "supply_disposition", freshness),
      });
    }
  }

  const seededPct = averageCanadaSeededPct(cropProgressRows);
  if (seededPct !== null) {
    const reportDate = latestCanadaCropProgressDate(cropProgressRows);
    const provinceSummary = canadaCropProgressSummary(cropProgressRows);
    if (seededPct <= 25) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Canadian seeding delay risk",
        body: `Provincial crop-progress rows show ${grain.name} seeding only ${formatPct(seededPct)} complete on average${
          reportDate ? ` as of ${reportDate}` : ""
        }${provinceSummary ? ` (${provinceSummary})` : ""}.`,
        sourceName: "canada_crop_progress",
        metricLabel: `${formatPct(seededPct)} seeded avg`,
        confidence: sourceConfidence("medium", "canada_crop_progress", freshness),
      });
    } else if (seededPct >= 75) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Canadian seeding progress cushions supply",
        body: `Provincial crop-progress rows show ${grain.name} seeding ${formatPct(seededPct)} complete on average${
          reportDate ? ` as of ${reportDate}` : ""
        }${provinceSummary ? ` (${provinceSummary})` : ""}.`,
        sourceName: "canada_crop_progress",
        metricLabel: `${formatPct(seededPct)} seeded avg`,
        confidence: sourceConfidence("medium", "canada_crop_progress", freshness),
      });
    }
  }

  const latestPrice = prices[0] ?? {};
  const priceChangePct = numberValue(latestPrice, "change_pct");
  const price = numberValue(latestPrice, "settlement_price");
  if (priceChangePct !== null) {
    if (priceChangePct >= 0.5) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Futures follow-through",
        body: `The latest packet price sample is ${formatPrice(
          price,
          textValue(latestPrice, "currency"),
          textValue(latestPrice, "unit"),
        )} on ${textValue(latestPrice, "price_date") ?? "unknown date"}.`,
        sourceName: "grain_prices",
        metricLabel: formatPct(priceChangePct),
        confidence: sourceConfidence("medium", "grain_prices", freshness),
      });
    } else if (priceChangePct <= -0.5) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Futures pressure",
        body: `The latest packet price sample is ${formatPrice(
          price,
          textValue(latestPrice, "currency"),
          textValue(latestPrice, "unit"),
        )} on ${textValue(latestPrice, "price_date") ?? "unknown date"}.`,
        sourceName: "grain_prices",
        metricLabel: formatPct(priceChangePct),
        confidence: sourceConfidence("medium", "grain_prices", freshness),
      });
    }
  }

  const terminalCapacity = numberValue(grainMonitor, "terminal_capacity_pct");
  if (terminalCapacity !== null) {
    if (terminalCapacity >= 85) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Logistics congestion risk",
        body: "Grain Monitor terminal capacity is high, so exports can lag even when demand exists.",
        sourceName: "grain_monitor_snapshots",
        metricLabel: `${terminalCapacity.toFixed(1)}% terminal capacity`,
        confidence: sourceConfidence("medium", "grain_monitor_snapshots", freshness),
      });
    } else if (terminalCapacity <= 65) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Logistics room available",
        body: "Grain Monitor terminal capacity is not flashing congestion in the latest packet row.",
        sourceName: "grain_monitor_snapshots",
        metricLabel: `${terminalCapacity.toFixed(1)}% terminal capacity`,
        confidence: sourceConfidence("medium", "grain_monitor_snapshots", freshness),
      });
    }
  }

  const primaryPosition = positioning.find((row) => textValue(row, "mapping_type") === "primary");
  if (primaryPosition) {
    const mmLong = numberValue(primaryPosition, "managed_money_long");
    const mmShort = numberValue(primaryPosition, "managed_money_short");
    const changeLong = numberValue(primaryPosition, "change_managed_money_long");
    const changeShort = numberValue(primaryPosition, "change_managed_money_short");

    if (mmLong !== null && mmShort !== null) {
      const net = mmLong - mmShort;
      const wow = changeLong !== null && changeShort !== null ? changeLong - changeShort : null;
      if (net > 0 && (wow === null || wow >= 0)) {
        addDriver(bullDrivers, {
          tone: "bull",
          title: "Managed money support",
          body: `Managed money is net long in the primary positioning row for ${grain.name}.`,
          sourceName: "cftc_cot_positions",
          metricLabel: `${net.toLocaleString("en-CA")} net contracts`,
          confidence: sourceConfidence("medium", "cftc_cot_positions", freshness),
        });
      } else if (net < 0 || (wow !== null && wow < 0)) {
        addDriver(bearDrivers, {
          tone: "bear",
          title: "Positioning pressure",
          body: `The primary positioning row is not adding support for ${grain.name}.`,
          sourceName: "cftc_cot_positions",
          metricLabel: `${net.toLocaleString("en-CA")} net contracts`,
          confidence: sourceConfidence("medium", "cftc_cot_positions", freshness),
        });
      }
    }
  }

  const warnings = normalizeWarnings(packet, freshness);
  const confidence = confidenceFromFreshness(freshness, warnings);
  const stanceScore = scoreDrivers(bullDrivers, bearDrivers);

  return {
    id: `ca-${grain.slug}`,
    lane: "canada",
    name: grain.name,
    slug: grain.slug,
    cropYear: textValue(packet, "crop_year"),
    grainWeek: numberValue(packet, "grain_week"),
    marketYear: null,
    packetGeneratedAt: textValue(packet, "packet_generated_at"),
    stanceScore,
    stanceLabel: stanceLabel(stanceScore),
    confidence: confidence.confidence,
    confidenceScore: confidence.score,
    bullCase: caseSummary("Bull", bullDrivers),
    bearCase: caseSummary("Bear", bearDrivers),
    bullDrivers,
    bearDrivers,
    freshness,
    warnings,
    vikingL2Chunks: [],
    ...sourceCounts(freshness),
  };
}

export function buildUsThesisBoardItem(
  market: UsMarketDef,
  packetInput: unknown,
): ThesisBoardItem {
  const packet = asRecord(packetInput);
  const supply = asRecord(packet.supply);
  const cropProgress = asRecord(supply.crop_progress);
  const usTotal = asRecord(cropProgress.us_total);
  const demand = asRecord(packet.demand);
  const exportSales = asRecord(demand.export_sales);
  const wasde = asRecord(supply.wasde);
  const demandWasde = asRecord(demand.wasde);
  const quarterlyStocks = asRecord(supply.quarterly_stocks);
  const acreage = latestNationalAcreage(asArray(supply.acreage));
  const prices = asArray(packet.prices);
  const positioning = asArray(packet.positioning);
  const freshness = normalizeFreshness(packet);

  const bullDrivers: ThesisDriver[] = [];
  const bearDrivers: ThesisDriver[] = [];

  const goodExcellent = numberValue(usTotal, "good_excellent_pct");
  const geYoy = numberValue(usTotal, "ge_pct_yoy_change");
  const plantedVsAvg = numberValue(usTotal, "planted_pct_vs_avg");

  if (goodExcellent !== null) {
    if (goodExcellent <= 50 || (geYoy !== null && geYoy <= -8)) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "US crop stress supports price",
        body: `US total good/excellent is ${goodExcellent.toFixed(1)}%${
          geYoy !== null ? `, ${formatPct(geYoy)} versus last year` : ""
        }.`,
        sourceName: "usda_crop_progress",
        metricLabel: `${goodExcellent.toFixed(1)}% good/excellent`,
        confidence: sourceConfidence("high", "usda_crop_progress", freshness),
      });
    } else if (goodExcellent >= 70 || (geYoy !== null && geYoy >= 8)) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "US crop condition adds supply pressure",
        body: `US total good/excellent is ${goodExcellent.toFixed(1)}%${
          geYoy !== null ? `, ${formatPct(geYoy)} versus last year` : ""
        }.`,
        sourceName: "usda_crop_progress",
        metricLabel: `${goodExcellent.toFixed(1)}% good/excellent`,
        confidence: sourceConfidence("high", "usda_crop_progress", freshness),
      });
    }
  }

  if (plantedVsAvg !== null) {
    const plantingContext = acreagePlantingContext(acreage, plantedVsAvg);
    if (plantedVsAvg <= -5) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Planting pace risk",
        body: `The latest US crop progress row shows planting behind normal pace${plantingContext.bodySuffix}.`,
        sourceName: plantingContext.sourceName,
        metricLabel: plantingContext.metricLabel,
        confidence: sourceConfidence("medium", "usda_crop_progress", freshness),
      });
    } else if (plantedVsAvg >= 5) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Planting pace comfortable",
        body: `The latest US crop progress row shows planting ahead of normal pace${plantingContext.bodySuffix}.`,
        sourceName: plantingContext.sourceName,
        metricLabel: plantingContext.metricLabel,
        confidence: sourceConfidence("medium", "usda_crop_progress", freshness),
      });
    }
  }

  const netSales = numberValue(exportSales, "net_sales_mt");
  const exportPace = exportProjectionPacePct(exportSales);
  if (netSales !== null) {
    if (netSales > 0 && exportPace !== null && exportPace >= 95) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Export sales demand",
        body: `Latest weekly net sales are ${formatMt(netSales)}${
          exportPace !== null ? ` with export pace at ${exportPace.toFixed(1)}%` : ""
        }.`,
        sourceName: "usda_export_sales",
        metricLabel: formatMt(netSales),
        confidence: sourceConfidence("high", "usda_export_sales", freshness),
      });
    } else if (netSales < 0 || (exportPace !== null && exportPace <= 80)) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Export sales drag",
        body: `Latest weekly net sales are ${formatMt(netSales)}${
          exportPace !== null ? ` with export pace at ${exportPace.toFixed(1)}%` : ""
        }.`,
        sourceName: "usda_export_sales",
        metricLabel: formatMt(netSales),
        confidence: sourceConfidence("high", "usda_export_sales", freshness),
      });
    }
  }

  const stocksToUse = numberValue(wasde, "stocks_to_use_pct");
  const endingStocksDirection = textValue(wasde, "ending_stocks_direction");
  const endingStocksMmt = numberValue(wasde, "ending_stocks_mmt");
  if (stocksToUse !== null || endingStocksDirection) {
    if (endingStocksDirection === "down" || (stocksToUse !== null && stocksToUse <= 10)) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "WASDE balance tightening",
        body: `Ending stocks are ${endingStocksMmt !== null ? `${endingStocksMmt.toFixed(2)} mmt` : "available"} in the latest mapped WASDE row.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: stocksToUse !== null ? `${stocksToUse.toFixed(1)}% stocks/use` : "ending stocks down",
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    } else if (endingStocksDirection === "up" || (stocksToUse !== null && stocksToUse >= 20)) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "WASDE balance loosening",
        body: `Ending stocks are ${endingStocksMmt !== null ? `${endingStocksMmt.toFixed(2)} mmt` : "available"} in the latest mapped WASDE row.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: stocksToUse !== null ? `${stocksToUse.toFixed(1)}% stocks/use` : "ending stocks up",
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    }
  }

  const endingStocksChangeKt = numberValue(wasde, "ending_stocks_change_kt");
  const exportsChangeKt = numberValue(demandWasde, "exports_change_kt") ?? numberValue(wasde, "exports_change_kt");
  const crushChangeKt = numberValue(demandWasde, "crush_change_kt") ?? numberValue(wasde, "crush_change_kt");
  const domesticConsumptionChangeKt =
    numberValue(demandWasde, "domestic_consumption_change_kt") ??
    numberValue(wasde, "domestic_consumption_change_kt");
  const demandChangeKt = crushChangeKt ?? domesticConsumptionChangeKt;
  const revisionWindow = wasdeRevisionWindow(wasde);
  const exportProjectionMt = numberValue(exportSales, "usda_projection_mt");
  const exportCommitmentsMt = numberValue(exportSales, "total_commitments_mt");

  if (exportPace !== null && (exportProjectionMt !== null || exportCommitmentsMt !== null)) {
    const metricLabel = `${formatPct(exportPace)} of WASDE export projection`;
    const commitmentsCopy =
      exportCommitmentsMt !== null && exportProjectionMt !== null
        ? `${formatMtDelta(exportCommitmentsMt)} committed versus ${formatMtDelta(exportProjectionMt)} projected`
        : `export pace at ${exportPace.toFixed(1)}%`;

    if (exportPace >= 102) {
      addDriver(bullDrivers, {
        tone: "bull",
        title:
          exportsChangeKt !== null && exportsChangeKt <= -500
            ? "Export sales challenge WASDE export cut"
            : exportsChangeKt !== null && exportsChangeKt >= 500
              ? "Export sales confirm raised WASDE projection"
              : "Export sales outrunning WASDE projection",
        body: `USDA export-sales commitments are running ahead of the WASDE export target: ${commitmentsCopy}${
          exportsChangeKt !== null
            ? `, while WASDE exports changed ${formatKtDelta(exportsChangeKt)}${revisionWindow}`
            : ""
        }.`,
        sourceName: "usda_export_sales + usda_wasde_mapped",
        metricLabel,
        confidence: sourceConfidence("high", "usda_export_sales", freshness),
      });
    } else if (exportPace <= 85) {
      addDriver(bearDrivers, {
        tone: "bear",
        title:
          exportsChangeKt !== null && exportsChangeKt >= 500
            ? "Export sales execution risk against WASDE raise"
            : exportsChangeKt !== null && exportsChangeKt <= -500
              ? "Export sales confirm WASDE export cut"
              : "Export sales lag WASDE projection",
        body: `USDA export-sales commitments are lagging the WASDE export target: ${commitmentsCopy}${
          exportsChangeKt !== null
            ? `, while WASDE exports changed ${formatKtDelta(exportsChangeKt)}${revisionWindow}`
            : ""
        }.`,
        sourceName: "usda_export_sales + usda_wasde_mapped",
        metricLabel,
        confidence: sourceConfidence("high", "usda_export_sales", freshness),
      });
    }
  }

  if (endingStocksChangeKt !== null) {
    if (endingStocksChangeKt <= -500) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "WASDE ending stocks cut",
        body: `USDA lowered ending stocks${revisionWindow}, tightening the balance by ${formatKtDelta(
          endingStocksChangeKt,
        )}.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(endingStocksChangeKt)} ending stocks`,
        confidence: sourceConfidence("high", "usda_wasde_mapped", freshness),
      });
    } else if (endingStocksChangeKt >= 500) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "WASDE ending stocks raised",
        body: `USDA raised ending stocks${revisionWindow}, loosening the balance by ${formatKtDelta(
          endingStocksChangeKt,
        )}.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(endingStocksChangeKt)} ending stocks`,
        confidence: sourceConfidence("high", "usda_wasde_mapped", freshness),
      });
    }
  }

  if (exportsChangeKt !== null) {
    if (exportsChangeKt >= 500) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "WASDE export projection raised",
        body: `USDA lifted projected exports${revisionWindow}, adding ${formatKtDelta(
          exportsChangeKt,
        )} of demand against the balance sheet.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(exportsChangeKt)} exports`,
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    } else if (exportsChangeKt <= -500) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "WASDE export projection cut",
        body: `USDA cut projected exports${revisionWindow}, removing ${formatKtDelta(
          Math.abs(exportsChangeKt),
        )} of demand from the balance sheet.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(exportsChangeKt)} exports`,
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    }
  }

  if (demandChangeKt !== null) {
    if (demandChangeKt >= 500) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: crushChangeKt !== null ? "WASDE crush demand raised" : "WASDE domestic use raised",
        body: `USDA lifted ${crushChangeKt !== null ? "crush" : "domestic use"}${revisionWindow}, adding ${formatKtDelta(
          demandChangeKt,
        )} of non-export demand.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(demandChangeKt)} ${crushChangeKt !== null ? "crush" : "domestic use"}`,
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    } else if (demandChangeKt <= -500) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: crushChangeKt !== null ? "WASDE crush demand cut" : "WASDE domestic use cut",
        body: `USDA cut ${crushChangeKt !== null ? "crush" : "domestic use"}${revisionWindow}, removing ${formatKtDelta(
          Math.abs(demandChangeKt),
        )} of non-export demand.`,
        sourceName: "usda_wasde_mapped",
        metricLabel: `${formatKtDelta(demandChangeKt)} ${crushChangeKt !== null ? "crush" : "domestic use"}`,
        confidence: sourceConfidence("medium", "usda_wasde_mapped", freshness),
      });
    }
  }

  const stocksSurpriseKt = numberValue(quarterlyStocks, "vs_wasde_estimate_kt");
  const stocksYoyPct = numberValue(quarterlyStocks, "change_vs_year_ago_pct");
  const totalStocksKt = numberValue(quarterlyStocks, "total_stocks_kt");
  const stocksReportDate = textValue(quarterlyStocks, "report_date");
  if (stocksSurpriseKt !== null || stocksYoyPct !== null) {
    if (
      (stocksSurpriseKt !== null && stocksSurpriseKt <= -1_000) ||
      (stocksYoyPct !== null && stocksYoyPct <= -5)
    ) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Quarterly stocks tighter than expected",
        body: `USDA quarterly stocks show ${formatKt(totalStocksKt)} on hand${
          stocksReportDate ? ` as of ${stocksReportDate}` : ""
        }, with a ${stocksSurpriseKt !== null ? formatKt(stocksSurpriseKt) : "not available"} surprise versus WASDE context and ${formatPct(stocksYoyPct)} versus year ago.`,
        sourceName: "usda_quarterly_stocks",
        metricLabel: stocksSurpriseKt !== null ? `${formatKt(stocksSurpriseKt)} vs WASDE` : formatPct(stocksYoyPct),
        confidence: sourceConfidence("high", "usda_quarterly_stocks", freshness),
      });
    } else if (
      (stocksSurpriseKt !== null && stocksSurpriseKt >= 1_000) ||
      (stocksYoyPct !== null && stocksYoyPct >= 5)
    ) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Quarterly stocks heavier than expected",
        body: `USDA quarterly stocks show ${formatKt(totalStocksKt)} on hand${
          stocksReportDate ? ` as of ${stocksReportDate}` : ""
        }, with a ${stocksSurpriseKt !== null ? formatKt(stocksSurpriseKt) : "not available"} surprise versus WASDE context and ${formatPct(stocksYoyPct)} versus year ago.`,
        sourceName: "usda_quarterly_stocks",
        metricLabel: stocksSurpriseKt !== null ? `${formatKt(stocksSurpriseKt)} vs WASDE` : formatPct(stocksYoyPct),
        confidence: sourceConfidence("high", "usda_quarterly_stocks", freshness),
      });
    }
  }

  const latestPrice = prices[0] ?? {};
  const priceChangePct = numberValue(latestPrice, "change_pct");
  const price = numberValue(latestPrice, "settlement_price");
  if (priceChangePct !== null) {
    if (priceChangePct >= 0.5) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Futures follow-through",
        body: `The latest packet price sample is ${formatPrice(
          price,
          textValue(latestPrice, "currency"),
          textValue(latestPrice, "unit"),
        )}.`,
        sourceName: "grain_prices",
        metricLabel: formatPct(priceChangePct),
        confidence: sourceConfidence("medium", "grain_prices", freshness),
      });
    } else if (priceChangePct <= -0.5) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Futures pressure",
        body: `The latest packet price sample is ${formatPrice(
          price,
          textValue(latestPrice, "currency"),
          textValue(latestPrice, "unit"),
        )}.`,
        sourceName: "grain_prices",
        metricLabel: formatPct(priceChangePct),
        confidence: sourceConfidence("medium", "grain_prices", freshness),
      });
    }
  }

  const primaryPosition = positioning.find((row) => textValue(row, "mapping_type") === "primary");
  if (primaryPosition) {
    const mmLong = numberValue(primaryPosition, "managed_money_long");
    const mmShort = numberValue(primaryPosition, "managed_money_short");
    if (mmLong !== null && mmShort !== null) {
      const net = mmLong - mmShort;
      if (net > 0) {
        addDriver(bullDrivers, {
          tone: "bull",
          title: "Managed money net long",
          body: "Primary CFTC positioning is net long in the latest packet row.",
          sourceName: "cftc_cot_positions",
          metricLabel: `${net.toLocaleString("en-US")} net contracts`,
          confidence: sourceConfidence("medium", "cftc_cot_positions", freshness),
        });
      } else if (net < 0) {
        addDriver(bearDrivers, {
          tone: "bear",
          title: "Managed money net short",
          body: "Primary CFTC positioning is net short in the latest packet row.",
          sourceName: "cftc_cot_positions",
          metricLabel: `${net.toLocaleString("en-US")} net contracts`,
          confidence: sourceConfidence("medium", "cftc_cot_positions", freshness),
        });
      }
    }
  }

  const warnings = normalizeWarnings(packet, freshness);
  const confidence = confidenceFromFreshness(freshness, warnings);
  const stanceScore = scoreDrivers(bullDrivers, bearDrivers);

  return {
    id: `us-${market.slug}`,
    lane: "us",
    name: market.name,
    slug: market.slug,
    cropYear: null,
    grainWeek: null,
    marketYear: numberValue(packet, "market_year") ?? CURRENT_US_MARKET_YEAR,
    packetGeneratedAt: textValue(packet, "packet_generated_at"),
    stanceScore,
    stanceLabel: stanceLabel(stanceScore),
    confidence: confidence.confidence,
    confidenceScore: confidence.score,
    bullCase: caseSummary("Bull", bullDrivers),
    bearCase: caseSummary("Bear", bearDrivers),
    bullDrivers,
    bearDrivers,
    freshness,
    warnings,
    vikingL2Chunks: [],
    ...sourceCounts(freshness),
  };
}

function vikingL2TopicsForUsItem(item: ThesisBoardItem): Parameters<typeof getVikingL2Context>[0]["topics"] {
  const sourceNames = new Set(item.freshness.map((row) => row.sourceName));
  const driverText = [...item.bullDrivers, ...item.bearDrivers]
    .map((driver) => `${driver.title} ${driver.body} ${driver.sourceName}`)
    .join(" ")
    .toLowerCase();
  const topics: NonNullable<Parameters<typeof getVikingL2Context>[0]["topics"]> = [];

  if (sourceNames.has("usda_wasde_mapped") || driverText.includes("wasde")) {
    topics.push("wasde_revisions");
  }
  if (sourceNames.has("usda_crop_progress") || driverText.includes("crop")) {
    topics.push("crop_progress_signals");
  }
  if (sourceNames.has("usda_export_sales") || driverText.includes("export")) {
    topics.push("export_sales_pace");
  }
  if (sourceNames.has("cftc_cot_positions") || driverText.includes("managed money")) {
    topics.push("cot_positioning");
  }

  return topics.length > 0 ? topics : ["grain_specifics", "market_structure"];
}

function vikingL2KeywordsForUsItem(item: ThesisBoardItem): string[] {
  const words = new Set<string>([item.name]);
  for (const driver of [...item.bullDrivers, ...item.bearDrivers]) {
    for (const candidate of [driver.title, driver.sourceName, driver.metricLabel]) {
      candidate
        .split(/[^A-Za-z]+/)
        .map((word) => word.toLowerCase())
        .filter((word) => word.length >= 5)
        .slice(0, 4)
        .forEach((word) => words.add(word));
    }
  }
  return [...words].slice(0, 12);
}

async function enrichUsThesisBoardItemsWithVikingL2(
  items: ThesisBoardItem[],
): Promise<ThesisBoardItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const chunks = await getVikingL2Context({
        grain: item.name,
        topics: vikingL2TopicsForUsItem(item),
        keywords: vikingL2KeywordsForUsItem(item),
        maxChunks: 3,
      });
      return { ...item, vikingL2Chunks: chunks };
    }),
  );
}

function driverConfidenceWeight(confidence: ThesisConfidence): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function stanceDirection(item: ThesisBoardItem | null): "bullish" | "bearish" | "balanced" | "missing" {
  if (!item) return "missing";
  if (item.stanceScore > 0) return "bullish";
  if (item.stanceScore < 0) return "bearish";
  return "balanced";
}

function signedScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function strongestPointsFor(
  item: ThesisBoardItem | null,
  country: ThesisCountryCode,
  tone: ThesisDriverTone,
): ThesisComparisonPoint[] {
  if (!item) return [];
  const drivers = tone === "bull" ? item.bullDrivers : item.bearDrivers;
  return drivers
    .map((driver) => ({
      country,
      tone,
      title: driver.title,
      body: driver.body,
      sourceName: driver.sourceName,
      confidence: driver.confidence,
      metricLabel: driver.metricLabel,
    }))
    .sort((a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence))
    .slice(0, 2);
}

function leadDriver(item: ThesisBoardItem): ThesisDriver | null {
  const direction = stanceDirection(item);
  const preferred =
    direction === "bearish"
      ? [...item.bearDrivers].sort(
          (a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence),
        )
      : direction === "bullish"
        ? [...item.bullDrivers].sort(
            (a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence),
          )
        : [...item.bullDrivers, ...item.bearDrivers].sort(
            (a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence),
          );
  return preferred[0] ?? null;
}

function comparisonStatusFor(
  canada: ThesisBoardItem | null,
  us: ThesisBoardItem | null,
): ThesisComparisonStatus {
  if (canada && !us) return "canada_only";
  if (!canada && us) return "us_only";
  if (!canada || !us) return "mixed";

  const canadaDirection = stanceDirection(canada);
  const usDirection = stanceDirection(us);
  if (canadaDirection === "bullish" && usDirection === "bullish") return "aligned_bullish";
  if (canadaDirection === "bearish" && usDirection === "bearish") return "aligned_bearish";
  if (canadaDirection === "balanced" && usDirection === "balanced") return "aligned_balanced";
  return "mixed";
}

function comparisonStatusLabel(status: ThesisComparisonStatus): string {
  const labels: Record<ThesisComparisonStatus, string> = {
    aligned_bullish: "Aligned bull",
    aligned_bearish: "Aligned bear",
    aligned_balanced: "Both balanced",
    mixed: "Country split",
    mapping_needed: "Mapping needed",
    canada_only: "Canada only",
    us_only: "US only",
  };
  return labels[status];
}

function comparisonReadiness(
  grain: string,
  status: ThesisComparisonStatus,
  canada: ThesisBoardItem | null,
  us: ThesisBoardItem | null,
): { readinessLabel: string; readinessDetail: string } {
  if (status === "mapping_needed") {
    return {
      readinessLabel: "Mapping pending",
      readinessDetail: `Needs class-safe ${grain} source mapping before this row can produce a thesis read.`,
    };
  }

  if (status === "canada_only") {
    return {
      readinessLabel: "Canada-first",
      readinessDetail: "Canada packet is present; no matching US overview market is modeled for this V1 row.",
    };
  }

  if (status === "us_only") {
    return {
      readinessLabel: "US-first",
      readinessDetail: "US packet is present; no matching Canada major-grain packet is modeled for this V1 row.",
    };
  }

  if (canada && us) {
    return {
      readinessLabel: "Source-backed",
      readinessDetail: "Canada and US packets are present; use this as a scouting-quality thesis row, not final price advice.",
    };
  }

  return {
    readinessLabel: "Source gap",
    readinessDetail: "No source-backed Canada or US packet is available for this V1 row.",
  };
}

function comparisonExplanation(
  grain: string,
  canada: ThesisBoardItem | null,
  us: ThesisBoardItem | null,
): string {
  if (canada && !us) {
    return `${grain} has a Canada packet in V1, but no matching US overview market is modeled on this board.`;
  }
  if (!canada && us) {
    return `${grain} has a US packet in V1, but no matching Canada major-grain packet is modeled on this board.`;
  }
  if (!canada && !us && SOURCE_MAPPING_NEEDED_LANES.has(grain)) {
    return `${grain} is in V1 scope, but class-specific source mapping is still pending. Generic Wheat is not used as a proxy for this row.`;
  }
  if (!canada || !us) {
    return "No Canada or US packet is available for this V1 row.";
  }

  const canadaLead = leadDriver(canada);
  const usLead = leadDriver(us);
  const canadaDetail = canadaLead ? ` (${canadaLead.title})` : "";
  const usDetail = usLead ? ` (${usLead.title})` : "";
  return `CA ${signedScore(canada.stanceScore)} ${canada.stanceLabel}${canadaDetail}; US ${signedScore(
    us.stanceScore,
  )} ${us.stanceLabel}${usDetail}.`;
}

export interface ThesisFarmerReadSummary {
  coverageLine: string;
  mappingLine: string;
  actionLine: string;
}

export function buildFarmerReadSummary(rows: ThesisComparisonRow[]): ThesisFarmerReadSummary {
  const sourceBackedOrIntentionalRows = rows.filter(
    (row) => row.status !== "mapping_needed" && (row.canada || row.us),
  ).length;
  const mappingRows = rows.filter((row) => row.status === "mapping_needed");
  const wheatClassMappingRows = mappingRows.filter((row) => row.grain.includes("Wheat"));
  const wheatClassNames = wheatClassMappingRows.map((row) => row.grain);
  const mappingCount = mappingRows.length;
  const mappingNoun = mappingCount === 1 ? "row is" : "rows are";

  return {
    coverageLine: `${sourceBackedOrIntentionalRows} of ${rows.length} V1 rows are source-backed or intentionally Canada-first; ${mappingCount} wheat-class ${mappingNoun} parked until class-safe mapping exists.`,
    mappingLine:
      wheatClassNames.length > 0
        ? `${wheatClassNames.join(" and ")} stay visible but unscored: generic Wheat is not used as a proxy.`
        : "No wheat-class proxy rows are being scored without direct source mapping.",
    actionLine:
      "Use the board as a scouting sheet: prioritize source-backed split markets, then open row drivers before changing a pricing plan.",
  };
}

export function buildMajorThesisComparisonRows(
  canadaItems: ThesisBoardItem[],
  usItems: ThesisBoardItem[],
): ThesisComparisonRow[] {
  const canadaByName = new Map(
    canadaItems
      .filter((item) => isMajorCanadaThesisGrain(item.name))
      .map((item) => [item.name, item] as const),
  );
  const usByName = new Map(
    usItems
      .filter((item) => isMajorUsThesisMarket(item.name))
      .map((item) => [item.name, item] as const),
  );
  return THESIS_BOARD_V1_LANE_SOURCE_MAP.map((lane) => {
    const grain = lane.lane;
    const canada = lane.canadaSourceName ? (canadaByName.get(lane.canadaSourceName) ?? null) : null;
    const us = lane.usSourceName ? (usByName.get(lane.usSourceName) ?? null) : null;
    const status =
      !canada && !us && SOURCE_MAPPING_NEEDED_LANES.has(grain)
        ? "mapping_needed"
        : comparisonStatusFor(canada, us);
    const strongestBullPoints = [
      ...strongestPointsFor(canada, "CA", "bull"),
      ...strongestPointsFor(us, "US", "bull"),
    ].sort((a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence));
    const strongestBearPoints = [
      ...strongestPointsFor(canada, "CA", "bear"),
      ...strongestPointsFor(us, "US", "bear"),
    ].sort((a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence));

    const readiness = comparisonReadiness(grain, status, canada, us);

    return {
      grain,
      canada,
      us,
      status,
      statusLabel: comparisonStatusLabel(status),
      readinessLabel: readiness.readinessLabel,
      readinessDetail: readiness.readinessDetail,
      explanation: comparisonExplanation(grain, canada, us),
      strongestBullPoints,
      strongestBearPoints,
    };
  });
}

async function fetchCanadaPacket(
  supabase: SupabaseServerClient,
  grain: GrainDef,
): Promise<ThesisBoardItem> {
  const { data, error } = await retryStatementTimeout(async () =>
    await supabase.rpc("get_canada_thesis_packet", {
      p_grain: grain.name,
      p_crop_year: CURRENT_CROP_YEAR,
      p_grain_week: null,
    }),
  );

  if (error) {
    return buildCanadaThesisBoardItem(grain, {
      lane: "canada",
      grain: grain.name,
      crop_year: CURRENT_CROP_YEAR,
      quality_warnings: [
        {
          source_name: "get_canada_thesis_packet",
          status: "broken",
          action_hint: error.message,
        },
      ],
      freshness: [],
    });
  }

  return buildCanadaThesisBoardItem(grain, data);
}

async function fetchUsPacket(
  supabase: SupabaseServerClient,
  market: UsMarketDef,
): Promise<ThesisBoardItem> {
  const { data, error } = await retryStatementTimeout(async () =>
    await supabase.rpc("get_us_thesis_packet", {
      p_market_name: market.name,
      p_market_year: CURRENT_US_MARKET_YEAR,
    }),
  );

  if (error) {
    return buildUsThesisBoardItem(market, {
      lane: "us",
      market_name: market.name,
      market_year: CURRENT_US_MARKET_YEAR,
      quality_warnings: [
        {
          source_name: "get_us_thesis_packet",
          status: "broken",
          action_hint: error.message,
        },
      ],
      freshness: [],
    });
  }

  return buildUsThesisBoardItem(market, data);
}

async function buildBoardData({
  generatedAt,
  packetMode,
  cacheStatus,
  sourceRunWatermark,
  latestAvailableSourceRunAt,
  cacheItemCount,
  canadaItems,
  usItems,
}: {
  generatedAt: string;
  packetMode: ThesisBoardData["packetMode"];
  cacheStatus: ThesisBoardData["cacheStatus"];
  sourceRunWatermark: string | null;
  latestAvailableSourceRunAt: string | null;
  cacheItemCount: number;
  canadaItems: ThesisBoardItem[];
  usItems: ThesisBoardItem[];
}): Promise<ThesisBoardData> {
  const majorCanadaItems = canadaItems.filter((item) => isMajorCanadaThesisGrain(item.name));
  const majorUsItems = await enrichUsThesisBoardItemsWithVikingL2(
    usItems.filter((item) => isMajorUsThesisMarket(item.name)),
  );
  const allItems = [...majorCanadaItems, ...majorUsItems];
  const sourceHealth = buildSourceHealthSummary(allItems);
  return {
    generatedAt,
    packetMode,
    cacheStatus,
    sourceRunWatermark,
    latestAvailableSourceRunAt,
    cacheItemCount,
    canadaItems: majorCanadaItems,
    usItems: majorUsItems,
    comparisonRows: buildMajorThesisComparisonRows(majorCanadaItems, majorUsItems),
    totals: {
      itemCount: allItems.length,
      strongSourceCount: sourceHealth.strongSourceCount,
      staleSourceCount: sourceHealth.watchSourceInstanceCount,
      watchSourceInstanceCount: sourceHealth.watchSourceInstanceCount,
      uniqueWatchSourceCount: sourceHealth.uniqueWatchSourceCount,
      optionalSourceCount: sourceHealth.optionalSourceCount,
      blockerCount: allItems.reduce(
        (total, item) => total + item.warnings.filter((warning) => warning.severity === "blocker").length,
        0,
      ),
    },
    sourceHealth,
  };
}

interface CachedBoardPackets {
  generatedAt: string;
  sourceRunWatermark: string | null;
  cacheItemCount: number;
  canadaPackets: JsonRecord[];
  usPackets: JsonRecord[];
}

function parseCachedBoardPackets(value: unknown): CachedBoardPackets | null {
  const payload = asRecord(value);
  const canadaPackets = asArray(payload.canada);
  const usPackets = asArray(payload.us);
  const generatedAt = textValue(payload, "generated_at");
  if (!generatedAt) return null;

  return {
    generatedAt,
    sourceRunWatermark: textValue(payload, "source_run_watermark"),
    cacheItemCount: numberValue(payload, "cache_item_count") ?? canadaPackets.length + usPackets.length,
    canadaPackets,
    usPackets,
  };
}

function findCanadaGrain(packet: JsonRecord, index: number): GrainDef {
  const packetName = textValue(packet, "grain");
  return (
    ALL_GRAINS.find((grain) => grain.name.toLowerCase() === packetName?.toLowerCase()) ??
    ALL_GRAINS[index] ??
    ALL_GRAINS[0]
  );
}

function findUsMarket(packet: JsonRecord, index: number): UsMarketDef {
  const packetName = textValue(packet, "market_name");
  return (
    US_OVERVIEW_MARKETS.find((market) => market.name.toLowerCase() === packetName?.toLowerCase()) ??
    US_OVERVIEW_MARKETS[index] ??
    US_OVERVIEW_MARKETS[0]
  );
}

function buildBoardDataFromCachedPackets(
  packets: CachedBoardPackets,
  cacheStatus: ThesisBoardData["cacheStatus"],
  latestAvailableSourceRunAt: string | null,
): Promise<ThesisBoardData> {
  const canadaItems = packets.canadaPackets.map((packet, index) =>
    buildCanadaThesisBoardItem(findCanadaGrain(packet, index), packet),
  );
  const usItems = packets.usPackets.map((packet, index) =>
    buildUsThesisBoardItem(findUsMarket(packet, index), packet),
  );

  return buildBoardData({
    generatedAt: packets.generatedAt,
    packetMode: "cached",
    cacheStatus,
    sourceRunWatermark: packets.sourceRunWatermark,
    latestAvailableSourceRunAt,
    cacheItemCount: packets.cacheItemCount,
    canadaItems,
    usItems,
  });
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function cacheStatusForSourceState({
  cachedMajorPacketCount,
  expectedMajorPacketCount,
  packetGeneratedAt,
  packetSourceRunWatermark,
  latestAvailableSourceRunAt,
}: {
  cachedMajorPacketCount: number;
  expectedMajorPacketCount: number;
  packetGeneratedAt: string | null;
  packetSourceRunWatermark: string | null;
  latestAvailableSourceRunAt: string | null;
}): ThesisBoardData["cacheStatus"] {
  if (cachedMajorPacketCount < expectedMajorPacketCount) return "stale";
  const sourceRunTime = dateValue(packetSourceRunWatermark);
  const cacheTime = dateValue(packetGeneratedAt);
  if (sourceRunTime === null || cacheTime === null) return "stale";
  const latestSourceRunTime = dateValue(latestAvailableSourceRunAt);
  if (latestSourceRunTime !== null && latestSourceRunTime > sourceRunTime) return "stale";
  return sourceRunTime > cacheTime ? "stale" : "fresh";
}

function cacheStatusFor(
  packets: CachedBoardPackets,
  latestAvailableSourceRunAt: string | null,
): ThesisBoardData["cacheStatus"] {
  const cachedMajorCanadaCount = packets.canadaPackets.filter((packet, index) =>
    isMajorCanadaThesisGrain(textValue(packet, "grain") ?? ALL_GRAINS[index]?.name ?? ""),
  ).length;
  const cachedMajorUsCount = packets.usPackets.filter((packet, index) =>
    isMajorUsThesisMarket(textValue(packet, "market_name") ?? US_OVERVIEW_MARKETS[index]?.name ?? ""),
  ).length;
  return cacheStatusForSourceState({
    cachedMajorPacketCount: cachedMajorCanadaCount + cachedMajorUsCount,
    expectedMajorPacketCount: EXPECTED_THESIS_BOARD_PACKET_COUNT,
    packetGeneratedAt: packets.generatedAt,
    packetSourceRunWatermark: packets.sourceRunWatermark,
    latestAvailableSourceRunAt,
  });
}

async function fetchLatestAvailableSourceRunAt(
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("source_runs")
    .select("finished_at")
    .in("status", ["success", "partial"])
    .neq("source_name", "thesis-packet-cache")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return typeof data?.finished_at === "string" ? data.finished_at : null;
}

async function fetchCachedBoardPackets(
  supabase: SupabaseServerClient,
): Promise<CachedBoardPackets | null> {
  const { data, error } = await supabase.rpc("get_thesis_board_cached", {
    p_crop_year: CURRENT_CROP_YEAR,
    p_market_year: CURRENT_US_MARKET_YEAR,
  });
  if (error) return null;
  return parseCachedBoardPackets(data);
}

async function fetchLiveFallbackBoardData(supabase: SupabaseServerClient): Promise<ThesisBoardData> {
  const canadaItems: ThesisBoardItem[] = [];
  const usItems: ThesisBoardItem[] = [];

  // Fallback stays sequential because concurrent all-grain packet calls can trip
  // hosted statement timeouts. The cached path above is the normal fast path.
  for (const grain of getMajorCanadaThesisGrains()) {
    canadaItems.push(await fetchCanadaPacket(supabase, grain));
  }
  for (const market of getMajorUsThesisMarkets()) {
    usItems.push(await fetchUsPacket(supabase, market));
  }

  return await buildBoardData({
    generatedAt: new Date().toISOString(),
    packetMode: "live_rpc_fallback",
    cacheStatus: "fallback",
    sourceRunWatermark: null,
    latestAvailableSourceRunAt: null,
    cacheItemCount: 0,
    canadaItems,
    usItems,
  });
}

export async function getThesisBoardData(): Promise<ThesisBoardData> {
  const supabase = await createClient();
  const [cachedPackets, latestAvailableSourceRunAt] = await Promise.all([
    fetchCachedBoardPackets(supabase),
    fetchLatestAvailableSourceRunAt(supabase),
  ]);

  if (cachedPackets && cachedPackets.cacheItemCount > 0) {
    const cacheStatus = cacheStatusFor(cachedPackets, latestAvailableSourceRunAt);
    return await buildBoardDataFromCachedPackets(
      cachedPackets,
      cacheStatus,
      latestAvailableSourceRunAt,
    );
  }

  return fetchLiveFallbackBoardData(supabase);
}
