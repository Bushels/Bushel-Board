type JsonRecord = Record<string, unknown>;

export const CANOLA_MARKET_READ_VERSION = "canola-market-read-v1";

export type SourceConfidence = "high" | "medium" | "low";
export type CanolaMarketReadStatus = "available" | "unavailable";

export interface MarketReadFact {
  label: string;
  value: number | string;
  unit: string;
  period: string;
  source_name: string;
  source_table: string;
  source_row_key: string;
  scope: string;
  confidence: SourceConfidence;
  quality_flags: string[];
  notes?: string;
}

export interface MarketReadChange {
  label: string;
  current_value: number | null;
  previous_value: number | null;
  change_value: number | null;
  change_pct: number | null;
  unit: string;
  current_period: string;
  previous_period: string | null;
  source_name: string;
  source_table: string;
}

export interface MarketReadInterpretation {
  title: string;
  body: string;
  source_names: string[];
  confidence: SourceConfidence;
}

export interface MarketReadSpeculation {
  label: string;
  statement: string;
  trigger: string;
  source_names: string[];
}

export interface MarketReadWatchItem {
  label: string;
  watch_for: string;
  why_it_matters: string;
  source_names: string[];
}

export interface MarketReadFreshness {
  source_name: string;
  source_lane: string | null;
  expected_cadence: string | null;
  latest_period: string | null;
  latest_period_end: string | null;
  rows_available: number | null;
  freshness_status: string;
  thesis_use: string | null;
  action_hint: string | null;
  quality_flags: string[];
}

export interface MarketReadQualityWarning {
  source_name: string;
  status: string;
  message: string;
  action_hint: string | null;
  severity: "info" | "watch" | "blocker";
}

export interface MarketReadSourceLink {
  source_name: string;
  label: string;
  source_table: string;
  registry_source_id: string | null;
  url: string | null;
}

export interface CanolaMarketRead {
  version: typeof CANOLA_MARKET_READ_VERSION;
  status: CanolaMarketReadStatus;
  reason: string | null;
  grain: string;
  crop_year: string | null;
  grain_week: number | null;
  generated_at: string;
  packet_generated_at: string | null;
  headline: string;
  bottom_line: string;
  what_changed: MarketReadChange[];
  facts: MarketReadFact[];
  interpretation: MarketReadInterpretation[];
  speculation: MarketReadSpeculation[];
  farmer_watch_items: MarketReadWatchItem[];
  freshness: MarketReadFreshness[];
  quality_warnings: MarketReadQualityWarning[];
  source_links: MarketReadSourceLink[];
}

const SOURCE_LINKS: MarketReadSourceLink[] = [
  {
    source_name: "cgc_observations",
    label: "Canadian Grain Commission Grain Statistics Weekly",
    source_table: "cgc_observations",
    registry_source_id: "cgc_weekly_stats",
    url: "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/",
  },
  {
    source_name: "producer_car_allocations",
    label: "Canadian Grain Commission Producer Car Allocations",
    source_table: "producer_car_allocations",
    registry_source_id: "cgc_producer_cars",
    url: "https://www.grainscanada.gc.ca/en/grain-research/statistics/producer-car/{cropYear}/pca-hwp-en.csv",
  },
  {
    source_name: "grain_monitor_snapshots",
    label: "Quorum Grain Monitor weekly performance update",
    source_table: "grain_monitor_snapshots",
    registry_source_id: "grain_monitor_weekly",
    url: "https://grainmonitor.ca/",
  },
  {
    source_name: "supply_disposition",
    label: "AAFC / Statistics Canada supply-disposition",
    source_table: "supply_disposition",
    registry_source_id: "aafc_statscan_supply",
    url: "https://www23.statcan.gc.ca/imdb/p2SV.pl?Function=getSurvey&Id=1570305",
  },
  {
    source_name: "grain_prices",
    label: "Bushel Board grain price feed",
    source_table: "grain_prices",
    registry_source_id: "grain_prices",
    url: null,
  },
  {
    source_name: "cftc_cot_positions",
    label: "CFTC Commitments of Traders",
    source_table: "cftc_cot_positions",
    registry_source_id: "cftc_cot",
    url: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  },
  {
    source_name: "crop_plans",
    label: "Bushel Board farmer-entered crop plans",
    source_table: "crop_plans",
    registry_source_id: "farmer_inventory",
    url: null,
  },
  {
    source_name: "crop_plan_deliveries",
    label: "Bushel Board farmer-entered deliveries",
    source_table: "crop_plan_deliveries",
    registry_source_id: "farmer_inventory",
    url: null,
  },
  {
    source_name: "posted_prices",
    label: "Bushel Board posted cash prices",
    source_table: "posted_prices",
    registry_source_id: "posted_prices",
    url: null,
  },
  {
    source_name: "weather_cache",
    label: "Bushel Board weather cache",
    source_table: "weather_cache",
    registry_source_id: "weather",
    url: null,
  },
  {
    source_name: "usda_wasde_raw",
    label: "USDA WASDE raw archive",
    source_table: "usda_wasde_raw",
    registry_source_id: "usda_wasde",
    url: "https://www.usda.gov/about-usda/general-information/staff-offices/office-chief-economist/commodity-markets/wasde-report",
  },
  {
    source_name: "usda_wasde_mapped",
    label: "USDA WASDE mapped context",
    source_table: "usda_wasde_mapped",
    registry_source_id: "usda_wasde",
    url: "https://www.usda.gov/historical-wasde-report-data-3",
  },
];

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
  return typeof value === "string" && value.trim() ? value : null;
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

