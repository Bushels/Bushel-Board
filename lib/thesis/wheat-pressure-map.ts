import type {
  ThesisBoardItem,
  ThesisComparisonPoint,
  ThesisComparisonRow,
  ThesisCountryCode,
  ThesisDriver,
  ThesisDriverTone,
  ThesisFreshnessRow,
} from "@/lib/queries/thesis-board";
import type { SourceRunSummary } from "@/lib/queries/source-runs";
import type { XPulseSignalSummary, XPulseWatchSummary } from "@/lib/queries/x-scout-runs";
import {
  getGrainImpactProfile,
  type GrainImpactFactor,
  type GrainImpactRelationship,
  type GrainMarketResponseRule,
  type GrainMarketShape,
  type ImpactScope,
  type ImpactSourceClass,
} from "@/lib/thesis/grain-impact-map";
import type { RatingDomainId, RatingDomainMetric, RatingDomainScore } from "@/lib/thesis/rating-model";

export type WheatPressureMapTone = "bull" | "bear" | "balanced" | "mixed";
export type WheatPressureSourceReadiness = "active_driver" | "available" | "lagged" | "missing" | "watch_only";
export type WheatPressureScoreRole = "score_input" | "bounded_context" | "watch_only" | "proof_only";
export type WheatPressureGraphEdgeKind = "source_to_factor" | "factor_to_score" | "country_to_score" | "relationship";

export interface WheatPressureMapBuildContext {
  sourceRuns?: readonly SourceRunSummary[];
  xPulseWatch?: XPulseWatchSummary | null;
}

export interface WheatPressureCountryNode {
  id: string;
  country: ThesisCountryCode;
  label: string;
  score: number;
  stanceLabel: string;
  confidenceScore: number;
  scoreSource: "weekly_packet" | "daily_overlay";
  scoreSourceDate: string | null;
}

export interface WheatPressureDriverNode {
  id: string;
  country: ThesisCountryCode;
  tone: ThesisDriverTone;
  title: string;
  body: string;
  sourceName: string;
  sourceClass: ImpactSourceClass;
  domain: RatingDomainId;
  metricLabel: string;
  confidence: ThesisComparisonPoint["confidence"];
  factorId: string;
  factorLabel: string;
  boundary: string;
}

export interface WheatPressurePacketContribution {
  id: string;
  country: ThesisCountryCode;
  domain: RatingDomainId;
  score: number;
  weight: number;
  weightedScore: number;
  confidence: RatingDomainScore["confidence"];
  freshnessStatus: RatingDomainScore["freshness_status"];
  sourceIds: string[];
  metrics: RatingDomainMetric[];
  evidence: string[];
  blockedClaims: string[];
  periodAnchor: string;
  scoreSource: "weekly_packet" | "daily_overlay";
  includedInPressure: boolean;
}

export interface WheatPressureSourceNode {
  id: string;
  sourceId: string;
  label: string;
  sourceClass: ImpactSourceClass;
  scoreRole: WheatPressureScoreRole;
  readiness: WheatPressureSourceReadiness;
  readinessLabel: string;
  domains: RatingDomainId[];
  factorIds: string[];
  factorLabels: string[];
  activeDriverCount: number;
  packetContributions: WheatPressurePacketContribution[];
  totalWeightedScore: number;
  includedInPressure: boolean;
  freshnessStatus: string | null;
  latestPeriodEnd: string | null;
  latestRunStatus: string | null;
  latestRunFinishedAt: string | null;
  detail: string;
  boundary: string;
}

export interface WheatPressureFactorNode {
  id: string;
  factorId: string;
  label: string;
  domain: RatingDomainId;
  scope: ImpactScope;
  sourceClass: ImpactSourceClass;
  sourceIds: string[];
  scoreRole: WheatPressureScoreRole;
  readiness: WheatPressureSourceReadiness;
  readinessLabel: string;
  activeDriverCount: number;
  activeSourceCount: number;
  packetContributions: WheatPressurePacketContribution[];
  totalWeightedScore: number;
  includedInPressure: boolean;
  boundary: string;
}

export interface WheatPressureGraphEdge {
  id: string;
  kind: WheatPressureGraphEdgeKind;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  label: string;
  sourceClass: ImpactSourceClass;
  scoreRole: WheatPressureScoreRole;
  includedInPressure: boolean;
  tone?: ThesisDriverTone;
  confidence?: ThesisComparisonPoint["confidence"];
}

