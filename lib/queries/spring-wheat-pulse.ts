import {
  getCanadaSeedingProgress,
  getLatestCanadaCropProgress,
} from "@/lib/queries/canada-seeding-progress";
import {
  getSeedingSeismograph,
  type SeismographRow,
} from "@/lib/queries/seeding-progress";
import { createClient } from "@/lib/supabase/server";

const CANADA_WATCHLIST = [
  {
    provinceCode: "AB",
    provinceName: "Alberta",
    centroidLng: -114.37,
    centroidLat: 53.93,
    sourceName: "Alberta Crop Reports",
    sourceUrl: "https://www.alberta.ca/alberta-crop-reports",
    summary: "Queued for Alberta's first 2026 crop-report release.",
  },
  {
    provinceCode: "SK",
    provinceName: "Saskatchewan",
    centroidLng: -106.45,
    centroidLat: 52.94,
    sourceName: "Saskatchewan Crop Report",
    sourceUrl:
      "https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/agribusiness-farmers-and-ranchers/market-and-trade-statistics/crops-statistics/crop-report",
    summary: "Queued for Saskatchewan's first 2026 crop-report release.",
  },
] as const;

const CANADA_CENTROIDS: Record<
  string,
  { centroidLng: number; centroidLat: number }
> = {
  AB: { centroidLng: -114.37, centroidLat: 53.93 },
  SK: { centroidLng: -106.45, centroidLat: 52.94 },
  MB: { centroidLng: -97.7, centroidLat: 53.76 },
};

const SUPPORTED_GRAINS = [
  {
    slug: "spring-wheat",
    label: "Spring Wheat",
    commodity: "WHEAT",
    usDisplayName: "spring wheat",
    usVerb: "is",
    usStateCodes: ["ID", "MN", "MT", "ND", "SD", "WA"],
    sourceResolution: "State-level USDA Spring Wheat, excluding durum",
    canadaNotePattern: /spring wheat/i,
    canadaContract:
      "Canada uses official provincial crop reports. Manitoba is live, but the current release is province-wide seeding with regional spring-wheat notes rather than a province-wide spring-wheat percentage.",
  },
  {
    slug: "corn",
    label: "Corn",
    commodity: "CORN",
    usDisplayName: "corn",
    usVerb: "is",
    usStateCodes: null,
    sourceResolution: "State-level USDA Corn",
    canadaNotePattern: /corn/i,
    canadaContract:
      "Canada uses official provincial crop reports. Manitoba is live, but the current release is province-wide seeding with regional corn notes rather than a province-wide corn percentage.",
  },
  {
    slug: "soybeans",
    label: "Soybeans",
    commodity: "SOYBEANS",
    usDisplayName: "soybeans",
    usVerb: "are",
    usStateCodes: null,
    sourceResolution: "State-level USDA Soybeans",
    canadaNotePattern: /soybeans?|soya/i,
    canadaContract:
      "Canada uses official provincial crop reports. Current Manitoba data is province-wide seeding; no province-wide soybean percentage has been loaded yet.",
  },
  {
    slug: "oats",
    label: "Oats",
    commodity: "OATS",
    usDisplayName: "oats",
    usVerb: "are",
    usStateCodes: null,
    sourceResolution: "State-level USDA Oats",
    canadaNotePattern: /oats?/i,
    canadaContract:
      "Canada uses official provincial crop reports. Current Manitoba data is province-wide seeding; no province-wide oat percentage has been loaded yet.",
  },
  {
    slug: "barley",
    label: "Barley",
    commodity: "BARLEY",
    usDisplayName: "barley",
    usVerb: "is",
    usStateCodes: null,
    sourceResolution: "State-level USDA Barley",
    canadaNotePattern: /barley/i,
    canadaContract:
      "Canada uses official provincial crop reports. Current Manitoba data is province-wide seeding; no province-wide barley percentage has been loaded yet.",
  },
  {
    slug: "sorghum",
    label: "Sorghum",
    commodity: "SORGHUM",
    usDisplayName: "sorghum",
    usVerb: "is",
    usStateCodes: null,
    sourceResolution: "State-level USDA Sorghum",
    canadaNotePattern: /sorghum/i,
    canadaContract:
      "Canada uses official provincial crop reports. Sorghum is not a core Canadian seeding-report crop, so Canada remains source-watch context rather than a crop-specific comparison.",
  },
] as const;