function percent(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function round(value: number | null, decimals = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function kt(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toLocaleString("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kt`;
}

function pct(value: number | null): string {
  if (value === null) return "not available";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function ratioPctText(value: number | null): string {
  if (value === null) return "not available";
  return `${value.toFixed(1)}%`;
}

function addFact(facts: MarketReadFact[], fact: MarketReadFact): void {
  if (fact.value === null || fact.value === undefined || fact.value === "") return;
  facts.push(fact);
}

function sourceStatus(
  freshnessBySource: Map<string, MarketReadFreshness>,
  sourceName: string,
): string | null {
  return freshnessBySource.get(sourceName)?.freshness_status ?? null;
}

function statusFlag(status: string | null): string[] {
  if (!status || status === "strong") return [];
  return [status.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")];
}

function confidenceFromStatus(status: string | null, hasHardWarning = false): SourceConfidence {
  if (hasHardWarning) return "low";
  if (!status || status === "strong") return "high";
  if (status === "empty" || status === "broken" || status === "legacy") return "low";
  return "medium";
}

function normalizeFreshness(packet: JsonRecord, grainWeek: number | null): MarketReadFreshness[] {
  return asArray(packet.freshness).map((row) => {
    const sourceName = textValue(row, "source_name") ?? "unknown";
    const status = textValue(row, "freshness_status") ?? "unknown";
    const flags = statusFlag(status);
    const latestPeriod = textValue(row, "latest_period");

    if (sourceName === "grain_monitor_snapshots" && grainWeek !== null) {
      const weekMatch = latestPeriod?.match(/wk\s+(\d+)/i);
      const sourceWeek = weekMatch ? Number(weekMatch[1]) : null;
      if (sourceWeek !== null && sourceWeek < grainWeek) flags.push("source_lag_expected");
    }

    return {
      source_name: sourceName,
      source_lane: textValue(row, "source_lane"),
      expected_cadence: textValue(row, "expected_cadence"),
      latest_period: latestPeriod,
      latest_period_end: textValue(row, "latest_period_end"),
      rows_available: numberValue(row, "rows_available"),
      freshness_status: status,
      thesis_use: textValue(row, "thesis_use"),
      action_hint: textValue(row, "action_hint"),
      quality_flags: [...new Set(flags)],
    };
  });
}

function warningSeverity(status: string): "info" | "watch" | "blocker" {
  if (status === "broken" || status === "empty") return "blocker";
  if (status === "legacy" || status.includes("stale")) return "watch";
  return "info";
}

function addWarning(
  warnings: MarketReadQualityWarning[],
  warning: MarketReadQualityWarning,
): void {
  const key = `${warning.source_name}:${warning.status}:${warning.message}`;
  const exists = warnings.some(
    (item) => `${item.source_name}:${item.status}:${item.message}` === key,
  );
  if (!exists) warnings.push(warning);
}

function normalizeWarnings(packet: JsonRecord): MarketReadQualityWarning[] {
  return asArray(packet.quality_warnings).map((row) => {
    const sourceName = textValue(row, "source_name") ?? "unknown";
    const status = textValue(row, "status") ?? "unknown";
    const actionHint = textValue(row, "action_hint");
    return {
      source_name: sourceName,
      status,
      message: `${sourceName} is ${status}.`,
      action_hint: actionHint,
      severity: warningSeverity(status),
    };
  });
}

function changeMetric(
  label: string,
  currentValue: number | null,
  previousValue: number | null,
  unit: string,
  currentPeriod: string,
  previousPeriod: string | null,
  sourceName: string,
  sourceTable: string,
): MarketReadChange {
  const changeValue =
    currentValue !== null && previousValue !== null ? round(currentValue - previousValue, 1) : null;
  return {
    label,
    current_value: currentValue,
    previous_value: previousValue,
    change_value: changeValue,
    change_pct:
      currentValue !== null && previousValue !== null && previousValue !== 0
        ? round(((currentValue - previousValue) / previousValue) * 100, 1)
        : null,
    unit,
    current_period: currentPeriod,
    previous_period: previousPeriod,
    source_name: sourceName,
    source_table: sourceTable,
  };
}

function buildWhatChanged(packet: JsonRecord, previousPacket: JsonRecord): MarketReadChange[] {
  const currentWeek = numberValue(packet, "grain_week");
  const previousWeek = numberValue(previousPacket, "grain_week");
  const demand = asRecord(packet.demand);
  const previousDemand = asRecord(previousPacket.demand);
  const delivery = asRecord(demand.producer_deliveries_current_week);
  const previousDelivery = asRecord(previousDemand.producer_deliveries_current_week);
  const exports = asRecord(demand.exports);
  const previousExports = asRecord(previousDemand.exports);

  if (currentWeek === null || previousWeek === null) return [];

  return [
    changeMetric(
      "Producer deliveries",
      numberValue(delivery, "total_kt"),
      numberValue(previousDelivery, "total_kt"),
      "Ktonnes",
      `grain_week_${currentWeek}`,
      `grain_week_${previousWeek}`,
      "cgc_observations",
      "v_country_producer_deliveries",
    ),
    changeMetric(
      "Exports",
      numberValue(exports, "current_week_kt"),
      numberValue(previousExports, "current_week_kt"),
      "Ktonnes",
      `grain_week_${currentWeek}`,
      `grain_week_${previousWeek}`,
      "cgc_observations",
      "cgc_observations",
    ),
  ];
}

function buildFacts(
  packet: JsonRecord,
  freshnessBySource: Map<string, MarketReadFreshness>,
): MarketReadFact[] {
  const facts: MarketReadFact[] = [];
  const grain = textValue(packet, "grain") ?? "Canola";
  const cropYear = textValue(packet, "crop_year") ?? "unknown";
  const grainWeek = numberValue(packet, "grain_week");
  const demand = asRecord(packet.demand);
  const deliveryCurrent = asRecord(demand.producer_deliveries_current_week);
  const deliveryCropYear = asRecord(demand.producer_deliveries_crop_year);
  const exports = asRecord(demand.exports);
  const supply = asRecord(packet.supply);
  const logistics = asRecord(packet.logistics);
  const grainMonitor = asRecord(logistics.grain_monitor);
  const producerCars = asArray(logistics.producer_cars);
  const prices = asArray(packet.prices);
  const positioning = asArray(packet.positioning);
  const farmerBehavior = asRecord(packet.farmer_behavior);

  const cgcStatus = sourceStatus(freshnessBySource, "cgc_observations");
  const cgcFlags = statusFlag(cgcStatus);
  const cgcConfidence = confidenceFromStatus(cgcStatus);
  const cgcPeriod = `crop_year ${cropYear}, grain_week ${grainWeek ?? "unknown"}`;

  addFact(facts, {
    label: "Producer deliveries, current week",
    value: numberValue(deliveryCurrent, "total_kt") ?? "",
    unit: "Ktonnes",
    period: cgcPeriod,
    source_name: "cgc_observations",
    source_table: "v_country_producer_deliveries",
    source_row_key: `${cropYear}:wk${grainWeek}:${grain}:Current Week`,
    scope: "Canada plus documented producer-car formula",
    confidence: cgcConfidence,
    quality_flags: cgcFlags,
    notes: "Primary deliveries plus Process producer deliveries plus Producer Cars shipments.",
  });
  addFact(facts, {
    label: "Producer deliveries, crop year to date",
    value: numberValue(deliveryCropYear, "total_kt") ?? "",
    unit: "Ktonnes",
    period: cgcPeriod,
    source_name: "cgc_observations",
    source_table: "v_country_producer_deliveries",
    source_row_key: `${cropYear}:wk${grainWeek}:${grain}:Crop Year`,
    scope: "Canada plus documented producer-car formula",
    confidence: cgcConfidence,
    quality_flags: cgcFlags,
  });
  addFact(facts, {
    label: "Exports, current week",
    value: numberValue(exports, "current_week_kt") ?? "",
    unit: "Ktonnes",
    period: cgcPeriod,
    source_name: "cgc_observations",
    source_table: "cgc_observations",
    source_row_key: `${cropYear}:wk${grainWeek}:${grain}:exports:Current Week`,
    scope: "Canada terminal/direct export flow formula",
    confidence: cgcConfidence,
    quality_flags: cgcFlags,
    notes: "Terminal exports plus direct export-destination flows where present in the packet RPC.",
  });
  addFact(facts, {
    label: "Exports, crop year to date",
    value: numberValue(exports, "crop_year_kt") ?? "",
    unit: "Ktonnes",
    period: cgcPeriod,
    source_name: "cgc_observations",
    source_table: "cgc_observations",
    source_row_key: `${cropYear}:wk${grainWeek}:${grain}:exports:Crop Year`,
    scope: "Canada terminal/direct export flow formula",
    confidence: cgcConfidence,
    quality_flags: cgcFlags,
  });

  const supplyStatus = sourceStatus(freshnessBySource, "supply_disposition");
  const supplyCropYear = textValue(supply, "crop_year");
  const supplyMismatch = Boolean(supplyCropYear && supplyCropYear !== cropYear);
  const supplyFlags = [
    ...statusFlag(supplyStatus),
    ...(supplyMismatch ? ["source_crop_year_differs_from_packet"] : []),
  ];
  const supplyConfidence = confidenceFromStatus(supplyStatus, supplyMismatch);
  const supplyPeriod = `source crop_year ${supplyCropYear ?? "unknown"}, source ${
    textValue(supply, "source") ?? "unknown"
  }`;

  for (const [key, label] of [
    ["production_kt", "AAFC/StatsCan production"],
    ["total_supply_kt", "AAFC/StatsCan total supply"],
    ["carry_in_kt", "AAFC/StatsCan carry-in"],
    ["carry_out_kt", "AAFC/StatsCan carry-out"],
  ] as const) {
    addFact(facts, {
      label,
      value: numberValue(supply, key) ?? "",
      unit: "Ktonnes",
      period: supplyPeriod,
      source_name: "supply_disposition",
      source_table: "v_supply_disposition_current",
      source_row_key: `${supplyCropYear ?? "unknown"}:${grain}:supply_disposition`,
      scope: "Canada balance sheet",
      confidence: supplyConfidence,
      quality_flags: supplyFlags,
      notes: supplyMismatch ? "Shown as lagged balance-sheet context, not same-year CGC truth." : undefined,
    });
  }

  for (const [key, label, unit, flags] of [
    ["seeded_area_acres", "StatsCan final seeded area", "acres", []],
    ["harvested_area_acres", "StatsCan final harvested area", "acres", []],
    ["yield_bu_per_acre", "StatsCan final yield", "bu/ac", []],
    [
      "intended_seeded_area_acres",
      "StatsCan intended seeded area",
      "acres",
      ["preliminary_intentions"],
    ],
  ] as const) {
    addFact(facts, {
      label,
      value: numberValue(supply, key) ?? "",
      unit,
      period: supplyPeriod,
      source_name: "supply_disposition",
      source_table: "v_supply_disposition_current",
      source_row_key: `${supplyCropYear ?? "unknown"}:${grain}:${key}`,
      scope: "Canada crop-size baseline",
      confidence: supplyConfidence,
      quality_flags: [...supplyFlags, ...flags],
      notes:
        key === "intended_seeded_area_acres"
          ? "Preliminary seeding-intention estimate. Replace with final seeded area when released."
          : undefined,
    });
  }

  const gmStatus = sourceStatus(freshnessBySource, "grain_monitor_snapshots");
  const gmWeek = numberValue(grainMonitor, "grain_week");
  const gmLagged = grainWeek !== null && gmWeek !== null && gmWeek < grainWeek;
  const gmFlags = [
    ...statusFlag(gmStatus),
    ...(gmLagged ? ["source_lag_expected"] : []),
  ];
  const gmConfidence = confidenceFromStatus(gmStatus, false);
  const gmPeriod = `grain_week ${gmWeek ?? "unknown"}, report_date ${
    textValue(grainMonitor, "report_date") ?? "unknown"
  }`;

  for (const [key, label, unit] of [
    ["country_deliveries_kt", "Grain Monitor country deliveries", "Ktonnes"],
    ["country_stocks_kt", "Grain Monitor country stocks", "Ktonnes"],
    ["terminal_stocks_kt", "Grain Monitor terminal stocks", "Ktonnes"],
    ["terminal_capacity_pct", "Grain Monitor terminal capacity", "Percent"],
    ["total_unloads_cars", "Grain Monitor unloads", "Cars"],
    ["vessels_vancouver", "Vessels waiting at Vancouver", "Vessels"],
  ] as const) {
    addFact(facts, {
      label,
      value: numberValue(grainMonitor, key) ?? "",
      unit,
      period: gmPeriod,
      source_name: "grain_monitor_snapshots",
      source_table: "grain_monitor_snapshots",
      source_row_key: `${textValue(grainMonitor, "crop_year") ?? cropYear}:wk${gmWeek ?? "unknown"}`,
      scope: "Canada logistics",
      confidence: gmConfidence,
      quality_flags: gmFlags,
      notes: gmLagged ? "Naturally lagged versus the CGC grain week." : undefined,
    });
  }

  const latestProducerCar = producerCars[0] ?? {};
  const pcStatus = sourceStatus(freshnessBySource, "producer_car_allocations");
  const pcWeek = numberValue(latestProducerCar, "grain_week");
  const pcForward = grainWeek !== null && pcWeek !== null && pcWeek > grainWeek;
  const pcFlags = [
    ...statusFlag(pcStatus),
    ...(pcForward ? ["forward_week"] : []),
  ];
  addFact(facts, {
    label: "Producer car allocation, latest week",
    value: numberValue(latestProducerCar, "week_cars") ?? "",
    unit: "Cars",
    period: `grain_week ${pcWeek ?? "unknown"}`,
    source_name: "producer_car_allocations",
    source_table: "producer_car_allocations",
    source_row_key: `${cropYear}:wk${pcWeek ?? "unknown"}:${grain}`,
    scope: "Canada producer cars",
    confidence: confidenceFromStatus(pcStatus),
    quality_flags: pcFlags,
    notes: pcForward ? "Forward-looking allocation relative to the CGC movement week." : undefined,
  });

  const canolaPrice = prices.find((row) => textValue(row, "grain") === "Canola") ?? {};
  const priceStatus = sourceStatus(freshnessBySource, "grain_prices");
  addFact(facts, {
    label: "ICE canola futures sample",
    value: numberValue(canolaPrice, "settlement_price") ?? "",
    unit: `${textValue(canolaPrice, "currency") ?? ""} ${textValue(canolaPrice, "unit") ?? ""}`.trim(),
    period: textValue(canolaPrice, "price_date") ?? "unknown price date",
    source_name: "grain_prices",
    source_table: "grain_prices",
    source_row_key: `${textValue(canolaPrice, "grain") ?? grain}:${textValue(canolaPrice, "contract") ?? "unknown"}:${
      textValue(canolaPrice, "price_date") ?? "unknown"
    }`,
    scope: "Futures price context",
    confidence: confidenceFromStatus(priceStatus),
    quality_flags: statusFlag(priceStatus),
    notes: "Futures follow-through only. This is not a local cash bid or basis.",
  });

  const primaryPosition = positioning.find((row) => textValue(row, "mapping_type") === "primary");
  if (primaryPosition) {
    const cotStatus = sourceStatus(freshnessBySource, "cftc_cot_positions");
    addFact(facts, {
      label: "Managed money canola net position",
      value:
        (numberValue(primaryPosition, "managed_money_long") ?? 0) -
        (numberValue(primaryPosition, "managed_money_short") ?? 0),
      unit: "Contracts",
      period: textValue(primaryPosition, "report_date") ?? "unknown report date",
      source_name: "cftc_cot_positions",
      source_table: "cftc_cot_positions",
      source_row_key: `${textValue(primaryPosition, "commodity") ?? "CANOLA"}:${
        textValue(primaryPosition, "report_date") ?? "unknown"
      }`,
      scope: "Futures positioning",
      confidence: confidenceFromStatus(cotStatus),
      quality_flags: statusFlag(cotStatus),
      notes: "Primary canola mapping only; secondary oilseed contracts stay labelled as proxy context.",
    });
  }

  const cropPlanCount = numberValue(farmerBehavior, "crop_plan_count");
  const userCount = numberValue(farmerBehavior, "user_count");
  if (cropPlanCount !== null) {
    const farmerFlags = userCount !== null && userCount < 5 ? ["small_sample", "privacy_threshold_not_met"] : [];
    addFact(facts, {
      label: "Farmer-entered canola crop plans",
      value: cropPlanCount,
      unit: "Plans",
      period: cropYear,
      source_name: "crop_plans",
      source_table: "crop_plans",
      source_row_key: `${cropYear}:${grain}:crop_plans`,
      scope: "Bushel Board users",
      confidence: farmerFlags.length > 0 ? "low" : "medium",
      quality_flags: farmerFlags,
      notes: "Small user counts must not be published as peer-behavior evidence.",
    });
  }

  return facts;
}

function buildInterpretation(
  packet: JsonRecord,
  facts: MarketReadFact[],
  freshnessBySource: Map<string, MarketReadFreshness>,
): MarketReadInterpretation[] {
  const demand = asRecord(packet.demand);
  const delivery = asRecord(demand.producer_deliveries_current_week);
  const exports = asRecord(demand.exports);
  const supply = asRecord(packet.supply);
  const logistics = asRecord(packet.logistics);
  const grainMonitor = asRecord(logistics.grain_monitor);
  const grainWeek = numberValue(packet, "grain_week");
  const supplyCropYear = textValue(supply, "crop_year");
  const cropYear = textValue(packet, "crop_year");
  const currentDeliveryKt = numberValue(delivery, "total_kt");
  const currentExportsKt = numberValue(exports, "current_week_kt");
  const processKt = numberValue(delivery, "process_deliveries_kt");
  const exportDeliveryRatio = percent(currentExportsKt, currentDeliveryKt);
  const processDeliveryRatio = percent(processKt, currentDeliveryKt);
  const gmWeek = numberValue(grainMonitor, "grain_week");
  const priceStatus = sourceStatus(freshnessBySource, "grain_prices");
  const cotStatus = sourceStatus(freshnessBySource, "cftc_cot_positions");

  const interpretations: MarketReadInterpretation[] = [];

  if (currentDeliveryKt !== null && currentExportsKt !== null) {
    interpretations.push({
      title: "Commercial pull",
      body: `CGC week ${grainWeek ?? "unknown"} shows ${kt(currentDeliveryKt)} delivered and ${kt(
        currentExportsKt,
      )} exported. The current-week export/delivery ratio was ${ratioPctText(round(
        exportDeliveryRatio,
        1,
      ))} against producer deliveries, but this is not total demand because domestic crush is a separate pull.`,
      source_names: ["cgc_observations"],
      confidence: "high",
    });
  }

  if (processDeliveryRatio !== null) {
    interpretations.push({
      title: "Domestic crush signal",
      body: `The current-week process/delivery ratio was ${ratioPctText(round(
        processDeliveryRatio,
        1,
      ))} against producer deliveries. That keeps domestic crush visible in the read instead of treating export movement as the whole demand story.`,
      source_names: ["cgc_observations"],
      confidence: "high",
    });
  }

  if (supplyCropYear && cropYear && supplyCropYear !== cropYear) {
    interpretations.push({
      title: "Balance-sheet lag",
      body: `The supply-disposition row is labelled ${supplyCropYear} while the movement packet is ${cropYear}. Use production and total supply as lagged context until the AAFC/StatsCan update path is current for the packet year.`,
      source_names: ["supply_disposition"],
      confidence: "medium",
    });
  }

  if (gmWeek !== null && grainWeek !== null) {
    interpretations.push({
      title: "Logistics timing",
      body:
        gmWeek < grainWeek
          ? `Grain Monitor is at week ${gmWeek} while CGC movement is week ${grainWeek}. It can explain port and elevator pressure, but it should not be smoothed into same-week CGC movement.`
          : `Grain Monitor is aligned with CGC week ${grainWeek}; logistics context can be read beside current movement.`,
      source_names: ["grain_monitor_snapshots"],
      confidence: "medium",
    });
  }

  if (priceStatus && priceStatus !== "strong") {
    interpretations.push({
      title: "Price follow-through",
      body: `The price lane is ${priceStatus}. Futures can confirm or reject the physical read, but it should not carry the thesis while the source is stale-risk and local cash bids are empty.`,
      source_names: ["grain_prices", "posted_prices"],
      confidence: "medium",
    });
  }

  if (cotStatus && cotStatus !== "strong") {
    interpretations.push({
      title: "Positioning lag",
      body: `CFTC positioning is ${cotStatus}. Use it as delayed market-structure context, not as a fresh farmer action signal.`,
      source_names: ["cftc_cot_positions"],
      confidence: "medium",
    });
  }

  if (facts.some((fact) => fact.quality_flags.includes("privacy_threshold_not_met"))) {
    interpretations.push({
      title: "Farmer-behavior privacy",
      body: "Farmer-entered canola plan data is too thin for a public peer-behavior claim. It can prove the input lane exists, not a market-wide farmer pattern.",
      source_names: ["crop_plans"],
      confidence: "low",
    });
  }

  return interpretations;
}

function buildSpeculation(packet: JsonRecord): MarketReadSpeculation[] {
  const demand = asRecord(packet.demand);
  const delivery = asRecord(demand.producer_deliveries_current_week);
  const exports = asRecord(demand.exports);
  const currentDeliveryKt = numberValue(delivery, "total_kt");
  const currentExportsKt = numberValue(exports, "current_week_kt");
  const exportDeliveryRatio = percent(currentExportsKt, currentDeliveryKt);

  const speculation: MarketReadSpeculation[] = [
    {
      label: "Cash-basis gap",
      statement:
        "Best guess: farmer cheque relevance remains unproven until local cash bids or basis are wired. Futures strength alone is not enough to prove a local cash-price read.",
      trigger:
        "Prove or disprove when posted_prices has current Canola rows or another documented cash-bid lane is admitted in the source registry.",
      source_names: ["posted_prices", "grain_prices"],
    },
  ];

  if (exportDeliveryRatio !== null) {
    speculation.push({
      label: "Export/delivery watch",
      statement:
        exportDeliveryRatio >= 80
          ? "Best guess: the current-week export/delivery ratio is high, but this needs one more CGC week before it becomes a stronger read."
          : "Best guess: the current-week export/delivery ratio is not carrying the whole demand story; domestic crush and logistics need to explain more of the movement.",
      trigger:
        "Check the next get_canada_thesis_packet result: current-week exports divided by current-week producer deliveries, plus current price freshness.",
      source_names: ["cgc_observations", "grain_prices"],
    });
  }

  return speculation;
}

function buildWatchItems(packet: JsonRecord): MarketReadWatchItem[] {
  const grainWeek = numberValue(packet, "grain_week");
  return [
    {
      label: "Next CGC movement print",
      watch_for: `Canola producer deliveries and exports in grain week ${
        grainWeek !== null ? grainWeek + 1 : "next"
      }.`,
      why_it_matters:
        "It proves whether the current export/delivery relationship is a one-week pulse or a real demand pull.",
      source_names: ["cgc_observations"],
    },
    {
      label: "Cash-bid lane",
      watch_for: "posted_prices moving from empty to current for Canola.",
      why_it_matters:
        "That is the farmer cheque. Without it, the read cannot make a local basis or hauling call.",
      source_names: ["posted_prices"],
    },
    {
      label: "Price refresh",
      watch_for: "A current ICE canola futures sample after weekends and holidays.",
      why_it_matters:
        "Fresh futures show whether physical movement is getting market follow-through.",
      source_names: ["grain_prices"],
    },
    {
      label: "Grain Monitor lag",
      watch_for: "Whether Grain Monitor catches up to the latest CGC week.",
      why_it_matters:
        "Logistics pressure is useful, but a lagged port/elevator read should not be treated as same-week movement.",
      source_names: ["grain_monitor_snapshots"],
    },
    {
      label: "AAFC/StatsCan supply update",
      watch_for: "Supply-disposition source crop year matching the packet crop year.",
      why_it_matters:
        "Production and carryout are balance-sheet anchors. A mismatched crop year is context, not current truth.",
      source_names: ["supply_disposition"],
    },
  ];
}

function buildSourceLinks(
  facts: MarketReadFact[],
  freshness: MarketReadFreshness[],
  cropYear: string | null,
): MarketReadSourceLink[] {
  const names = new Set<string>([
    ...facts.map((fact) => fact.source_name),
    ...freshness.map((row) => row.source_name),
  ]);

  return SOURCE_LINKS.filter((link) => names.has(link.source_name)).map((link) => ({
    ...link,
    url: cropYear && link.url ? link.url.replace("{cropYear}", cropYear) : link.url,
  }));
}

function sourceRunsAreEmpty(freshness: MarketReadFreshness[], packet: JsonRecord): boolean {
  const rawFreshness = asArray(packet.freshness);
  if (rawFreshness.length === 0) return false;
  return rawFreshness.every((row) => !row.last_success_at && !row.last_run_status);
}

function addDerivedWarnings(
  warnings: MarketReadQualityWarning[],
  packet: JsonRecord,
  facts: MarketReadFact[],
  freshness: MarketReadFreshness[],
): void {
  const cropYear = textValue(packet, "crop_year");
  const supply = asRecord(packet.supply);
  const supplyCropYear = textValue(supply, "crop_year");
  if (cropYear && supplyCropYear && cropYear !== supplyCropYear) {
    addWarning(warnings, {
      source_name: "supply_disposition",
      status: "lagged_context",
      message: `Supply-disposition crop year ${supplyCropYear} does not match packet crop year ${cropYear}.`,
      action_hint: "Use as labelled context only until the supply update routine is current.",
      severity: "watch",
    });
  }

  if (sourceRunsAreEmpty(freshness, packet)) {
    addWarning(warnings, {
      source_name: "source_runs",
      status: "empty",
      message:
        "source_runs has no run summaries yet, so freshness is falling back to source-table latest-row checks.",
      action_hint: "Let patched collectors write run summaries, then rerun the validator.",
      severity: "watch",
    });
  }

  const positioning = asArray(packet.positioning);
  const proxyRows = positioning.filter((row) => textValue(row, "mapping_type") !== "primary");
  if (proxyRows.length > 0) {
    addWarning(warnings, {
      source_name: "cftc_cot_positions",
      status: "proxy_mapping",
      message: `${proxyRows.length} CFTC positioning row(s) are secondary/proxy mappings, not direct canola truth.`,
      action_hint: "Keep proxy rows labelled in interpretation and public output.",
      severity: "watch",
    });
  }

  if (facts.some((fact) => fact.quality_flags.includes("privacy_threshold_not_met"))) {
    addWarning(warnings, {
      source_name: "crop_plans",
      status: "small_sample",
      message: "Farmer-entered canola data is below a safe public peer-comparison threshold.",
      action_hint: "Do not publish farmer-behavior claims until privacy thresholds are defined and met.",
      severity: "watch",
    });
  }
}

export function buildUnavailableCanolaMarketRead(reason: string, detail?: string): CanolaMarketRead {
  return {
    version: CANOLA_MARKET_READ_VERSION,
    status: "unavailable",
    reason,
    grain: "Canola",
    crop_year: null,
    grain_week: null,
    generated_at: new Date().toISOString(),
    packet_generated_at: null,
    headline: "Canola market read unavailable until source freshness validates",
    bottom_line: detail ?? "No recommendation.",
    what_changed: [],
    facts: [],
    interpretation: [],
    speculation: [],
    farmer_watch_items: [
      {
        label: "Data layer",
        watch_for: "get_canada_thesis_packet('Canola', ...) returning a facts packet.",
        why_it_matters: "The deterministic read fails closed instead of falling back to stale AI prose.",
        source_names: ["get_canada_thesis_packet"],
      },
    ],
    freshness: [],
    quality_warnings: [
      {
        source_name: "get_canada_thesis_packet",
        status: reason,
        message: detail ?? "Packet RPC is unavailable.",
        action_hint: "Verify Data Layer Foundation migrations and rerun the validator.",
        severity: "blocker",
      },
    ],
    source_links: [],
  };
}

export function buildCanolaMarketRead(
  packetInput: unknown,
  previousPacketInput: unknown = null,
): CanolaMarketRead {
  const packet = asRecord(packetInput);
  const grain = textValue(packet, "grain") ?? "Canola";
  const cropYear = textValue(packet, "crop_year");
  const grainWeek = numberValue(packet, "grain_week");

  if (!cropYear || grainWeek === null || Object.keys(packet).length === 0) {
    return buildUnavailableCanolaMarketRead(
      "data_layer_not_deployed",
      "get_canada_thesis_packet did not return a valid Canola packet.",
    );
  }

  const freshness = normalizeFreshness(packet, grainWeek);
  const freshnessBySource = new Map(freshness.map((row) => [row.source_name, row]));
  const facts = buildFacts(packet, freshnessBySource);
  const warnings = normalizeWarnings(packet);
  addDerivedWarnings(warnings, packet, facts, freshness);

  const previousPacket = asRecord(previousPacketInput);
  const whatChanged = Object.keys(previousPacket).length > 0 ? buildWhatChanged(packet, previousPacket) : [];
  const interpretation = buildInterpretation(packet, facts, freshnessBySource);
  const speculation = buildSpeculation(packet);
  const sourceLinks = buildSourceLinks(facts, freshness, cropYear);
  const delivery = facts.find((fact) => fact.label === "Producer deliveries, current week");
  const exports = facts.find((fact) => fact.label === "Exports, current week");
  const visibleWarningCount = warnings.filter((warning) => warning.severity !== "info").length;

  return {
    version: CANOLA_MARKET_READ_VERSION,
    status: "available",
    reason: null,
    grain,
    crop_year: cropYear,
    grain_week: grainWeek,
    generated_at: new Date().toISOString(),
    packet_generated_at: textValue(packet, "packet_generated_at"),
    headline: `${grain} market read wk ${grainWeek}: ${kt(
      typeof delivery?.value === "number" ? delivery.value : null,
    )} delivered, ${kt(typeof exports?.value === "number" ? exports.value : null)} exported, ${visibleWarningCount} source warning(s)`,
    bottom_line:
      "Source read only. Physical movement is visible, while stale-risk, empty, lagged, and proxy lanes stay labelled.",
    what_changed: whatChanged,
    facts,
    interpretation,
    speculation,
    farmer_watch_items: buildWatchItems(packet),
    freshness,
    quality_warnings: warnings,
    source_links: sourceLinks,
  };
}

function factToMarkdown(fact: MarketReadFact): string {
  const value =
    typeof fact.value === "number"
      ? fact.value.toLocaleString("en-CA", { maximumFractionDigits: 2 })
      : fact.value;
  const flags = fact.quality_flags.length > 0 ? ` [${fact.quality_flags.join(", ")}]` : "";
  return `- ${fact.label}: ${value} ${fact.unit} | ${fact.period} | ${fact.source_name}.${fact.source_table}${flags}`;
}

function changeToMarkdown(change: MarketReadChange): string {
  if (change.change_value === null) {
    return `- ${change.label}: no prior packet delta available.`;
  }
  const sign = change.change_value > 0 ? "+" : "";
  return `- ${change.label}: ${change.current_value?.toLocaleString("en-CA")} ${change.unit} (${sign}${change.change_value.toLocaleString("en-CA")} ${change.unit}, ${pct(change.change_pct)} vs ${change.previous_period})`;
}

export function renderCanolaMarketReadMarkdown(read: CanolaMarketRead): string {
  const lines: string[] = [
    `# ${read.headline}`,
    "",
    "## Bottom Line",
    read.bottom_line,
    "",
    "## What Changed",
    ...(read.what_changed.length > 0
      ? read.what_changed.map(changeToMarkdown)
      : ["- No prior-week packet delta available; no week-over-week change stated."]),
    "",
    "## Facts",
    ...(read.facts.length > 0 ? read.facts.map(factToMarkdown) : ["- No packet facts available."]),
    "",
    "## Interpretation",
    ...(read.interpretation.length > 0
      ? read.interpretation.map((item) => `- ${item.title}: ${item.body}`)
      : ["- No interpretation generated."]),
    "",
    "## Speculation",
    ...(read.speculation.length > 0
      ? read.speculation.map((item) => `- ${item.label}: ${item.statement} Trigger: ${item.trigger}`)
      : ["- None."]),
    "",
    "## Farmer Watch Items",
    ...read.farmer_watch_items.map(
      (item) => `- ${item.label}: ${item.watch_for} Why it matters: ${item.why_it_matters}`,
    ),
    "",
    "## Freshness",
    ...read.freshness.map((row) => {
      const flags = row.quality_flags.length > 0 ? ` [${row.quality_flags.join(", ")}]` : "";
      return `- ${row.source_name}: ${row.freshness_status}; latest=${row.latest_period ?? "none"}; rows=${
        row.rows_available ?? "unknown"
      }${flags}`;
    }),
    "",
    "## Quality Warnings",
    ...(read.quality_warnings.length > 0
      ? read.quality_warnings.map(
          (warning) =>
            `- ${warning.severity.toUpperCase()} ${warning.source_name}: ${warning.message} ${
              warning.action_hint ?? ""
            }`.trim(),
        )
      : ["- None."]),
    "",
    "## Source Links",
    ...read.source_links.map(
      (link) =>
        `- ${link.source_name}: ${link.label}${link.url ? ` (${link.url})` : ""}; registry=${link.registry_source_id ?? "none"}`,
    ),
  ];

  return `${lines.join("\n")}\n`;
}
