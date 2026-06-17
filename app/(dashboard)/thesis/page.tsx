import Link from "next/link";
import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Flag,
  Radar,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cookies } from "next/headers";
import { GrainImpactGraphPanel } from "@/components/dashboard/grain-impact-graph-panel";
import { GrainReadLinkage } from "@/components/dashboard/grain-read-linkage";
import { YourAreaCard } from "@/components/dashboard/your-area-card";
import { getAreaBids, getProvincialFlow } from "@/lib/queries/area-read";
import { AREA_FSA_COOKIE, areaFromFsa } from "@/lib/utils/area";
import type { GrainImpactGraphBoardRead } from "@/lib/thesis/grain-impact-graph";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getThesisBoardData,
  buildMajorThesisComparisonRows,
  filterThesisBoardDataForActiveFarmerDisplay,
  buildSourceHealthRead,
  type ThesisBoardData,
  type ThesisFreshnessRow,
  type ThesisBoardItem,
  type ThesisComparisonPoint,
  type ThesisComparisonRow,
  type ThesisDriver,
} from "@/lib/queries/thesis-board";
import {
  getXPulseWatchSummary,
  type XPulseSignalSummary,
  type XPulseWatchSummary,
} from "@/lib/queries/x-scout-runs";
import {
  getLatestSourceRunSummaries,
  type SourceRunSummary,
} from "@/lib/queries/source-runs";
import {
  getLatestDailyThesisUpdates,
  type DailyThesisUpdateSummary,
} from "@/lib/queries/daily-thesis-updates";
import {
  getLocalTrack54ReadinessSnapshot,
  type Track54ReadinessModeGateSnapshot,
  type Track54ReadinessSnapshot,
} from "@/lib/queries/track54-readiness";
import { isActiveFarmerThesisGrain } from "@/lib/thesis/active-grain-display";
import {
  publicWheatGapLabels,
  sanitizePublicAdviceCopy,
  sanitizePublicWheatClassCopy,
} from "@/lib/public-copy-guardrails";
import {
  getGrainImpactProfile,
  type GrainImpactFactor,
  type GrainMarketResponseRule,
  type ImpactSourceClass,
} from "@/lib/thesis/grain-impact-map";
import {
  getGrainDataCoverageProfile,
  type GrainDataAdmissionPriority,
  type GrainDataCoverageChecklist,
  type GrainDataCoverageGap,
  type GrainDataCoverageRow,
  type GrainDataCoverageStep,
} from "@/lib/thesis/grain-data-coverage";
import {
  buildWheatPressureMapModel,
  WHEAT_SOURCE_REGISTRY,
  type WheatPressureCountryNode,
  type WheatPressureDriverNode,
  type WheatPressureFactorNode,
  type WheatPressureGraphEdge,
  type WheatPressureMapModel,
  type WheatPressurePacketContribution,
  type WheatPressureRelationshipNode,
  type WheatPressureScoreRole,
  type WheatPressureSourceNode,
  type WheatPressureSourceReadiness,
} from "@/lib/thesis/wheat-pressure-map";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "Not stamped";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function sanitizeXPulseCopy(value: string): string {
  return sanitizePublicAdviceCopy(value);
}

function confidenceClass(confidence: string): string {
  if (confidence === "high") {
    return "border-prairie/30 bg-prairie/10 text-prairie";
  }
  if (confidence === "medium") {
    return "border-canola/35 bg-canola/10 text-canola";
  }
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function stanceClass(score: number): string {
  if (score > 0) return "text-prairie";
  if (score < 0) return "text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
}

function directionalIndicatorLabel(score: number): string {
  if (score >= 20) return "Bull tilt";
  if (score > 0) return "Lean bull";
  if (score <= -20) return "Bear tilt";
  if (score < 0) return "Lean bear";
  return "Balanced";
}

function graphBoardReadSource(items: ThesisBoardItem[]): GrainImpactGraphBoardRead["scoreSource"] {
  if (items.length === 0) return "none";
  const sourceKinds = new Set(items.map((item) => item.scoreSource?.kind ?? "weekly_packet"));
  if (sourceKinds.size > 1) return "mixed";
  return sourceKinds.has("daily_overlay") ? "daily_overlay" : "weekly_packet";
}

function weightedBoardReadScore(items: ThesisBoardItem[]): number | null {
  if (items.length === 0) return null;
  const weighted = items.reduce(
    (state, item) => {
      const confidence = Number.isFinite(item.confidenceScore) ? Math.max(0, item.confidenceScore) : 0;
      return {
        scoreTotal: state.scoreTotal + item.stanceScore * confidence,
        confidenceTotal: state.confidenceTotal + confidence,
      };
    },
    { scoreTotal: 0, confidenceTotal: 0 },
  );

  if (weighted.confidenceTotal > 0) {
    return Math.round(weighted.scoreTotal / weighted.confidenceTotal);
  }

  return Math.round(items.reduce((sum, item) => sum + item.stanceScore, 0) / items.length);
}

function averageBoardReadConfidence(items: ThesisBoardItem[]): number | null {
  if (items.length === 0) return null;
  return Math.round(items.reduce((sum, item) => sum + item.confidenceScore, 0) / items.length);
}

function buildGrainImpactGraphBoardReads(rows: readonly ThesisComparisonRow[]): GrainImpactGraphBoardRead[] {
  return rows.map((row) => {
    const items = [row.canada, row.us].filter((item): item is ThesisBoardItem => item !== null);
    return {
      grain: row.grain,
      statusLabel: row.statusLabel,
      score: weightedBoardReadScore(items),
      confidence: averageBoardReadConfidence(items),
      canadaScore: row.canada?.stanceScore ?? null,
      canadaConfidence: row.canada?.confidenceScore ?? null,
      usScore: row.us?.stanceScore ?? null,
      usConfidence: row.us?.confidenceScore ?? null,
      scoreSource: graphBoardReadSource(items),
    };
  });
}

function stanceFillClass(score: number): string {
  if (score > 0) return "bg-prairie";
  if (score < 0) return "bg-amber-600";
  return "bg-muted-foreground";
}

function comparisonClass(status: ThesisComparisonRow["status"]): string {
  if (status === "aligned_bullish") {
    return "border-prairie/25 bg-prairie/10 text-prairie";
  }
  if (status === "aligned_bearish") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (status === "mixed") {
    return "border-canola/30 bg-canola/10 text-canola";
  }
  if (status === "mapping_needed") {
    return "border-border bg-muted/60 text-muted-foreground";
  }
  return "border-border bg-muted/50 text-muted-foreground";
}

function rowActionCue(row: ThesisComparisonRow): { label: string; detail: string } {
  if (row.status === "mixed") {
    return {
      label: "Open first",
      detail: "Canada and US disagree; read both lead drivers before relying on this row.",
    };
  }
  if (row.status === "aligned_bullish") {
    return {
      label: "Confirmed bull read",
      detail: "Both country packets lean constructive; check freshness and lead evidence.",
    };
  }
  if (row.status === "aligned_bearish") {
    return {
      label: "Confirmed bear read",
      detail: "Both country packets lean defensive; check freshness and lead evidence.",
    };
  }
  if (row.status === "canada_only" || row.status === "us_only") {
    return {
      label: "One-country read",
      detail:
        row.status === "canada_only"
          ? "Use as Canada context only; no matching US packet is modeled in V1."
          : "Use as US context only; no matching Canada packet is modeled in V1.",
    };
  }
  if (row.status === "mapping_needed") {
    return {
      label: "Source gap",
      detail: "Do not infer a thesis until class-safe source mapping is admitted.",
    };
  }
  return {
    label: "Monitor",
    detail: "Balanced read; keep it on the board and wait for a stronger source move.",
  };
}

function actionCueClass(status: ThesisComparisonRow["status"]): string {
  if (status === "mixed") return "border-canola/35 bg-canola/10 text-canola";
  if (status === "aligned_bullish") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (status === "aligned_bearish") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (status === "mapping_needed") return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function shortSourceHealthRead(data: Awaited<ReturnType<typeof getThesisBoardData>>): string {
  const prairieWeekStatus = data.sourceRunContext.canadaCropProgress?.prairieWeekStatus ?? null;
  const prairieWeekStatusLabel = prairieWeekStatus ? prairieWeekStatus.replaceAll("_", " ") : null;
  if (data.totals.uniqueWatchSourceCount === 0) {
    if (prairieWeekStatus?.startsWith("partial_")) {
      return `Rendered public source groups are clean, but Canada crop progress reports ${prairieWeekStatusLabel}.`;
    }
    return "All rendered public source groups are currently clean.";
  }
  return `${data.totals.uniqueWatchSourceCount} source group${data.totals.uniqueWatchSourceCount === 1 ? "" : "s"} need attention across ${data.totals.watchSourceInstanceCount} packet rows.`;
}

function prairieWeekStatusRead(data: Awaited<ReturnType<typeof getThesisBoardData>>): string | null {
  const context = data.sourceRunContext.canadaCropProgress;
  const status = context?.prairieWeekStatus ?? null;
  if (!context || !status?.startsWith("partial_")) return null;
  const label = status.replaceAll("_", " ");
  const loadedLabel = context.loadedProvinces.length
    ? `; loaded ${context.loadedProvinces.join("+")}`
    : "";
  const missingLabel = context.missingProvinces.length
    ? `; missing ${context.missingProvinces.join("+")}`
    : "";
  const sourceLabel = context?.latestSourceLabel ? ` (${context.latestSourceLabel})` : "";
  return `Prairie crop progress: ${label}${loadedLabel}${missingLabel}${sourceLabel}`;
}

function watchSourceCardDetail(data: Awaited<ReturnType<typeof getThesisBoardData>>): string {
  const rowCount = data.totals.watchSourceInstanceCount;
  const rowLabel = rowCount === 1 ? "row" : "rows";
  const base = `${rowCount} stale, empty, lagged, or broken freshness ${rowLabel}.`;
  const prairieWeekStatus = data.sourceRunContext.canadaCropProgress?.prairieWeekStatus ?? null;
  if (prairieWeekStatus?.startsWith("partial_")) {
    return `${base} Prairie completeness is partial and shown below.`;
  }
  return `${base} Optional farmer-local empties excluded from confidence.`;
}

function freshnessClass(status: string): string {
  if (status === "strong") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (status === "empty" || status === "broken") {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-canola/30 bg-canola/10 text-canola";
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  canada_crop_progress: "Prairie crop-progress reports",
  cftc_cot_positions: "CFTC Commitments of Traders",
  cgc_imports: "CGC weekly import run",
  cgc_observations: "CGC weekly grain stats",
  crop_acreage_estimates: "USDA acreage estimates",
  crop_plan_deliveries: "Farm delivery plan",
  crop_plans: "Farm crop plan",
  grain_monitor_snapshots: "Canada Grain Monitor",
  grain_price_intraday: "Intraday grain-price quotes",
  grain_prices: "Grain price feed",
  fx_rates: "USD/CAD FX rates",
  posted_prices: "Posted cash prices",
  producer_car_allocations: "CGC Producer Cars",
  supply_disposition: "Canada supply-disposition table",
  usda_crop_progress: "USDA Crop Progress",
  usda_export_sales: "USDA Export Sales",
  usda_quarterly_stocks: "USDA Quarterly Grain Stocks",
  usda_wasde_mapped: "USDA WASDE",
  usda_wasde_raw: "Raw WASDE/PSD world balance",
  weather_cache: "Weather context",
  x_market_signals: "X Pulse accepted signals",
  x_scout_runs: "X Pulse scout proof",
};

function sourceDisplayName(sourceName: string): string {
  const parts = sourceName.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => SOURCE_DISPLAY_NAMES[part] ?? part.replaceAll("_", " ")).join(" + ");
  }
  return SOURCE_DISPLAY_NAMES[sourceName] ?? sourceName.replaceAll("_", " ");
}

function sourceDisplayNameWithId(sourceName: string): string {
  const displayName = sourceDisplayName(sourceName);
  return displayName === sourceName ? displayName : `${displayName} (${sourceName})`;
}

type WeeklyDataIntakeItem = {
  timing: string;
  source: string;
  target: string;
  sourceNames: string[];
  sourceRunNames?: string[];
  schedule: WeeklyDataIntakeSchedule;
  role: string;
  pressureLane: string;
  analyzedData: string;
  significance: string;
};

type WeeklyDataIntakeSchedule =
  | {
      kind: "weekly";
      weekdays: number[];
    }
  | {
      kind: "weekday";
    }
  | {
      kind: "monthly";
    };

type WeeklyAnalysisStep = {
  label: string;
  timing: string;
  sources: string;
  boardEffect: string;
};

type AnalysisPressureRule = {
  lane: string;
  bullish: string;
  bearish: string;
  boundary?: string;
};

type DailyDecisionStep = {
  label: string;
  timing: string;
  detail: string;
  icon: LucideIcon;
};

const DAILY_DECISION_PATH: DailyDecisionStep[] = [
  {
    label: "Price/FX refresh",
    timing: "Mon-Fri 3:45 PM MT",
    detail: "Settlement and CAD-normalized context refresh first; stale prices hold daily deltas.",
    icon: TrendingUp,
  },
  {
    label: "X Pulse dry-run proof",
    timing: "Mon-Fri 4:10 PM MT",
    detail: "Watch evidence stays in no-write artifact review; if scout credentials or artifacts fail, daily X Pulse is paused.",
    icon: Radar,
  },
  {
    label: "Bounded daily review",
    timing: "After accepted proof",
    detail: "May move visible score and confidence only; weekly thesis text is not rewritten.",
    icon: ShieldCheck,
  },
  {
    label: "Friday thesis stays source-of-record",
    timing: "Friday after final pulls",
    detail: "Desk review writes the official thesis rows after source packets, prices, and vetted leads are ready.",
    icon: Flag,
  },
];

const WEEKLY_ANALYSIS_FLOW: WeeklyAnalysisStep[] = [
  {
    label: "Daily price base",
    timing: "Mon-Fri before review",
    sources: "Futures prices + USD/CAD",
    boardEffect: "Prices and FX refresh first so weekday score moves are not judged on stale context.",
  },
  {
    label: "Early crop read",
    timing: "Mon-Tue",
    sources: "USDA Crop Progress + Manitoba Crop Report",
    boardEffect: "The first weather and condition read sets the watch list, but Prairie status stays partial.",
  },
  {
    label: "Thu flow check",
    timing: "Wed-Thu",
    sources: "CGC, Export Sales, SK crop progress, Producer Cars, and Grain Monitor",
    boardEffect: "CGC, Export Sales, SK crop progress, Producer Cars, and Grain Monitor test real movement and demand.",
  },
  {
    label: "Fri thesis handoff",
    timing: "Friday",
    sources: "AB crop progress + CFTC positioning + desk review",
    boardEffect: "AB crop progress, CFTC positioning, and Friday desk review decide what deserves source-of-record treatment.",
  },
  {
    label: "Monthly reset",
    timing: "10th-14th",
    sources: "USDA WASDE",
    boardEffect: "WASDE resets the official US supply-demand baseline before weekly signals are interpreted.",
  },
];

const ANALYSIS_PRESSURE_RULES: AnalysisPressureRule[] = [
  {
    lane: "Supply/weather pressure",
    bullish: "Bullish when crop stress, delayed harvest, or lower production risk tightens supply.",
    bearish: "Bearish when conditions improve, harvest accelerates, or supply risk eases.",
  },
  {
    lane: "Demand/flow pressure",
    bullish: "Bullish when exports, shipments, or disappearance run ahead of expectations.",
    bearish: "Bearish when sales lag, movement slows, or stocks build.",
  },
  {
    lane: "Logistics pressure",
    bullish: "Bullish when the pipeline clears, terminals pull grain, or producer-car demand confirms movement.",
    bearish: "Bearish when port, vessel, rail, or storage evidence points to backed-up movement.",
  },
  {
    lane: "Positioning pressure",
    bullish: "Bullish when funds are crowded short, covering, or commercials show firmer support.",
    bearish: "Bearish when long crowding, fund liquidation, or weak commercial support adds downside risk.",
  },
  {
    lane: "Price/FX pressure",
    bullish: "Bullish when settlement or CAD-normalized prices improve after fresh FX context.",
    bearish: "Bearish when futures weaken or FX erodes the Canadian cash-price backdrop.",
  },
  {
    lane: "Social/evidence risk",
    bullish: "Watch-only; never decisive alone.",
    bearish: "Only changes the board after official-source or desk review corroborates the lead.",
    boundary: "X Pulse can flag what to inspect; it cannot become thesis fact by itself.",
  },
  {
    lane: "Supply/demand baseline",
    bullish: "Bullish when WASDE tightens carryout, lifts exports, or cuts production.",
    bearish: "Bearish when WASDE raises stocks, cuts demand, or lifts production.",
  },
];

const WEEKLY_DATA_INTAKE: WeeklyDataIntakeItem[] = [
  {
    timing: "Mon 4:32 PM MT",
    source: "USDA Crop Progress",
    target: "usda_crop_progress",
    sourceNames: ["usda_crop_progress"],
    schedule: { kind: "weekly", weekdays: [1] },
    role: "Official thesis input",
    pressureLane: "Supply/weather pressure",
    analyzedData: "Planting, emergence, crop condition, harvest progress, state, crop, period, and week-over-week percentage moves.",
    significance: "US planting, condition, and harvest pressure; moves US supply/weather reads.",
  },
  {
    timing: "Tue/Wed",
    source: "Manitoba Crop Report",
    target: "canada_crop_progress",
    sourceNames: ["canada_crop_progress"],
    schedule: { kind: "weekly", weekdays: [2, 3] },
    role: "Official thesis input",
    pressureLane: "Supply/weather pressure",
    analyzedData: "Seeding or harvest progress, crop stage, crop condition, soil moisture, regional weather, and stress notes.",
    significance: "First Prairie crop-progress read; useful early, but partial until SK and AB land.",
  },
  {
    timing: "Wed 2:17 PM MT",
    source: "Canada Grain Monitor",
    target: "grain_monitor_snapshots",
    sourceNames: ["grain_monitor_snapshots"],
    schedule: { kind: "weekly", weekdays: [3] },
    role: "Official thesis input",
    pressureLane: "Logistics pressure",
    analyzedData: "Vessel lineup, port stocks, terminal movement, rail/service context, commercial storage, and export logistics notes.",
    significance: "Port, vessel, storage, and rail context; shows whether movement is flowing or blocked.",
  },
  {
    timing: "Thu 9:03 AM MT",
    source: "USDA Export Sales",
    target: "usda_export_sales",
    sourceNames: ["usda_export_sales"],
    schedule: { kind: "weekly", weekdays: [4] },
    role: "Official thesis input",
    pressureLane: "Demand/flow pressure",
    analyzedData: "Weekly net sales, exports, outstanding sales, total commitments, week ending date, and admitted projection pace.",
    significance: "Weekly US sales and shipments; tests demand pace against admitted USDA projections.",
  },
  {
    timing: "Thu 11:15 AM MT",
    source: "Saskatchewan Crop Report",
    target: "canada_crop_progress",
    sourceNames: ["canada_crop_progress"],
    schedule: { kind: "weekly", weekdays: [4] },
    role: "Official thesis input",
    pressureLane: "Supply/weather pressure",
    analyzedData: "Seeding or harvest progress, crop stage, crop condition, topsoil moisture, regional stress, and yield-risk notes.",
    significance: "Adds the largest Prairie grain province to the growing-season supply/weather proxy.",
  },
  {
    timing: "Thu 1:35 PM MT",
    source: "CGC Weekly Grain Stats",
    target: "cgc_observations",
    sourceNames: ["cgc_observations", "cgc_imports"],
    schedule: { kind: "weekly", weekdays: [4] },
    role: "Official thesis input",
    pressureLane: "Demand/flow pressure",
    analyzedData: "Producer deliveries, primary stocks, process use, terminal receipts, terminal exports, and export-destination flows.",
    significance: "Deliveries, stocks, terminal receipts, and exports; core Canada flow pressure.",
  },
  {
    timing: "Thu 4:00 PM MT",
    source: "CGC Producer Cars",
    target: "producer_car_allocations",
    sourceNames: ["producer_car_allocations"],
    schedule: { kind: "weekly", weekdays: [4] },
    role: "Official thesis input",
    pressureLane: "Logistics pressure",
    analyzedData: "Producer-car applications, allocations, shipments, corridor/destination mix, and farmer-direct rail demand.",
    significance: "Producer-car demand and allocation context; shows farmer-direct rail intent.",
  },
  {
    timing: "Fri 1:45/3:30 PM MT",
    source: "Alberta Crop Report",
    target: "canada_crop_progress",
    sourceNames: ["canada_crop_progress"],
    schedule: { kind: "weekly", weekdays: [5] },
    role: "Official thesis input",
    pressureLane: "Supply/weather pressure",
    analyzedData: "Crop condition, seeding or harvest progress, soil moisture, regional weather, yield/stress notes, and AB completion status.",
    significance: "Completes the Prairie crop-progress package or records an explicit AB gap.",
  },
  {
    timing: "Fri 2:00 PM MT",
    source: "CFTC Commitments of Traders",
    target: "cftc_cot_positions",
    sourceNames: ["cftc_cot_positions"],
    schedule: { kind: "weekly", weekdays: [5] },
    role: "Official thesis input",
    pressureLane: "Positioning pressure",
    analyzedData: "Managed-money, commercial, producer/merchant, swap-dealer, net position, and week-over-week position changes.",
    significance: "Fund and commercial positioning; shows crowding, hedger pressure, and sentiment risk.",
  },
  {
    timing: "Mon-Fri 3:45 PM MT",
    source: "Futures prices + USD/CAD",
    target: "grain_prices",
    sourceNames: ["grain_prices", "fx_rates", "grain_price_intraday"],
    schedule: { kind: "weekday" },
    role: "Price context",
    pressureLane: "Price/FX pressure",
    analyzedData: "Daily futures settlement, contract changes, USD/CAD, CAD-normalized prices, and tracked-contract freshness.",
    significance: "Settlement and CAD-normalized price context; required before weekday thesis deltas.",
  },
  {
    timing: "Mon-Fri 4:10 PM MT",
    source: "Supervised X Pulse dry run",
    target: "x_scout_runs",
    sourceNames: ["x_scout_runs"],
    schedule: { kind: "weekday" },
    role: "Watch-only evidence",
    pressureLane: "Social/evidence risk",
    analyzedData: "Trusted-handle posts, source tier, timestamp, affected grains/regions/decisions, allowed claims, blocked claims, and price snapshot status.",
    significance: "Dry-run trusted-handle watch leads only; they stay secondary until official-source or desk review corroborates them.",
  },
  {
    timing: "Monthly 10th-14th",
    source: "USDA WASDE",
    target: "usda_wasde_raw / mapped",
    sourceNames: ["usda_wasde_mapped", "usda_wasde_raw"],
    schedule: { kind: "monthly" },
    role: "Official thesis input",
    pressureLane: "Supply/demand baseline",
    analyzedData: "Production, yield, ending stocks, exports, domestic use, crush, stocks-to-use, and month-over-month revisions.",
    significance: "Monthly supply-demand baseline and revisions; anchors US projection context.",
  },
];

const WEEKLY_DATA_SOURCE_RUN_NAMES = [
  ...new Set([
    ...WEEKLY_DATA_INTAKE.flatMap((item) => item.sourceRunNames ?? item.sourceNames),
    ...WHEAT_SOURCE_REGISTRY.map((source) => source.sourceId),
  ]),
].filter((name) => name !== "x_scout_runs" && name !== "x_market_signals");

type IntakeStatusChip = {
  label: string;
  className: string;
};

type IntakeCurrentProof = {
  chips: IntakeStatusChip[];
  summary: string;
  detail: string;
};

type WeeklyIntakeRow = {
  item: WeeklyDataIntakeItem;
  proof: IntakeCurrentProof;
  index: number;
};

type WeeklyPullTrackerCard = {
  title: string;
  badge: string;
  badgeClass: string;
  detail: string;
};

type WeeklyPullCalendarDay = {
  weekday: number;
  label: string;
  rows: WeeklyIntakeRow[];
};

function allFreshnessRows(data: ThesisBoardData): ThesisFreshnessRow[] {
  return [...data.canadaItems, ...data.usItems].flatMap((item) => item.freshness);
}

function latestFreshnessPeriod(rows: ThesisFreshnessRow[]): string | null {
  const dated = rows
    .map((row) => row.latestPeriodEnd)
    .filter((value): value is string => Boolean(value))
    .sort();
  if (dated.length > 0) return dated.at(-1)!;

  return rows.find((row) => row.latestPeriod)?.latestPeriod ?? null;
}

function uniqueStatuses(rows: ThesisFreshnessRow[]): string[] {
  return [...new Set(rows.map((row) => row.freshnessStatus || "unknown"))].sort();
}

function sourceRowsByNames(data: ThesisBoardData, sourceNames: string[]): ThesisFreshnessRow[] {
  const wanted = new Set(sourceNames);
  return allFreshnessRows(data).filter((row) => wanted.has(row.sourceName));
}

function sourceRowsForIntake(data: ThesisBoardData, item: WeeklyDataIntakeItem): ThesisFreshnessRow[] {
  return sourceRowsByNames(data, item.sourceNames);
}

function sourceRunsForIntake(
  sourceRuns: SourceRunSummary[],
  item: WeeklyDataIntakeItem,
): SourceRunSummary[] {
  const wanted = new Set(item.sourceRunNames ?? item.sourceNames);
  return sourceRuns.filter((run) => wanted.has(run.sourceName));
}

function latestSourceRunPeriod(run: SourceRunSummary): string | null {
  return run.sourcePeriodEnd ?? run.latestSourceLabel;
}

function sourceRunClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "success") return freshnessClass("strong");
  if (normalized === "partial" || normalized === "started" || normalized === "dry_run") {
    return freshnessClass("lagged");
  }
  if (normalized === "failed") return freshnessClass("broken");
  return "border-border bg-muted/50 text-muted-foreground";
}

