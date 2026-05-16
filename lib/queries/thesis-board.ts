import { ALL_GRAINS, type GrainDef } from "@/lib/constants/grains";
import { US_OVERVIEW_MARKETS, type UsMarketDef } from "@/lib/constants/us-markets";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import type { ThesisArtifactV1 } from "@/lib/thesis/artifact-contract";

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
  explanation: string;
  strongestBullPoints: ThesisComparisonPoint[];
  strongestBearPoints: ThesisComparisonPoint[];
}

export interface ThesisBoardData {
  generatedAt: string;
  packetMode: "cached" | "live_rpc_fallback";
  cacheStatus: "fresh" | "stale" | "fallback";
  sourceRunWatermark: string | null;
  cacheItemCount: number;
  canadaItems: ThesisBoardItem[];
  usItems: ThesisBoardItem[];
  comparisonRows: ThesisComparisonRow[];
  totals: {
    itemCount: number;
    strongSourceCount: number;
    staleSourceCount: number;
    blockerCount: number;
  };
}

// Canonical frozen artifact contract alignment for upcoming roundtable publish path.
// The thesis board view remains packet-derived today, but this alias keeps both lanes type-linked.
export type CanonicalThesisArtifact = ThesisArtifactV1;

export const THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES = [
  "Wheat",
  "Canola",
  "Barley",
  "Oats",
  "Corn",
  "Soybeans",
  "Peas",
  "Lentils",
  "Amber Durum",
  "Flaxseed",
] as const;

export const THESIS_BOARD_MAJOR_US_MARKET_NAMES = [
  "Corn",
  "Soybeans",
  "Wheat",
  "Oats",
  "Barley",
] as const;

const MAJOR_CANADA_GRAIN_NAMES = new Set<string>(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES);
const MAJOR_US_MARKET_NAMES = new Set<string>(THESIS_BOARD_MAJOR_US_MARKET_NAMES);

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

function formatPrice(value: number | null, currency: string | null, unit: string | null): string {
  if (value === null) return "not available";
  const prefix = currency === "USD" || currency === "CAD" ? `${currency} ` : "";
  const suffix = unit ? `/${unit}` : "";
  return `${prefix}${value.toLocaleString("en-CA", {
    maximumFractionDigits: 2,
  })}${suffix}`;
}

function statusSeverity(status: string): "info" | "watch" | "blocker" {
  const normalized = status.toLowerCase();
  if (normalized === "broken" || normalized === "empty") return "blocker";
  if (normalized.includes("stale") || normalized === "legacy" || normalized === "failed") {
    return "watch";
  }
  return "info";
}

function normalizeFreshness(packet: JsonRecord): ThesisFreshnessRow[] {
  return asArray(packet.freshness).map((row) => ({
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
  }));
}

function normalizeWarnings(packet: JsonRecord): ThesisWarning[] {
  return asArray(packet.quality_warnings).map((row) => {
    const status = textValue(row, "status") ?? "unknown";
    return {
      sourceName: textValue(row, "source_name") ?? "unknown",
      status,
      actionHint: textValue(row, "action_hint"),
      severity: statusSeverity(status),
    };
  });
}

function confidenceFromFreshness(
  freshness: ThesisFreshnessRow[],
  warnings: ThesisWarning[],
): { confidence: ThesisConfidence; score: number } {
  const blockers = warnings.filter((warning) => warning.severity === "blocker").length;
  const watch = warnings.filter((warning) => warning.severity === "watch").length;
  const stale = freshness.filter((row) => row.freshnessStatus !== "strong").length;
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

function ratioPct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
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
  if (score <= -60) return "Strong bear tilt";
  if (score <= -20) return "Bear tilt";
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
  const strongSourceCount = freshness.filter((row) => row.freshnessStatus === "strong").length;
  const staleSourceCount = freshness.filter((row) => row.freshnessStatus !== "strong").length;
  return {
    sourceCount: freshness.length,
    strongSourceCount,
    staleSourceCount,
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

  const warnings = normalizeWarnings(packet);
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
    if (plantedVsAvg <= -5) {
      addDriver(bullDrivers, {
        tone: "bull",
        title: "Planting pace risk",
        body: "The latest US crop progress row shows planting behind normal pace.",
        sourceName: "usda_crop_progress",
        metricLabel: `${formatPct(plantedVsAvg)} versus average`,
        confidence: sourceConfidence("medium", "usda_crop_progress", freshness),
      });
    } else if (plantedVsAvg >= 5) {
      addDriver(bearDrivers, {
        tone: "bear",
        title: "Planting pace comfortable",
        body: "The latest US crop progress row shows planting ahead of normal pace.",
        sourceName: "usda_crop_progress",
        metricLabel: `${formatPct(plantedVsAvg)} versus average`,
        confidence: sourceConfidence("medium", "usda_crop_progress", freshness),
      });
    }
  }

  const netSales = numberValue(exportSales, "net_sales_mt");
  const exportPace = numberValue(exportSales, "export_pace_pct");
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

  const warnings = normalizeWarnings(packet);
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
    ...sourceCounts(freshness),
  };
}