export type SeedingGrainSlug = (typeof SUPPORTED_GRAINS)[number]["slug"];

export interface SeedingGrainOption {
  slug: SeedingGrainSlug;
  label: string;
  href: string;
}

export type SeedingGrainConfig = (typeof SUPPORTED_GRAINS)[number];

export type SpringWheatMetricScope =
  | "usda_crop_progress"
  | "canada_crop_progress"
  | "canada_all_crop_with_regional_note"
  | "source_watch";

export interface SpringWheatTotalPulse {
  reportDate: string | null;
  plantedPct: number | null;
  emergedPct: number | null;
  plantedPctVsAvg: number | null;
  plantedPctPreviousYear: number | null;
  plantedPctYoyChange: number | null;
  emergedPctPreviousYear: number | null;
  emergedPctYoyChange: number | null;
  conditionVeryPoorPct: number | null;
  conditionPoorPct: number | null;
  conditionFairPct: number | null;
  conditionGoodPct: number | null;
  conditionExcellentPct: number | null;
  goodExcellentPct: number | null;
  conditionIndex: number | null;
  gePctYoyChange: number | null;
}

export interface SpringWheatPulseRegion {
  id: string;
  countryCode: "US" | "CA";
  regionCode: string;
  regionName: string;
  centroidLng: number;
  centroidLat: number;
  reportDate: string | null;
  status: "reported" | "scheduled";
  metricScope: SpringWheatMetricScope;
  plantedPct: number | null;
  emergedPct: number | null;
  seededPct: number | null;
  plantedPctPreviousYear: number | null;
  plantedPctYoyChange: number | null;
  emergedPctPreviousYear: number | null;
  emergedPctYoyChange: number | null;
  seededPctPreviousYear: number | null;
  seededPctYoyChange: number | null;
  paceDeltaPct: number | null;
  conditionVeryPoorPct: number | null;
  conditionPoorPct: number | null;
  conditionFairPct: number | null;
  conditionGoodPct: number | null;
  conditionExcellentPct: number | null;
  goodExcellentPct: number | null;
  conditionIndex: number | null;
  gePctYoyChange: number | null;
  metricLabel: string;
  sourceName: string;
  sourceUrl: string;
  sourceResolution: string;
  summary: string;
  notes: string[];
}