export interface WheatPressureGraphCoverage {
  knownSourceCount: number;
  sourceBackedCount: number;
  activeDriverSourceCount: number;
  scoringSourceCount: number;
  boundedContextSourceCount: number;
  watchOnlySourceCount: number;
  proofOnlySourceCount: number;
  missingSourceCount: number;
  factorCount: number;
  activeFactorCount: number;
  edgeCount: number;
  scoredEdgeCount: number;
  watchOnlyEdgeCount: number;
  parkedGapCount: number;
  activeDriverCount: number;
  packetContributionCount: number;
  scoredPacketContributionCount: number;
  xPulseAcceptedWheatCount: number;
}

export interface WheatPressureRelationshipNode {
  id: string;
  target: string;
  kind: GrainImpactRelationship["kind"];
  sourceClass: ImpactSourceClass;
  note: string;
}

export interface WheatPressureMapModel {
  grain: "Wheat";
  marketShape: GrainMarketShape;
  marketStructure: string;
  statusLabel: string;
  statusDetail: string;
  aggregateScore: number;
  aggregateConfidence: number;
  aggregateTone: WheatPressureMapTone;
  countryNodes: WheatPressureCountryNode[];
  driverNodes: WheatPressureDriverNode[];
  sourceNodes: WheatPressureSourceNode[];
  factorNodes: WheatPressureFactorNode[];
  graphEdges: WheatPressureGraphEdge[];
  graphCoverage: WheatPressureGraphCoverage;
  relationships: WheatPressureRelationshipNode[];
  responseRules: GrainMarketResponseRule[];
  parkedGaps: string[];
}

interface WheatPressureSourceRegistryEntry {
  sourceId: string;
  label: string;
  sourceClass: ImpactSourceClass;
  scoreRole: WheatPressureScoreRole;
  domains: RatingDomainId[];
  factorIds: string[];
  boundary: string;
}

type DriverFactor = Pick<GrainImpactFactor, "id" | "sourceClass" | "domain" | "label" | "boundary">;

