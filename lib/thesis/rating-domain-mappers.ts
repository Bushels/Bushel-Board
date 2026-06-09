import type { BuildRatingDomainInput, RatingDomainMetric, SourceFreshnessStatus } from "@/lib/thesis/rating-model";

type JsonRecord = Record<string, unknown>;

const CANADA_CGC_SOURCE = "cgc_observations";
const CANADA_SUPPLY_SOURCE = "supply_disposition";
const CANADA_CROP_PROGRESS_SOURCE = "canada_crop_progress";
const CANADA_GRAIN_MONITOR_SOURCE = "grain_monitor_snapshots";
const CANADA_PRODUCER_CARS_SOURCE = "producer_car_allocations";
const US_EXPORT_SALES_SOURCE = "usda_export_sales";
const US_CROP_PROGRESS_SOURCE = "usda_crop_progress";
const US_WASDE_SOURCE = "usda_wasde_mapped";
const US_QUARTERLY_STOCKS_SOURCE = "usda_quarterly_stocks";
const CFTC_COT_SOURCE = "cftc_cot_positions";
const GRAIN_PRICES_SOURCE = "grain_prices";

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

function formatSignedPct(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPct(value)}`;
}

function formatKt(value: number): string {
  return `${value.toLocaleString("en-CA", { maximumFractionDigits: 0 })} kt`;
}

function formatPrice(value: number | null, currency: string | null, unit: string | null): string {
  if (value === null) return "not available";
  const prefix = currency === "USD" || currency === "CAD" ? `${currency} ` : "";
  const suffix = unit ? `/${unit}` : "";
  return `${prefix}${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })}${suffix}`;
}

function formatContracts(value: number): string {
  return value.toLocaleString("en-CA");
}

function formatSignedContracts(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatContracts(value)} contracts`;
}

function roundMetricNumericValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function metric(params: {
  source: string;
  label: string;
  value: string;
  numericValue?: number | null;
  unit?: string;
  period?: string | null;
}): RatingDomainMetric {
  return {
    source: params.source,
    label: params.label,
    value: params.value,
    ...(params.numericValue !== null && params.numericValue !== undefined
      ? { numericValue: roundMetricNumericValue(params.numericValue) }
      : {}),
    ...(params.unit ? { unit: params.unit } : {}),
    ...(params.period !== undefined ? { period: params.period } : {}),
  };
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

function isActiveCanadaCropConditionWindow(packet: JsonRecord): boolean {
  const generatedAt = textValue(packet, "packet_generated_at");
  if (!generatedAt) return true;

  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) return true;

  const month = generatedDate.getUTCMonth() + 1;
  return month >= 5 && month <= 10;
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

const FRESHNESS_PRIORITY: Readonly<Record<SourceFreshnessStatus, number>> = Object.freeze({
  empty: 0,
  stale: 1,
  partial: 2,
  expected_lag: 2,
  watch: 2,
  strong: 3,
});

function combinedFreshnessForSources(
  packet: JsonRecord,
  sources: string[],
): { status: SourceFreshnessStatus; missingFreshnessProof: boolean } {
  if (sources.length === 0) return { status: "empty", missingFreshnessProof: true };

  const sourceFreshness = sources.map((source) => freshnessForSource(packet, source));
  const status = sourceFreshness.reduce<SourceFreshnessStatus>((weakest, freshness) => {
    return FRESHNESS_PRIORITY[freshness.status] < FRESHNESS_PRIORITY[weakest] ? freshness.status : weakest;
  }, "strong");

  return {
    status,
    missingFreshnessProof: sourceFreshness.some((freshness) => freshness.missingFreshnessProof),
  };
}

function appendSource(sources: string[], source: string): void {
  if (!sources.includes(source)) {
    sources.push(source);
  }
}

function requiredDomainFromSources(params: {
  domain: BuildRatingDomainInput["domain"];
  score: number;
  sources: string[];
  freshness: { status: SourceFreshnessStatus; missingFreshnessProof: boolean };
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
  metrics?: RatingDomainMetric[];
}): BuildRatingDomainInput {
  return {
    domain: params.domain,
    score: Math.max(-100, Math.min(100, params.score)),
    confidence: confidenceForFreshness(params.freshness.status),
    freshness_status: params.freshness.status,
    sources: params.freshness.missingFreshnessProof ? [] : params.sources,
    metrics: params.freshness.missingFreshnessProof ? [] : params.metrics ?? [],
    positive_evidence: params.positive_evidence ?? [],
    negative_evidence: params.negative_evidence ?? [],
    blocked_claims: params.blocked_claims ?? [],
    isRequired: true,
    isPrimaryDirectSource: true,
    missingFreshnessProof: params.freshness.missingFreshnessProof,
  };
}

function requiredDomain(params: {
  domain: BuildRatingDomainInput["domain"];
  score: number;
  source: string;
  freshness: { status: SourceFreshnessStatus; missingFreshnessProof: boolean };
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
  metrics?: RatingDomainMetric[];
}): BuildRatingDomainInput {
  return requiredDomainFromSources({
    ...params,
    sources: [params.source],
  });
}

function directContextDomain(params: {
  domain: BuildRatingDomainInput["domain"];
  score: number;
  source: string;
  freshness: { status: SourceFreshnessStatus; missingFreshnessProof: boolean };
  confidence?: BuildRatingDomainInput["confidence"];
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
  metrics?: RatingDomainMetric[];
}): BuildRatingDomainInput {
  return directContextDomainFromSources({
    ...params,
    sources: [params.source],
  });
}

function directContextDomainFromSources(params: {
  domain: BuildRatingDomainInput["domain"];
  score: number;
  sources: string[];
  freshness: { status: SourceFreshnessStatus; missingFreshnessProof: boolean };
  confidence?: BuildRatingDomainInput["confidence"];
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
  metrics?: RatingDomainMetric[];
}): BuildRatingDomainInput {
  return {
    domain: params.domain,
    score: Math.max(-100, Math.min(100, params.score)),
    confidence: params.confidence ?? confidenceForFreshness(params.freshness.status),
    freshness_status: params.freshness.status,
    sources: params.freshness.missingFreshnessProof ? [] : params.sources,
    metrics: params.freshness.missingFreshnessProof ? [] : params.metrics ?? [],
    positive_evidence: params.positive_evidence ?? [],
    negative_evidence: params.negative_evidence ?? [],
    blocked_claims: params.blocked_claims ?? [],
    isRequired: false,
    isPrimaryDirectSource: true,
    missingFreshnessProof: params.freshness.missingFreshnessProof,
  };
}

function mapCanadaLogisticsDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const logistics = asRecord(packet.logistics);
  const grainMonitor = asRecord(logistics.grain_monitor);
  const producerCars = asArray(logistics.producer_cars);
  const scoreSources: string[] = [];
  const metrics: RatingDomainMetric[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  const unloadsVsAveragePct = numberValue(grainMonitor, "var_to_four_week_avg_pct");
  if (unloadsVsAveragePct !== null) {
    if (unloadsVsAveragePct >= 15) {
      score += 15;
      appendSource(scoreSources, CANADA_GRAIN_MONITOR_SOURCE);
      metrics.push(metric({
        source: CANADA_GRAIN_MONITOR_SOURCE,
        label: "Unloads vs four-week average",
        value: formatSignedPct(unloadsVsAveragePct),
        numericValue: unloadsVsAveragePct,
        unit: "pct",
      }));
      positive.push(`Grain Monitor unloads are ${formatSignedPct(unloadsVsAveragePct)} versus the four-week average.`);
    } else if (unloadsVsAveragePct <= -15) {
      score -= 15;
      appendSource(scoreSources, CANADA_GRAIN_MONITOR_SOURCE);
      metrics.push(metric({
        source: CANADA_GRAIN_MONITOR_SOURCE,
        label: "Unloads vs four-week average",
        value: formatSignedPct(unloadsVsAveragePct),
        numericValue: unloadsVsAveragePct,
        unit: "pct",
      }));
      negative.push(`Grain Monitor unloads are ${formatSignedPct(unloadsVsAveragePct)} versus the four-week average.`);
    }
  }

  const terminalCapacityPct = numberValue(grainMonitor, "terminal_capacity_pct");
  if (terminalCapacityPct !== null && terminalCapacityPct >= 90) {
    score -= 10;
    appendSource(scoreSources, CANADA_GRAIN_MONITOR_SOURCE);
    metrics.push(metric({
      source: CANADA_GRAIN_MONITOR_SOURCE,
      label: "Terminal stocks/capacity",
      value: formatPct(terminalCapacityPct),
      numericValue: terminalCapacityPct,
      unit: "pct",
    }));
    negative.push(`Terminal stocks are using ${formatPct(terminalCapacityPct)} of reported terminal capacity.`);
  }

  const vesselsVancouver = numberValue(grainMonitor, "vessels_vancouver");
  if (vesselsVancouver !== null && vesselsVancouver >= 20) {
    score -= 10;
    appendSource(scoreSources, CANADA_GRAIN_MONITOR_SOURCE);
    metrics.push(metric({
      source: CANADA_GRAIN_MONITOR_SOURCE,
      label: "Vancouver vessel lineup",
      value: vesselsVancouver.toLocaleString("en-CA"),
      numericValue: vesselsVancouver,
      unit: "vessels",
    }));
    negative.push(`Vancouver vessel lineup is elevated at ${vesselsVancouver.toLocaleString("en-CA")} vessels.`);
  }

  const latestProducerCar = producerCars[0] ?? {};
  const weekCars = numberValue(latestProducerCar, "week_cars");
  if (weekCars !== null && weekCars >= 25) {
    score += 10;
    appendSource(scoreSources, CANADA_PRODUCER_CARS_SOURCE);
    metrics.push(metric({
      source: CANADA_PRODUCER_CARS_SOURCE,
      label: "Producer-car allocations",
      value: weekCars.toLocaleString("en-CA"),
      numericValue: weekCars,
      unit: "cars",
    }));
    positive.push(`Producer-car allocations add direct rail movement support with ${weekCars.toLocaleString("en-CA")} cars.`);
  }

  const usDestinationCars = numberValue(latestProducerCar, "dest_united_states");
  if (usDestinationCars !== null && usDestinationCars >= 10) {
    score += 10;
    appendSource(scoreSources, CANADA_PRODUCER_CARS_SOURCE);
    metrics.push(metric({
      source: CANADA_PRODUCER_CARS_SOURCE,
      label: "Producer cars to US destinations",
      value: usDestinationCars.toLocaleString("en-CA"),
      numericValue: usDestinationCars,
      unit: "cars",
    }));
    positive.push(`Producer cars include ${usDestinationCars.toLocaleString("en-CA")} cars to US destinations.`);
  }

  if (positive.length === 0 && negative.length === 0) return null;

  return directContextDomainFromSources({
    domain: "logistics",
    score,
    sources: scoreSources,
    freshness: combinedFreshnessForSources(packet, scoreSources),
    metrics,
    positive_evidence: positive,
    negative_evidence: negative,
  });
}

function mapPriceDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const latestPrice = asArray(packet.prices)[0] ?? {};
  if (Object.keys(latestPrice).length === 0) return null;

  const changePct = numberValue(latestPrice, "change_pct");
  if (changePct === null || Math.abs(changePct) < 0.5) return null;

  const freshness = freshnessForSource(packet, GRAIN_PRICES_SOURCE);
  const price = numberValue(latestPrice, "settlement_price");
  const priceDate = textValue(latestPrice, "price_date");
  const source = textValue(latestPrice, "source")?.toLowerCase() ?? "";
  const isBarchartLatestOnly = source === "barchart";
  const priceCopy = formatPrice(price, textValue(latestPrice, "currency"), textValue(latestPrice, "unit"));
  const dateCopy = priceDate ? ` on ${priceDate}` : "";
  const provisionalCopy = isBarchartLatestOnly
    ? " Barchart latest-only scrape; volume/open interest unavailable, so treat this as provisional price momentum only."
    : "";
  const scoreMagnitude = isBarchartLatestOnly ? 10 : 20;
  const confidence = isBarchartLatestOnly ? "low" : confidenceForFreshness(freshness.status);
  const metrics = [
    metric({
      source: GRAIN_PRICES_SOURCE,
      label: "Futures change",
      value: formatPct(changePct),
      numericValue: changePct,
      unit: "pct",
      period: priceDate,
    }),
    metric({
      source: GRAIN_PRICES_SOURCE,
      label: "Settlement price",
      value: priceCopy,
      numericValue: price,
      unit: textValue(latestPrice, "unit") ?? undefined,
      period: priceDate,
    }),
  ];

  if (freshness.status !== "strong") {
    return directContextDomain({
      domain: "price",
      score: 0,
      source: GRAIN_PRICES_SOURCE,
      freshness,
      confidence,
      metrics,
      blocked_claims: ["price_context_requires_fresh_grain_prices"],
    });
  }

  if (changePct >= 0.5) {
    return directContextDomain({
      domain: "price",
      score: scoreMagnitude,
      source: GRAIN_PRICES_SOURCE,
      freshness,
      confidence,
      metrics,
      positive_evidence: [
        `Fresh grain-price context shows futures follow-through: ${formatPct(changePct)} at ${priceCopy}${dateCopy}.${provisionalCopy}`,
      ],
    });
  }

  return directContextDomain({
    domain: "price",
    score: -scoreMagnitude,
    source: GRAIN_PRICES_SOURCE,
    freshness,
    confidence,
    metrics,
    negative_evidence: [
      `Fresh grain-price context shows futures pressure: ${formatPct(changePct)} at ${priceCopy}${dateCopy}.${provisionalCopy}`,
    ],
  });
}

function mapCftcPositioningDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const primaryPosition = asArray(packet.positioning).find((row) => textValue(row, "mapping_type") === "primary");
  if (!primaryPosition) return null;

  const mmLong = numberValue(primaryPosition, "managed_money_long");
  const mmShort = numberValue(primaryPosition, "managed_money_short");
  if (mmLong === null || mmShort === null) return null;

  const changeLong = numberValue(primaryPosition, "change_managed_money_long");
  const changeShort = numberValue(primaryPosition, "change_managed_money_short");
  const net = mmLong - mmShort;
  const wow = changeLong !== null && changeShort !== null ? changeLong - changeShort : null;
  const freshness = freshnessForSource(packet, CFTC_COT_SOURCE);
  const metrics = [
    metric({
      source: CFTC_COT_SOURCE,
      label: "Managed-money net",
      value: formatSignedContracts(net),
      numericValue: net,
      unit: "contracts",
    }),
    ...(wow !== null
      ? [
        metric({
          source: CFTC_COT_SOURCE,
          label: "Weekly net change",
          value: formatSignedContracts(wow),
          numericValue: wow,
          unit: "contracts",
        }),
      ]
      : []),
  ];

  if (net > 0 && (wow === null || wow >= 0)) {
    return requiredDomain({
      domain: "positioning",
      score: 20,
      source: CFTC_COT_SOURCE,
      freshness,
      metrics,
      positive_evidence: [
        `CFTC primary managed-money positioning is net long by ${formatContracts(net)} contracts${
          wow !== null ? `, with weekly net change ${formatSignedContracts(wow)}` : ""
        }.`,
      ],
    });
  }

  if (net < 0 || (wow !== null && wow < 0)) {
    return requiredDomain({
      domain: "positioning",
      score: -20,
      source: CFTC_COT_SOURCE,
      freshness,
      metrics,
      negative_evidence: [
        `CFTC primary managed-money positioning is ${
          net < 0 ? `net short by ${formatContracts(Math.abs(net))} contracts` : `net long by ${formatContracts(net)} contracts`
        }${wow !== null ? `, with weekly net change ${formatSignedContracts(wow)}` : ""}.`,
      ],
    });
  }

  return null;
}

function mapCanadaSupplyDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const supply = asRecord(packet.supply);
  const totalSupply = numberValue(supply, "total_supply_kt");
  const carryOut = numberValue(supply, "carry_out_kt");
  const carryOutShare = ratioPct(carryOut, totalSupply);
  if (carryOutShare === null || totalSupply === null || carryOut === null) return null;

  const freshness = freshnessForSource(packet, CANADA_SUPPLY_SOURCE);
  const metrics = [
    metric({
      source: CANADA_SUPPLY_SOURCE,
      label: "Carryout/total supply",
      value: formatPct(carryOutShare),
      numericValue: carryOutShare,
      unit: "pct",
    }),
    metric({
      source: CANADA_SUPPLY_SOURCE,
      label: "Carryout",
      value: formatKt(carryOut),
      numericValue: carryOut,
      unit: "kt",
    }),
    metric({
      source: CANADA_SUPPLY_SOURCE,
      label: "Total supply",
      value: formatKt(totalSupply),
      numericValue: totalSupply,
      unit: "kt",
    }),
  ];

  if (carryOutShare <= 8) {
    return requiredDomain({
      domain: "supply",
      score: 30,
      source: CANADA_SUPPLY_SOURCE,
      freshness,
      metrics,
      positive_evidence: [
        `Supply-disposition carryout is tight at ${formatPct(carryOutShare)} of total supply (${formatKt(carryOut)} carryout against ${formatKt(
          totalSupply,
        )} total supply).`,
      ],
    });
  }

  if (carryOutShare >= 18) {
    return requiredDomain({
      domain: "supply",
      score: -30,
      source: CANADA_SUPPLY_SOURCE,
      freshness,
      metrics,
      negative_evidence: [
        `Supply-disposition carryout is heavy at ${formatPct(carryOutShare)} of total supply (${formatKt(carryOut)} carryout against ${formatKt(
          totalSupply,
        )} total supply).`,
      ],
    });
  }

  return null;
}

function mapUsSupplyDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const supply = asRecord(packet.supply);
  const wasde = asRecord(supply.wasde);
  const quarterlyStocks = asRecord(supply.quarterly_stocks);
  if (Object.keys(wasde).length === 0 && Object.keys(quarterlyStocks).length === 0) return null;

  const stocksToUse = numberValue(wasde, "stocks_to_use_pct");
  const endingStocksDirection = textValue(wasde, "ending_stocks_direction");
  const endingStocksMmt = numberValue(wasde, "ending_stocks_mmt");
  const endingStocksChangeKt = numberValue(wasde, "ending_stocks_change_kt");
  const stocksSurpriseKt = numberValue(quarterlyStocks, "vs_wasde_estimate_kt");
  const stocksYoyPct = numberValue(quarterlyStocks, "change_vs_year_ago_pct");
  const totalStocksKt = numberValue(quarterlyStocks, "total_stocks_kt");
  const reportDate = textValue(quarterlyStocks, "report_date");
  const scoreSources: string[] = [];
  const metrics: RatingDomainMetric[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  if (endingStocksChangeKt !== null && endingStocksChangeKt <= -500) {
    score += 35;
    appendSource(scoreSources, US_WASDE_SOURCE);
    metrics.push(metric({
      source: US_WASDE_SOURCE,
      label: "Ending stocks revision",
      value: formatKt(endingStocksChangeKt),
      numericValue: endingStocksChangeKt,
      unit: "kt",
    }));
    positive.push(`WASDE lowered ending stocks by ${formatKt(Math.abs(endingStocksChangeKt))}.`);
  } else if (endingStocksChangeKt !== null && endingStocksChangeKt >= 500) {
    score -= 35;
    appendSource(scoreSources, US_WASDE_SOURCE);
    metrics.push(metric({
      source: US_WASDE_SOURCE,
      label: "Ending stocks revision",
      value: formatKt(endingStocksChangeKt),
      numericValue: endingStocksChangeKt,
      unit: "kt",
    }));
    negative.push(`WASDE raised ending stocks by ${formatKt(endingStocksChangeKt)}.`);
  } else if (endingStocksDirection === "down" || (stocksToUse !== null && stocksToUse <= 10)) {
    score += 25;
    appendSource(scoreSources, US_WASDE_SOURCE);
    if (stocksToUse !== null) {
      metrics.push(metric({
        source: US_WASDE_SOURCE,
        label: "Stocks/use",
        value: formatPct(stocksToUse),
        numericValue: stocksToUse,
        unit: "pct",
      }));
    }
    if (endingStocksMmt !== null) {
      metrics.push(metric({
        source: US_WASDE_SOURCE,
        label: "Ending stocks",
        value: `${endingStocksMmt.toFixed(2)} mmt`,
        numericValue: endingStocksMmt,
        unit: "mmt",
      }));
    }
    positive.push(
      `WASDE balance is tightening${
        stocksToUse !== null ? ` with stocks/use at ${formatPct(stocksToUse)}` : ""
      }${endingStocksMmt !== null ? ` and ending stocks at ${endingStocksMmt.toFixed(2)} mmt` : ""}.`,
    );
  } else if (endingStocksDirection === "up" || (stocksToUse !== null && stocksToUse >= 20)) {
    score -= 25;
    appendSource(scoreSources, US_WASDE_SOURCE);
    if (stocksToUse !== null) {
      metrics.push(metric({
        source: US_WASDE_SOURCE,
        label: "Stocks/use",
        value: formatPct(stocksToUse),
        numericValue: stocksToUse,
        unit: "pct",
      }));
    }
    if (endingStocksMmt !== null) {
      metrics.push(metric({
        source: US_WASDE_SOURCE,
        label: "Ending stocks",
        value: `${endingStocksMmt.toFixed(2)} mmt`,
        numericValue: endingStocksMmt,
        unit: "mmt",
      }));
    }
    negative.push(
      `WASDE balance is loosening${
        stocksToUse !== null ? ` with stocks/use at ${formatPct(stocksToUse)}` : ""
      }${endingStocksMmt !== null ? ` and ending stocks at ${endingStocksMmt.toFixed(2)} mmt` : ""}.`,
    );
  }

  const stocksReportSuffix = reportDate ? ` as of ${reportDate}` : "";
  const totalStocksCopy = totalStocksKt !== null ? `${formatKt(totalStocksKt)} on hand${stocksReportSuffix}` : `reported stocks${stocksReportSuffix}`;

  if ((stocksSurpriseKt !== null && stocksSurpriseKt <= -1_000) || (stocksYoyPct !== null && stocksYoyPct <= -5)) {
    score += 30;
    appendSource(scoreSources, US_QUARTERLY_STOCKS_SOURCE);
    if (totalStocksKt !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Quarterly stocks",
        value: formatKt(totalStocksKt),
        numericValue: totalStocksKt,
        unit: "kt",
        period: reportDate,
      }));
    }
    if (stocksSurpriseKt !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Stocks vs WASDE context",
        value: formatKt(stocksSurpriseKt),
        numericValue: stocksSurpriseKt,
        unit: "kt",
        period: reportDate,
      }));
    }
    if (stocksYoyPct !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Stocks vs last year",
        value: formatSignedPct(stocksYoyPct),
        numericValue: stocksYoyPct,
        unit: "pct",
        period: reportDate,
      }));
    }
    positive.push(
      `USDA quarterly stocks are tighter than expected: ${totalStocksCopy}${quarterlyStocksComparisonCopy(
        stocksSurpriseKt,
        stocksYoyPct,
      )}.`,
    );
  } else if ((stocksSurpriseKt !== null && stocksSurpriseKt >= 1_000) || (stocksYoyPct !== null && stocksYoyPct >= 5)) {
    score -= 30;
    appendSource(scoreSources, US_QUARTERLY_STOCKS_SOURCE);
    if (totalStocksKt !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Quarterly stocks",
        value: formatKt(totalStocksKt),
        numericValue: totalStocksKt,
        unit: "kt",
        period: reportDate,
      }));
    }
    if (stocksSurpriseKt !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Stocks vs WASDE context",
        value: formatKt(stocksSurpriseKt),
        numericValue: stocksSurpriseKt,
        unit: "kt",
        period: reportDate,
      }));
    }
    if (stocksYoyPct !== null) {
      metrics.push(metric({
        source: US_QUARTERLY_STOCKS_SOURCE,
        label: "Stocks vs last year",
        value: formatSignedPct(stocksYoyPct),
        numericValue: stocksYoyPct,
        unit: "pct",
        period: reportDate,
      }));
    }
    negative.push(
      `USDA quarterly stocks are heavier than expected: ${totalStocksCopy}${quarterlyStocksComparisonCopy(
        stocksSurpriseKt,
        stocksYoyPct,
      )}.`,
    );
  }

  if (positive.length === 0 && negative.length === 0) return null;

  return requiredDomainFromSources({
    domain: "supply",
    score,
    sources: scoreSources,
    freshness: combinedFreshnessForSources(packet, scoreSources),
    metrics,
    positive_evidence: positive,
    negative_evidence: negative,
  });
}