export interface SpringWheatPulsePayload {
  cropYear: number;
  grainSlug: SeedingGrainSlug;
  grainLabel: string;
  usDisplayName: string;
  commodity: string;
  availableGrains: SeedingGrainOption[];
  latestUsWeek: string | null;
  latestCanadaReportDate: string | null;
  usTotal: SpringWheatTotalPulse | null;
  regions: SpringWheatPulseRegion[];
  pulseCall: string;
  sourceContract: string[];
  sourceRunId: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtPct(value: number | null): string {
  return value === null ? "not reported" : `${Math.round(value)}%`;
}

function fmtSigned(value: number | null): string {
  if (value === null) return "not reported";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function latestWeek(rows: SeismographRow[]): string | null {
  return rows.map((row) => row.week_ending).sort().at(-1) ?? null;
}

interface ConditionSnapshot {
  conditionVeryPoorPct: number | null;
  conditionPoorPct: number | null;
  conditionFairPct: number | null;
  conditionGoodPct: number | null;
  conditionExcellentPct: number | null;
  goodExcellentPct: number | null;
  conditionIndex: number | null;
  gePctYoyChange: number | null;
}

function grainOptions(): SeedingGrainOption[] {
  return SUPPORTED_GRAINS.map((grain) => ({
    slug: grain.slug,
    label: grain.label,
    href: `/seeding/${grain.slug}`,
  }));
}

export function getSeedingGrainConfig(
  slug: string,
): SeedingGrainConfig | null {
  return (
    SUPPORTED_GRAINS.find((grain) => grain.slug === slug) ??
    null
  );
}

function stateSummary(row: SeismographRow): string {
  const parts = [
    `${fmtPct(row.planted_pct)} planted`,
    `${fmtPct(row.emerged_pct)} emerged`,
    `${fmtSigned(row.planted_pct_vs_avg)} vs 5-year average`,
  ];
  return parts.join(", ");
}

async function getUsTotalPulse(
  commodity: string,
  cropYear: number,
): Promise<SpringWheatTotalPulse | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usda_crop_progress")
    .select(
      "week_ending,planted_pct,emerged_pct,planted_pct_vs_avg,planted_pct_previous_year,planted_pct_yoy_change,emerged_pct_previous_year,emerged_pct_yoy_change,condition_very_poor_pct,condition_poor_pct,condition_fair_pct,condition_good_pct,condition_excellent_pct,good_excellent_pct,condition_index,ge_pct_yoy_change",
    )
    .eq("commodity", commodity)
    .eq("state", "US TOTAL")
    .eq("crop_year", cropYear)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    reportDate:
      typeof data.week_ending === "string" ? data.week_ending : null,
    plantedPct: num(data.planted_pct),
    emergedPct: num(data.emerged_pct),
    plantedPctVsAvg: num(data.planted_pct_vs_avg),
    plantedPctPreviousYear: num(data.planted_pct_previous_year),
    plantedPctYoyChange: num(data.planted_pct_yoy_change),
    emergedPctPreviousYear: num(data.emerged_pct_previous_year),
    emergedPctYoyChange: num(data.emerged_pct_yoy_change),
    conditionVeryPoorPct: num(data.condition_very_poor_pct),
    conditionPoorPct: num(data.condition_poor_pct),
    conditionFairPct: num(data.condition_fair_pct),
    conditionGoodPct: num(data.condition_good_pct),
    conditionExcellentPct: num(data.condition_excellent_pct),
    goodExcellentPct: num(data.good_excellent_pct),
    conditionIndex: num(data.condition_index),
    gePctYoyChange: num(data.ge_pct_yoy_change),
  };
}

async function getLatestConditionSnapshots(
  commodity: string,
  cropYear: number,
  weekEnding: string | null,
): Promise<Map<string, ConditionSnapshot>> {
  if (!weekEnding) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usda_crop_progress")
    .select(
      "state,condition_very_poor_pct,condition_poor_pct,condition_fair_pct,condition_good_pct,condition_excellent_pct,good_excellent_pct,condition_index,ge_pct_yoy_change",
    )
    .eq("commodity", commodity)
    .eq("crop_year", cropYear)
    .eq("week_ending", weekEnding)
    .not("good_excellent_pct", "is", null);

  if (error || !data) return new Map();

  const snapshots = new Map<string, ConditionSnapshot>();
  for (const row of data) {
    const state =
      typeof row.state === "string" ? row.state.toUpperCase() : null;
    if (!state) continue;
    snapshots.set(state, {
      conditionVeryPoorPct: num(row.condition_very_poor_pct),
      conditionPoorPct: num(row.condition_poor_pct),
      conditionFairPct: num(row.condition_fair_pct),
      conditionGoodPct: num(row.condition_good_pct),
      conditionExcellentPct: num(row.condition_excellent_pct),
      goodExcellentPct: num(row.good_excellent_pct),
      conditionIndex: num(row.condition_index),
      gePctYoyChange: num(row.ge_pct_yoy_change),
    });
  }
  return snapshots;
}

async function getLatestSourceRunId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_runs")
    .select("id")
    .eq("source_name", "usda_crop_progress")
    .eq("collector_name", "import-usda-crop-progress")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return typeof data.id === "string" ? data.id : null;
}