export const WHEAT_SOURCE_REGISTRY: readonly WheatPressureSourceRegistryEntry[] = [
  {
    sourceId: "cgc_observations",
    label: "CGC weekly grain stats",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["demand"],
    factorIds: ["wheat-export-demand"],
    boundary: "Physical Canadian movement source; it proves flow, not buyer motive.",
  },
  {
    sourceId: "cgc_imports",
    label: "CGC import proof",
    sourceClass: "official_thesis_input",
    scoreRole: "proof_only",
    domains: ["demand"],
    factorIds: ["wheat-export-demand"],
    boundary: "Collector proof supports freshness; the observation rows carry the market fact.",
  },
  {
    sourceId: "supply_disposition",
    label: "Canada supply-disposition table",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["supply"],
    factorIds: ["wheat-canada-supply-baseline"],
    boundary: "Slower balance-sheet context anchors supply pressure but should not override fresher weekly flow.",
  },
  {
    sourceId: "canada_crop_progress",
    label: "Prairie crop-progress reports",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["supply", "weather"],
    factorIds: ["wheat-ca-us-supply", "wheat-saskatchewan-spring-cereal-development", "wheat-prairie-cropland-moisture"],
    boundary: "Admitted public Wheat proxy only; it does not unlock class-specific Wheat scoring.",
  },
  {
    sourceId: "usda_crop_progress",
    label: "USDA Crop Progress",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["supply", "weather"],
    factorIds: ["wheat-ca-us-supply"],
    boundary: "US crop-condition and planting evidence must stay seasonally weighted.",
  },
  {
    sourceId: "usda_export_sales",
    label: "USDA Export Sales",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["demand"],
    factorIds: ["wheat-export-demand"],
    boundary: "Official demand pace; tender-level origin detail is still parked.",
  },
  {
    sourceId: "usda_wasde_mapped",
    label: "USDA WASDE mapped balance",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["supply", "demand"],
    factorIds: ["wheat-ca-us-supply", "wheat-export-demand"],
    boundary: "Monthly supply-demand reset; do not treat it as a weekly flow source.",
  },
  {
    sourceId: "usda_quarterly_stocks",
    label: "USDA Quarterly Grain Stocks",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["supply"],
    factorIds: ["wheat-ca-us-supply"],
    boundary: "Quarterly inventory surprise confirms or challenges WASDE supply context.",
  },
  {
    sourceId: "grain_monitor_snapshots",
    label: "Canada Grain Monitor",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["logistics"],
    factorIds: ["wheat-logistics"],
    boundary: "Lagged Canadian logistics context; use it to explain corridor friction or clearance.",
  },
  {
    sourceId: "producer_car_allocations",
    label: "CGC Producer Cars",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["logistics"],
    factorIds: ["wheat-logistics"],
    boundary: "Forward-looking producer-car demand and allocation context, not a full rail-service read.",
  },
  {
    sourceId: "cftc_cot_positions",
    label: "CFTC Commitments of Traders",
    sourceClass: "official_thesis_input",
    scoreRole: "score_input",
    domains: ["positioning"],
    factorIds: ["wheat-positioning"],
    boundary: "Positioning confirms or challenges fundamentals; it does not replace supply and demand evidence.",
  },
  {
    sourceId: "grain_prices",
    label: "Daily futures price feed",
    sourceClass: "price_context",
    scoreRole: "bounded_context",
    domains: ["price"],
    factorIds: ["wheat-feed-substitution"],
    boundary: "Price can confirm or reject a source-backed read; stale proof blocks the contribution.",
  },
  {
    sourceId: "fx_rates",
    label: "USD/CAD FX rates",
    sourceClass: "price_context",
    scoreRole: "bounded_context",
    domains: ["price"],
    factorIds: ["wheat-feed-substitution"],
    boundary: "Currency translation is context for Canadian value, not a standalone Wheat fact.",
  },
  {
    sourceId: "grain_price_intraday",
    label: "Intraday grain-price quotes",
    sourceClass: "price_context",
    scoreRole: "bounded_context",
    domains: ["price"],
    factorIds: ["wheat-feed-substitution"],
    boundary: "Intraday quotes are inspection context until admitted into the score packet with freshness proof.",
  },
  {
    sourceId: "usda_wasde_raw",
    label: "Raw WASDE/PSD world balance",
    sourceClass: "watch_only",
    scoreRole: "watch_only",
    domains: ["supply"],
    factorIds: ["wheat-global-origin-competition"],
    boundary: "Broad world-balance context only; origin-specific tender, freight, and policy feeds are not admitted.",
  },
  {
    sourceId: "x_scout_runs",
    label: "X Pulse scout proof",
    sourceClass: "watch_only",
    scoreRole: "watch_only",
    domains: ["demand"],
    factorIds: ["wheat-x-pulse-watch"],
    boundary: "Scout proof is watch-only and cannot write or rank thesis facts.",
  },
  {
    sourceId: "x_market_signals",
    label: "X Pulse accepted signals",
    sourceClass: "watch_only",
    scoreRole: "watch_only",
    domains: ["demand"],
    factorIds: ["wheat-x-pulse-watch"],
    boundary: "Accepted X posts remain inspection leads until official-source or desk corroboration exists.",
  },
];

const DEFAULT_DRIVER_FACTOR: DriverFactor = {
  id: "wheat-unmapped-review-lead",
  sourceClass: "watch_only",
  domain: "demand",
  label: "Unmapped Wheat review lead",
  boundary: "This driver is visible for inspection only until the source is mapped to an admitted Wheat factor.",
};

function countryNodeFromItem(country: ThesisCountryCode, item: ThesisBoardItem): WheatPressureCountryNode {
  return {
    id: `wheat-${country.toLowerCase()}`,
    country,
    label: country === "CA" ? "Canada Wheat" : "US Wheat",
    score: item.stanceScore,
    stanceLabel: item.stanceLabel,
    confidenceScore: item.confidenceScore,
    scoreSource: item.scoreSource?.kind ?? "weekly_packet",
    scoreSourceDate: item.scoreSource?.recordedAt ?? null,
  };
}

function splitSourceIds(sourceName: string): string[] {
  return sourceName.split("+").map((part) => part.trim()).filter(Boolean);
}

function scoreRoleForSourceClass(sourceClass: ImpactSourceClass): WheatPressureScoreRole {
  if (sourceClass === "official_thesis_input") return "score_input";
  if (sourceClass === "price_context") return "bounded_context";
  return "watch_only";
}

function includedInPressure(scoreRole: WheatPressureScoreRole): boolean {
  return scoreRole === "score_input" || scoreRole === "bounded_context";
}