function intakeRoleClass(role: string): string {
  if (role === "Official thesis input") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (role === "Price context") return "border-canola/30 bg-canola/10 text-canola";
  if (role === "Watch-only evidence") return "border-border bg-muted/50 text-muted-foreground";
  return "border-border bg-background/70 text-muted-foreground";
}

function pressureLaneClass(pressureLane: string): string {
  if (pressureLane.includes("Supply")) return "border-prairie/25 bg-prairie/10 text-prairie";
  if (pressureLane.includes("Demand") || pressureLane.includes("Logistics")) {
    return "border-canola/30 bg-canola/10 text-canola";
  }
  if (pressureLane.includes("Social")) return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function sourceRunProofDetail(run: SourceRunSummary): string {
  const period = latestSourceRunPeriod(run);
  const rowsChanged = run.rowsInserted + run.rowsUpdated;
  const rowDetail = rowsChanged > 0 ? `; ${rowsChanged} rows changed` : "";
  const errorDetail = run.errorMessage ? `; error: ${run.errorMessage}` : "";
  return `Latest collector ${run.collectorName} finished ${formatDateTime(run.finishedAt)}${period ? ` for ${period}` : ""}${rowDetail}${errorDetail}.`;
}

function xPulseIntakeProof(watch: XPulseWatchSummary): IntakeCurrentProof {
  const latestRun = watch.latestRun;
  if (!latestRun) {
    return {
      chips: [{ label: "not stored", className: "border-border bg-muted/50 text-muted-foreground" }],
      summary: "No stored scout run",
      detail: "The board remains official-source-led until a supervised no-write X artifact is accepted.",
    };
  }

  const freshnessStatus =
    latestRun.status === "success" && latestRun.priceSnapshotStatus === "fresh"
      ? "strong"
      : latestRun.status === "failed" || latestRun.status === "rejected"
        ? "broken"
        : "lagged";
  return {
    chips: [
      { label: latestRun.status, className: freshnessClass(freshnessStatus) },
      { label: `price ${latestRun.priceSnapshotStatus}`, className: freshnessClass(latestRun.priceSnapshotStatus === "fresh" ? "strong" : "lagged") },
    ],
    summary: `Accepted ${latestRun.acceptedSignalCount}; rejected ${latestRun.rejectedSignalCount}`,
    detail: `Last scan ${formatDateTime(latestRun.runFinishedAt ?? latestRun.runStartedAt)}. Watch evidence only.`,
  };
}

function intakeCurrentProof(
  item: WeeklyDataIntakeItem,
  data: ThesisBoardData,
  watch: XPulseWatchSummary,
  sourceRuns: SourceRunSummary[],
): IntakeCurrentProof {
  if (item.sourceNames.includes("x_scout_runs")) return xPulseIntakeProof(watch);

  const rows = sourceRowsForIntake(data, item);
  const runProofs = sourceRunsForIntake(sourceRuns, item);
  const latestRun = runProofs[0] ?? null;
  if (rows.length === 0) {
    if (latestRun) {
      return {
        chips: [{ label: latestRun.status, className: sourceRunClass(latestRun.status) }],
        summary: `${sourceDisplayName(latestRun.sourceName)} latest collector ${latestRun.status}`,
        detail: sourceRunProofDetail(latestRun),
      };
    }
    return {
      chips: [{ label: "not in packet", className: "border-border bg-muted/50 text-muted-foreground" }],
      summary: "No rendered freshness row",
      detail: "Listed as an intake lane, but not present in the current public packet freshness.",
    };
  }

  const statuses = uniqueStatuses(rows);
  const latestPeriod = latestFreshnessPeriod(rows);
  const sourceLabel = item.sourceNames.map(sourceDisplayName).join(" + ");
  const runDetail = latestRun ? ` ${sourceRunProofDetail(latestRun)}` : "";
  return {
    chips: statuses.map((status) => ({ label: status, className: freshnessClass(status) })),
    summary: `${sourceLabel} appears in ${rows.length} packet row${rows.length === 1 ? "" : "s"}`,
    detail: `${latestPeriod ? `Latest source period ${latestPeriod}.` : "Latest source period is not stamped."}${runDetail}`,
  };
}

const WEEKDAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isWeekday(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

function intakeAppliesToday(item: WeeklyDataIntakeItem, weekday: number): boolean {
  if (item.schedule.kind === "weekday") return isWeekday(weekday);
  if (item.schedule.kind === "weekly") return item.schedule.weekdays.includes(weekday);
  return false;
}

function futureWeeklyPullDay(item: WeeklyDataIntakeItem, weekday: number): number | null {
  if (item.schedule.kind !== "weekly") return null;
  const futureDay = item.schedule.weekdays.filter((day) => day > weekday).sort((left, right) => left - right)[0];
  return futureDay ?? null;
}

function sourceList(rows: WeeklyIntakeRow[], fallback = "No scheduled pulls"): string {
  if (rows.length === 0) return fallback;
  return rows.map(({ item }) => item.source).join("; ");
}

function weeklyPullCalendarDays(rows: WeeklyIntakeRow[]): WeeklyPullCalendarDay[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    label: WEEKDAY_FULL_LABELS[weekday],
    rows: rows.filter(({ item }) => intakeAppliesToday(item, weekday)),
  }));
}

function calendarProofLabel(rows: WeeklyIntakeRow[]): string {
  if (rows.length === 0) return "no scheduled lanes";
  const readyCount = rows.filter(({ proof }) => proofLooksCurrent(proof)).length;
  return `${readyCount}/${rows.length} proof-backed`;
}

function proofLooksCurrent(proof: IntakeCurrentProof): boolean {
  return proof.chips.some(({ label }) => {
    const normalized = label.toLowerCase();
    return normalized === "strong" || normalized === "success" || normalized === "fresh" || normalized === "price fresh";
  });
}

function nextOfficialRowsAfterToday(rows: WeeklyIntakeRow[], weekday: number): WeeklyIntakeRow[] {
  const todayRows = new Set(rows.filter(({ item }) => intakeAppliesToday(item, weekday)).map(({ index }) => index));
  const futureRows = rows
    .filter(({ item, index }) => item.role === "Official thesis input" && !todayRows.has(index))
    .map((row) => ({ ...row, nextDay: futureWeeklyPullDay(row.item, weekday) }))
    .filter((row) => row.nextDay !== null)
    .sort((left, right) => (left.nextDay ?? 0) - (right.nextDay ?? 0) || left.index - right.index);

  const nextDay = futureRows[0]?.nextDay ?? null;
  return nextDay === null ? [] : futureRows.filter((row) => row.nextDay === nextDay);
}

function weeklyPullTrackerCards(rows: WeeklyIntakeRow[], now = new Date()): WeeklyPullTrackerCard[] {
  const todayKey = localDateKey(now);
  const weekday = weekdayFromDateKey(todayKey);
  const todayRows = rows.filter(({ item }) => intakeAppliesToday(item, weekday));
  const proofReadyCount = todayRows.filter(({ proof }) => proofLooksCurrent(proof)).length;
  const nextRows = nextOfficialRowsAfterToday(rows, weekday);
  const nextDay = nextRows[0] ? futureWeeklyPullDay(nextRows[0].item, weekday) : null;
  const fridayRows = rows.filter(
    ({ item }) => item.role === "Official thesis input" && item.schedule.kind === "weekly" && item.schedule.weekdays.includes(5),
  );
  const todayCountLabel =
    todayRows.length === 1 ? "1 scheduled lane today" : `${todayRows.length} scheduled lanes today`;
  const proofCountLabel =
    todayRows.length === 0
      ? "No scheduled lanes today."
      : `${proofReadyCount}/${todayRows.length} current proofs are strong or successful.`;
  const nextOfficialDetail =
    nextRows.length > 0 && nextDay !== null
      ? `${WEEKDAY_SHORT_LABELS[nextDay]} after today: ${sourceList(nextRows)}.`
      : "No remaining official weekly pull after today; keep the latest board proof until Friday review or next week's cycle.";

  return [
    {
      title: `Today ${dateLabelFromKey(todayKey)}`,
      badge: todayCountLabel,
      badgeClass: todayRows.length > 0 ? "border-canola/30 bg-canola/10 text-canola" : "border-border bg-background/70 text-muted-foreground",
      detail: `${sourceList(todayRows)}. These are the lanes to verify before trusting a same-day board move.`,
    },
    {
      title: "Current proof for today lanes",
      badge: todayRows.length === 0 ? "no pull window" : `${proofReadyCount}/${todayRows.length} proof-backed`,
      badgeClass: proofReadyCount === todayRows.length && todayRows.length > 0 ? freshnessClass("strong") : "border-canola/30 bg-canola/10 text-canola",
      detail: `${proofCountLabel} Proof means packet freshness, collector status, or no-write X artifact; the daily update window handles same-day scout proof.`,
    },
    {
      title: "Next official pull",
      badge: nextRows.length > 0 && nextDay !== null ? WEEKDAY_SHORT_LABELS[nextDay] : "none left",
      badgeClass: nextRows.length > 0 ? "border-prairie/25 bg-prairie/10 text-prairie" : "border-border bg-background/70 text-muted-foreground",
      detail: nextOfficialDetail,
    },
    {
      title: "Friday handoff watch",
      badge: "source-of-record",
      badgeClass: "border-border bg-background/70 text-muted-foreground",
      detail: `${sourceList(fridayRows)} feed the final weekly desk review boundary; X Pulse remains watch-only until corroborated.`,
    },
  ];
}