function buildUsRegions(
  rows: SeismographRow[],
  config: SeedingGrainConfig,
  conditionSnapshots: Map<string, ConditionSnapshot>,
): SpringWheatPulseRegion[] {
  const latest = latestWeek(rows);
  if (!latest) return [];
  const allowedCodes =
    config.usStateCodes === null ? null : new Set<string>(config.usStateCodes);

  return rows
    .filter(
      (row) =>
        row.week_ending === latest &&
        row.planted_pct !== null &&
        (allowedCodes === null || allowedCodes.has(row.state_code)),
    )
    .sort((a, b) => (a.planted_pct ?? 0) - (b.planted_pct ?? 0))
    .map((row) => {
      const condition =
        conditionSnapshots.get(row.state_name.toUpperCase()) ?? null;
      const goodExcellentPct =
        condition?.goodExcellentPct ?? row.good_excellent_pct;
      const gePctYoyChange =
        condition?.gePctYoyChange ?? row.ge_pct_yoy_change;
      return {
        id: `US-${row.state_code}`,
        countryCode: "US" as const,
        regionCode: row.state_code,
        regionName: row.state_name,
        centroidLng: row.centroid_lng,
        centroidLat: row.centroid_lat,
        reportDate: row.week_ending,
        status: "reported" as const,
        metricScope: "usda_crop_progress" as const,
        plantedPct: row.planted_pct,
        emergedPct: row.emerged_pct,
        seededPct: null,
        plantedPctPreviousYear: row.planted_pct_previous_year,
        plantedPctYoyChange: row.planted_pct_yoy_change,
        emergedPctPreviousYear: row.emerged_pct_previous_year,
        emergedPctYoyChange: row.emerged_pct_yoy_change,
        seededPctPreviousYear: null,
        seededPctYoyChange: null,
        paceDeltaPct: row.planted_pct_vs_avg,
        conditionVeryPoorPct: condition?.conditionVeryPoorPct ?? null,
        conditionPoorPct: condition?.conditionPoorPct ?? null,
        conditionFairPct: condition?.conditionFairPct ?? null,
        conditionGoodPct: condition?.conditionGoodPct ?? null,
        conditionExcellentPct: condition?.conditionExcellentPct ?? null,
        goodExcellentPct,
        conditionIndex: condition?.conditionIndex ?? row.condition_index,
        gePctYoyChange,
        metricLabel: `${fmtPct(row.planted_pct)} planted`,
        sourceName: "USDA NASS Crop Progress",
        sourceUrl: "https://quickstats.nass.usda.gov/",
        sourceResolution: config.sourceResolution,
        summary: stateSummary(row),
        notes: [
          `Planting and emergence come from ${config.sourceResolution}.`,
          goodExcellentPct === null
            ? "Condition has not been reported for this state in the current USDA row."
            : "Condition is USDA Good/Excellent and five-bucket crop condition where reported.",
        ],
      };
    });
}