function factorForDriver(point: ThesisComparisonPoint, factors: readonly GrainImpactFactor[]): DriverFactor {
  const sourceIds = splitSourceIds(point.sourceName);
  return (
    factors.find((factor) => sourceIds.some((sourceId) => factor.sourceIds.includes(sourceId))) ??
    DEFAULT_DRIVER_FACTOR
  );
}

function driverNodeFromPoint(
  point: ThesisComparisonPoint,
  index: number,
  factors: readonly GrainImpactFactor[],
): WheatPressureDriverNode {
  const factor = factorForDriver(point, factors);
  return {
    id: `wheat-driver-${point.country.toLowerCase()}-${point.tone}-${index}`,
    country: point.country,
    tone: point.tone,
    title: point.title,
    body: point.body,
    sourceName: point.sourceName,
    sourceClass: factor.sourceClass,
    domain: factor.domain,
    metricLabel: point.metricLabel,
    confidence: point.confidence,
    factorId: factor.id,
    factorLabel: factor.label,
    boundary: factor.boundary,
  };
}

function driverPointFromDriver(
  driver: ThesisDriver,
  country: ThesisCountryCode,
  tone: ThesisDriverTone,
): ThesisComparisonPoint {
  return {
    country,
    tone,
    title: driver.title,
    body: driver.body,
    sourceName: driver.sourceName,
    confidence: driver.confidence,
    metricLabel: driver.metricLabel,
  };
}

function itemDriverPoints(item: ThesisBoardItem | null, country: ThesisCountryCode): ThesisComparisonPoint[] {
  if (!item) return [];
  return [
    ...item.bullDrivers.map((driver) => driverPointFromDriver(driver, country, "bull")),
    ...item.bearDrivers.map((driver) => driverPointFromDriver(driver, country, "bear")),
  ];
}