function quarterlyStocksComparisonCopy(stocksSurpriseKt: number | null, stocksYoyPct: number | null): string {
  const comparisons: string[] = [];
  if (stocksSurpriseKt !== null) {
    comparisons.push(
      `${formatKt(Math.abs(stocksSurpriseKt))} ${stocksSurpriseKt < 0 ? "below" : "above"} WASDE context`,
    );
  }
  if (stocksYoyPct !== null) {
    comparisons.push(`${formatPct(Math.abs(stocksYoyPct))} ${stocksYoyPct < 0 ? "below" : "above"} last year`);
  }

  return comparisons.length > 0 ? `, ${comparisons.join(" and ")}` : "";
}

function latestCanadaProvinceMetricRows(rows: JsonRecord[], metric: string): JsonRecord[] {
  const byProvince = new Map<string, JsonRecord>();

  for (const row of rows) {
    if (textValue(row, "metric") !== metric) continue;
    if (textValue(row, "region_scope") !== "province") continue;
    if (numberValue(row, "value_pct") === null) continue;

    const province = textValue(row, "province_code");
    if (!province) continue;

    const existing = byProvince.get(province);
    const reportDate = textValue(row, "report_date") ?? "";
    const existingDate = existing ? textValue(existing, "report_date") ?? "" : "";
    if (!existing || reportDate >= existingDate) {
      byProvince.set(province, row);
    }
  }

  return Array.from(byProvince.values());
}