async function buildCanadaRegions(
  cropYear: number,
  config: SeedingGrainConfig,
): Promise<SpringWheatPulseRegion[]> {
  const [reports, cropProgress] = await Promise.all([
    getCanadaSeedingProgress(cropYear),
    getLatestCanadaCropProgress(cropYear, config.label),
  ]);
  const cropProgressCodes = new Set(
    cropProgress.map((row) => row.province_code),
  );

  const cropSpecific = cropProgress.map((row) => {
    const centroid =
      CANADA_CENTROIDS[row.province_code] ?? CANADA_CENTROIDS.MB;
    return {
      id: `CA-${row.province_code}`,
      countryCode: "CA" as const,
      regionCode: row.province_code,
      regionName: row.province_name,
      centroidLng: centroid.centroidLng,
      centroidLat: centroid.centroidLat,
      reportDate: row.report_date,
      status: "reported" as const,
      metricScope: "canada_crop_progress" as const,
      plantedPct: null,
      emergedPct: null,
      seededPct: row.value_pct,
      plantedPctPreviousYear: null,
      plantedPctYoyChange: null,
      emergedPctPreviousYear: null,
      emergedPctYoyChange: null,
      seededPctPreviousYear: row.previous_year_pct,
      seededPctYoyChange: row.value_vs_previous_year_pct,
      paceDeltaPct: row.value_vs_five_year_avg_pct,
      conditionVeryPoorPct: null,
      conditionPoorPct: null,
      conditionFairPct: null,
      conditionGoodPct: null,
      conditionExcellentPct: null,
      goodExcellentPct: null,
      conditionIndex: null,
      gePctYoyChange: null,
      metricLabel: `${fmtPct(row.value_pct)} seeded`,
      sourceName: row.source_name,
      sourceUrl: row.document_url ?? row.source_url,
      sourceResolution:
        "Provincial crop report; crop-specific province seeding percentage",
      summary: `${row.province_name} reported ${fmtPct(row.value_pct)} of ${row.crop_name.toLowerCase()} seeded.`,
      notes: [
        row.period_start && row.period_end
          ? `Source period: ${row.period_start} to ${row.period_end}; released ${row.release_date ?? row.report_date}.`
          : `Source report date: ${row.report_date}.`,
        row.source_excerpt ?? "Official provincial crop-progress observation.",
        row.previous_year_pct === null && row.five_year_avg_pct === null
          ? "Previous-year and five-year comparisons are not present in this crop table yet."
          : "Previous-year and five-year comparisons are carried when the province reports them.",
      ],
    };
  });

  const reported = reports
    .filter((report) => !cropProgressCodes.has(report.province_code))
    .map((report) => {
    const centroid =
      CANADA_CENTROIDS[report.province_code] ?? CANADA_CENTROIDS.MB;
    const cropNote = report.regional_notes.find((item) =>
      config.canadaNotePattern.test(item.note),
    );
    const notes = [
      `Province report seeded estimate: ${fmtPct(report.seeded_pct)} across reported crops.`,
      cropNote
        ? `${cropNote.region}: ${cropNote.note}`
        : `No province-wide ${config.usDisplayName} percentage released yet.`,
    ];
    const seededPctYoyChange =
      report.seeded_pct !== null && report.seeded_pct_previous_year !== null
        ? Number(
            (report.seeded_pct - report.seeded_pct_previous_year).toFixed(3),
          )
        : null;

    return {
      id: `CA-${report.province_code}`,
      countryCode: "CA" as const,
      regionCode: report.province_code,
      regionName: report.province_name,
      centroidLng: centroid.centroidLng,
      centroidLat: centroid.centroidLat,
      reportDate: report.report_date,
      status: "reported" as const,
      metricScope: "canada_all_crop_with_regional_note" as const,
      plantedPct: null,
      emergedPct: null,
      seededPct: report.seeded_pct,
      plantedPctPreviousYear: null,
      plantedPctYoyChange: null,
      emergedPctPreviousYear: null,
      emergedPctYoyChange: null,
      seededPctPreviousYear: report.seeded_pct_previous_year,
      seededPctYoyChange,
      paceDeltaPct: report.seeded_pct_vs_5yr_avg,
      conditionVeryPoorPct: null,
      conditionPoorPct: null,
      conditionFairPct: null,
      conditionGoodPct: null,
      conditionExcellentPct: null,
      goodExcellentPct: null,
      conditionIndex: null,
      gePctYoyChange: null,
      metricLabel: `${fmtPct(report.seeded_pct)} seeded`,
      sourceName: report.source_name,
      sourceUrl: report.source_url,
      sourceResolution:
        "Provincial crop report; current percentage is province-wide all-crop seeding",
      summary: report.summary,
      notes,
    };
  });

  const reportedCodes = new Set(
    [...cropSpecific, ...reported].map((item) => item.regionCode),
  );
  const scheduled = CANADA_WATCHLIST.filter(
    (item) => !reportedCodes.has(item.provinceCode),
  ).map((item) => ({
    id: `CA-${item.provinceCode}`,
    countryCode: "CA" as const,
    regionCode: item.provinceCode,
    regionName: item.provinceName,
    centroidLng: item.centroidLng,
    centroidLat: item.centroidLat,
    reportDate: null,
    status: "scheduled" as const,
    metricScope: "source_watch" as const,
    plantedPct: null,
    emergedPct: null,
    seededPct: null,
    plantedPctPreviousYear: null,
    plantedPctYoyChange: null,
    emergedPctPreviousYear: null,
    emergedPctYoyChange: null,
    seededPctPreviousYear: null,
    seededPctYoyChange: null,
    paceDeltaPct: null,
    conditionVeryPoorPct: null,
    conditionPoorPct: null,
    conditionFairPct: null,
    conditionGoodPct: null,
    conditionExcellentPct: null,
    goodExcellentPct: null,
    conditionIndex: null,
    gePctYoyChange: null,
    metricLabel: "release watch",
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceResolution: "Official provincial crop report watchlist",
    summary: item.summary,
    notes: ["No 2026 seeding percentage loaded yet."],
  }));

  return [...cropSpecific, ...reported, ...scheduled].sort((a, b) =>
    a.regionCode.localeCompare(b.regionCode),
  );
}