function driverPointsForRow(row: ThesisComparisonRow): ThesisComparisonPoint[] {
  const itemPoints = [
    ...itemDriverPoints(row.canada, "CA"),
    ...itemDriverPoints(row.us, "US"),
  ];
  const points = itemPoints.length > 0 ? itemPoints : [...row.strongestBullPoints, ...row.strongestBearPoints];
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.country}|${point.tone}|${point.sourceName}|${point.title}|${point.metricLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function packetContributionsForItem(
  item: ThesisBoardItem | null,
  country: ThesisCountryCode,
): WheatPressurePacketContribution[] {
  if (!item || !Array.isArray(item.ratingScorecard?.domains)) return [];

  return item.ratingScorecard.domains
    .filter((domain) => domain.sources.length > 0)
    .map((domain) => {
      const sourceIds = [...domain.sources];
      const contributionIncluded = sourceIds.some((sourceId) => {
        const source = WHEAT_SOURCE_REGISTRY.find((entry) => entry.sourceId === sourceId);
        return source ? includedInPressure(source.scoreRole) : false;
      });
      const evidence = [
        ...domain.positive_evidence.map((claim) => `Bull: ${claim}`),
        ...domain.negative_evidence.map((claim) => `Bear: ${claim}`),
      ];

      return {
        id: `wheat-contribution-${country.toLowerCase()}-${domain.domain}-${sourceIds.join("-")}`,
        country,
        domain: domain.domain,
        score: domain.score,
        weight: domain.weight,
        weightedScore: domain.weighted_score,
        confidence: domain.confidence,
        freshnessStatus: domain.freshness_status,
        sourceIds,
        metrics: domain.metrics ?? [],
        evidence,
        blockedClaims: [...domain.blocked_claims],
        periodAnchor: item.ratingScorecard.period_anchor,
        scoreSource: item.scoreSource?.kind ?? "weekly_packet",
        includedInPressure: contributionIncluded,
      } satisfies WheatPressurePacketContribution;
    });
}

function packetContributionsForRow(row: ThesisComparisonRow): WheatPressurePacketContribution[] {
  return [
    ...packetContributionsForItem(row.canada, "CA"),
    ...packetContributionsForItem(row.us, "US"),
  ];
}

function roundContribution(value: number): number {
  return Math.round(value * 100) / 100;
}

function contributionTotal(contributions: readonly WheatPressurePacketContribution[]): number {
  return roundContribution(contributions.reduce((sum, contribution) => sum + contribution.weightedScore, 0));
}

function contributionMatchesSource(
  entry: WheatPressureSourceRegistryEntry,
  contribution: WheatPressurePacketContribution,
): boolean {
  return entry.domains.includes(contribution.domain) && contribution.sourceIds.includes(entry.sourceId);
}

function contributionMatchesFactor(
  factor: GrainImpactFactor,
  contribution: WheatPressurePacketContribution,
): boolean {
  return (
    contribution.domain === factor.domain &&
    contribution.sourceIds.some((sourceId) => factor.sourceIds.includes(sourceId))
  );
}

function aggregateScore(nodes: readonly WheatPressureCountryNode[]): number {
  if (nodes.length === 0) return 0;
  const weightSum = nodes.reduce((sum, node) => sum + Math.max(1, node.confidenceScore), 0);
  return Math.round(
    nodes.reduce((sum, node) => sum + node.score * Math.max(1, node.confidenceScore), 0) / weightSum,
  );
}

function aggregateConfidence(nodes: readonly WheatPressureCountryNode[]): number {
  if (nodes.length === 0) return 0;
  return Math.round(nodes.reduce((sum, node) => sum + Math.max(1, node.confidenceScore), 0) / nodes.length);
}

function aggregateTone(row: ThesisComparisonRow, score: number): WheatPressureMapTone {
  if (row.status === "mixed") return "mixed";
  if (score > 0) return "bull";
  if (score < 0) return "bear";
  return "balanced";
}

function statusDetail(row: ThesisComparisonRow, nodes: readonly WheatPressureCountryNode[]): string {
  if (row.status === "mixed" && nodes.length === 2) {
    return `Country split: ${nodes[0].country} ${signedScore(nodes[0].score)} versus ${nodes[1].country} ${signedScore(nodes[1].score)}.`;
  }
  if (nodes.length === 1) {
    return `${nodes[0].country} only: use this as one-country Wheat context.`;
  }
  return row.explanation;
}

function signedScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function allFreshnessRows(row: ThesisComparisonRow): ThesisFreshnessRow[] {
  return [...(row.canada?.freshness ?? []), ...(row.us?.freshness ?? [])];
}

function freshnessRank(status: string): number {
  const normalized = status.toLowerCase();
  if (normalized === "strong") return 4;
  if (normalized.includes("stale") || normalized.includes("lagged") || normalized.includes("usable")) return 3;
  if (normalized === "empty" || normalized === "broken" || normalized === "failed") return 1;
  return 2;
}

function newestDate(left: string | null, right: string | null): number {
  return String(right ?? "").localeCompare(String(left ?? ""));
}

function freshnessForSource(
  sourceId: string,
  rows: readonly ThesisFreshnessRow[],
): ThesisFreshnessRow | null {
  const matches = rows.filter((row) => row.sourceName === sourceId);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => {
    const rankDelta = freshnessRank(b.freshnessStatus) - freshnessRank(a.freshnessStatus);
    if (rankDelta !== 0) return rankDelta;
    return newestDate(a.latestPeriodEnd, b.latestPeriodEnd);
  })[0];
}

function latestRunForSource(sourceId: string, runs: readonly SourceRunSummary[]): SourceRunSummary | null {
  const matches = runs.filter((run) => run.sourceName === sourceId);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => newestDate(a.finishedAt, b.finishedAt))[0];
}

function wheatSignalCount(signals: readonly XPulseSignalSummary[]): number {
  return signals.filter((signal) => {
    const names = [
      signal.grain,
      signal.primaryImpactGrain ?? "",
      ...signal.affectedGrains,
    ].map((name) => name.toLowerCase());
    return names.includes("wheat");
  }).length;
}

function isXPulseSource(sourceId: string): boolean {
  return sourceId === "x_scout_runs" || sourceId === "x_market_signals";
}

function readinessLabel(readiness: WheatPressureSourceReadiness): string {
  const labels: Record<WheatPressureSourceReadiness, string> = {
    active_driver: "Active driver",
    available: "Available",
    lagged: "Lagged",
    missing: "Missing",
    watch_only: "Watch-only",
  };
  return labels[readiness];
}

function sourceReadiness(
  entry: WheatPressureSourceRegistryEntry,
  activeCount: number,
  freshness: ThesisFreshnessRow | null,
  sourceRun: SourceRunSummary | null,
  context: WheatPressureMapBuildContext,
): WheatPressureSourceReadiness {
  if (activeCount > 0) return "active_driver";

  if (isXPulseSource(entry.sourceId)) {
    return context.xPulseWatch?.latestRun ? "watch_only" : "missing";
  }

  if (freshness) {
    return freshness.freshnessStatus.toLowerCase() === "strong" ? "available" : "lagged";
  }

  if (sourceRun) {
    return sourceRun.status === "success" ? "available" : "lagged";
  }

  if (entry.sourceClass === "watch_only") return "missing";
  return "missing";
}

