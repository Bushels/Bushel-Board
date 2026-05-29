import type { BuildRatingDomainInput, SourceFreshnessStatus } from "@/lib/thesis/rating-model";

type JsonRecord = Record<string, unknown>;

const CANADA_CGC_SOURCE = "cgc_observations";
const US_EXPORT_SALES_SOURCE = "usda_export_sales";
const US_CROP_PROGRESS_SOURCE = "usda_crop_progress";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function numberValue(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function textValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function ratioPct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function isActiveUsCropProgressWindow(packet: JsonRecord): boolean {
  const generatedAt = textValue(packet, "packet_generated_at");
  if (!generatedAt) return true;

  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) return true;

  const month = generatedDate.getUTCMonth() + 1;
  // Treat April-November as the old-crop/new-crop relevance window where NASS
  // crop condition can carry price-risk signal. Outside that window, avoid
  // turning dormant/off-season condition rows into live weather claims.
  return month >= 4 && month <= 11;
}

function normalizeFreshnessStatus(status: string | null): SourceFreshnessStatus {
  const normalized = status?.toLowerCase().trim();
  if (normalized === "strong") return "strong";
  if (normalized === "partial") return "partial";
  if (normalized === "expected_lag" || normalized === "expected lag") return "expected_lag";
  if (normalized === "empty" || normalized === "missing") return "empty";
  if (normalized === "stale") return "stale";
  if (normalized?.includes("stale")) return "stale";
  if (normalized === "watch" || normalized === "unknown" || normalized?.includes("watch")) return "watch";
  return "watch";
}

function freshnessForSource(packet: JsonRecord, sourceName: string): {
  status: SourceFreshnessStatus;
  missingFreshnessProof: boolean;
} {
  const row = asArray(packet.freshness).find((freshnessRow) => textValue(freshnessRow, "source_name") === sourceName);
  if (!row) return { status: "empty", missingFreshnessProof: true };
  return {
    status: normalizeFreshnessStatus(textValue(row, "freshness_status")),
    missingFreshnessProof: false,
  };
}

function confidenceForFreshness(status: SourceFreshnessStatus): "high" | "medium" | "low" {
  if (status === "strong") return "high";
  if (status === "partial" || status === "expected_lag" || status === "watch") return "medium";
  return "low";
}

function requiredDomain(params: {
  domain: BuildRatingDomainInput["domain"];
  score: number;
  source: string;
  freshness: { status: SourceFreshnessStatus; missingFreshnessProof: boolean };
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
}): BuildRatingDomainInput {
  return {
    domain: params.domain,
    score: Math.max(-100, Math.min(100, params.score)),
    confidence: confidenceForFreshness(params.freshness.status),
    freshness_status: params.freshness.status,
    sources: params.freshness.missingFreshnessProof ? [] : [params.source],
    positive_evidence: params.positive_evidence ?? [],
    negative_evidence: params.negative_evidence ?? [],
    blocked_claims: params.blocked_claims ?? [],
    isRequired: true,
    isPrimaryDirectSource: true,
    missingFreshnessProof: params.freshness.missingFreshnessProof,
  };
}

/**
 * Converts current Canada packet fields into deterministic rating-domain inputs.
 * Thresholds intentionally mirror the conservative UI driver cutoffs: exports at
 * >=45% of deliveries and process at >=30% are bullish; <=20% and <=10% are bearish.
 */