function buildPulseCall(
  usTotal: SpringWheatTotalPulse | null,
  regions: SpringWheatPulseRegion[],
  config: SeedingGrainConfig,
): string {
  const usRegions = regions.filter(
    (region) => region.countryCode === "US" && region.status === "reported",
  );
  const laggards = usRegions
    .filter((region) => (region.paceDeltaPct ?? 0) <= -5)
    .sort((a, b) => (a.paceDeltaPct ?? 0) - (b.paceDeltaPct ?? 0))
    .slice(0, 2);
  const leaders = usRegions
    .filter((region) => (region.paceDeltaPct ?? 0) >= 3)
    .sort((a, b) => (b.paceDeltaPct ?? 0) - (a.paceDeltaPct ?? 0))
    .slice(0, 2);

  const usLine = usTotal
    ? `U.S. ${config.usDisplayName} ${config.usVerb} ${fmtPct(usTotal.plantedPct)} planted and ${fmtPct(
        usTotal.emergedPct,
      )} emerged, ${fmtSigned(usTotal.plantedPctVsAvg)} vs the 5-year pace.`
    : `U.S. ${config.usDisplayName} planting pace has not released for the current week.`;

  const lagLine =
    laggards.length > 0
      ? `Lag pressure is concentrated in ${laggards
          .map(
            (region) =>
              `${region.regionName} (${fmtSigned(region.paceDeltaPct)})`,
          )
          .join(" and ")}.`
      : `No tracked U.S. ${config.usDisplayName} state is more than 5 points behind average.`;

  const leadLine =
    leaders.length > 0
      ? `The fast side is ${leaders
          .map(
            (region) =>
              `${region.regionName} (${fmtSigned(region.paceDeltaPct)})`,
          )
          .join(" and ")}.`
      : `No tracked U.S. ${config.usDisplayName} state is materially ahead of average yet.`;

  return `${usLine} ${lagLine} ${leadLine}`;
}

export async function getSeedingPulse(
  slug: string,
  cropYear: number,
): Promise<SpringWheatPulsePayload | null> {
  const config = getSeedingGrainConfig(slug);
  if (!config) return null;

  const [rows, usTotal, canadaRegions, sourceRunId] = await Promise.all([
    getSeedingSeismograph(config.commodity, cropYear),
    getUsTotalPulse(config.commodity, cropYear),
    buildCanadaRegions(cropYear, config),
    getLatestSourceRunId(),
  ]);

  const latestUsWeek = latestWeek(rows);
  const conditionSnapshots = await getLatestConditionSnapshots(
    config.commodity,
    cropYear,
    latestUsWeek,
  );
  const usRegions = buildUsRegions(rows, config, conditionSnapshots);
  const regions = [...usRegions, ...canadaRegions];
  const latestCanadaReportDate =
    canadaRegions
      .map((region) => region.reportDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    cropYear,
    grainSlug: config.slug,
    grainLabel: config.label,
    usDisplayName: config.usDisplayName,
    commodity: config.commodity,
    availableGrains: grainOptions(),
    latestUsWeek,
    latestCanadaReportDate,
    usTotal,
    regions,
    pulseCall: buildPulseCall(usTotal, regions, config),
    sourceRunId,
    sourceContract: [
      `U.S. planting and emergence use ${config.sourceResolution}.`,
      config.commodity === "WHEAT"
        ? "The canonical Wheat condition row can include winter wheat where spring wheat condition is not available; the pulse does not market it as pure spring-wheat condition."
        : `Condition rows use USDA NASS ${config.label} condition where available; the pulse does not infer field-level crop condition.`,
      config.canadaContract,
      "Map markers are state/province anchors only. This is not field-level crop detection.",
    ],
  };
}

export async function getSpringWheatPulse(
  cropYear: number,
): Promise<SpringWheatPulsePayload> {
  const payload = await getSeedingPulse("spring-wheat", cropYear);
  if (!payload) {
    throw new Error("Spring Wheat seeding pulse config is missing.");
  }
  return payload;
}