function driverConfidenceWeight(confidence: ThesisConfidence): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function stanceDirection(item: ThesisBoardItem | null): "bullish" | "bearish" | "balanced" | "missing" {
  if (!item) return "missing";
  if (item.stanceScore >= 20) return "bullish";
  if (item.stanceScore <= -20) return "bearish";
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
    canada_only: "Canada only",
    us_only: "US only",
  };
  return labels[status];
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
  const orderedNames = [
    ...THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES,
    ...THESIS_BOARD_MAJOR_US_MARKET_NAMES.filter(
      (name) => !MAJOR_CANADA_GRAIN_NAMES.has(name),
    ),
  ];

  return orderedNames.map((grain) => {
    const canada = canadaByName.get(grain) ?? null;
    const us = usByName.get(grain) ?? null;
    const status = comparisonStatusFor(canada, us);
    const strongestBullPoints = [
      ...strongestPointsFor(canada, "CA", "bull"),
      ...strongestPointsFor(us, "US", "bull"),
    ].sort((a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence));
    const strongestBearPoints = [
      ...strongestPointsFor(canada, "CA", "bear"),
      ...strongestPointsFor(us, "US", "bear"),
    ].sort((a, b) => driverConfidenceWeight(b.confidence) - driverConfidenceWeight(a.confidence));

    return {
      grain,
      canada,
      us,
      status,
      statusLabel: comparisonStatusLabel(status),
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

function buildBoardData({
  generatedAt,
  packetMode,
  cacheStatus,
  sourceRunWatermark,
  cacheItemCount,
  canadaItems,
  usItems,
}: {
  generatedAt: string;
  packetMode: ThesisBoardData["packetMode"];
  cacheStatus: ThesisBoardData["cacheStatus"];
  sourceRunWatermark: string | null;
  cacheItemCount: number;
  canadaItems: ThesisBoardItem[];
  usItems: ThesisBoardItem[];
}): ThesisBoardData {
  const majorCanadaItems = canadaItems.filter((item) => isMajorCanadaThesisGrain(item.name));
  const majorUsItems = usItems.filter((item) => isMajorUsThesisMarket(item.name));
  const allItems = [...majorCanadaItems, ...majorUsItems];
  return {
    generatedAt,
    packetMode,
    cacheStatus,
    sourceRunWatermark,
    cacheItemCount,
    canadaItems: majorCanadaItems,
    usItems: majorUsItems,
    comparisonRows: buildMajorThesisComparisonRows(majorCanadaItems, majorUsItems),
    totals: {
      itemCount: allItems.length,
      strongSourceCount: allItems.reduce((total, item) => total + item.strongSourceCount, 0),
      staleSourceCount: allItems.reduce((total, item) => total + item.staleSourceCount, 0),
      blockerCount: allItems.reduce(
        (total, item) => total + item.warnings.filter((warning) => warning.severity === "blocker").length,
        0,
      ),
    },
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
): ThesisBoardData {
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

function cacheStatusFor(packets: CachedBoardPackets): ThesisBoardData["cacheStatus"] {
  const cachedMajorCanadaCount = packets.canadaPackets.filter((packet, index) =>
    isMajorCanadaThesisGrain(textValue(packet, "grain") ?? ALL_GRAINS[index]?.name ?? ""),
  ).length;
  const cachedMajorUsCount = packets.usPackets.filter((packet, index) =>
    isMajorUsThesisMarket(textValue(packet, "market_name") ?? US_OVERVIEW_MARKETS[index]?.name ?? ""),
  ).length;
  if (cachedMajorCanadaCount + cachedMajorUsCount < EXPECTED_THESIS_BOARD_PACKET_COUNT) {
    return "stale";
  }
  const sourceRunTime = dateValue(packets.sourceRunWatermark);
  const cacheTime = dateValue(packets.generatedAt);
  if (sourceRunTime === null || cacheTime === null) return "stale";
  return sourceRunTime > cacheTime ? "stale" : "fresh";
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

  return buildBoardData({
    generatedAt: new Date().toISOString(),
    packetMode: "live_rpc_fallback",
    cacheStatus: "fallback",
    sourceRunWatermark: null,
    cacheItemCount: 0,
    canadaItems,
    usItems,
  });
}

export async function getThesisBoardData(): Promise<ThesisBoardData> {
  const supabase = await createClient();
  const cachedPackets = await fetchCachedBoardPackets(supabase);

  if (cachedPackets && cachedPackets.cacheItemCount > 0) {
    return buildBoardDataFromCachedPackets(cachedPackets, cacheStatusFor(cachedPackets));
  }

  return fetchLiveFallbackBoardData(supabase);
}