function sourceDetail(
  entry: WheatPressureSourceRegistryEntry,
  activeCount: number,
  freshness: ThesisFreshnessRow | null,
  sourceRun: SourceRunSummary | null,
  context: WheatPressureMapBuildContext,
): string {
  if (isXPulseSource(entry.sourceId)) {
    const latest = context.xPulseWatch?.latestRun ?? null;
    const wheatAccepted = wheatSignalCount(context.xPulseWatch?.topSignals ?? []);
    if (!latest) return "No current X Pulse proof is attached to this graph.";
    return `Latest scout ${latest.status}; accepted ${latest.acceptedSignalCount}, rejected ${latest.rejectedSignalCount}; Wheat watch leads ${wheatAccepted}.`;
  }

  if (activeCount > 0) {
    return `${activeCount} active Wheat driver${activeCount === 1 ? "" : "s"} in the current row.`;
  }

  if (freshness) {
    const period = freshness.latestPeriodEnd ?? freshness.latestPeriod ?? "latest period unknown";
    return `Packet freshness ${freshness.freshnessStatus}; latest ${period}.`;
  }

  if (sourceRun) {
    const finished = sourceRun.finishedAt ?? "finish time missing";
    return `Latest collector ${sourceRun.status}; finished ${finished}.`;
  }

  return "No current packet or source-run proof is attached to this view.";
}

function buildSourceNodes(
  row: ThesisComparisonRow,
  driverNodes: readonly WheatPressureDriverNode[],
  profileFactors: readonly GrainImpactFactor[],
  packetContributions: readonly WheatPressurePacketContribution[],
  context: WheatPressureMapBuildContext,
): WheatPressureSourceNode[] {
  const freshnessRows = allFreshnessRows(row);
  const activeBySource = new Map<string, number>();
  for (const driver of driverNodes) {
    for (const sourceId of splitSourceIds(driver.sourceName)) {
      activeBySource.set(sourceId, (activeBySource.get(sourceId) ?? 0) + 1);
    }
  }

  return WHEAT_SOURCE_REGISTRY.map((entry) => {
    const activeDriverCount = activeBySource.get(entry.sourceId) ?? 0;
    const freshness = freshnessForSource(entry.sourceId, freshnessRows);
    const sourceRun = latestRunForSource(entry.sourceId, context.sourceRuns ?? []);
    const factors = profileFactors.filter((factor) => entry.factorIds.includes(factor.id));
    const readiness = sourceReadiness(entry, activeDriverCount, freshness, sourceRun, context);
    const sourceContributions = packetContributions.filter((contribution) =>
      contributionMatchesSource(entry, contribution),
    );

    return {
      id: `wheat-source-${entry.sourceId.replaceAll(/[^a-z0-9]+/g, "-")}`,
      sourceId: entry.sourceId,
      label: entry.label,
      sourceClass: entry.sourceClass,
      scoreRole: entry.scoreRole,
      readiness,
      readinessLabel: readinessLabel(readiness),
      domains: [...entry.domains],
      factorIds: [...entry.factorIds],
      factorLabels: factors.map((factor) => factor.label),
      activeDriverCount,
      packetContributions: sourceContributions,
      totalWeightedScore: contributionTotal(sourceContributions),
      includedInPressure: includedInPressure(entry.scoreRole),
      freshnessStatus: freshness?.freshnessStatus ?? null,
      latestPeriodEnd: freshness?.latestPeriodEnd ?? null,
      latestRunStatus: sourceRun?.status ?? null,
      latestRunFinishedAt: sourceRun?.finishedAt ?? null,
      detail: sourceDetail(entry, activeDriverCount, freshness, sourceRun, context),
      boundary: entry.boundary,
    };
  });
}