type DailyUpdateTile = {
  title: string;
  badge: string;
  badgeClass: string;
  detail: string;
  icon: LucideIcon;
};

type DailyUpdateChecklistItem = {
  label: string;
  status: "complete" | "pending" | "held";
  badge: string;
  detail: string;
};

type TodayUpdateWindow = {
  dateLabel: string;
  badge: string;
  badgeClass: string;
  detail: string;
};

const TRACK54_LOCAL_TIME_ZONE = "America/Edmonton";
const PRICE_REFRESH_MINUTES = 15 * 60 + 45;
const DAILY_PULSE_MINUTES = 16 * 60 + 10;
const DAILY_HEALTH_CHECK_MINUTES = 16 * 60 + 45;
const REQUIRED_PRICE_CONTEXT_SOURCE_NAMES = ["grain_prices"];

function localDateKey(date: Date, timeZone = TRACK54_LOCAL_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function localMinutes(date: Date, timeZone = TRACK54_LOCAL_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function dateLabelFromKey(dateKey: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function weekdayFromDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function localDateKeyFromTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed);
}

function xPulseRunDateKey(latestRun: XPulseWatchSummary["latestRun"]): string | null {
  if (!latestRun) return null;
  if (latestRun.runDate) return latestRun.runDate;
  const timestamp = latestRun.runFinishedAt ?? latestRun.runStartedAt;
  return timestamp ? localDateKey(new Date(timestamp)) : null;
}

function xPulseProofTileDetail(
  latestRun: XPulseWatchSummary["latestRun"],
  todayKey: string,
): string {
  if (!latestRun) return "No stored scout run; board remains official-source-led.";

  const latestRunDate = xPulseRunDateKey(latestRun);
  const latestRunLabel = latestRunDate ? dateLabelFromKey(latestRunDate) : "latest run";
  const proofPrefix =
    latestRunDate === todayKey
      ? `Current-day proof stored: accepted ${latestRun.acceptedSignalCount}, rejected ${latestRun.rejectedSignalCount}`
      : `Latest stored proof from ${latestRunLabel}: accepted ${latestRun.acceptedSignalCount}, rejected ${latestRun.rejectedSignalCount}`;
  const currentDayNote =
    latestRunDate === todayKey
      ? "Current-day proof is stored; daily review remains bounded."
      : "Current-day proof follows the Today update window below; X Pulse remains watch-only and gate-held.";

  return `${proofPrefix}; last scan ${formatDateTime(latestRun.runFinishedAt ?? latestRun.runStartedAt)}. ${currentDayNote}`;
}

function hasFreshPriceContextForDate(data: ThesisBoardData, dateKey: string): boolean {
  return sourceRowsByNames(data, REQUIRED_PRICE_CONTEXT_SOURCE_NAMES).some(
    (row) =>
      row.freshnessStatus === "strong" &&
      (row.latestPeriodEnd === dateKey || row.latestPeriod === dateKey),
  );
}

function todayUpdateWindow(
  watch: XPulseWatchSummary,
  hasFreshTodayPriceContext: boolean,
  now = new Date(),
): TodayUpdateWindow {
  const todayKey = localDateKey(now);
  const dateLabel = dateLabelFromKey(todayKey);
  const weekday = weekdayFromDateKey(todayKey);
  const latestRun = watch.latestRun;
  const latestRunDate = xPulseRunDateKey(latestRun);

  if (latestRunDate === todayKey && latestRun) {
    return {
      dateLabel,
      badge: "X proof stored",
      badgeClass: freshnessClass(latestRun.status === "success" ? "strong" : "lagged"),
      detail: `Today's X Pulse proof is stored: accepted ${latestRun.acceptedSignalCount}, rejected ${latestRun.rejectedSignalCount}; daily review remains bounded.`,
    };
  }

  if (weekday === 0 || weekday === 6) {
    return {
      dateLabel,
      badge: "Weekend hold",
      badgeClass: "border-border bg-background/70 text-muted-foreground",
      detail: "Daily X Pulse and bounded review automations run Monday-Friday; the board keeps the latest proven packet and review-gated overlays.",
    };
  }

  const minutes = localMinutes(now);
  if (!hasFreshTodayPriceContext) {
    return {
      dateLabel,
      badge: "Price pending",
      badgeClass: "border-canola/30 bg-canola/10 text-canola",
      detail:
        minutes < PRICE_REFRESH_MINUTES
          ? "Waiting for 3:45 PM MT price/FX refresh before any daily movement can be judged."
          : "Price/FX context is not stamped for today; daily movement stays held until it is fresh.",
    };
  }
  if (minutes < DAILY_PULSE_MINUTES) {
    return {
      dateLabel,
      badge: "Not due yet",
      badgeClass: "border-canola/30 bg-canola/10 text-canola",
      detail: "Waiting for 4:10 PM MT X Pulse proof; current board keeps the latest proven packet and review-gated daily overlays.",
    };
  }
  if (minutes < DAILY_HEALTH_CHECK_MINUTES) {
    return {
      dateLabel,
      badge: "Scout window open",
      badgeClass: "border-canola/30 bg-canola/10 text-canola",
      detail: "X Pulse proof is due after 4:10 PM MT; health check waits until 4:45 PM MT before retrying a missing no-write artifact.",
    };
  }
  return {
    dateLabel,
    badge: "Artifact check due",
    badgeClass: freshnessClass("lagged"),
    detail: "No same-day X Pulse proof is stored after the 4:10 PM MT window; health check can verify or retry only the no-write artifact.",
  };
}

function dailyChecklistBadgeClass(status: DailyUpdateChecklistItem["status"]): string {
  if (status === "complete") return freshnessClass("strong");
  if (status === "pending") return "border-canola/30 bg-canola/10 text-canola";
  return "border-border bg-background/70 text-muted-foreground";
}

function buildDailyUpdateChecklist({
  hasFreshTodayPriceContext,
  latestRun,
  todayKey,
  currentDayDailyUpdate,
  todayWindow,
}: {
  hasFreshTodayPriceContext: boolean;
  latestRun: XPulseWatchSummary["latestRun"];
  todayKey: string;
  currentDayDailyUpdate: DailyThesisUpdateSummary | null;
  todayWindow: TodayUpdateWindow;
}): DailyUpdateChecklistItem[] {
  const dateLabel = dateLabelFromKey(todayKey);
  const latestRunDate = xPulseRunDateKey(latestRun);
  const weekend = weekdayFromDateKey(todayKey) === 0 || weekdayFromDateKey(todayKey) === 6;
  const xPulseIsCurrent = latestRunDate === todayKey && latestRun !== null;

  return [
    {
      label: "Price/FX context",
      status: hasFreshTodayPriceContext ? "complete" : "pending",
      badge: hasFreshTodayPriceContext ? "fresh today" : "missing today",
      detail: hasFreshTodayPriceContext
        ? `Required price packet is stamped for ${dateLabel}.`
        : `Daily movement stays held until grain_prices is stamped for ${dateLabel}.`,
    },
    {
      label: "X Pulse proof",
      status: xPulseIsCurrent ? "complete" : weekend ? "held" : "pending",
      badge: xPulseIsCurrent ? "stored today" : todayWindow.badge.toLowerCase(),
      detail: xPulseIsCurrent && latestRun
        ? `Same-day scout proof is stored: accepted ${latestRun.acceptedSignalCount}, rejected ${latestRun.rejectedSignalCount}.`
        : todayWindow.detail,
    },
    {
      label: "Bounded daily row",
      status: currentDayDailyUpdate ? "complete" : weekend ? "held" : "pending",
      badge: currentDayDailyUpdate ? "row stored" : "not stored",
      detail: currentDayDailyUpdate
        ? dailyUpdateDetail(currentDayDailyUpdate)
        : "No same-day score trajectory row is stamped yet; visible scores stay on weekly packets or prior overlays.",
    },
    {
      label: "Daily automation gate",
      status: "held",
      badge: "proof-gated",
      detail:
        "Automatic write mode stays disabled until the required no-write artifact streak and approval gate clear.",
    },
  ];
}

function findReadinessGate(
  snapshot: Track54ReadinessSnapshot | null,
  mode: Track54ReadinessModeGateSnapshot["mode"],
): Track54ReadinessModeGateSnapshot | null {
  return snapshot?.modeGates.find((gate) => gate.mode === mode) ?? null;
}

function readinessGateModeLabel(mode: Track54ReadinessModeGateSnapshot["mode"]): string {
  return mode === "daily_pulse" ? "Daily pulse" : "Friday deep";
}

function readinessGateBadgeClass(
  gate: Track54ReadinessModeGateSnapshot,
  reportFreshEnough: boolean,
): string {
  if (!reportFreshEnough) return freshnessClass("lagged");
  if (gate.promotionStatus === "ready_for_human_approval") return freshnessClass("strong");
  if (gate.readinessStatus === "hold_manual_review") return freshnessClass("broken");
  return "border-canola/30 bg-canola/10 text-canola";
}

function readinessLastKnownNotice(snapshot: Track54ReadinessSnapshot): string | null {
  if (snapshot.reportFreshEnough === true) return null;
  const label = proofFreshnessLabel(snapshot.reportFreshEnough, snapshot.reportAgeHours);
  const issue = label === "timestamp missing"
    ? "Readiness report timestamp is missing"
    : `Readiness report is ${label}`;
  return `${issue}; gate counts are last-known proof, not current proof.`;
}

function readinessGateDetail(
  gate: Track54ReadinessModeGateSnapshot,
  reportFreshEnough: boolean,
): string {
  const nextDates = gate.nextEligibleRunDates.length > 0
    ? ` Next proof date${gate.nextEligibleRunDates.length === 1 ? "" : "s"}: ${
        gate.nextEligibleRunDates.map(dateLabelFromKey).join(", ")
      }.`
    : "";
  const prefix = reportFreshEnough ? "" : "Last-known proof: ";
  return `${prefix}${gate.artifactDaysFound}/${gate.requiredArtifactDays} clean no-write artifact days; accepted ${gate.acceptedSignalCount}, decision-grade ${gate.acceptedDecisionGradeCount}.${nextDates}`;
}

function readinessProofBadgeClass(snapshot: Track54ReadinessSnapshot): string {
  if (snapshot.productionWritesEnabled) return freshnessClass("broken");
  if (snapshot.reportFreshEnough !== true) return freshnessClass("lagged");
  if (!snapshot.browserSmokeClean) return freshnessClass("broken");
  if (snapshot.browserSmokeProof?.freshEnough !== true) return freshnessClass("lagged");
  return freshnessClass("strong");
}

function readinessProofBadge(snapshot: Track54ReadinessSnapshot): string {
  if (snapshot.productionWritesEnabled) return "write mode enabled";
  if (snapshot.reportFreshEnough !== true) return `readiness report ${proofFreshnessLabel(snapshot.reportFreshEnough, snapshot.reportAgeHours)}`;
  if (!snapshot.browserSmokeClean) return "browser proof failed";
  if (!snapshot.browserSmokeProof) return "browser proof missing";
  if (snapshot.browserSmokeProof.freshEnough !== true) {
    return `browser proof ${proofFreshnessLabel(
      snapshot.browserSmokeProof.freshEnough,
      snapshot.browserSmokeProof.ageHours,
    )}`;
  }
  return "browser proof clean";
}

function proofFreshnessLabel(freshEnough: boolean, ageHours: number | null): string {
  if (freshEnough) return "fresh";
  if (ageHours !== null && ageHours < 0) return "future-dated";
  if (ageHours === null) return "timestamp missing";
  return "stale";
}

function proofFreshnessDetail(freshEnough: boolean, ageHours: number | null, windowLabel: string): string {
  const label = proofFreshnessLabel(freshEnough, ageHours);
  if (label === "fresh" || label === "stale") return `${label} for the ${windowLabel}`;
  if (label === "future-dated") return `future-dated; not valid for the ${windowLabel}`;
  return `timestamp missing; not valid for the ${windowLabel}`;
}

function readinessCredentialHeld(snapshot: Track54ReadinessSnapshot | null): boolean {
  if (snapshot?.grokRunner?.credentialIssue) return true;
  return (snapshot?.completionBlockers ?? []).some((blocker) => /auth|credential|preflight/i.test(blocker));
}

function readableCredentialIssue(value: string | null | undefined): string {
  if (!value) return "not reported";
  return readableStatus(value);
}

function readableCredentialSource(value: string | null | undefined): string {
  if (!value || value === "none") return "none";
  if (value === "xai_api_key") return "XAI API key";
  if (value === "grok_cli_auth") return "Grok CLI auth";
  return readableStatus(value);
}

function grokCredentialStatusLine(snapshot: Track54ReadinessSnapshot): string | null {
  const proof = snapshot.grokRunner;
  if (!proof?.credentialIssue) return null;

  const source = readableCredentialSource(proof.credentialSource);
  const issue = readableCredentialIssue(proof.credentialIssue);
  return `Grok credential: ${issue}; source ${source}.`;
}

function grokCredentialRecoveryLine(snapshot: Track54ReadinessSnapshot): string | null {
  const proof = snapshot.grokRunner;
  if (!proof?.credentialIssue) return null;

  return "Safe recovery: run local Grok login or add XAI_API_KEY, then use the no-write recovery shortcut.";
}

function publicReadinessBlocker(snapshot: Track54ReadinessSnapshot): string {
  const blocker = snapshot.completionBlockers[0];
  if (!blocker) return "No public blocker is listed in the readiness report.";

  const credentialProof = snapshot.grokRunner;
  if (credentialProof?.credentialIssue) {
    return `Current blocker: X Pulse scout credential issue: ${
      readableCredentialIssue(credentialProof.credentialIssue)
    }; source ${readableCredentialSource(credentialProof.credentialSource)}. Scheduled dry-run artifacts will not collect until refreshed.`;
  }

  if (/auth|credential|preflight/i.test(blocker)) {
    return "Current blocker: X Pulse scout credential/preflight is not ready, so scheduled dry-run artifacts will not collect until refreshed.";
  }

  if (/artifact/i.test(blocker)) {
    return "Current blocker: no-write artifact gate is incomplete.";
  }

  return `Current blocker: ${sanitizeXPulseCopy(blocker)}`;
}

function readinessProofDetail(snapshot: Track54ReadinessSnapshot): string {
  const firstBlocker = ` ${publicReadinessBlocker(snapshot)}`;
  const reportFreshness = proofFreshnessDetail(
    snapshot.reportFreshEnough,
    snapshot.reportAgeHours,
    "eight-hour review window",
  );
  const browserProof = snapshot.browserSmokeProof;
  const browserProofDetail = browserProof?.generatedAt
    ? ` Browser proof generated ${formatDateTime(browserProof.generatedAt)}; ${proofFreshnessDetail(
      browserProof.freshEnough,
      browserProof.ageHours,
      "six-hour proof window",
    )}.`
    : browserProof
      ? " Browser proof timestamp is not present."
      : " Browser proof is missing.";
  return `Readiness report generated ${formatDateTime(snapshot.generatedAt)}; ${reportFreshness}; overall status ${readableStatus(snapshot.overallStatus)}.${browserProofDetail}${firstBlocker}`;
}

function xPulsePublicGateNotice(
  snapshot: Track54ReadinessSnapshot | null,
  latestRun: XPulseWatchSummary["latestRun"],
): string {
  const dailyGate = findReadinessGate(snapshot, "daily_pulse");
  const latestRunDate = xPulseRunDateKey(latestRun);
  const latestRunNote = latestRunDate
    ? ` Last stored X Pulse proof: ${dateLabelFromKey(latestRunDate)}.`
    : " No stored X Pulse proof is available.";

  if (!snapshot) {
    return `X Pulse remains watch-only and cannot move thesis rows by itself.${latestRunNote}`;
  }

  const gateNote = dailyGate
    ? `${snapshot.reportFreshEnough === true ? " Daily gate" : " Last-known daily gate"}: ${dailyGate.artifactDaysFound}/${dailyGate.requiredArtifactDays} clean no-write artifacts, ${dailyGate.acceptedDecisionGradeCount} decision-grade accepted signals.`
    : " Daily gate status is not available.";
  const staleNotice = readinessLastKnownNotice(snapshot);
  const prefix = readinessCredentialHeld(snapshot)
    ? snapshot.grokRunner?.credentialIssue
      ? `Daily X Pulse paused: scout credential issue is ${readableCredentialIssue(snapshot.grokRunner.credentialIssue)}.`
      : "Daily X Pulse paused: scout credential refresh required."
    : "Daily X Pulse gate-held: production write mode is disabled.";

  return `${prefix}${staleNotice ? ` ${staleNotice}` : ""}${gateNote}${latestRunNote}`;
}

type DailyOverlayCoverage = {
  totalRows: number;
  overlaidRows: number;
  todayOverlaidRows: number;
  weeklyRows: number;
  latestOverlayAt: string | null;
  overlaidLabels: string[];
  weeklyLabels: string[];
};

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function currentStanceLabel(score: number): string {
  if (score >= 60) return "Strong bull tilt";
  if (score >= 20) return "Bull tilt";
  if (score > 0) return "Lean bull";
  if (score <= -60) return "Strong bear tilt";
  if (score <= -20) return "Bear tilt";
  if (score < 0) return "Lean bear";
  return "Balanced";
}

function confidenceFromScore(score: number): ThesisBoardItem["confidence"] {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function dailyUpdateSideLabel(side: DailyThesisUpdateSummary["side"]): string {
  return side === "canada" ? "CAD" : "US";
}

function dailyUpdateToneClass(update: DailyThesisUpdateSummary): string {
  const delta = update.stanceDelta ?? 0;
  if (delta > 0) return "border-prairie/25 bg-prairie/10 text-prairie";
  if (delta < 0) return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function dailyUpdateBadge(update: DailyThesisUpdateSummary): string {
  const delta = update.stanceDelta;
  if (delta === null) return `${dailyUpdateSideLabel(update.side)} ${update.market}`;
  return `${dailyUpdateSideLabel(update.side)} ${update.market} ${signedNumber(delta)}`;
}

function dailyUpdateDateKey(update: DailyThesisUpdateSummary): string | null {
  return localDateKeyFromTimestamp(update.recordedAt);
}

function latestCurrentDayDailyUpdate(
  dailyUpdates: DailyThesisUpdateSummary[],
  todayKey: string,
): DailyThesisUpdateSummary | null {
  return dailyUpdates.find((update) => dailyUpdateDateKey(update) === todayKey) ?? null;
}

function dailyUpdateDetail(update: DailyThesisUpdateSummary): string {
  const stanceDelta = update.stanceDelta === null ? "not stamped" : signedNumber(update.stanceDelta);
  const confidenceDelta =
    update.confidenceDelta === null ? "not stamped" : signedNumber(update.confidenceDelta);
  const signal = update.signalNote ?? update.trigger ?? "Daily trajectory review";
  return `Latest ${dailyUpdateSideLabel(update.side)} ${update.market}: ${stanceDelta} stance / ${confidenceDelta} confidence at ${formatDateTime(update.recordedAt)}. ${sanitizeXPulseCopy(signal)}.`;
}

function dailyUpdateItemSide(item: ThesisBoardItem): DailyThesisUpdateSummary["side"] {
  return item.lane === "canada" ? "canada" : "us";
}

function normalizedMarketName(value: string): string {
  return value.trim().toLowerCase();
}

function dailyUpdateAppliesToItem(
  update: DailyThesisUpdateSummary,
  item: ThesisBoardItem,
): boolean {
  if (update.side !== dailyUpdateItemSide(item)) return false;
  if (normalizedMarketName(update.market) !== normalizedMarketName(item.name)) return false;
  if (update.cropYear && item.cropYear && update.cropYear !== item.cropYear) return false;
  if (update.side === "canada" && update.grainWeek !== null && item.grainWeek !== null) {
    return update.grainWeek === item.grainWeek;
  }
  if (update.side === "us" && update.marketYear !== null && item.marketYear !== null) {
    return update.marketYear === item.marketYear;
  }
  return true;
}

function latestDailyUpdateForItem(
  item: ThesisBoardItem,
  dailyUpdates: DailyThesisUpdateSummary[],
): DailyThesisUpdateSummary | null {
  const sortedUpdates = [...dailyUpdates].sort((left, right) => {
    const leftTime = left.recordedAt ? new Date(left.recordedAt).getTime() : 0;
    const rightTime = right.recordedAt ? new Date(right.recordedAt).getTime() : 0;
    return rightTime - leftTime;
  });
  return sortedUpdates.find((update) => dailyUpdateAppliesToItem(update, item)) ?? null;
}

function applyDailyUpdateToItem(
  item: ThesisBoardItem,
  dailyUpdates: DailyThesisUpdateSummary[],
): ThesisBoardItem {
  const update = latestDailyUpdateForItem(item, dailyUpdates);
  if (!update) return item;

  const confidenceScore = update.confidenceScore ?? update.newConfidence ?? item.confidenceScore;
  return {
    ...item,
    stanceScore: update.stanceScore,
    stanceLabel: currentStanceLabel(update.stanceScore),
    confidenceScore,
    confidence: confidenceFromScore(confidenceScore),
    scoreSource: {
      kind: "daily_overlay",
      recordedAt: update.recordedAt,
      trigger: update.trigger,
    },
  };
}

function applyDailyTrajectoryOverlay(
  data: ThesisBoardData,
  dailyUpdates: DailyThesisUpdateSummary[],
): ThesisBoardData {
  if (dailyUpdates.length === 0) return data;

  const canadaItems = data.canadaItems.map((item) => applyDailyUpdateToItem(item, dailyUpdates));
  const usItems = data.usItems.map((item) => applyDailyUpdateToItem(item, dailyUpdates));
  return {
    ...data,
    canadaItems,
    usItems,
    comparisonRows: buildMajorThesisComparisonRows(canadaItems, usItems),
  };
}

function dailyOverlayItemLabel(item: ThesisBoardItem, state: "review-gated daily overlay" | "weekly packet score"): string {
  return `${dailyUpdateSideLabel(dailyUpdateItemSide(item))} ${item.name}: ${state}`;
}

function scoreSourceLabel(item: ThesisBoardItem): string {
  if (item.scoreSource?.kind !== "daily_overlay") return "Weekly packet";
  const dateKey = localDateKeyFromTimestamp(item.scoreSource.recordedAt);
  return dateKey
    ? `Daily overlay ${dateLabelFromKey(dateKey)} (review-gated)`
    : "Daily overlay (review-gated)";
}

function scoreSourceClass(item: ThesisBoardItem): string {
  return item.scoreSource?.kind === "daily_overlay"
    ? "border-prairie/25 bg-prairie/10 text-prairie"
    : "border-border bg-background/70 text-muted-foreground";
}

function ScoreSourceBadge({ item }: { item: ThesisBoardItem }) {
  return (
    <Badge variant="outline" className={scoreSourceClass(item)}>
      Score source: {scoreSourceLabel(item)}
    </Badge>
  );
}

function rowItems(row: ThesisComparisonRow): ThesisBoardItem[] {
  return [row.canada, row.us].filter((item): item is ThesisBoardItem => item !== null);
}

function aggregateRowScore(row: ThesisComparisonRow): number | null {
  return weightedBoardReadScore(rowItems(row));
}

function aggregateRowConfidence(row: ThesisComparisonRow): number | null {
  return averageBoardReadConfidence(rowItems(row));
}

function confidenceScaledPosition(score: number, confidence: number): number {
  const target = 50 + score / 2;
  const scale = Math.max(0, Math.min(100, confidence)) / 100;
  return Math.max(0, Math.min(100, 50 + (target - 50) * scale));
}

function wheatCoverageLabel(row: ThesisComparisonRow): string {
  if (row.canada && row.us) return "Canada + US";
  if (row.canada) return "Canada only";
  if (row.us) return "US only";
  return "No active packet";
}

function firstPointLabel(points: ThesisComparisonPoint[], fallback: string): string {
  const point = points[0];
  if (!point) return fallback;
  return `${point.country} ${point.title}: ${point.body} (${point.metricLabel} / ${sourceDisplayName(point.sourceName)}).`;
}

const WHEAT_PRESSURE_LANE_IDS = [
  "supply",
  "demand",
  "movement",
  "logistics",
  "price",
  "positioning",
  "weather",
] as const;

const WHEAT_PRESSURE_LANE_LABELS: Record<(typeof WHEAT_PRESSURE_LANE_IDS)[number], string> = {
  supply: "Supply",
  demand: "Demand",
  movement: "Movement",
  logistics: "Logistics",
  price: "Price",
  positioning: "Positioning",
  weather: "Weather",
};

function pressureLaneSummaries(row: ThesisComparisonRow) {
  return WHEAT_PRESSURE_LANE_IDS.map((domain) => {
    const domains = rowItems(row).flatMap((item) =>
      item.ratingScorecard.domains.filter((score) => score.domain === domain),
    );
    const score = Math.round(domains.reduce((sum, item) => sum + item.weighted_score, 0));
    const sources = Array.from(new Set(domains.flatMap((item) => item.sources))).slice(0, 3);
    const positiveEvidence = domains.flatMap((item) => item.positive_evidence);
    const negativeEvidence = domains.flatMap((item) => item.negative_evidence);
    const evidence =
      positiveEvidence[0] ??
      negativeEvidence[0] ??
      (domains.length ? "No plain-English evidence line is attached to this lane yet." : "No active packet evidence in this lane.");

    return {
      domain,
      label: WHEAT_PRESSURE_LANE_LABELS[domain],
      score,
      sourceCount: sources.length,
      sources,
      evidence,
    };
  });
}

function MarketUseNotice() {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] leading-5 text-muted-foreground shadow-sm sm:px-5 sm:py-3 sm:text-xs">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-prairie" aria-hidden="true" />
        <p>
          Market intelligence from public sources only. Not an instruction to price, hedge, or
          market grain. Data follows official publication schedules and may lag.
        </p>
      </div>
    </div>
  );
}

function DataFlowStep({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: string;
  tone: "official" | "price" | "watch" | "read";
}) {
  const toneClass =
    tone === "official"
      ? "border-prairie/25 bg-prairie/10 text-prairie"
      : tone === "price"
        ? "border-canola/35 bg-canola/10 text-canola"
        : tone === "watch"
          ? "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-border bg-background text-foreground";

  return (
    <div className={cn("min-w-0 rounded-lg border p-3", toneClass)}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function WheatDataFlowStrip() {
  const steps = [
    {
      label: "Official inputs",
      detail: "CGC, USDA, CFTC, crop reports, logistics, and supply tables.",
      tone: "official" as const,
    },
    {
      label: "Pressure lanes",
      detail: "Supply, demand, movement, logistics, price, positioning, and weather.",
      tone: "official" as const,
    },
    {
      label: "Wheat read",
      detail: "Canada and US packet evidence is confidence-weighted into one visible read.",
      tone: "read" as const,
    },
    {
      label: "Watch leads",
      detail: "X/social evidence flags what to inspect; it cannot move the read alone.",
      tone: "watch" as const,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Sources to Wheat Bull/Bear board</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Official evidence can move the read. Watch-only leads only tell the desk what to inspect next.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-canola/35 bg-canola/10 text-canola">
          Data flow
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
        {steps.map((step, index) => (
          <Fragment key={step.label}>
            <DataFlowStep {...step} />
            {index < steps.length - 1 ? (
              <div className="hidden items-center justify-center text-muted-foreground md:flex" aria-hidden="true">
                <ArrowRight className="h-4 w-4" />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function WheatStanceMeter({
  score,
  confidence,
}: {
  score: number | null;
  confidence: number | null;
}) {
  const safeScore = score ?? 0;
  const safeConfidence = confidence ?? 0;
  const position = confidenceScaledPosition(safeScore, safeConfidence);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Wheat stance meter
          </p>
          <p className={cn("mt-1 text-4xl font-semibold tabular-nums", stanceClass(safeScore))}>
            {safeScore > 0 ? `+${safeScore}` : safeScore}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">{directionalIndicatorLabel(safeScore)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{safeConfidence}% confidence</p>
        </div>
      </div>
      <div className="relative mt-5 h-4 rounded-full bg-muted" aria-label={`Wheat confidence-scaled stance score ${safeScore}`}>
        <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
        <span
          className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-2 border-background bg-canola shadow-md"
          data-confidence-scaled-position={`${position.toFixed(2)}%`}
          style={{ left: `calc(${position}% - 0.875rem)` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
        <span>Bear</span>
        <span>Balanced</span>
        <span>Bull</span>
      </div>
    </div>
  );
}

type WheatLocalContextSummary = {
  label: string;
  detail: string;
};

function WheatMobileDecisionSnapshot({
  row,
  score,
  confidence,
  localContext,
}: {
  row: ThesisComparisonRow;
  score: number | null;
  confidence: number | null;
  localContext: WheatLocalContextSummary;
}) {
  const safeScore = score ?? 0;
  const safeConfidence = confidence ?? 0;
  const position = confidenceScaledPosition(safeScore, safeConfidence);

  return (
    <div className="space-y-2 px-4 pb-4 sm:hidden">
      <div className="rounded-lg border border-border bg-background/80 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Wheat stance meter
            </p>
            <p className={cn("text-3xl font-semibold tabular-nums", stanceClass(safeScore))}>
              {safeScore > 0 ? `+${safeScore}` : safeScore}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{directionalIndicatorLabel(safeScore)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{safeConfidence}% confidence</p>
          </div>
        </div>
        <div
          className="relative mt-2 h-2 rounded-full bg-muted"
          aria-label={`Wheat confidence-scaled stance score ${safeScore}`}
        >
          <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
          <span
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-background bg-canola shadow-sm"
            data-confidence-scaled-position={`${position.toFixed(2)}%`}
            style={{ left: `calc(${position}% - 0.5rem)` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="rounded-lg border border-prairie/20 bg-background/80 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-prairie">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          Top bull evidence
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {firstPointLabel(row.strongestBullPoints, "No bullish Wheat driver in the current packets.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-canola/25 bg-canola/10 p-3">
          <p className="text-xs font-semibold text-canola">Data flow</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Official inputs -&gt; pressure lanes -&gt; Wheat read.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/80 p-3">
          <p className="text-xs font-semibold text-foreground">Your area</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {localContext.detail}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{localContext.label}</p>
    </div>
  );
}

function WheatPressureLaneBreakdown({ row }: { row: ThesisComparisonRow }) {
  const lanes = pressureLaneSummaries(row);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Pressure-lane breakdown</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Lane scores come from the same Canada/US packet scorecards that drive the visible Wheat read.
          </p>
        </div>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
          Wheat only
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.domain} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{lane.label}</p>
              <span className={cn("text-sm font-semibold tabular-nums", stanceClass(lane.score))}>
                {lane.score > 0 ? `+${lane.score}` : lane.score}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{lane.evidence}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {lane.sourceCount > 0
                ? lane.sources.map(sourceDisplayName).join(" + ")
                : "No active source in this lane"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WheatDecisionSurface({
  row,
  localContext,
}: {
  row: ThesisComparisonRow | null;
  localContext: WheatLocalContextSummary;
}) {
  if (!row) {
    return (
      <Card className="rounded-lg border-dashed py-6 shadow-none">
        <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
          Wheat is the active farmer-facing grain, but no Wheat thesis packet is available in the current board data.
        </CardContent>
      </Card>
    );
  }

  const score = aggregateRowScore(row);
  const confidence = aggregateRowConfidence(row);
  const action = rowActionCue(row);

  return (
    <section className="space-y-4" aria-labelledby="wheat-decision-heading">
      <Card className="overflow-hidden rounded-lg border-canola/30 bg-gradient-to-br from-canola/10 via-card to-prairie/8 py-0 shadow-sm">
        <CardHeader className="gap-3 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-2 border-canola/35 bg-background/70 text-canola sm:mb-3">
                Wheat-first farmer read
              </Badge>
              <CardTitle id="wheat-decision-heading" className="font-display text-xl sm:text-2xl md:text-3xl">
                Wheat Bull/Bear decision surface
              </CardTitle>
              <CardDescription className="mt-2 hidden text-sm leading-6 sm:block">
                One active grain is visible to farmers today. The other V1 grain lanes stay in the shared harness for later re-enable, but they are hidden from the normal read.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge variant="outline" className={comparisonClass(row.status)}>
                {row.statusLabel}
              </Badge>
              <Badge variant="outline" className={actionCueClass(row.status)}>
                {action.label}
              </Badge>
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                {wheatCoverageLabel(row)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <WheatMobileDecisionSnapshot row={row} score={score} confidence={confidence} localContext={localContext} />
        <CardContent className="hidden gap-4 px-5 pb-5 sm:grid lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <WheatStanceMeter score={score} confidence={confidence} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-prairie/20 bg-background/75 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-prairie">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Top bull evidence
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {firstPointLabel(row.strongestBullPoints, "No bullish Wheat driver in the current packets.")}
              </p>
            </div>
            <div className="rounded-lg border border-amber-600/20 bg-background/75 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <TrendingDown className="h-4 w-4" aria-hidden="true" />
                Top bear evidence
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {firstPointLabel(row.strongestBearPoints, "No bearish Wheat driver in the current packets.")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/75 p-4 sm:col-span-2">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Flag className="h-4 w-4 text-canola" aria-hidden="true" />
                Current read
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {action.detail} {row.explanation} Use this to inspect the evidence stack, not as an instruction to market grain.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <WheatDataFlowStrip />
    </section>
  );
}

type BoardUpdateModeSummary = {
  totalRows: number;
  todayRows: number;
  dailyOverlayRows: number;
  weeklyRows: number;
  latestOverlayAt: string | null;
  badge: string;
  badgeClass: string;
  countLabel: string;
  detail: string;
};

function pluralizeRows(count: number): string {
  return `${count} row${count === 1 ? "" : "s"}`;
}

function boardUpdateModeSummary(data: ThesisBoardData, todayKey: string): BoardUpdateModeSummary {
  const items = [...data.canadaItems, ...data.usItems];
  const dailyOverlayItems = items.filter((item) => item.scoreSource?.kind === "daily_overlay");
  const todayRows = dailyOverlayItems.filter(
    (item) => localDateKeyFromTimestamp(item.scoreSource?.recordedAt) === todayKey,
  ).length;
  const latestOverlayAt = dailyOverlayItems
    .map((item) => item.scoreSource?.recordedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .at(-1) ?? null;
  const totalRows = items.length;
  const dailyOverlayRows = dailyOverlayItems.length;
  const weeklyRows = Math.max(0, totalRows - dailyOverlayRows);

  if (totalRows === 0) {
    return {
      totalRows,
      todayRows,
      dailyOverlayRows,
      weeklyRows,
      latestOverlayAt,
      badge: "no rows",
      badgeClass: "border-border bg-muted/50 text-muted-foreground",
      countLabel: "0/0 today",
      detail: "No visible Bull/Bear rows are available for update-mode scoring.",
    };
  }

  if (todayRows === totalRows) {
    return {
      totalRows,
      todayRows,
      dailyOverlayRows,
      weeklyRows,
      latestOverlayAt,
      badge: "all current today",
      badgeClass: "border-prairie/25 bg-prairie/10 text-prairie",
      countLabel: `${todayRows}/${totalRows} today`,
      detail: `All ${pluralizeRows(totalRows)} have same-day bounded overlays; weekly thesis text remains Friday source-of-record and write automation stays approval-gated.`,
    };
  }

  if (todayRows > 0) {
    const priorOverlayRows = Math.max(0, dailyOverlayRows - todayRows);
    return {
      totalRows,
      todayRows,
      dailyOverlayRows,
      weeklyRows,
      latestOverlayAt,
      badge: "partial today",
      badgeClass: "border-canola/35 bg-canola/10 text-canola",
      countLabel: `${todayRows}/${totalRows} today`,
      detail: `${todayRows}/${totalRows} visible Bull/Bear rows have same-day bounded overlays; ${pluralizeRows(priorOverlayRows)} use prior review-gated overlays and ${pluralizeRows(weeklyRows)} remain weekly packet scores. Friday thesis text remains source-of-record and write automation stays approval-gated.`,
    };
  }

  if (dailyOverlayRows > 0) {
    return {
      totalRows,
      todayRows,
      dailyOverlayRows,
      weeklyRows,
      latestOverlayAt,
      badge: "prior overlay active",
      badgeClass: "border-canola/35 bg-canola/10 text-canola",
      countLabel: `${todayRows}/${totalRows} today`,
      detail: `${dailyOverlayRows}/${totalRows} visible Bull/Bear rows use current-period review-gated daily overlays, but none are stamped today. ${pluralizeRows(weeklyRows)} remain weekly packet scores.${latestOverlayAt ? ` Latest overlay row ${formatDateTime(latestOverlayAt)}.` : ""} Write automation stays approval-gated.`,
    };
  }

  return {
    totalRows,
    todayRows,
    dailyOverlayRows,
    weeklyRows,
    latestOverlayAt,
    badge: "weekly packet",
    badgeClass: "border-border bg-background/70 text-muted-foreground",
    countLabel: `${todayRows}/${totalRows} today`,
    detail: "No visible Bull/Bear row has a daily overlay; weekly thesis packet controls the displayed scores until a review-gated daily row matches the current period.",
  };
}

function dailyOverlayCoverage(
  data: ThesisBoardData,
  dailyUpdates: DailyThesisUpdateSummary[],
  todayKey: string,
): DailyOverlayCoverage {
  const items = [...data.canadaItems, ...data.usItems];
  const matchedUpdates: DailyThesisUpdateSummary[] = [];
  const overlaidLabels: string[] = [];
  const weeklyLabels: string[] = [];

  for (const item of items) {
    const update = latestDailyUpdateForItem(item, dailyUpdates);
    if (update) {
      matchedUpdates.push(update);
      overlaidLabels.push(dailyOverlayItemLabel(item, "review-gated daily overlay"));
    } else {
      weeklyLabels.push(dailyOverlayItemLabel(item, "weekly packet score"));
    }
  }

  const latestOverlayAt = matchedUpdates
    .map((update) => update.recordedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    totalRows: items.length,
    overlaidRows: matchedUpdates.length,
    todayOverlaidRows: matchedUpdates.filter((update) => dailyUpdateDateKey(update) === todayKey).length,
    weeklyRows: Math.max(0, items.length - matchedUpdates.length),
    latestOverlayAt,
    overlaidLabels,
    weeklyLabels,
  };
}

function sourceFreshnessTile(
  title: string,
  sourceNames: string[],
  data: ThesisBoardData,
  icon: LucideIcon,
): DailyUpdateTile {
  const rows = sourceRowsByNames(data, sourceNames);
  if (rows.length === 0) {
    return {
      title,
      badge: "not in packet",
      badgeClass: "border-border bg-muted/50 text-muted-foreground",
      detail: "No rendered freshness row in the current public board packet.",
      icon,
    };
  }

  const statuses = uniqueStatuses(rows);
  const latestPeriod = latestFreshnessPeriod(rows);
  return {
    title,
    badge: statuses.join(" + "),
    badgeClass: freshnessClass(statuses.includes("strong") && statuses.length === 1 ? "strong" : statuses[0] ?? "unknown"),
    detail: `${rows.length} packet row${rows.length === 1 ? "" : "s"}; latest period ${latestPeriod ?? "not stamped"}.`,
    icon,
  };
}

function DailyUpdateStatusPanel({
  data,
  xPulseWatch,
  dailyUpdates,
  readinessSnapshot,
}: {
  data: ThesisBoardData;
  xPulseWatch: XPulseWatchSummary;
  dailyUpdates: DailyThesisUpdateSummary[];
  readinessSnapshot: Track54ReadinessSnapshot | null;
}) {
  const latestRun = xPulseWatch.latestRun;
  const latestDailyUpdate = dailyUpdates[0] ?? null;
  const todayKey = localDateKey(new Date());
  const currentDayDailyUpdate = latestCurrentDayDailyUpdate(dailyUpdates, todayKey);
  const overlayCoverage = dailyOverlayCoverage(data, dailyUpdates, todayKey);
  const hasFreshTodayPriceContext = hasFreshPriceContextForDate(data, todayKey);
  const todayWindow = todayUpdateWindow(xPulseWatch, hasFreshTodayPriceContext);
  const dailyPulseGate = findReadinessGate(readinessSnapshot, "daily_pulse");
  const fridayDeepGate = findReadinessGate(readinessSnapshot, "friday_deep");
  const xPulsePublicNotice = xPulsePublicGateNotice(readinessSnapshot, latestRun);
  const readinessGates = [dailyPulseGate, fridayDeepGate].filter(
    (gate): gate is Track54ReadinessModeGateSnapshot => Boolean(gate),
  );
  const dailyChecklist = buildDailyUpdateChecklist({
    hasFreshTodayPriceContext,
    latestRun,
    todayKey,
    currentDayDailyUpdate,
    todayWindow,
  });
  const cacheBadge = data.packetMode === "cached" ? data.cacheStatus : "live fallback";
  const cacheFresh = data.packetMode !== "cached" || data.cacheStatus === "fresh";
  const xFreshStatus =
    latestRun?.status === "success" && latestRun.priceSnapshotStatus === "fresh"
      ? "strong"
      : latestRun?.status === "failed" || latestRun?.status === "rejected"
        ? "broken"
        : "lagged";
  const tiles: DailyUpdateTile[] = [
    {
      title: "Board packet",
      badge: cacheBadge,
      badgeClass: freshnessClass(cacheFresh ? "strong" : "stale"),
      detail: `Generated ${formatDateTime(data.generatedAt)}; source run ${formatDateTime(data.latestAvailableSourceRunAt)}.`,
      icon: DatabaseZap,
    },
    sourceFreshnessTile("Price context", REQUIRED_PRICE_CONTEXT_SOURCE_NAMES, data, TrendingUp),
    {
      title: "Latest X Pulse dry-run proof",
      badge: latestRun?.status ?? "not stored",
      badgeClass: freshnessClass(xFreshStatus),
      detail: xPulseProofTileDetail(latestRun, todayKey),
      icon: Radar,
    },
    {
      title: "Daily soft update",
      badge: currentDayDailyUpdate
        ? dailyUpdateBadge(currentDayDailyUpdate)
        : latestDailyUpdate
          ? "prior-day overlay"
          : "review gated",
      badgeClass: currentDayDailyUpdate
        ? dailyUpdateToneClass(currentDayDailyUpdate)
        : "border-canola/30 bg-canola/10 text-canola",
      detail: currentDayDailyUpdate
        ? `${dailyUpdateDetail(currentDayDailyUpdate)} Today's current-score overlay only; Friday thesis text remains the source-of-record.`
        : latestDailyUpdate
          ? `No current-day daily trajectory row is stored yet. Latest overlay: ${dailyUpdateDetail(latestDailyUpdate)} Prior-day overlay can still affect the displayed score until the current local-day bounded review writes a matching row.`
          : "Daily deltas stay review-gated until fresh prices, accepted watch leads, and the no-write artifact gate clear.",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl font-semibold">Daily Update Status</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          A quick proof strip for whether the current bull/bear read has fresh packets, price context,
          and supervised watch evidence behind it. X Pulse is a dry-run watch lane until its artifact
          gate and human approval clear.
        </p>
      </div>
      <div className="rounded-lg border border-canola/30 bg-canola/8 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {xPulsePublicNotice}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.title} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-canola" aria-hidden="true" />
                  {tile.title}
                </div>
                <Badge variant="outline" className={tile.badgeClass}>
                  {tile.badge}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{tile.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Daily decision path</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Daily board movement follows this order so watch evidence cannot outrank official packets or fresh prices.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {DAILY_DECISION_PATH.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{step.label}</p>
                    <p className="mt-1 text-xs font-medium text-canola">{step.timing}</p>
                  </div>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Today update window</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Shows whether the current-day proof is pending, due, or already stored.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
              Today {todayWindow.dateLabel}
            </Badge>
            <Badge variant="outline" className={todayWindow.badgeClass}>
              {todayWindow.badge}
            </Badge>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{todayWindow.detail}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Today update checklist</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Shows which gates are satisfied before the daily Bull/Bear status can be called current.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
            {dailyChecklist.filter((item) => item.status === "complete").length}/{dailyChecklist.length} complete
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dailyChecklist.map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-background/75 p-3">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <Badge variant="outline" className={dailyChecklistBadgeClass(item.status)}>
                  {item.badge}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
      {readinessGates.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Daily automation gate progress</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Write mode stays disabled until the matching no-write proof window passes and Kyle approves promotion.
              </p>
            </div>
            <Badge
              variant="outline"
              className={readinessSnapshot?.productionWritesEnabled
                ? freshnessClass("broken")
                : "w-fit border-border bg-background/70 text-muted-foreground"}
            >
              {readinessSnapshot?.productionWritesEnabled ? "write mode enabled" : "write mode disabled"}
            </Badge>
          </div>
          {readinessSnapshot ? (
            <div className="mb-3 rounded-md border border-border bg-background/75 p-3">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-xs font-semibold text-foreground">Readiness proof</p>
                <Badge variant="outline" className={readinessProofBadgeClass(readinessSnapshot)}>
                  {readinessProofBadge(readinessSnapshot)}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{readinessProofDetail(readinessSnapshot)}</p>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {readinessGates.map((gate) => (
              <div key={gate.mode} className="rounded-md border border-border bg-background/75 p-3">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="text-xs font-semibold text-foreground">{readinessGateModeLabel(gate.mode)}</p>
                  <Badge
                    variant="outline"
                    className={readinessGateBadgeClass(gate, readinessSnapshot?.reportFreshEnough === true)}
                  >
                    {gate.artifactDaysFound}/{gate.requiredArtifactDays} clean days
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {readinessGateDetail(gate, readinessSnapshot?.reportFreshEnough === true)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Review-gated daily overlay coverage</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Counts matching current-period trajectory rows and separates same-day rows from older overlays.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
            {overlayCoverage.todayOverlaidRows}/{overlayCoverage.totalRows} today
          </Badge>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {overlayCoverage.overlaidRows} of {overlayCoverage.totalRows} board row
          {overlayCoverage.totalRows === 1 ? "" : "s"} have current-period daily trajectory overlays;
          {" "}
          {overlayCoverage.todayOverlaidRows} of those are stamped today.
          {" "}
          {overlayCoverage.weeklyRows} row{overlayCoverage.weeklyRows === 1 ? "" : "s"}{" "}
          {overlayCoverage.weeklyRows === 1 ? "remains" : "remain"} on weekly packet
          scores until a matching daily row exists.
          {overlayCoverage.latestOverlayAt
            ? ` Latest overlay row ${formatDateTime(overlayCoverage.latestOverlayAt)}.`
            : " No daily overlay row is active for the current visible board."}
          {" "}
          Daily overlay means a bounded review row, not an enabled production write loop.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Review-gated overlay rows</p>
            <div className="flex flex-wrap gap-1.5">
              {overlayCoverage.overlaidLabels.length > 0 ? (
                overlayCoverage.overlaidLabels.map((label) => (
                  <Badge key={label} variant="outline" className="border-prairie/25 bg-prairie/10 text-prairie">
                    {label}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
                  None active
                </Badge>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Weekly packet rows</p>
            <div className="flex flex-wrap gap-1.5">
              {overlayCoverage.weeklyLabels.length > 0 ? (
                overlayCoverage.weeklyLabels.map((label) => (
                  <Badge key={label} variant="outline" className="border-border bg-background/70 text-muted-foreground">
                    {label}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="border-prairie/25 bg-prairie/10 text-prairie">
                  All visible rows have review-gated daily overlays
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
      {dailyUpdates.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Latest Daily Trajectory Moves</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Review-gated movement rows overlaid on visible scores while weekly thesis drivers
                remain anchored to the source-backed packet.
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
              {dailyUpdates.length} recent
            </Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {dailyUpdates.slice(0, 4).map((update) => (
              <div
                key={`${update.side}-${update.market}-${update.recordedAt}`}
                className="rounded-md border border-border bg-background/75 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={dailyUpdateToneClass(update)}>
                    {dailyUpdateBadge(update)}
                  </Badge>
                  <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                    current {signedNumber(update.stanceScore)}
                  </Badge>
                  {update.confidenceScore !== null ? (
                    <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                      {update.confidenceScore}% confidence
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{dailyUpdateDetail(update)}</p>
                {update.reasoning ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {sanitizeXPulseCopy(update.reasoning)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function WeeklyDataIntakePanel({
  data,
  xPulseWatch,
  sourceRuns,
}: {
  data: ThesisBoardData;
  xPulseWatch: XPulseWatchSummary;
  sourceRuns: SourceRunSummary[];
}) {
  const intakeRows = WEEKLY_DATA_INTAKE.map((item, index) => ({
    item,
    proof: intakeCurrentProof(item, data, xPulseWatch, sourceRuns),
    index,
  }));
  const trackerCards = weeklyPullTrackerCards(intakeRows);
  const calendarDays = weeklyPullCalendarDays(intakeRows);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Weekly Data Intake</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The board pulls official source data, prices, and supervised watch evidence on this cadence.
            Each row shows the table it feeds and what pressure it adds to the bull/bear read.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-white/60">
          {WEEKLY_DATA_INTAKE.length} inputs
        </Badge>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground shadow-sm">
        Official thesis inputs remain the source-of-record. Price context is secondary context, and
        X Pulse is an unverified social monitoring lead until official-source or desk review
        corroborates it.
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Current week pull tracker</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Current-day view of which intake lanes are on deck, which have proof, and what still feeds the Friday
            source-of-record review.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {trackerCards.map((card) => (
            <div key={card.title} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-semibold text-foreground">{card.title}</p>
                <Badge variant="outline" className={cn("w-fit", card.badgeClass)}>
                  {card.badge}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{card.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Weekly pull calendar</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Monday-Friday view of the data lanes that can refresh the board before the Friday thesis handoff.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {calendarDays.map((day) => (
            <div key={day.weekday} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-semibold text-foreground">{day.label}</p>
                <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
                  {calendarProofLabel(day.rows)}
                </Badge>
              </div>
              <p className="text-xs font-medium leading-5 text-foreground">
                {sourceList(day.rows, "No scheduled board inputs")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...new Set(day.rows.map(({ item }) => item.pressureLane))].map((lane) => (
                  <Badge key={`${day.label}-${lane}`} variant="outline" className={pressureLaneClass(lane)}>
                    {lane}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {day.rows.length > 0
                  ? "These lanes can refresh source proof, price context, or watch evidence for the current board."
                  : "No scheduled board input is expected for this weekday."}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">How the week updates the board</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Read this as the operating sequence: price context first, crop/flow evidence through the week,
            then Friday thesis-of-record review.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {WEEKLY_ANALYSIS_FLOW.map((step) => (
            <div key={step.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  <p className="mt-1 text-xs font-medium text-canola">{step.timing}</p>
                </div>
                <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-xs font-medium leading-5 text-foreground">{step.sources}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.boardEffect}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">How data becomes Bull/Bear pressure</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            The same source can matter differently by lane. These rules explain what the board treats as
            constructive, cautious, or watch-only before a score moves.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ANALYSIS_PRESSURE_RULES.map((rule) => (
            <div key={rule.lane} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <Badge variant="outline" className={pressureLaneClass(rule.lane)}>
                {rule.lane}
              </Badge>
              <dl className="mt-3 space-y-2 text-xs leading-5">
                <div>
                  <dt className="font-semibold text-prairie">Bullish read</dt>
                  <dd className="text-muted-foreground">{rule.bullish}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-amber-700 dark:text-amber-300">Bearish read</dt>
                  <dd className="text-muted-foreground">{rule.bearish}</dd>
                </div>
                {rule.boundary ? (
                  <div>
                    <dt className="font-semibold text-foreground">Boundary</dt>
                    <dd className="text-muted-foreground">{rule.boundary}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quick source cards</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Scan the weekly pull list without sideways table scrolling.
          </p>
          <span className="sr-only">Mobile weekly intake cards</span>
          <span className="sr-only">Mobile quick-read cards for the same pull list; desktop keeps the full audit table.</span>
        </div>
        <div className="grid gap-3">
          {intakeRows.map(({ item, proof }) => (
            <div key={`${item.timing}-${item.source}-card`} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0 text-canola" aria-hidden="true" />
                    {item.source}
                  </div>
                  <p className="mt-1 text-xs font-medium text-canola">{item.timing}</p>
                </div>
                <Badge variant="outline" className={intakeRoleClass(item.role)}>
                  {item.role}
                </Badge>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={pressureLaneClass(item.pressureLane)}>
                    {item.pressureLane}
                  </Badge>
                  {proof.chips.map((chip) => (
                    <Badge key={`${item.source}-card-${chip.label}`} variant="outline" className={chip.className}>
                      {chip.label}
                    </Badge>
                  ))}
                </div>
                <dl className="space-y-2 text-xs leading-5">
                  <div>
                    <dt className="font-semibold text-foreground">Role</dt>
                    <dd className="text-muted-foreground">{item.role}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Pressure lane</dt>
                    <dd className="text-muted-foreground">{item.pressureLane}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Feeds</dt>
                    <dd className="text-muted-foreground">{item.target}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Analyzed data</dt>
                    <dd className="text-muted-foreground">{item.analyzedData}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Current board status</dt>
                    <dd className="text-muted-foreground">
                      <span className="font-medium text-foreground">{proof.summary}.</span>{" "}
                      {proof.detail}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">What it changes</dt>
                    <dd className="text-muted-foreground">{item.significance}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1660px] text-left text-sm">
            <caption className="sr-only">
              Weekly data intake cadence, target tables, analyzed data, evidence role, pressure lane, current board and source-run status, and bull bear significance.
            </caption>
            <thead className="border-b border-border bg-muted/35 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-44 px-4 py-3 font-semibold">When</th>
                <th className="w-56 px-4 py-3 font-semibold">Pulled data</th>
                <th className="w-56 px-4 py-3 font-semibold">Feeds</th>
                <th className="w-72 px-4 py-3 font-semibold">Analyzed data</th>
                <th className="w-44 px-4 py-3 font-semibold">Role</th>
                <th className="w-48 px-4 py-3 font-semibold">Pressure lane</th>
                <th className="w-72 px-4 py-3 font-semibold">Current board status</th>
                <th className="px-4 py-3 font-semibold">Signifies</th>
              </tr>
            </thead>
            <tbody>
              {intakeRows.map(({ item, proof }) => {
                return (
                  <tr key={`${item.timing}-${item.source}`} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0 text-canola" aria-hidden="true" />
                        {item.timing}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-foreground">{item.source}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{item.target}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{item.analyzedData}</td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="outline" className={intakeRoleClass(item.role)}>
                        {item.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="outline" className={pressureLaneClass(item.pressureLane)}>
                        {item.pressureLane}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {proof.chips.map((chip) => (
                            <Badge key={`${item.source}-${chip.label}`} variant="outline" className={chip.className}>
                              {chip.label}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs font-medium leading-5 text-foreground">{proof.summary}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{proof.detail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{item.significance}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function metricLabel(item: ThesisBoardItem): string {
  if (item.lane === "canada") {
    return `Crop year ${item.cropYear ?? "unknown"} / week ${item.grainWeek ?? "latest"}`;
  }
  return `Market year ${item.marketYear ?? "latest"}`;
}

function xPulseToneClass(sentiment: XPulseSignalSummary["sentiment"]): string {
  if (sentiment === "bullish") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (sentiment === "bearish") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-background/70 text-muted-foreground";
}

function metadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function formatAuditReason(reason: string): string {
  return sanitizeXPulseCopy(reason.replaceAll("_", " ").replaceAll(":", ": "));
}

function XPulseSignalRow({
  signal,
  auditMode,
}: {
  signal: XPulseSignalSummary;
  auditMode: boolean;
}) {
  const allowedClaims = metadataStringArray(signal.signalMetadata, "allowed_claims");
  const blockedClaims = metadataStringArray(signal.signalMetadata, "blocked_claims");

  return (
    <div className="rounded-md border border-border bg-background/75 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="outline" className={xPulseToneClass(signal.sentiment)}>
              {signal.sentiment}
            </Badge>
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              {signal.sourceCredTier ?? "unlisted source"}
            </Badge>
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              {signal.relevanceScore}/100 relevance
            </Badge>
          </div>
          <p className="text-sm leading-6 text-foreground">
            {sanitizeXPulseCopy(signal.postSummary)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {signal.primaryImpactGrain ?? signal.grain}
            {signal.affectedRegions.length ? ` / ${signal.affectedRegions.join(", ")}` : ""}
            {signal.postDate ? ` / posted ${formatDateTime(signal.postDate)}` : ""}
          </p>
        </div>
        {signal.postUrl ? (
          <Link
            href={signal.postUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-semibold text-canola hover:text-canola/80"
          >
            Open post
          </Link>
        ) : null}
      </div>

      {auditMode ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          <p>
            Allowed claims:{" "}
            {allowedClaims.length
              ? allowedClaims.map(sanitizeXPulseCopy).join("; ")
              : "none listed"}
          </p>
          <p>
            Blocked claims:{" "}
            {blockedClaims.length
              ? blockedClaims.map(sanitizeXPulseCopy).join("; ")
              : "none listed"}
          </p>
          <p>
            Staleness: {signal.stalenessClass ?? "not classified"}; official verification:{" "}
            {signal.needsOfficialVerification ? "required" : "not required"}
          </p>
          <p>
            Corroboration: {signal.corroboration.sameClaimCount} matching claims; official source{" "}
            {signal.corroboration.officialSourceMatch ? "matched" : "not matched"}
            {signal.corroboration.independentSources.length
              ? `; independent sources ${signal.corroboration.independentSources.join(", ")}`
              : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function XPulseWatchPanel({
  watch,
  auditMode,
}: {
  watch: XPulseWatchSummary;
  auditMode: boolean;
}) {
  const latestRun = watch.latestRun;
  const acceptedCount = latestRun?.acceptedSignalCount ?? watch.topSignals.length;
  const rejectedLabel = latestRun ? String(latestRun.rejectedSignalCount) : "not stored";
  const rejectionReasons = latestRun?.rejectionReasons ?? [];

  return (
    <Card className="rounded-lg border-border bg-card py-4 shadow-none">
      <CardHeader className="gap-3 px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 border-border bg-muted/40 text-muted-foreground">
              Watch-only social evidence
            </Badge>
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <Radar className="h-5 w-5 text-canola" aria-hidden="true" />
              X Pulse Watch
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
              Quarantined X posts are unverified social monitoring leads only. Friday thesis rows
              still come from official source packets, price context, and desk review.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              Last scan {formatDateTime(latestRun?.runFinishedAt ?? latestRun?.runStartedAt ?? null)}
            </Badge>
            <Badge variant="outline" className="border-prairie/25 bg-prairie/10 text-prairie">
              Accepted {acceptedCount}
            </Badge>
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              Rejected {rejectedLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {watch.topSignals.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {watch.topSignals.slice(0, 4).map((signal) => (
              <XPulseSignalRow key={signal.id} signal={signal} auditMode={auditMode} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            No accepted supervised X Pulse posts are stored yet. The thesis board remains fully source-led.
          </div>
        )}

        {auditMode ? (
          <details className="rounded-md border border-canola/25 bg-canola/5 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Scout run audit
            </summary>
            <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <p>Status: {latestRun?.status ?? "no run stored"}</p>
              <p>Runner: {latestRun?.runner ?? "not available"}</p>
              <p>Mode: {latestRun?.mode ?? "not available"}</p>
              <p>Price snapshot: {latestRun?.priceSnapshotStatus ?? "not checked"}</p>
              <p>Prompt: {latestRun?.promptVersion ?? "not available"}</p>
              <p>Raw posts: {latestRun?.rawSignalCount ?? 0}</p>
              <p>Artifact hash: {latestRun?.artifactSha256 ?? "not stored"}</p>
              <p>Artifact path: {latestRun?.artifactPath ?? "not stored"}</p>
            </div>
            <div className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-foreground">Rejected signal reasons</p>
              <p>
                {rejectionReasons.length
                  ? rejectionReasons.map(formatAuditReason).join("; ")
                  : "none recorded for this run"}
              </p>
            </div>
          </details>
        ) : null}

        <div className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-prairie" aria-hidden="true" />
          <span>
            Guardrail: X Pulse can add watch evidence only. It cannot update thesis rows without
            official-source or desk-review corroboration, and it cannot override source health,
            price freshness, or the weekly desk thesis.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function readableStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function productionGateClass(snapshot: Track54ReadinessSnapshot): string {
  if (snapshot.productionWritesEnabled) return freshnessClass("broken");
  if (snapshot.reportFreshEnough !== true) return freshnessClass("lagged");
  if (snapshot.overallStatus === "ready_for_human_approval") return freshnessClass("strong");
  return freshnessClass("lagged");
}

function productionGateModeClass(
  gate: Track54ReadinessModeGateSnapshot,
  reportFreshEnough: boolean,
): string {
  if (!reportFreshEnough) return freshnessClass("lagged");
  if (gate.promotionStatus === "ready_for_human_approval") return freshnessClass("strong");
  if (gate.readinessStatus === "blocked_by_artifact_gates") return freshnessClass("lagged");
  return freshnessClass("broken");
}

function modeGateLabel(gate: Track54ReadinessModeGateSnapshot): string {
  return `${gate.artifactDaysFound}/${gate.requiredArtifactDays} artifact days`;
}

function ProductionGateAuditPanel({ snapshot }: { snapshot: Track54ReadinessSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Track 54 production gate</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Audit-only operator view for whether daily Bull/Bear write mode is ready to promote.
          </p>
        </div>
        <Card className="rounded-lg border-canola/30 bg-canola/8 py-4 shadow-none">
          <CardContent className="space-y-2 px-4">
            <Badge variant="outline" className="border-canola/30 bg-canola/10 text-canola">
              Readiness report missing
            </Badge>
            <p className="text-sm leading-6 text-muted-foreground">
              Run the no-write Track 54 readiness check to populate the local operator report. Public thesis
              rows remain source-backed and write-mode routines stay disabled.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const lastKnownNotice = readinessLastKnownNotice(snapshot);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Track 54 production gate</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Audit-only operator view for whether daily Bull/Bear write mode is ready to promote.
          </p>
        </div>
        <Badge variant="outline" className={productionGateClass(snapshot)}>
          {readableStatus(snapshot.overallStatus)}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg py-4 shadow-sm">
          <CardContent className="space-y-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Production writes</p>
              <Badge
                variant="outline"
                className={snapshot.productionWritesEnabled ? freshnessClass("broken") : freshnessClass("strong")}
              >
                {snapshot.productionWritesEnabled ? "enabled" : "disabled"}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Human approval {snapshot.humanApprovalRequiredBeforeWrites ? "is required" : "is not required"} before
              any write-mode routines can be registered.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-4 shadow-sm">
          <CardContent className="space-y-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Browser proof</p>
              <Badge variant="outline" className={readinessProofBadgeClass(snapshot)}>
                {readinessProofBadge(snapshot)}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {readinessProofDetail(snapshot)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-4 shadow-sm">
          <CardContent className="space-y-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Completion blockers</p>
              <Badge
                variant="outline"
                className={snapshot.completionBlockers.length || lastKnownNotice
                  ? freshnessClass("lagged")
                  : freshnessClass("strong")}
              >
                {snapshot.completionBlockers.length}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {lastKnownNotice ? `${lastKnownNotice} ` : ""}
              {snapshot.completionBlockers[0] ?? "No completion blockers listed in the readiness report."}
            </p>
            {grokCredentialStatusLine(snapshot) ? (
              <p className="text-xs leading-5 text-muted-foreground">{grokCredentialStatusLine(snapshot)}</p>
            ) : null}
            {grokCredentialRecoveryLine(snapshot) ? (
              <p className="text-xs leading-5 text-muted-foreground">{grokCredentialRecoveryLine(snapshot)}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.modeGates.map((gate) => (
          <Card key={gate.mode} className="rounded-lg py-4 shadow-sm">
            <CardContent className="space-y-3 px-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{gate.mode}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {readableStatus(gate.reviewVerdict)}; {readableStatus(gate.promotionStatus)}.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={productionGateModeClass(gate, snapshot.reportFreshEnough === true)}
                >
                  {modeGateLabel(gate)}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {lastKnownNotice ? `${lastKnownNotice} ` : ""}
                Accepted {gate.acceptedSignalCount}; decision-grade {gate.acceptedDecisionGradeCount}. Next eligible
                dates: {gate.nextEligibleRunDates.length ? gate.nextEligibleRunDates.join(", ") : "none listed"}.
              </p>
              {gate.promotionBlockers.length ? (
                <p className="text-xs leading-5 text-muted-foreground">{gate.promotionBlockers[0]}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function DriverList({
  title,
  tone,
  drivers,
}: {
  title: string;
  tone: "bull" | "bear";
  drivers: ThesisDriver[];
}) {
  const Icon = tone === "bull" ? TrendingUp : TrendingDown;
  const toneClass =
    tone === "bull"
      ? "border-prairie/20 bg-prairie/6 text-prairie"
      : "border-amber-600/20 bg-amber-500/8 text-amber-700 dark:text-amber-300";

  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      {drivers.length > 0 ? (
        <div className="space-y-3">
          {drivers.slice(0, 4).map((driver) => (
            <div key={`${driver.sourceName}-${driver.title}`} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{driver.title}</p>
                <Badge variant="outline" className={confidenceClass(driver.confidence)}>
                  {driver.confidence}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{driver.body}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {driver.metricLabel} / {sourceDisplayName(driver.sourceName)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {tone === "bull"
            ? "No strong bullish drivers identified this week."
            : "No strong bearish drivers identified this week."}
        </p>
      )}
    </div>
  );
}


function VikingL2ContextPanel({ item }: { item: ThesisBoardItem }) {
  if (item.lane !== "us" || item.vikingL2Chunks.length === 0) return null;

  return (
    <details className="rounded-lg border border-canola/20 bg-canola/5 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Viking L2 interpretation support ({item.vikingL2Chunks.length})
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Local-only distilled book context used as interpretation support. Current source packets still
          control the stance score.
        </p>
        {item.vikingL2Chunks.map((chunk) => (
          <div key={`${item.id}-${chunk.source}-${chunk.id}`} className="rounded-md border border-border bg-background p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-canola/30 bg-canola/10 text-canola">
                {chunk.topic.replaceAll("_", " ")}
              </Badge>
              <p className="text-xs font-medium text-muted-foreground">
                {chunk.source}{chunk.pageHint ? ` · ${chunk.pageHint}` : ""}
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{chunk.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function FreshnessStrip({ item }: { item: ThesisBoardItem }) {
  const visibleRows = item.freshness.slice(0, 6);
  return (
    <div className="flex flex-wrap gap-2">
      {visibleRows.map((row) => (
        <Badge
          key={`${item.id}-${row.sourceName}`}
          variant="outline"
          className={freshnessClass(row.freshnessStatus)}
        >
          {sourceDisplayName(row.sourceName)}: {row.freshnessStatus}
        </Badge>
      ))}
      {item.freshness.length > visibleRows.length && (
        <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
          +{item.freshness.length - visibleRows.length} more
        </Badge>
      )}
    </div>
  );
}

function ScorecardAuditPanel({ item }: { item: ThesisBoardItem }) {
  const scorecard = item.ratingScorecard;
  const missingSources = scorecard.missing_required_sources;
  const blockedClaims = [
    ...scorecard.llm_blocked_claims,
    ...scorecard.domains.flatMap((domain) => domain.blocked_claims),
  ].filter((claim, index, claims) => claim && claims.indexOf(claim) === index);

  return (
    <div className="rounded-lg border border-canola/30 bg-canola/5 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Scorecard audit</p>
          <p className="text-xs text-muted-foreground">
            {scorecard.lane} / {scorecard.period_anchor} / watermark {scorecard.source_watermark ?? "none"}
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-canola/35 bg-background/70 text-canola">
          Quality adjustments: {scorecard.quality_adjustments.length}
        </Badge>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="rounded-md border border-border bg-background px-3 py-2 text-muted-foreground">
          Overall rating: {scorecard.overall_score} / {scorecard.overall_label}
        </p>
        <p className="rounded-md border border-border bg-background px-3 py-2 text-muted-foreground">
          Confidence: {scorecard.confidence_score}% / {scorecard.confidence_label}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {scorecard.domains.map((domain) => (
          <Badge
            key={`${item.id}-scorecard-${domain.domain}`}
            variant="outline"
            className="border-border bg-background/80 text-muted-foreground"
          >
            {domain.domain}: {domain.score} × {domain.weight}
          </Badge>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
        <p>
          Missing required sources: {missingSources.length > 0 ? missingSources.join(", ") : "none"}
        </p>
        <p>Blocked claims: {blockedClaims.length > 0 ? blockedClaims.join(", ") : "none"}</p>
      </div>
    </div>
  );
}

function impactSourceClassLabel(sourceClass: ImpactSourceClass): string {
  const labels: Record<ImpactSourceClass, string> = {
    official_thesis_input: "Official input",
    price_context: "Price context",
    bounded_context: "Bounded context",
    watch_only: "Watch-only",
    parked: "Parked",
  };
  return labels[sourceClass];
}

function impactSourceClassClass(sourceClass: ImpactSourceClass): string {
  if (sourceClass === "official_thesis_input") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (sourceClass === "price_context" || sourceClass === "bounded_context") {
    return "border-canola/35 bg-canola/10 text-canola";
  }
  if (sourceClass === "watch_only") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted/50 text-muted-foreground";
}

function ImpactFactorRow({ factor }: { factor: GrainImpactFactor }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={impactSourceClassClass(factor.sourceClass)}>
          {impactSourceClassLabel(factor.sourceClass)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
          {factor.domain}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
          {factor.scope.replaceAll("_", " ")}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-foreground">{factor.label}</p>
      <div className="mt-2 grid gap-2 text-xs leading-5 text-muted-foreground md:grid-cols-2">
        <p>
          <span className="font-semibold text-foreground">Bull:</span> {factor.bullSignal}
        </p>
        <p>
          <span className="font-semibold text-foreground">Bear:</span> {factor.bearSignal}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Boundary: {factor.boundary}
      </p>
    </div>
  );
}

function MarketResponseRuleRow({ response }: { response: GrainMarketResponseRule }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {response.sourceClasses.map((sourceClass) => (
          <Badge
            key={`${response.id}-source-class-${sourceClass}`}
            variant="outline"
            className={impactSourceClassClass(sourceClass)}
          >
            {impactSourceClassLabel(sourceClass)}
          </Badge>
        ))}
      </div>
      <p className="text-sm font-semibold text-foreground">{response.label}</p>
      <div className="mt-2 grid gap-2 text-xs leading-5 text-muted-foreground lg:grid-cols-3">
        <p>
          <span className="font-semibold text-foreground">When:</span> {response.when}
        </p>
        <p>
          <span className="font-semibold text-foreground">Market response:</span> {response.marketResponse}
        </p>
        <p>
          <span className="font-semibold text-foreground">Confidence:</span> {response.confidenceImpact}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Viking overlay: {response.vikingTopics.map((topic) => topic.replaceAll("_", " ")).join(", ")}
      </p>
    </div>
  );
}

function pressureMapToneClass(tone: WheatPressureMapModel["aggregateTone"]): string {
  if (tone === "bull") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (tone === "bear") return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  if (tone === "mixed") return "border-canola/35 bg-canola/10 text-canola";
  return "border-border bg-background/80 text-muted-foreground";
}

function pressureMapDriverClass(driver: WheatPressureDriverNode): string {
  if (driver.tone === "bull") return "border-prairie/25 bg-prairie/8";
  return "border-amber-600/25 bg-amber-500/8";
}

function pressureMapDriverIconClass(driver: WheatPressureDriverNode): string {
  return driver.tone === "bull" ? "text-prairie" : "text-amber-700 dark:text-amber-300";
}

function wheatPressureScoreSourceLabel(node: WheatPressureCountryNode): string {
  if (node.scoreSource === "daily_overlay") {
    return `Daily overlay${node.scoreSourceDate ? ` ${formatDateTime(node.scoreSourceDate)}` : ""}`;
  }
  return "Weekly packet";
}

function wheatPressureReadinessClass(readiness: WheatPressureSourceReadiness): string {
  if (readiness === "active_driver") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (readiness === "available") return freshnessClass("strong");
  if (readiness === "watch_only") return impactSourceClassClass("watch_only");
  if (readiness === "missing") return freshnessClass("empty");
  return freshnessClass("lagged");
}

function wheatPressureScoreRoleLabel(role: WheatPressureScoreRole): string {
  const labels: Record<WheatPressureScoreRole, string> = {
    score_input: "Scores",
    bounded_context: "Bounded context",
    watch_only: "Watch-only",
    proof_only: "Proof only",
  };
  return labels[role];
}

function wheatPressureScoreRoleClass(role: WheatPressureScoreRole): string {
  if (role === "score_input") return impactSourceClassClass("official_thesis_input");
  if (role === "bounded_context") return impactSourceClassClass("price_context");
  if (role === "watch_only") return impactSourceClassClass("watch_only");
  return "border-border bg-background/80 text-muted-foreground";
}

function wheatContributionClass(value: number): string {
  if (value > 0) return "border-prairie/25 bg-prairie/10 text-prairie";
  if (value < 0) return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function signedWeightedScore(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const formatted = rounded.toLocaleString("en-CA", { maximumFractionDigits: 2 });
  return rounded > 0 ? `+${formatted}` : formatted;
}

function scoreWeightLabel(contribution: WheatPressurePacketContribution): string {
  const weightPct = `${Math.round(contribution.weight * 100)}%`;
  return `${signedNumber(contribution.score)} x ${weightPct}`;
}

function WheatPressureContributionStrip({
  contributions,
  totalWeightedScore,
}: {
  contributions: readonly WheatPressurePacketContribution[];
  totalWeightedScore: number;
}) {
  if (contributions.length === 0) {
    return (
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Current packet contribution: none from this lane.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <Badge variant="outline" className={wheatContributionClass(totalWeightedScore)}>
        Current packet contribution {signedWeightedScore(totalWeightedScore)}
      </Badge>
      <div className="space-y-1.5">
        {contributions.slice(0, 3).map((contribution) => (
          <div
            key={contribution.id}
            className="rounded-md border border-border bg-background/80 px-2 py-1.5 text-xs leading-5 text-muted-foreground"
          >
            <p className="font-medium text-foreground">
              {contribution.country} {contribution.domain}: {signedWeightedScore(contribution.weightedScore)} ({scoreWeightLabel(contribution)})
            </p>
            <p>
              Sources: {contribution.sourceIds.map(sourceDisplayName).join(", ")}; confidence {contribution.confidence}; freshness {contribution.freshnessStatus}.
            </p>
            {contribution.metrics.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {contribution.metrics.slice(0, 3).map((metric) => (
                  <span
                    key={`${contribution.id}-${metric.source}-${metric.label}`}
                    className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {metric.label}: {metric.value}
                  </span>
                ))}
              </div>
            ) : null}
            {contribution.evidence[0] ? (
              <p className="mt-1 line-clamp-2">{sanitizePublicWheatClassCopy(contribution.evidence[0])}</p>
            ) : null}
          </div>
        ))}
      </div>
      {contributions.length > 3 ? (
        <p className="text-xs text-muted-foreground">+{contributions.length - 3} more packet contribution{contributions.length - 3 === 1 ? "" : "s"}.</p>
      ) : null}
    </div>
  );
}

function WheatPressureSourceCard({ source }: { source: WheatPressureSourceNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={wheatPressureReadinessClass(source.readiness)}>
          {source.readinessLabel}
        </Badge>
        <Badge variant="outline" className={wheatPressureScoreRoleClass(source.scoreRole)}>
          {wheatPressureScoreRoleLabel(source.scoreRole)}
        </Badge>
      </div>
      <p className="text-sm font-semibold leading-5 text-foreground">{source.label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{source.detail}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Factors: {source.factorLabels.length ? source.factorLabels.map(sanitizePublicWheatClassCopy).join(", ") : "freshness proof only"}
      </p>
      <WheatPressureContributionStrip
        contributions={source.packetContributions}
        totalWeightedScore={source.totalWeightedScore}
      />
    </div>
  );
}

function WheatPressureFactorCard({ factor }: { factor: WheatPressureFactorNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={wheatPressureReadinessClass(factor.readiness)}>
          {factor.readinessLabel}
        </Badge>
        <Badge variant="outline" className={impactSourceClassClass(factor.sourceClass)}>
          {impactSourceClassLabel(factor.sourceClass)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
          {factor.domain}
        </Badge>
      </div>
      <p className="text-sm font-semibold leading-5 text-foreground">{sanitizePublicWheatClassCopy(factor.label)}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {factor.activeSourceCount}/{factor.sourceIds.length} source lanes visible; {factor.activeDriverCount} active driver{factor.activeDriverCount === 1 ? "" : "s"}.
      </p>
      <WheatPressureContributionStrip
        contributions={factor.packetContributions}
        totalWeightedScore={factor.totalWeightedScore}
      />
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{sanitizePublicWheatClassCopy(factor.boundary)}</p>
    </div>
  );
}

function WheatPressureGraphEdgeRow({ edge }: { edge: WheatPressureGraphEdge }) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-background p-2.5 text-xs leading-5 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_auto] md:items-center">
      <p className="font-medium text-foreground">{sanitizePublicWheatClassCopy(edge.fromLabel)}</p>
      <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden="true" />
      <p className="font-medium text-foreground">{sanitizePublicWheatClassCopy(edge.toLabel)}</p>
      <Badge variant="outline" className={wheatPressureScoreRoleClass(edge.scoreRole)}>
        {edge.label}
      </Badge>
    </div>
  );
}

function WheatPressureDriverCard({ driver }: { driver: WheatPressureDriverNode }) {
  const Icon = driver.tone === "bull" ? TrendingUp : TrendingDown;

  return (
    <div className={cn("rounded-lg border bg-background/90 p-3 shadow-sm", pressureMapDriverClass(driver))}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={driver.tone === "bull" ? freshnessClass("strong") : freshnessClass("lagged")}>
          {driver.country} {driver.tone}
        </Badge>
        <Badge variant="outline" className={impactSourceClassClass(driver.sourceClass)}>
          {impactSourceClassLabel(driver.sourceClass)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
          {driver.domain}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", pressureMapDriverIconClass(driver))} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-foreground">{driver.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {driver.metricLabel} / {sourceDisplayName(driver.sourceName)}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Linked factor: {driver.factorLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function WheatPressureCountryCard({ node }: { node: WheatPressureCountryNode }) {
  const positive = node.score > 0;
  const width = `${Math.min(50, Math.abs(node.score / 2) * (node.confidenceScore / 100)).toFixed(2)}%`;

  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          {node.country}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
          {wheatPressureScoreSourceLabel(node)}
        </Badge>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={cn("text-2xl font-semibold tabular-nums", stanceClass(node.score))}>
            {signedNumber(node.score)}
          </p>
          <p className="text-xs font-medium text-muted-foreground">{node.stanceLabel}</p>
        </div>
        <p className="text-xs font-semibold text-muted-foreground tabular-nums">{node.confidenceScore}%</p>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-muted" aria-label={`${node.label} confidence-scaled pressure ${node.score}`}>
        <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
        <span
          className={cn(
            "absolute top-0 h-full rounded-full motion-safe:animate-pulse",
            stanceFillClass(node.score),
            positive ? "left-1/2" : "right-1/2",
          )}
          style={{ width }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function WheatPressureRelationshipCard({ relationship }: { relationship: WheatPressureRelationshipNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/90 p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={impactSourceClassClass(relationship.sourceClass)}>
          {impactSourceClassLabel(relationship.sourceClass)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
          {relationship.kind.replaceAll("_", " ")}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-foreground">{relationship.target}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{relationship.note}</p>
    </div>
  );
}

function WheatPressureMapPanel({
  rows,
  xPulseWatch,
  sourceRuns,
}: {
  rows: ThesisComparisonRow[];
  xPulseWatch: XPulseWatchSummary;
  sourceRuns: SourceRunSummary[];
}) {
  const wheatRow = rows.find((row) => row.grain === "Wheat") ?? null;
  const model = wheatRow ? buildWheatPressureMapModel(wheatRow, { xPulseWatch, sourceRuns }) : null;
  if (!model) return null;

  const activeDrivers = model.driverNodes;
  const rule = model.responseRules[model.aggregateTone === "mixed" ? 0 : 1] ?? model.responseRules[0];
  const primaryBoundary = activeDrivers[0]?.boundary ?? "Wheat pressure stays bounded by admitted source evidence.";
  const publicGaps = publicWheatGapLabels(model.parkedGaps);
  const coverage = model.graphCoverage;

  return (
    <section className="scroll-mt-28 space-y-4" aria-labelledby="wheat-pressure-map-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 w-fit border-canola/35 bg-canola/8 text-canola">
            Wheat pilot
          </Badge>
          <h2 id="wheat-pressure-map-heading" className="scroll-mt-28 font-display text-2xl font-semibold">
            Wheat Pressure Map
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Active Wheat evidence, relationship links, and guardrails across every known source lane before the board prints the final Bull/Bear read.
          </p>
        </div>
        <Badge variant="outline" className={cn("w-fit", pressureMapToneClass(model.aggregateTone))}>
          {model.statusLabel} / {signedNumber(model.aggregateScore)}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source lanes</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{coverage.knownSourceCount}</p>
          <p className="text-xs leading-5 text-muted-foreground">{coverage.sourceBackedCount} have current proof in this view</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Causal factors</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{coverage.factorCount}</p>
          <p className="text-xs leading-5 text-muted-foreground">{coverage.activeFactorCount} active or proof-backed</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph links</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{coverage.edgeCount}</p>
          <p className="text-xs leading-5 text-muted-foreground">{coverage.scoredEdgeCount} can affect pressure</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packet contributions</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{coverage.packetContributionCount}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {coverage.scoredPacketContributionCount} score-backed; {coverage.parkedGapCount} parked gaps
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Source data lanes</p>
            <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
              {coverage.activeDriverSourceCount} active-driver sources
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {model.sourceNodes.map((source) => (
              <WheatPressureSourceCard key={source.id} source={source} />
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Wheat factor nodes</p>
            <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
              {coverage.boundedContextSourceCount} bounded price lanes
            </Badge>
          </div>
          <div className="space-y-3">
            {model.factorNodes.map((factor) => (
              <WheatPressureFactorCard key={factor.id} factor={factor} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.65fr)]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wheat score nodes</p>
              {model.countryNodes.map((node) => (
                <WheatPressureCountryCard key={node.id} node={node} />
              ))}
              <div className="rounded-lg border border-canola/30 bg-canola/8 p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={pressureMapToneClass(model.aggregateTone)}>
                    Final read
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                    {model.aggregateConfidence}% avg confidence
                  </Badge>
                </div>
                <p className={cn("text-3xl font-semibold tabular-nums", stanceClass(model.aggregateScore))}>
                  {signedNumber(model.aggregateScore)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{model.statusDetail}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active evidence drivers</p>
              {activeDrivers.length ? (
                activeDrivers.map((driver) => (
                  <WheatPressureDriverCard key={driver.id} driver={driver} />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                  No active Wheat driver nodes were captured in the current packets.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">All graph links</p>
              <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
                {coverage.watchOnlyEdgeCount} watch-only links
              </Badge>
            </div>
            <div className="space-y-2">
              {model.graphEdges.map((edge) => (
                <WheatPressureGraphEdgeRow key={edge.id} edge={edge} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Rule firing now</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule?.label ?? "No Wheat rule selected."}</p>
          </div>
          {rule ? (
            <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">When:</span> {sanitizePublicWheatClassCopy(rule.when)}
              </p>
              <p>
                <span className="font-semibold text-foreground">Market response:</span> {sanitizePublicWheatClassCopy(rule.marketResponse)}
              </p>
              <p>
                <span className="font-semibold text-foreground">Confidence:</span> {sanitizePublicWheatClassCopy(rule.confidenceImpact)}
              </p>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source boundary
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{sanitizePublicWheatClassCopy(primaryBoundary)}</p>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parked Wheat gaps
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {publicGaps.slice(0, 5).join(", ")}.
            </p>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationship links</p>
            <div className="mt-3 space-y-3">
              {model.relationships.map((relationship) => (
                <WheatPressureRelationshipCard key={relationship.id} relationship={relationship} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const COVERAGE_CHECKLIST_STEPS: Array<{
  key: keyof GrainDataCoverageChecklist;
  label: string;
}> = [
  { key: "pulled", label: "Pull" },
  { key: "packeted", label: "Packet" },
  { key: "scored", label: "Score" },
  { key: "explanation_only", label: "Explain" },
  { key: "missing", label: "Gap" },
];

function coverageStepLabel(step: GrainDataCoverageStep): string {
  const labels: Record<GrainDataCoverageStep, string> = {
    pulled: "Pulled only",
    packeted: "In packet",
    scored: "Scores",
    explanation_only: "Explanation only",
    missing: "Missing",
  };
  return labels[step];
}

function coverageStepClass(step: GrainDataCoverageStep): string {
  if (step === "scored") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (step === "explanation_only") return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  if (step === "packeted") return "border-canola/35 bg-canola/10 text-canola";
  if (step === "pulled") return "border-border bg-background/80 text-muted-foreground";
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function CoverageChecklist({ checklist, idPrefix }: { checklist: GrainDataCoverageChecklist; idPrefix: string }) {
  return (
    <div className="grid grid-cols-5 gap-1 text-[11px] font-medium">
      {COVERAGE_CHECKLIST_STEPS.map((step) => {
        const active = checklist[step.key];
        return (
          <div
            key={`${idPrefix}-coverage-step-${step.key}`}
            className={cn(
              "rounded-md border px-1.5 py-1 text-center",
              active
                ? "border-canola/30 bg-canola/10 text-canola"
                : "border-border bg-muted/30 text-muted-foreground/70",
            )}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

function DataCoverageFactorRow({ row }: { row: GrainDataCoverageRow }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={coverageStepClass(row.currentStep)}>
          {coverageStepLabel(row.currentStep)}
        </Badge>
        <Badge variant="outline" className={impactSourceClassClass(row.sourceClass)}>
          {impactSourceClassLabel(row.sourceClass)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
          {row.domain}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
          {row.scope.replaceAll("_", " ")}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-foreground">{row.label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Source IDs: {row.sourceIds.join(", ")}
      </p>
      <div className="mt-3">
        <CoverageChecklist checklist={row.checklist} idPrefix={row.id} />
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground lg:grid-cols-3">
        <p>
          <span className="font-semibold text-foreground">Bull:</span> {row.bullSignal}
        </p>
        <p>
          <span className="font-semibold text-foreground">Bear:</span> {row.bearSignal}
        </p>
        <p>
          <span className="font-semibold text-foreground">Next:</span> {row.nextAction}
        </p>
      </div>
    </div>
  );
}

function DataCoverageGapRow({ gap }: { gap: GrainDataCoverageGap }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={coverageStepClass(gap.currentStep)}>
          {coverageStepLabel(gap.currentStep)}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-foreground">{gap.label}</p>
      <div className="mt-3">
        <CoverageChecklist checklist={gap.checklist} idPrefix={gap.id} />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{gap.nextAction}</p>
    </div>
  );
}

function admissionPriorityKindLabel(kind: GrainDataAdmissionPriority["kind"]): string {
  if (kind === "promote_watch_lane") return "Promote watch lane";
  return "Admit missing source";
}

function AdmissionPriorityRow({ priority }: { priority: GrainDataAdmissionPriority }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola">
          Priority {priority.rank}
        </Badge>
        <Badge variant="outline" className={coverageStepClass(priority.currentStep)}>
          {coverageStepLabel(priority.currentStep)}
        </Badge>
        <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
          {admissionPriorityKindLabel(priority.kind)}
        </Badge>
        {priority.domain ? (
          <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
            {priority.domain}
          </Badge>
        ) : null}
        {priority.scope ? (
          <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
            {priority.scope.replaceAll("_", " ")}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-foreground">{priority.label}</p>
      {priority.sourceIds.length > 0 ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Candidate source IDs: {priority.sourceIds.join(", ")}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground lg:grid-cols-3">
        <p>
          <span className="font-semibold text-foreground">Why:</span> {priority.whyItMatters}
        </p>
        <p>
          <span className="font-semibold text-foreground">Admit:</span> {priority.admissionRequirement}
        </p>
        <p>
          <span className="font-semibold text-foreground">Boundary:</span> {priority.scoreBoundary}
        </p>
      </div>
    </div>
  );
}

function DataCoverageAuditPanel({ item }: { item: ThesisBoardItem }) {
  const coverage = getGrainDataCoverageProfile(item.name);
  if (!coverage) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Data coverage matrix</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Audit-only map of pulled, packeted, scored, explanation-only, and missing lanes for {coverage.grain}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit border-prairie/25 bg-prairie/10 text-prairie">
            Scored {coverage.summary.scored}
          </Badge>
          <Badge variant="outline" className="w-fit border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300">
            Explain {coverage.summary.explanationOnly}
          </Badge>
          <Badge variant="outline" className="w-fit border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">
            Gaps {coverage.summary.missing}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {COVERAGE_CHECKLIST_STEPS.map((step) => (
          <div key={`${item.id}-coverage-legend-${step.key}`} className="rounded-md border border-border bg-background px-3 py-2">
            <p className="text-xs font-semibold text-foreground">{step.label}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {step.key === "pulled"
                ? "Collector/source exists."
                : step.key === "packeted"
                  ? "Can enter packet."
                  : step.key === "scored"
                    ? "Can move rating."
                    : step.key === "explanation_only"
                      ? "Explains only."
                      : "Needs admission."}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3">
        {coverage.rows.map((row) => (
          <DataCoverageFactorRow key={`${item.id}-coverage-row-${row.id}`} row={row} />
        ))}
      </div>

      {coverage.admissionPriorities.length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next source admissions
            </p>
            <Badge variant="outline" className="w-fit border-canola/35 bg-background/70 text-canola">
              Top {coverage.summary.admissionPriorities}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ranked by lowest-friction path from the current impact map: watch-only lanes first, then missing source admissions.
          </p>
          <div className="mt-2 grid gap-3">
            {coverage.admissionPriorities.map((priority) => (
              <AdmissionPriorityRow
                key={`${item.id}-admission-priority-${priority.id}`}
                priority={priority}
              />
            ))}
          </div>
        </div>
      ) : null}

      {coverage.gaps.length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Missing source admissions
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {coverage.gaps.map((gap) => (
              <DataCoverageGapRow key={`${item.id}-coverage-gap-${gap.id}`} gap={gap} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImpactMapAuditPanel({ item }: { item: ThesisBoardItem }) {
  const profile = getGrainImpactProfile(item.name);
  if (!profile) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Impact Map audit</p>
          <p className="text-xs leading-5 text-muted-foreground">{profile.marketStructure}</p>
        </div>
        <Badge variant="outline" className="w-fit border-canola/35 bg-background/70 text-canola">
          {profile.marketShape.replaceAll("_", " ")}
        </Badge>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {profile.seasonalWindows.map((window) => (
          <Badge key={`${item.id}-impact-season-${window}`} variant="outline" className="border-border bg-background/80 text-muted-foreground">
            {window}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3">
        {profile.impactFactors.map((factor) => (
          <ImpactFactorRow key={`${item.id}-impact-factor-${factor.id}`} factor={factor} />
        ))}
      </div>

      {profile.marketResponses.length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Market response rules
          </p>
          <div className="mt-2 grid gap-3">
            {profile.marketResponses.map((response) => (
              <MarketResponseRuleRow
                key={`${item.id}-market-response-${response.id}`}
                response={response}
              />
            ))}
          </div>
        </div>
      ) : null}

      {profile.relationships.length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Relationships
          </p>
          <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
            {profile.relationships.map((relationship) => (
              <p key={`${item.id}-impact-relationship-${relationship.target}-${relationship.kind}`}>
                <span className="font-semibold text-foreground">{relationship.target}</span> ({relationship.kind.replaceAll("_", " ")}): {relationship.note}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {profile.parkedGaps.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Parked gaps: {profile.parkedGaps.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function ThesisCard({ item, auditMode }: { item: ThesisBoardItem; auditMode: boolean }) {
  const href = item.lane === "canada" ? `/grain/${item.slug}` : `/us/${item.slug}`;

  return (
    <Card className="rounded-lg py-5 shadow-sm">
      <CardHeader className="gap-4 px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                {item.lane === "canada" ? "Canada" : "US"}
              </Badge>
              <Badge variant="outline" className={confidenceClass(item.confidence)}>
                {item.confidenceScore ?? "--"}% confidence
              </Badge>
              <ScoreSourceBadge item={item} />
            </div>
            <CardTitle className="font-display text-xl leading-tight">{item.name}</CardTitle>
            <CardDescription className="mt-1">{metricLabel(item)}</CardDescription>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className={cn("text-3xl font-semibold tabular-nums", stanceClass(item.stanceScore))}>
              {item.stanceScore > 0 ? `+${item.stanceScore}` : item.stanceScore}
            </p>
            <p className="text-sm font-medium text-muted-foreground">{item.stanceLabel}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <DriverList title="Bull Case" tone="bull" drivers={item.bullDrivers} />
          <DriverList title="Bear Case" tone="bear" drivers={item.bearDrivers} />
        </div>

        <GrainReadLinkage grain={item.name} />

        <VikingL2ContextPanel item={item} />

        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">Source freshness</p>
            <p className="text-xs text-muted-foreground">
              Packet stamped {formatDateTime(item.packetGeneratedAt)}
            </p>
          </div>
          <FreshnessStrip item={item} />
          {item.warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {item.warnings.slice(0, 3).map((warning) => (
                <p
                  key={`${item.id}-${warning.sourceName}-${warning.status}`}
                  className="flex gap-2 text-xs leading-5 text-muted-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-canola" />
                  <span>
                    {sourceDisplayNameWithId(warning.sourceName)} is {warning.status}
                    {warning.actionHint ? `: ${warning.actionHint}` : ""}
                  </span>
                </p>
              ))}
              {item.warnings.length > 3 && (
                <p className="text-xs font-medium text-muted-foreground">
                  +{item.warnings.length - 3} more warnings hidden
                </p>
              )}
            </div>
          )}
        </div>

        {auditMode && <ScorecardAuditPanel item={item} />}

        {auditMode && <DataCoverageAuditPanel item={item} />}

        {auditMode && <ImpactMapAuditPanel item={item} />}

        <details className="rounded-lg border border-border bg-background px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Source provenance
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 pr-4 font-medium">Latest period</th>
                  <th className="py-2 pr-4 font-medium">Cadence</th>
                  <th className="py-2 pr-4 font-medium">Use</th>
                </tr>
              </thead>
              <tbody>
                {item.freshness.map((row) => (
                  <tr key={`${item.id}-detail-${row.sourceName}`} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {sourceDisplayNameWithId(row.sourceName)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.latestPeriod ?? "none"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.expectedCadence ?? "unknown"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.thesisUse ?? "context"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <Link
          href={href}
          className="inline-flex items-center gap-2 text-sm font-semibold text-canola transition-colors hover:text-canola/80"
        >
          Open detail page
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="rounded-lg py-5 shadow-none">
      <CardHeader className="px-5">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-canola/20 bg-canola/8 text-canola">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardDescription className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  );
}

function DataQualityBanner({ data }: { data: Awaited<ReturnType<typeof getThesisBoardData>> }) {
  const sourceHealthRead = buildSourceHealthRead(data.totals);
  const hasWatchSources = data.totals.uniqueWatchSourceCount > 0;
  const prairieWeekRead = prairieWeekStatusRead(data);
  const hasPartialPrairieWeek = prairieWeekRead !== null;
  const isStaleCache = data.packetMode === "cached" && data.cacheStatus !== "fresh";
  const sourceHealthCounts = `Source health: ${data.totals.strongSourceCount} strong freshness row${
    data.totals.strongSourceCount === 1 ? "" : "s"
  }; ${data.totals.uniqueWatchSourceCount} watch source group${
    data.totals.uniqueWatchSourceCount === 1 ? "" : "s"
  } across ${data.totals.watchSourceInstanceCount} packet row${
    data.totals.watchSourceInstanceCount === 1 ? "" : "s"
  }.`;
  const borderClass = isStaleCache || sourceHealthRead.tone === "blocker"
    ? "border-red-500/30 bg-red-500/8"
    : hasWatchSources || hasPartialPrairieWeek
      ? "border-canola/35 bg-canola/8"
      : "border-prairie/25 bg-prairie/8";
  const title = isStaleCache
    ? "Board freshness needs a refresh before use"
    : hasWatchSources
      ? "Official source rows have watch items to inspect"
      : hasPartialPrairieWeek
        ? "Official source rows clean; Prairie crop-progress package is partial"
      : "Official source rows are clean for this board";

  return (
    <Card className={cn("rounded-lg py-4 shadow-none", borderClass)}>
      <CardContent className="flex flex-col gap-3 px-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {sourceHealthCounts} {shortSourceHealthRead(data)} Confidence is source-completeness, not a marketing instruction.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Badge variant="outline" className={freshnessClass(isStaleCache ? "stale" : hasWatchSources || hasPartialPrairieWeek ? "lagged" : "strong")}>
            {data.packetMode === "cached" ? `Cached board: ${data.cacheStatus}` : "Live packet fallback"}
          </Badge>
          {prairieWeekRead ? (
            <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola">
              {prairieWeekRead}
            </Badge>
          ) : null}
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            Last source run {formatDateTime(data.latestAvailableSourceRunAt)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentSnapshotCard({ data }: { data: Awaited<ReturnType<typeof getThesisBoardData>> }) {
  const updateMode = boardUpdateModeSummary(data, localDateKey(new Date()));

  return (
    <Card className="rounded-lg border-canola/25 bg-canola/8 py-4 shadow-none">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock3 className="h-4 w-4 text-canola" />
          Current snapshot
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            {data.packetMode === "cached" ? "Cached board" : "Live RPC fallback"}
          </Badge>
          {data.packetMode === "cached" && (
            <Badge
              variant="outline"
              className={freshnessClass(data.cacheStatus === "fresh" ? "strong" : "stale")}
            >
              Cache {data.cacheStatus}
            </Badge>
          )}
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            Board update mode
          </Badge>
          <Badge variant="outline" className={updateMode.badgeClass}>
            {updateMode.badge}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            {updateMode.countLabel}
          </Badge>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Source watermark {formatDateTime(data.sourceRunWatermark)}; latest live run{" "}
          {formatDateTime(data.latestAvailableSourceRunAt)}. Direct packet data; no archive
          fallback.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Board update mode: {updateMode.detail} Daily overlays are review-gated status rows, not proof
          that production write automation is enabled.
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyLaneState({ label }: { label: string }) {
  return (
    <Card className="rounded-lg border-dashed py-6 shadow-none">
      <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
        No {label} thesis packets returned. Check the source freshness table before using this
        lane for a market read.
      </CardContent>
    </Card>
  );
}

type ThesisPageSearchParams = {
  audit?: string;
};

export default async function ThesisPage({
  searchParams,
}: {
  searchParams?: Promise<ThesisPageSearchParams>;
} = {}) {
  const params = await searchParams;
  const auditMode = params?.audit === "1";
  const cookieStore = await cookies();
  const area = areaFromFsa(cookieStore.get(AREA_FSA_COOKIE)?.value);
  const [data, xPulseWatch, sourceRuns, dailyUpdates, readinessSnapshot, provincialFlow, areaBids] =
    await Promise.all([
      getThesisBoardData(),
      getXPulseWatchSummary(),
      getLatestSourceRunSummaries(WEEKLY_DATA_SOURCE_RUN_NAMES),
      getLatestDailyThesisUpdates(4),
      getLocalTrack54ReadinessSnapshot(),
      area?.provinceName ? getProvincialFlow(area.provinceName) : Promise.resolve(null),
      area ? getAreaBids(area.fsa) : Promise.resolve([]),
    ]);
  const currentData = applyDailyTrajectoryOverlay(data, dailyUpdates);
  const farmerData = filterThesisBoardDataForActiveFarmerDisplay(currentData);
  const activeAreaFlows = (provincialFlow?.flows ?? []).filter((flow) => isActiveFarmerThesisGrain(flow.grain));
  const activeAreaBids = areaBids.filter((bid) => isActiveFarmerThesisGrain(bid.grain));
  const wheatComparisonRow = farmerData.comparisonRows.find((row) => row.grain === "Wheat") ?? null;
  const wheatCards = [...farmerData.canadaItems, ...farmerData.usItems];
  const wheatLocalContext: WheatLocalContextSummary = area?.provinceName
    ? {
        label: `${area.fsa} ${area.provinceName} context is filtered to Wheat.`,
        detail: `${activeAreaFlows.length} movement row${activeAreaFlows.length === 1 ? "" : "s"}; ${activeAreaBids.length} posted Wheat bid${activeAreaBids.length === 1 ? "" : "s"}.`,
      }
    : {
        label: "Postal code stays on this device only.",
        detail: "Set your postal code below for Wheat-only local movement and posted bids.",
      };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10 pt-4 sm:space-y-8 sm:pb-12 sm:pt-8">
      <section className="max-w-4xl">
        <Badge variant="outline" className="mb-2 border-canola/35 bg-canola/8 text-canola sm:mb-4">
          Live source packets
        </Badge>
        <h1 className="font-display text-2xl font-semibold tracking-normal text-foreground sm:text-3xl md:text-5xl">
          Wheat Bull/Bear Thesis Board
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:mt-4 sm:text-base sm:leading-7">
          Wheat-only farmer read from live source packets. Other V1 grain profiles stay reusable in
          the harness for later.
        </p>
      </section>

      <MarketUseNotice />

      <WheatDecisionSurface row={wheatComparisonRow} localContext={wheatLocalContext} />

      <YourAreaCard
        area={area}
        flows={activeAreaFlows}
        grainWeek={provincialFlow?.grainWeek ?? null}
        bids={activeAreaBids}
      />

      {wheatComparisonRow ? <WheatPressureLaneBreakdown row={wheatComparisonRow} /> : null}

      {wheatComparisonRow ? <GrainReadLinkage grain="Wheat" /> : null}

      <DataQualityBanner data={farmerData} />

      <CurrentSnapshotCard data={farmerData} />

      {auditMode ? (
        <DailyUpdateStatusPanel
          data={currentData}
          xPulseWatch={xPulseWatch}
          dailyUpdates={dailyUpdates}
          readinessSnapshot={readinessSnapshot}
        />
      ) : null}

      {auditMode ? <XPulseWatchPanel watch={xPulseWatch} auditMode={auditMode} /> : null}

      {auditMode ? <ProductionGateAuditPanel snapshot={readinessSnapshot} /> : null}

      {auditMode ? (
        <WeeklyDataIntakePanel data={currentData} xPulseWatch={xPulseWatch} sourceRuns={sourceRuns} />
      ) : null}

      <WheatPressureMapPanel
        rows={farmerData.comparisonRows}
        xPulseWatch={xPulseWatch}
        sourceRuns={sourceRuns}
      />

      {auditMode ? (
        <GrainImpactGraphPanel
          grains={currentData.comparisonRows.map((row) => row.grain)}
          boardReads={buildGrainImpactGraphBoardReads(currentData.comparisonRows)}
        />
      ) : null}

      {auditMode ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Source Packets"
            value={String(currentData.totals.itemCount)}
            detail={`${currentData.canadaItems.length} Canadian grains and ${currentData.usItems.length} US markets.`}
            icon={BarChart3}
          />
          <SummaryCard
            label="Strong Sources"
            value={String(currentData.totals.strongSourceCount)}
            detail="Freshness rows marked strong across rendered packet sources."
            icon={CheckCircle2}
          />
          <SummaryCard
            label="Watch Source Groups"
            value={String(currentData.totals.uniqueWatchSourceCount)}
            detail={watchSourceCardDetail(currentData)}
            icon={AlertTriangle}
          />
          <SummaryCard
            label="Packet Spine"
            value={currentData.packetMode === "cached" ? "Cached" : "Live"}
            detail={
              currentData.packetMode === "cached"
                ? `${currentData.cacheItemCount} cached packets; ${currentData.cacheStatus} against live source-run watermark.`
                : "Fallback mode: reading Canada and US packet RPCs directly."
            }
            icon={DatabaseZap}
          />
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Wheat Packet Details</h2>
            <p className="text-sm text-muted-foreground">
              Canada and US Wheat packet cards with source freshness, bull/bear cases, and provenance.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-white/60">
            {wheatCards.length} packets
          </Badge>
        </div>
        {wheatCards.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {wheatCards.map((item) => (
              <ThesisCard key={item.id} item={item} auditMode={auditMode} />
            ))}
          </div>
        ) : (
          <EmptyLaneState label="Wheat" />
        )}
      </section>
    </div>
  );
}