export function mapCanadaPacketToDomainInputs(packetInput: unknown): BuildRatingDomainInput[] {
  const packet = asRecord(packetInput);
  if (Object.keys(packet).length === 0) return [];

  const demand = asRecord(packet.demand);
  const deliveries = asRecord(demand.producer_deliveries_current_week);
  const exports = asRecord(demand.exports);
  const totalKt = numberValue(deliveries, "total_kt");
  const exportKt = numberValue(exports, "current_week_kt");
  const processKt = numberValue(deliveries, "process_deliveries_kt");
  const exportShare = ratioPct(exportKt, totalKt);
  const processShare = ratioPct(processKt, totalKt);
  const freshness = freshnessForSource(packet, CANADA_CGC_SOURCE);
  const domains: BuildRatingDomainInput[] = [];

  let demandScore = 0;
  const demandPositive: string[] = [];
  const demandNegative: string[] = [];

  if (exportShare !== null) {
    if (exportShare >= 45) {
      demandScore += 20;
      demandPositive.push(`Current-week export share is ${formatPct(exportShare)} of producer deliveries.`);
    } else if (exportShare <= 20) {
      demandScore -= 20;
      demandNegative.push(`Current-week export share is only ${formatPct(exportShare)} of producer deliveries.`);
    }
  }

  if (processShare !== null) {
    if (processShare >= 30) {
      demandScore += 15;
      demandPositive.push(`Current-week process share is ${formatPct(processShare)} of producer deliveries.`);
    } else if (processShare <= 10) {
      demandScore -= 15;
      demandNegative.push(`Current-week process share is only ${formatPct(processShare)} of producer deliveries.`);
    }
  }

  if (demandPositive.length > 0 || demandNegative.length > 0) {
    domains.push(
      requiredDomain({
        domain: "demand",
        score: demandScore,
        source: CANADA_CGC_SOURCE,
        freshness,
        positive_evidence: demandPositive,
        negative_evidence: demandNegative,
      }),
    );
  }

  // Movement is bearish only when unusually heavy producer deliveries (>=800 kt)
  // enter the pipeline while both export (<=20%) and process (<=10%) disappearance
  // remain weak.
  if (totalKt !== null && totalKt >= 800 && exportShare !== null && processShare !== null && exportShare <= 20 && processShare <= 10) {
    domains.push(
      requiredDomain({
        domain: "movement",
        score: -35,
        source: CANADA_CGC_SOURCE,
        freshness,
        negative_evidence: [
          `High producer deliveries entered the pipeline (${totalKt.toFixed(0)} kt) while disappearance is weak: export share ${formatPct(
            exportShare,
          )}, process share ${formatPct(processShare)}.`,
        ],
      }),
    );
  }

  return domains;
}

/**
 * Converts admitted US export-sales and crop-progress packet fields into rating
 * domains. Export-sales projection pace is used directly and never recomputed
 * from commitments/projection fields so Barley/Oats null paces stay blocked.
 * Conservative thresholds: >100% projection pace is bullish, <=85% is bearish;
 * US crop good/excellent <=50% or YoY <=-8% is weather-risk bullish only during
 * the April-November crop-progress relevance window.
 */
export function mapUsPacketToDomainInputs(packetInput: unknown): BuildRatingDomainInput[] {
  const packet = asRecord(packetInput);
  if (Object.keys(packet).length === 0) return [];

  const domains: BuildRatingDomainInput[] = [];
  const demand = asRecord(packet.demand);
  const exportSales = asRecord(demand.export_sales);
  const exportPace = numberValue(exportSales, "export_pace_pct");
  const exportFreshness = freshnessForSource(packet, US_EXPORT_SALES_SOURCE);

  if (Object.keys(exportSales).length > 0) {
    if (exportPace === null) {
      domains.push(
        requiredDomain({
          domain: "demand",
          score: 0,
          source: US_EXPORT_SALES_SOURCE,
          freshness: exportFreshness,
          blocked_claims: ["export_projection_pace_unavailable"],
        }),
      );
    } else if (exportPace > 100) {
      domains.push(
        requiredDomain({
          domain: "demand",
          score: 35,
          source: US_EXPORT_SALES_SOURCE,
          freshness: exportFreshness,
          positive_evidence: [`USDA export-sales admitted ${formatPct(exportPace)} export projection pace.`],
        }),
      );
    } else if (exportPace <= 85) {
      domains.push(
        requiredDomain({
          domain: "demand",
          score: -35,
          source: US_EXPORT_SALES_SOURCE,
          freshness: exportFreshness,
          negative_evidence: [`USDA export-sales admitted only ${formatPct(exportPace)} export projection pace.`],
        }),
      );
    }
  }

  const supply = asRecord(packet.supply);
  const cropProgress = asRecord(supply.crop_progress);
  const usTotal = asRecord(cropProgress.us_total);
  const goodExcellent = numberValue(usTotal, "good_excellent_pct");
  const geYoy = numberValue(usTotal, "ge_pct_yoy_change");
  const cropFreshness = freshnessForSource(packet, US_CROP_PROGRESS_SOURCE);

  if (
    goodExcellent !== null &&
    isActiveUsCropProgressWindow(packet) &&
    (goodExcellent <= 50 || (geYoy !== null && geYoy <= -8))
  ) {
    domains.push(
      requiredDomain({
        domain: "weather",
        score: 35,
        source: US_CROP_PROGRESS_SOURCE,
        freshness: cropFreshness,
        positive_evidence: [
          `US crop stress supports price: good/excellent is ${formatPct(goodExcellent)}${
            geYoy !== null ? `, ${formatPct(geYoy)} versus last year` : ""
          }.`,
        ],
      }),
    );
  }

  return domains;
}