function factorReadiness(
  factor: GrainImpactFactor,
  activeDriverCount: number,
  sourceNodes: readonly WheatPressureSourceNode[],
): WheatPressureSourceReadiness {
  if (activeDriverCount > 0) return "active_driver";
  const linkedSources = sourceNodes.filter((source) => factor.sourceIds.includes(source.sourceId));
  if (factor.sourceClass === "watch_only") {
    return linkedSources.some((source) => source.readiness !== "missing") ? "watch_only" : "missing";
  }
  if (linkedSources.some((source) => source.readiness === "available" || source.readiness === "watch_only")) {
    return "available";
  }
  if (linkedSources.some((source) => source.readiness === "lagged")) return "lagged";
  return "missing";
}

function buildFactorNodes(
  factors: readonly GrainImpactFactor[],
  driverNodes: readonly WheatPressureDriverNode[],
  sourceNodes: readonly WheatPressureSourceNode[],
  packetContributions: readonly WheatPressurePacketContribution[],
): WheatPressureFactorNode[] {
  return factors.map((factor) => {
    const activeDriverCount = driverNodes.filter((driver) => driver.factorId === factor.id).length;
    const readiness = factorReadiness(factor, activeDriverCount, sourceNodes);
    const scoreRole = scoreRoleForSourceClass(factor.sourceClass);
    const activeSourceCount = sourceNodes.filter(
      (source) => factor.sourceIds.includes(source.sourceId) && source.readiness !== "missing",
    ).length;
    const factorContributions = packetContributions.filter((contribution) =>
      contributionMatchesFactor(factor, contribution),
    );

    return {
      id: `wheat-factor-${factor.id}`,
      factorId: factor.id,
      label: factor.label,
      domain: factor.domain,
      scope: factor.scope,
      sourceClass: factor.sourceClass,
      sourceIds: [...factor.sourceIds],
      scoreRole,
      readiness,
      readinessLabel: readinessLabel(readiness),
      activeDriverCount,
      activeSourceCount,
      packetContributions: factorContributions,
      totalWeightedScore: contributionTotal(factorContributions),
      includedInPressure: includedInPressure(scoreRole),
      boundary: factor.boundary,
    };
  });
}

function edgeLabel(scoreRole: WheatPressureScoreRole): string {
  const labels: Record<WheatPressureScoreRole, string> = {
    score_input: "score input",
    bounded_context: "bounded context",
    watch_only: "watch only",
    proof_only: "proof only",
  };
  return labels[scoreRole];
}

function buildGraphEdges(
  sourceNodes: readonly WheatPressureSourceNode[],
  factorNodes: readonly WheatPressureFactorNode[],
  countryNodes: readonly WheatPressureCountryNode[],
  relationships: readonly WheatPressureRelationshipNode[],
): WheatPressureGraphEdge[] {
  const edges: WheatPressureGraphEdge[] = [];
  for (const source of sourceNodes) {
    for (const factorId of source.factorIds) {
      const factor = factorNodes.find((candidate) => candidate.factorId === factorId);
      if (!factor) continue;
      edges.push({
        id: `${source.id}-to-${factor.id}`,
        kind: "source_to_factor",
        from: source.id,
        to: factor.id,
        fromLabel: source.label,
        toLabel: factor.label,
        label: edgeLabel(source.scoreRole),
        sourceClass: source.sourceClass,
        scoreRole: source.scoreRole,
        includedInPressure: source.includedInPressure,
      });
    }
  }

  for (const factor of factorNodes) {
    edges.push({
      id: `${factor.id}-to-wheat-final`,
      kind: "factor_to_score",
      from: factor.id,
      to: "wheat-final",
      fromLabel: factor.label,
      toLabel: "Wheat Bull/Bear pressure",
      label: edgeLabel(factor.scoreRole),
      sourceClass: factor.sourceClass,
      scoreRole: factor.scoreRole,
      includedInPressure: factor.includedInPressure,
    });
  }

  for (const country of countryNodes) {
    edges.push({
      id: `${country.id}-to-wheat-final`,
      kind: "country_to_score",
      from: country.id,
      to: "wheat-final",
      fromLabel: country.label,
      toLabel: "Wheat Bull/Bear pressure",
      label: "country score",
      sourceClass: "official_thesis_input",
      scoreRole: "score_input",
      includedInPressure: true,
    });
  }

  for (const relationship of relationships) {
    const scoreRole = scoreRoleForSourceClass(relationship.sourceClass);
    edges.push({
      id: `${relationship.id}-to-wheat-final`,
      kind: "relationship",
      from: relationship.id,
      to: "wheat-final",
      fromLabel: relationship.target,
      toLabel: "Wheat Bull/Bear pressure",
      label: relationship.kind.replaceAll("_", " "),
      sourceClass: relationship.sourceClass,
      scoreRole,
      includedInPressure: includedInPressure(scoreRole),
    });
  }

  return edges;
}