function averageCanadaMetricPct(rows: JsonRecord[], key = "value_pct"): number | null {
  const values = rows
    .map((row) => numberValue(row, key))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function canadaMetricEvidenceSuffix(rows: JsonRecord[], key = "value_pct"): string {
  const provinceValues = rows
    .map((row) => {
      const province = textValue(row, "province_code");
      const value = numberValue(row, key);
      if (!province || value === null) return null;
      return `${province} ${formatPct(value)}`;
    })
    .filter((value): value is string => value !== null);

  return provinceValues.length > 0 ? ` (${provinceValues.join(", ")})` : "";
}

function canadaConditionDelta(rows: JsonRecord[]): { value: number; label: string } | null {
  const fiveYearDelta = averageCanadaMetricPct(rows, "value_vs_five_year_avg_pct");
  if (fiveYearDelta !== null) return { value: fiveYearDelta, label: "five-year average" };

  const previousYearDelta = averageCanadaMetricPct(rows, "value_vs_previous_year_pct");
  if (previousYearDelta !== null) return { value: previousYearDelta, label: "last year" };

  return null;
}

function canadaConditionDeltaCopy(delta: { value: number; label: string } | null): string {
  return delta ? `, ${formatSignedPct(delta.value)} versus ${delta.label}` : "";
}

function canadaDevelopmentEvidenceSuffix(rows: JsonRecord[]): string {
  const values = rows
    .map((row) => {
      const province = textValue(row, "province_code");
      const cropName = textValue(row, "crop_name");
      const value = numberValue(row, "value_pct");
      if (!province || !cropName || value === null) return null;
      return `${province} ${cropName} ${formatPct(value)} behind`;
    })
    .filter((value): value is string => value !== null);

  return values.length > 0 ? ` (${values.join(", ")})` : "";
}

function canadaMoistureEvidenceSuffix(rows: JsonRecord[]): string {
  const values = rows
    .map((row) => {
      const province = textValue(row, "province_code");
      const cropName = textValue(row, "crop_name");
      const value = numberValue(row, "value_pct");
      if (!province || !cropName || value === null) return null;
      return `${province} ${cropName} ${formatPct(value)} adequate/surplus`;
    })
    .filter((value): value is string => value !== null);

  return values.length > 0 ? ` (${values.join(", ")})` : "";
}

function mapCanadaCropProgressWeatherDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  const supply = asRecord(packet.supply);
  const cropProgressRows = asArray(supply.canada_crop_progress);
  const seededRows = latestCanadaProvinceMetricRows(cropProgressRows, "seeded_pct");
  const seededPct = averageCanadaMetricPct(seededRows);
  const freshness = freshnessForSource(packet, CANADA_CROP_PROGRESS_SOURCE);
  const metrics: RatingDomainMetric[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;
  let hasDirectCropProgressSignal = false;
  let hasProxyWeatherSignal = false;

  if (seededPct !== null) {
    const evidenceSuffix = canadaMetricEvidenceSuffix(seededRows);
    hasDirectCropProgressSignal = true;

    if (seededPct <= 25) {
      score += 30;
      metrics.push(metric({
        source: CANADA_CROP_PROGRESS_SOURCE,
        label: "Seeded average",
        value: formatPct(seededPct),
        numericValue: seededPct,
        unit: "pct",
      }));
      positive.push(
        `Canada crop-progress seeded average is only ${formatPct(seededPct)}${evidenceSuffix}, adding seasonal delay risk.`,
      );
    } else if (seededPct >= 75) {
      score -= 25;
      metrics.push(metric({
        source: CANADA_CROP_PROGRESS_SOURCE,
        label: "Seeded average",
        value: formatPct(seededPct),
        numericValue: seededPct,
        unit: "pct",
      }));
      negative.push(
        `Canada crop-progress seeded average is ${formatPct(seededPct)}${evidenceSuffix}, reducing seasonal seeding risk.`,
      );
    }
  }

  if (isActiveCanadaCropConditionWindow(packet)) {
    const conditionRows = latestCanadaProvinceMetricRows(cropProgressRows, "condition_good_excellent_pct");
    const conditionPct = averageCanadaMetricPct(conditionRows);
    const conditionDelta = canadaConditionDelta(conditionRows);

    if (conditionPct !== null) {
      const evidenceSuffix = canadaMetricEvidenceSuffix(conditionRows);
      const deltaCopy = canadaConditionDeltaCopy(conditionDelta);
      const deltaValue = conditionDelta?.value ?? null;
      hasDirectCropProgressSignal = true;

      if (conditionPct <= 50 || (deltaValue !== null && deltaValue <= -8)) {
        score += 30;
        metrics.push(metric({
          source: CANADA_CROP_PROGRESS_SOURCE,
          label: "Good/excellent average",
          value: formatPct(conditionPct),
          numericValue: conditionPct,
          unit: "pct",
        }));
        if (deltaValue !== null) {
          metrics.push(metric({
            source: CANADA_CROP_PROGRESS_SOURCE,
            label: `Good/excellent vs ${conditionDelta?.label ?? "benchmark"}`,
            value: formatSignedPct(deltaValue),
            numericValue: deltaValue,
            unit: "pct",
          }));
        }
        positive.push(
          `Canada crop condition is stressed: good/excellent averages ${formatPct(conditionPct)}${evidenceSuffix}${deltaCopy}.`,
        );
      } else if (conditionPct >= 75 || (deltaValue !== null && deltaValue >= 8)) {
        score -= 25;
        metrics.push(metric({
          source: CANADA_CROP_PROGRESS_SOURCE,
          label: "Good/excellent average",
          value: formatPct(conditionPct),
          numericValue: conditionPct,
          unit: "pct",
        }));
        if (deltaValue !== null) {
          metrics.push(metric({
            source: CANADA_CROP_PROGRESS_SOURCE,
            label: `Good/excellent vs ${conditionDelta?.label ?? "benchmark"}`,
            value: formatSignedPct(deltaValue),
            numericValue: deltaValue,
            unit: "pct",
          }));
        }
        negative.push(
          `Canada crop condition adds supply cushion: good/excellent averages ${formatPct(conditionPct)}${evidenceSuffix}${deltaCopy}.`,
        );
      }
    }

    const moistureRows = latestCanadaProvinceMetricRows(cropProgressRows, "soil_moisture_adequate_surplus_pct");
    const moisturePct = averageCanadaMetricPct(moistureRows);
    const moistureDelta = canadaConditionDelta(moistureRows);

    if (moisturePct !== null) {
      const evidenceSuffix = canadaMoistureEvidenceSuffix(moistureRows);
      const deltaCopy = canadaConditionDeltaCopy(moistureDelta);
      const deltaValue = moistureDelta?.value ?? null;
      hasProxyWeatherSignal = true;

      if (moisturePct <= 55 || (deltaValue !== null && deltaValue <= -8)) {
        score += 10;
        metrics.push(metric({
          source: CANADA_CROP_PROGRESS_SOURCE,
          label: "Adequate/surplus moisture proxy",
          value: formatPct(moisturePct),
          numericValue: moisturePct,
          unit: "pct",
        }));
        if (deltaValue !== null) {
          metrics.push(metric({
            source: CANADA_CROP_PROGRESS_SOURCE,
            label: `Moisture vs ${moistureDelta?.label ?? "benchmark"}`,
            value: formatSignedPct(deltaValue),
            numericValue: deltaValue,
            unit: "pct",
          }));
        }
        positive.push(
          `Canada cropland moisture proxy is dry: adequate/surplus moisture averages ${formatPct(
            moisturePct,
          )}${evidenceSuffix}${deltaCopy}, adding crop-stress risk.`,
        );
      } else if (moisturePct >= 75 || (deltaValue !== null && deltaValue >= 8)) {
        score -= 6;
        metrics.push(metric({
          source: CANADA_CROP_PROGRESS_SOURCE,
          label: "Adequate/surplus moisture proxy",
          value: formatPct(moisturePct),
          numericValue: moisturePct,
          unit: "pct",
        }));
        if (deltaValue !== null) {
          metrics.push(metric({
            source: CANADA_CROP_PROGRESS_SOURCE,
            label: `Moisture vs ${moistureDelta?.label ?? "benchmark"}`,
            value: formatSignedPct(deltaValue),
            numericValue: deltaValue,
            unit: "pct",
          }));
        }
        negative.push(
          `Canada cropland moisture proxy is supportive: adequate/surplus moisture averages ${formatPct(
            moisturePct,
          )}${evidenceSuffix}${deltaCopy}, lowering near-term moisture stress.`,
        );
      }
    }
  }

  const developmentBehindRows = latestCanadaProvinceMetricRows(cropProgressRows, "development_behind_pct");
  const developmentBehindPct = averageCanadaMetricPct(developmentBehindRows);

  if (developmentBehindPct !== null) {
    const evidenceSuffix = canadaDevelopmentEvidenceSuffix(developmentBehindRows);
    hasProxyWeatherSignal = true;

    if (developmentBehindPct >= 60) {
      score += 12;
      metrics.push(metric({
        source: CANADA_CROP_PROGRESS_SOURCE,
        label: "Behind-normal development proxy",
        value: formatPct(developmentBehindPct),
        numericValue: developmentBehindPct,
        unit: "pct",
      }));
      positive.push(
        `Canada crop-development timing proxy is delayed: ${formatPct(
          developmentBehindPct,
        )} behind normal development${evidenceSuffix}.`,
      );
    } else if (developmentBehindPct <= 25) {
      score -= 8;
      metrics.push(metric({
        source: CANADA_CROP_PROGRESS_SOURCE,
        label: "Behind-normal development proxy",
        value: formatPct(developmentBehindPct),
        numericValue: developmentBehindPct,
        unit: "pct",
      }));
      negative.push(
        `Canada crop-development timing proxy is mostly on pace: only ${formatPct(
          developmentBehindPct,
        )} behind normal development${evidenceSuffix}.`,
      );
    }
  }

  if (positive.length === 0 && negative.length === 0) return null;

  return {
    domain: "weather",
    score,
    confidence: hasProxyWeatherSignal ? "low" : confidenceForFreshness(freshness.status),
    freshness_status: freshness.status,
    sources: freshness.missingFreshnessProof ? [] : [CANADA_CROP_PROGRESS_SOURCE],
    metrics: freshness.missingFreshnessProof ? [] : metrics,
    positive_evidence: positive,
    negative_evidence: negative,
    isRequired: hasDirectCropProgressSignal,
    isPrimaryDirectSource: hasDirectCropProgressSignal,
    isProxy: hasProxyWeatherSignal,
    missingFreshnessProof: freshness.missingFreshnessProof,
  };
}

function mapUsCropProgressWeatherDomain(packet: JsonRecord): BuildRatingDomainInput | null {
  if (!isActiveUsCropProgressWindow(packet)) return null;

  const supply = asRecord(packet.supply);
  const cropProgress = asRecord(supply.crop_progress);
  const usTotal = asRecord(cropProgress.us_total);
  const goodExcellent = numberValue(usTotal, "good_excellent_pct");
  const geYoy = numberValue(usTotal, "ge_pct_yoy_change");
  const plantedVsAvg = numberValue(usTotal, "planted_pct_vs_avg");
  const freshness = freshnessForSource(packet, US_CROP_PROGRESS_SOURCE);
  const metrics: RatingDomainMetric[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  if (goodExcellent !== null) {
    if (goodExcellent <= 50 || (geYoy !== null && geYoy <= -8)) {
      score += 35;
      metrics.push(metric({
        source: US_CROP_PROGRESS_SOURCE,
        label: "Good/excellent",
        value: formatPct(goodExcellent),
        numericValue: goodExcellent,
        unit: "pct",
      }));
      if (geYoy !== null) {
        metrics.push(metric({
          source: US_CROP_PROGRESS_SOURCE,
          label: "Good/excellent YoY",
          value: formatSignedPct(geYoy),
          numericValue: geYoy,
          unit: "pct",
        }));
      }
      positive.push(
        `US crop stress supports price: good/excellent is ${formatPct(goodExcellent)}${
          geYoy !== null ? `, ${formatPct(geYoy)} versus last year` : ""
        }.`,
      );
    } else if (goodExcellent >= 70 || (geYoy !== null && geYoy >= 8)) {
      score -= 30;
      metrics.push(metric({
        source: US_CROP_PROGRESS_SOURCE,
        label: "Good/excellent",
        value: formatPct(goodExcellent),
        numericValue: goodExcellent,
        unit: "pct",
      }));
      if (geYoy !== null) {
        metrics.push(metric({
          source: US_CROP_PROGRESS_SOURCE,
          label: "Good/excellent YoY",
          value: formatSignedPct(geYoy),
          numericValue: geYoy,
          unit: "pct",
        }));
      }
      negative.push(
        `US crop condition adds supply cushion: good/excellent is ${formatPct(goodExcellent)}${
          geYoy !== null ? `, ${formatPct(geYoy)} versus last year` : ""
        }.`,
      );
    }
  }

  if (plantedVsAvg !== null) {
    if (plantedVsAvg <= -5) {
      score += 20;
      metrics.push(metric({
        source: US_CROP_PROGRESS_SOURCE,
        label: "Planting pace vs average",
        value: formatSignedPct(plantedVsAvg),
        numericValue: plantedVsAvg,
        unit: "pct",
      }));
      positive.push(`US planting pace is behind normal by ${formatPct(Math.abs(plantedVsAvg))}.`);
    } else if (plantedVsAvg >= 5) {
      score -= 20;
      metrics.push(metric({
        source: US_CROP_PROGRESS_SOURCE,
        label: "Planting pace vs average",
        value: formatSignedPct(plantedVsAvg),
        numericValue: plantedVsAvg,
        unit: "pct",
      }));
      negative.push(`US planting pace is ahead of normal by ${formatPct(plantedVsAvg)}.`);
    }
  }

  if (positive.length === 0 && negative.length === 0) return null;

  return requiredDomain({
    domain: "weather",
    score,
    source: US_CROP_PROGRESS_SOURCE,
    freshness,
    metrics,
    positive_evidence: positive,
    negative_evidence: negative,
  });
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
  const exportDeliveryRatio = ratioPct(exportKt, totalKt);
  const processDeliveryRatio = ratioPct(processKt, totalKt);
  const freshness = freshnessForSource(packet, CANADA_CGC_SOURCE);
  const domains: BuildRatingDomainInput[] = [];

  const supplyDomain = mapCanadaSupplyDomain(packet);
  if (supplyDomain) {
    domains.push(supplyDomain);
  }

  const weatherDomain = mapCanadaCropProgressWeatherDomain(packet);
  if (weatherDomain) {
    domains.push(weatherDomain);
  }

  let demandScore = 0;
  const demandMetrics: RatingDomainMetric[] = [];
  const demandPositive: string[] = [];
  const demandNegative: string[] = [];

  if (exportDeliveryRatio !== null) {
    if (exportDeliveryRatio >= 45) {
      demandScore += 20;
      demandMetrics.push(metric({
        source: CANADA_CGC_SOURCE,
        label: "Current-week export/delivery ratio",
        value: formatPct(exportDeliveryRatio),
        numericValue: exportDeliveryRatio,
        unit: "pct",
      }));
      demandPositive.push(`Current-week export/delivery ratio is ${formatPct(exportDeliveryRatio)} against current-week producer deliveries.`);
    } else if (exportDeliveryRatio <= 20) {
      demandScore -= 20;
      demandMetrics.push(metric({
        source: CANADA_CGC_SOURCE,
        label: "Current-week export/delivery ratio",
        value: formatPct(exportDeliveryRatio),
        numericValue: exportDeliveryRatio,
        unit: "pct",
      }));
      demandNegative.push(`Current-week export/delivery ratio is only ${formatPct(exportDeliveryRatio)} against current-week producer deliveries.`);
    }
  }

  if (processDeliveryRatio !== null) {
    if (processDeliveryRatio >= 30) {
      demandScore += 15;
      demandMetrics.push(metric({
        source: CANADA_CGC_SOURCE,
        label: "Current-week process/delivery ratio",
        value: formatPct(processDeliveryRatio),
        numericValue: processDeliveryRatio,
        unit: "pct",
      }));
      demandPositive.push(`Current-week process/delivery ratio is ${formatPct(processDeliveryRatio)} against current-week producer deliveries.`);
    } else if (processDeliveryRatio <= 10) {
      demandScore -= 15;
      demandMetrics.push(metric({
        source: CANADA_CGC_SOURCE,
        label: "Current-week process/delivery ratio",
        value: formatPct(processDeliveryRatio),
        numericValue: processDeliveryRatio,
        unit: "pct",
      }));
      demandNegative.push(`Current-week process/delivery ratio is only ${formatPct(processDeliveryRatio)} against current-week producer deliveries.`);
    }
  }

  if (demandPositive.length > 0 || demandNegative.length > 0) {
    domains.push(
      requiredDomain({
        domain: "demand",
        score: demandScore,
        source: CANADA_CGC_SOURCE,
        freshness,
        metrics: demandMetrics,
        positive_evidence: demandPositive,
        negative_evidence: demandNegative,
      }),
    );
  }

  // Movement is bearish only when unusually heavy producer deliveries (>=800 kt)
  // enter the pipeline while both export/delivery (<=20%) and process/delivery
  // (<=10%) disappearance ratios remain weak.
  if (
    totalKt !== null &&
    totalKt >= 800 &&
    exportDeliveryRatio !== null &&
    processDeliveryRatio !== null &&
    exportDeliveryRatio <= 20 &&
    processDeliveryRatio <= 10
  ) {
    domains.push(
      requiredDomain({
        domain: "movement",
        score: -35,
        source: CANADA_CGC_SOURCE,
        freshness,
        metrics: [
          metric({
            source: CANADA_CGC_SOURCE,
            label: "Producer deliveries",
            value: formatKt(totalKt),
            numericValue: totalKt,
            unit: "kt",
          }),
          metric({
            source: CANADA_CGC_SOURCE,
            label: "Current-week export/delivery ratio",
            value: formatPct(exportDeliveryRatio),
            numericValue: exportDeliveryRatio,
            unit: "pct",
          }),
          metric({
            source: CANADA_CGC_SOURCE,
            label: "Current-week process/delivery ratio",
            value: formatPct(processDeliveryRatio),
            numericValue: processDeliveryRatio,
            unit: "pct",
          }),
        ],
        negative_evidence: [
          `High producer deliveries entered the pipeline (${totalKt.toFixed(0)} kt) while disappearance is weak: export/delivery ratio ${formatPct(
            exportDeliveryRatio,
          )}, process/delivery ratio ${formatPct(processDeliveryRatio)}.`,
        ],
      }),
    );
  }

  const positioningDomain = mapCftcPositioningDomain(packet);
  if (positioningDomain) {
    domains.push(positioningDomain);
  }

  const logisticsDomain = mapCanadaLogisticsDomain(packet);
  if (logisticsDomain) {
    domains.push(logisticsDomain);
  }

  const priceDomain = mapPriceDomain(packet);
  if (priceDomain) {
    domains.push(priceDomain);
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
  const exportSalesMetrics = exportPace !== null
    ? [
      metric({
        source: US_EXPORT_SALES_SOURCE,
        label: "Export projection pace",
        value: formatPct(exportPace),
        numericValue: exportPace,
        unit: "pct",
      }),
    ]
    : [];

  if (Object.keys(exportSales).length > 0) {
    if (exportPace === null) {
      domains.push(
        requiredDomain({
          domain: "demand",
          score: 0,
          source: US_EXPORT_SALES_SOURCE,
          freshness: exportFreshness,
          metrics: exportSalesMetrics,
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
          metrics: exportSalesMetrics,
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
          metrics: exportSalesMetrics,
          negative_evidence: [`USDA export-sales admitted only ${formatPct(exportPace)} export projection pace.`],
        }),
      );
    }
  }

  const supplyDomain = mapUsSupplyDomain(packet);
  if (supplyDomain) {
    domains.push(supplyDomain);
  }

  const weatherDomain = mapUsCropProgressWeatherDomain(packet);
  if (weatherDomain) {
    domains.push(weatherDomain);
  }

  const positioningDomain = mapCftcPositioningDomain(packet);
  if (positioningDomain) {
    domains.push(positioningDomain);
  }

  const priceDomain = mapPriceDomain(packet);
  if (priceDomain) {
    domains.push(priceDomain);
  }

  return domains;
}