function buildGraphCoverage(
  sourceNodes: readonly WheatPressureSourceNode[],
  factorNodes: readonly WheatPressureFactorNode[],
  graphEdges: readonly WheatPressureGraphEdge[],
  parkedGaps: readonly string[],
  driverNodes: readonly WheatPressureDriverNode[],
  packetContributions: readonly WheatPressurePacketContribution[],
  context: WheatPressureMapBuildContext,
): WheatPressureGraphCoverage {
  return {
    knownSourceCount: sourceNodes.length,
    sourceBackedCount: sourceNodes.filter((source) => source.readiness !== "missing").length,
    activeDriverSourceCount: sourceNodes.filter((source) => source.activeDriverCount > 0).length,
    scoringSourceCount: sourceNodes.filter((source) => source.scoreRole === "score_input").length,
    boundedContextSourceCount: sourceNodes.filter((source) => source.scoreRole === "bounded_context").length,
    watchOnlySourceCount: sourceNodes.filter((source) => source.scoreRole === "watch_only").length,
    proofOnlySourceCount: sourceNodes.filter((source) => source.scoreRole === "proof_only").length,
    missingSourceCount: sourceNodes.filter((source) => source.readiness === "missing").length,
    factorCount: factorNodes.length,
    activeFactorCount: factorNodes.filter((factor) => factor.readiness !== "missing").length,
    edgeCount: graphEdges.length,
    scoredEdgeCount: graphEdges.filter((edge) => edge.includedInPressure).length,
    watchOnlyEdgeCount: graphEdges.filter((edge) => edge.scoreRole === "watch_only").length,
    parkedGapCount: parkedGaps.length,
    activeDriverCount: driverNodes.length,
    packetContributionCount: packetContributions.length,
    scoredPacketContributionCount: packetContributions.filter((contribution) => contribution.includedInPressure).length,
    xPulseAcceptedWheatCount: wheatSignalCount(context.xPulseWatch?.topSignals ?? []),
  };
}

export function buildWheatPressureMapModel(
  row: ThesisComparisonRow,
  context: WheatPressureMapBuildContext = {},
): WheatPressureMapModel | null {
  if (row.grain !== "Wheat") return null;

  const profile = getGrainImpactProfile("Wheat");
  if (!profile) return null;

  const countryNodes = [
    row.canada ? countryNodeFromItem("CA", row.canada) : null,
    row.us ? countryNodeFromItem("US", row.us) : null,
  ].filter((node): node is WheatPressureCountryNode => node !== null);
  const score = aggregateScore(countryNodes);
  const confidence = aggregateConfidence(countryNodes);

  const driverPoints = driverPointsForRow(row);
  const driverNodes = driverPoints.map((point, index) => driverNodeFromPoint(point, index, profile.impactFactors));
  const packetContributions = packetContributionsForRow(row);
  const relationships = profile.relationships.map((relationship) => ({
    id: `wheat-relationship-${relationship.target.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    target: relationship.target,
    kind: relationship.kind,
    sourceClass: relationship.sourceClass,
    note: relationship.note,
  }));
  const sourceNodes = buildSourceNodes(row, driverNodes, profile.impactFactors, packetContributions, context);
  const factorNodes = buildFactorNodes(profile.impactFactors, driverNodes, sourceNodes, packetContributions);
  const graphEdges = buildGraphEdges(sourceNodes, factorNodes, countryNodes, relationships);

  return {
    grain: "Wheat",
    marketShape: profile.marketShape,
    marketStructure: profile.marketStructure,
    statusLabel: row.statusLabel,
    statusDetail: statusDetail(row, countryNodes),
    aggregateScore: score,
    aggregateConfidence: confidence,
    aggregateTone: aggregateTone(row, score),
    countryNodes,
    driverNodes,
    sourceNodes,
    factorNodes,
    graphEdges,
    graphCoverage: buildGraphCoverage(
      sourceNodes,
      factorNodes,
      graphEdges,
      profile.parkedGaps,
      driverNodes,
      packetContributions,
      context,
    ),
    relationships,
    responseRules: [...profile.marketResponses],
    parkedGaps: [...profile.parkedGaps],
  };
}
