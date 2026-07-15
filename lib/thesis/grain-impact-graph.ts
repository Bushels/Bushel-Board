import {
  getGrainImpactProfile,
  type GrainImpactFactor,
  type GrainImpactProfile,
  type GrainImpactRelationship,
  type GrainMarketResponseRule,
  type GrainMarketShape,
  type ImpactScope,
  type ImpactSourceClass,
} from "@/lib/thesis/grain-impact-map";
import type { RatingDomainId } from "@/lib/thesis/rating-model";

export type GrainImpactGraphNodeKind =
  | "grain"
  | "domain"
  | "factor"
  | "source"
  | "relationship"
  | "response_rule"
  | "parked_gap";

export type GrainImpactGraphEdgeKind =
  | "source_to_factor"
  | "factor_to_domain"
  | "domain_to_grain"
  | "relationship_to_grain"
  | "response_rule_to_grain"
  | "parked_gap_to_grain";

export type GrainImpactGraphScoreRole =
  | "score_input"
  | "bounded_context"
  | "watch_only"
  | "parked_gap";

export interface GrainImpactGraphNode {
  id: string;
  kind: GrainImpactGraphNodeKind;
  label: string;
  detail: string;
  layer: number;
  rank: number;
  sourceClass?: ImpactSourceClass;
  scoreRole: GrainImpactGraphScoreRole;
  domain?: RatingDomainId;
  scope?: ImpactScope;
}

export interface GrainImpactGraphEdge {
  id: string;
  kind: GrainImpactGraphEdgeKind;
  from: string;
  to: string;
  label: string;
  rank: number;
  sourceClass?: ImpactSourceClass;
  scoreRole: GrainImpactGraphScoreRole;
}

export interface GrainImpactGraphCoverage {
  nodeCount: number;
  edgeCount: number;
  factorCount: number;
  sourceCount: number;
  scoreInputFactorCount: number;
  boundedContextFactorCount: number;
  watchOnlyFactorCount: number;
  parkedGapCount: number;
  strongestFactorIds: string[];
}

export interface GrainImpactGraphModel {
  grain: string;
  marketShape: GrainMarketShape;
  marketStructure: string;
  nodes: GrainImpactGraphNode[];
  edges: GrainImpactGraphEdge[];
  coverage: GrainImpactGraphCoverage;
}

export type GrainRelationshipOverviewNodeKind = "grain" | "external_anchor";

export interface GrainRelationshipOverviewNode {
  id: string;
  kind: GrainRelationshipOverviewNodeKind;
  label: string;
  detail: string;
  rank: number;
  scoreRole: GrainImpactGraphScoreRole;
  marketShape?: GrainMarketShape;
  incomingCount: number;
  outgoingCount: number;
}

export interface GrainRelationshipOverviewEdge {
  id: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  kind: GrainImpactRelationship["kind"];
  label: string;
  note: string;
  rank: number;
  sourceClass: ImpactSourceClass;
  scoreRole: GrainImpactGraphScoreRole;
  targetInPublicScope: boolean;
}

export interface GrainRelationshipOverviewCoverage {
  grainCount: number;
  externalAnchorCount: number;
  relationshipCount: number;
  crossGrainRelationshipCount: number;
  externalAnchorRelationshipCount: number;
  priceContextCount: number;
  watchOnlyCount: number;
  parkedCount: number;
  strongestHubIds: string[];
}

export interface GrainRelationshipOverviewModel {
  nodes: GrainRelationshipOverviewNode[];
  edges: GrainRelationshipOverviewEdge[];
  coverage: GrainRelationshipOverviewCoverage;
}

export interface GrainRelationshipRankLink {
  grain: string;
  kind: GrainImpactRelationship["kind"];
  rank: number;
  scoreRole: GrainImpactGraphScoreRole;
  note: string;
}

export interface GrainRelationshipRankRow {
  grain: string;
  currentReadScore: number | null;
  currentReadConfidence: number | null;
  outboundRank: number;
  inboundRank: number;
  netRank: number;
  outboundCount: number;
  inboundCount: number;
  externalWatchCount: number;
  strongestOutbound: GrainRelationshipRankLink | null;
  strongestInbound: GrainRelationshipRankLink | null;
}

export interface GrainImpactGraphBoardRead {
  grain: string;
  statusLabel: string;
  score: number | null;
  confidence: number | null;
  canadaScore: number | null;
  canadaConfidence: number | null;
  usScore: number | null;
  usConfidence: number | null;
  scoreSource: "weekly_packet" | "published_thesis" | "daily_overlay" | "mixed" | "none";
}

const DOMAIN_LABELS: Record<RatingDomainId, string> = {
  supply: "Supply",
  demand: "Demand",
  movement: "Movement",
  logistics: "Logistics",
  price: "Price",
  positioning: "Positioning",
  weather: "Weather",
  farmer_local: "Farmer local",
};

function graphId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function scoreRoleForSourceClass(sourceClass: ImpactSourceClass): GrainImpactGraphScoreRole {
  if (sourceClass === "official_thesis_input") return "score_input";
  if (sourceClass === "price_context") return "bounded_context";
  if (sourceClass === "bounded_context") return "bounded_context";
  if (sourceClass === "watch_only") return "watch_only";
  return "parked_gap";
}

function scoreRoleWeight(scoreRole: GrainImpactGraphScoreRole): number {
  if (scoreRole === "score_input") return 4;
  if (scoreRole === "bounded_context") return 3;
  if (scoreRole === "watch_only") return 2;
  return 1;
}

function strongerScoreRole(
  current: GrainImpactGraphScoreRole,
  candidate: GrainImpactGraphScoreRole,
): GrainImpactGraphScoreRole {
  return scoreRoleWeight(candidate) > scoreRoleWeight(current) ? candidate : current;
}

export function sourceAuthorityWeight(sourceClass: ImpactSourceClass): number {
  if (sourceClass === "official_thesis_input") return 1;
  if (sourceClass === "price_context") return 0.7;
  if (sourceClass === "bounded_context") return 0.7;
  if (sourceClass === "watch_only") return 0.35;
  return 0.12;
}

export function scopeRelevanceWeight(marketShape: GrainMarketShape, scope: ImpactScope): number {
  if (marketShape === "canada_first") {
    if (scope === "canada") return 1;
    if (scope === "cross_border") return 0.85;
    if (scope === "world") return 0.65;
    return 0.45;
  }

  if (marketShape === "us_led") {
    if (scope === "us") return 1;
    if (scope === "world" || scope === "cross_border") return 0.85;
    if (scope === "canada") return 0.45;
    return 0.35;
  }

  if (marketShape === "global_benchmark") {
    if (scope === "world" || scope === "cross_border") return 1;
    if (scope === "canada" || scope === "us") return 0.82;
    return 0.5;
  }

  if (marketShape === "specialty") {
    if (scope === "canada") return 1;
    if (scope === "world") return 0.7;
    if (scope === "cross_border") return 0.6;
    return 0.35;
  }

  if (scope === "cross_border" || scope === "canada" || scope === "us") return 0.85;
  if (scope === "world") return 0.65;
  return 0.35;
}

function visualRankForFactor(profile: GrainImpactProfile, factor: GrainImpactFactor): number {
  return Math.round(
    100 * sourceAuthorityWeight(factor.sourceClass) * scopeRelevanceWeight(profile.marketShape, factor.scope),
  );
}

function addNode(nodes: Map<string, GrainImpactGraphNode>, node: GrainImpactGraphNode) {
  const existing = nodes.get(node.id);
  if (!existing || node.rank > existing.rank) {
    nodes.set(node.id, node);
  }
}

function sourceNode(sourceId: string, sourceClass: ImpactSourceClass, rank: number): GrainImpactGraphNode {
  return {
    id: graphId("source", sourceId),
    kind: "source",
    label: sourceId.replaceAll("_", " "),
    detail: `Source lane: ${sourceId}.`,
    layer: 0,
    rank,
    sourceClass,
    scoreRole: scoreRoleForSourceClass(sourceClass),
  };
}

function factorNode(factor: GrainImpactFactor, rank: number): GrainImpactGraphNode {
  return {
    id: graphId("factor", factor.id),
    kind: "factor",
    label: factor.label,
    detail: factor.boundary,
    layer: 1,
    rank,
    sourceClass: factor.sourceClass,
    scoreRole: scoreRoleForSourceClass(factor.sourceClass),
    domain: factor.domain,
    scope: factor.scope,
  };
}

function domainNode(domain: RatingDomainId, rank: number): GrainImpactGraphNode {
  return {
    id: graphId("domain", domain),
    kind: "domain",
    label: DOMAIN_LABELS[domain],
    detail: `${DOMAIN_LABELS[domain]} pressure domain.`,
    layer: 2,
    rank,
    scoreRole: "score_input",
    domain,
  };
}

function relationshipNode(relationship: GrainImpactRelationship, rank: number): GrainImpactGraphNode {
  return {
    id: graphId("relationship", relationship.target),
    kind: "relationship",
    label: relationship.target,
    detail: relationship.note,
    layer: 0,
    rank,
    sourceClass: relationship.sourceClass,
    scoreRole: scoreRoleForSourceClass(relationship.sourceClass),
  };
}

function responseRuleNode(response: GrainMarketResponseRule, rank: number): GrainImpactGraphNode {
  return {
    id: graphId("response", response.id),
    kind: "response_rule",
    label: response.label,
    detail: response.marketResponse,
    layer: 0,
    rank,
    scoreRole: "watch_only",
  };
}

function overviewNodeId(kind: GrainRelationshipOverviewNodeKind, label: string): string {
  return graphId("overview", kind, label);
}

function addOverviewNode(
  nodes: Map<string, GrainRelationshipOverviewNode>,
  node: GrainRelationshipOverviewNode,
): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }

  nodes.set(node.id, {
    ...existing,
    detail: existing.detail || node.detail,
    rank: Math.max(existing.rank, node.rank),
    scoreRole: strongerScoreRole(existing.scoreRole, node.scoreRole),
    incomingCount: existing.incomingCount + node.incomingCount,
    outgoingCount: existing.outgoingCount + node.outgoingCount,
  });
}

export const PUBLIC_SCOPE_RANK_MULTIPLIER = 90;
export const EXTERNAL_SCOPE_RANK_MULTIPLIER = 72;

function relationshipRank(relationship: GrainImpactRelationship, targetInPublicScope: boolean): number {
  const publicScopeMultiplier = targetInPublicScope ? PUBLIC_SCOPE_RANK_MULTIPLIER : EXTERNAL_SCOPE_RANK_MULTIPLIER;
  return Math.round(sourceAuthorityWeight(relationship.sourceClass) * publicScopeMultiplier);
}

function relationshipLabel(kind: GrainImpactRelationship["kind"]): string {
  return kind.replaceAll("_", " ");
}

export function buildGrainRelationshipOverview(grains: readonly string[]): GrainRelationshipOverviewModel {
  const profiles = Array.from(new Set(grains))
    .map((grain) => getGrainImpactProfile(grain))
    .filter((profile): profile is GrainImpactProfile => profile !== null);
  const nodes = new Map<string, GrainRelationshipOverviewNode>();
  const edges: GrainRelationshipOverviewEdge[] = [];

  for (const profile of profiles) {
    addOverviewNode(nodes, {
      id: overviewNodeId("grain", profile.grain),
      kind: "grain",
      label: profile.grain,
      detail: profile.marketStructure,
      rank: 100,
      scoreRole: "score_input",
      marketShape: profile.marketShape,
      incomingCount: 0,
      outgoingCount: profile.relationships.length,
    });
  }

  for (const profile of profiles) {
    const fromId = overviewNodeId("grain", profile.grain);

    for (const relationship of profile.relationships) {
      const targetProfile = getGrainImpactProfile(relationship.target);
      const targetInPublicScope = targetProfile !== null;
      const targetKind: GrainRelationshipOverviewNodeKind = targetInPublicScope ? "grain" : "external_anchor";
      const toId = overviewNodeId(targetKind, relationship.target);
      const rank = relationshipRank(relationship, targetInPublicScope);
      const scoreRole = scoreRoleForSourceClass(relationship.sourceClass);

      addOverviewNode(nodes, {
        id: toId,
        kind: targetKind,
        label: relationship.target,
        detail: targetProfile?.marketStructure ?? relationship.note,
        rank,
        scoreRole,
        marketShape: targetProfile?.marketShape,
        incomingCount: 1,
        outgoingCount: 0,
      });

      edges.push({
        id: graphId("overview-edge", profile.grain, relationship.kind, relationship.target),
        from: fromId,
        to: toId,
        fromLabel: profile.grain,
        toLabel: relationship.target,
        kind: relationship.kind,
        label: relationshipLabel(relationship.kind),
        note: relationship.note,
        rank,
        sourceClass: relationship.sourceClass,
        scoreRole,
        targetInPublicScope,
      });
    }
  }

  const nodeList = Array.from(nodes.values()).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "grain" ? -1 : 1;
    const leftHubScore = left.incomingCount + left.outgoingCount;
    const rightHubScore = right.incomingCount + right.outgoingCount;
    if (leftHubScore !== rightHubScore) return rightHubScore - leftHubScore;
    if (left.rank !== right.rank) return right.rank - left.rank;
    return left.label.localeCompare(right.label);
  });

  const grainNodes = nodeList.filter((node) => node.kind === "grain");
  const externalNodes = nodeList.filter((node) => node.kind === "external_anchor");

  return {
    nodes: nodeList,
    edges: edges.sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return `${left.fromLabel}-${left.toLabel}`.localeCompare(`${right.fromLabel}-${right.toLabel}`);
    }),
    coverage: {
      grainCount: grainNodes.length,
      externalAnchorCount: externalNodes.length,
      relationshipCount: edges.length,
      crossGrainRelationshipCount: edges.filter((edge) => edge.targetInPublicScope).length,
      externalAnchorRelationshipCount: edges.filter((edge) => !edge.targetInPublicScope).length,
      priceContextCount: edges.filter((edge) => edge.scoreRole === "bounded_context").length,
      watchOnlyCount: edges.filter((edge) => edge.scoreRole === "watch_only").length,
      parkedCount: edges.filter((edge) => edge.scoreRole === "parked_gap").length,
      strongestHubIds: grainNodes
        .slice()
        .sort((left, right) => {
          const leftHubScore = left.incomingCount + left.outgoingCount;
          const rightHubScore = right.incomingCount + right.outgoingCount;
          if (leftHubScore !== rightHubScore) return rightHubScore - leftHubScore;
          return right.rank - left.rank;
        })
        .slice(0, 4)
        .map((node) => node.id),
    },
  };
}

function rankLinkFromEdge(edge: GrainRelationshipOverviewEdge, direction: "outbound" | "inbound"): GrainRelationshipRankLink {
  return {
    grain: direction === "outbound" ? edge.toLabel : edge.fromLabel,
    kind: edge.kind,
    rank: edge.rank,
    scoreRole: edge.scoreRole,
    note: edge.note,
  };
}

function strongestLink(
  edges: GrainRelationshipOverviewEdge[],
  direction: "outbound" | "inbound",
): GrainRelationshipRankLink | null {
  const edge = edges
    .slice()
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return `${left.fromLabel}-${left.toLabel}`.localeCompare(`${right.fromLabel}-${right.toLabel}`);
    })[0];

  return edge ? rankLinkFromEdge(edge, direction) : null;
}

export function buildGrainRelationshipRankRows({
  overview,
  boardReads = [],
}: {
  overview: GrainRelationshipOverviewModel;
  boardReads?: readonly GrainImpactGraphBoardRead[];
}): GrainRelationshipRankRow[] {
  const readsByGrain = new Map(boardReads.map((read) => [read.grain, read]));

  return overview.nodes
    .filter((node) => node.kind === "grain")
    .map((node) => {
      const outboundEdges = overview.edges.filter((edge) => edge.from === node.id);
      const inboundEdges = overview.edges.filter((edge) => edge.to === node.id);
      const outboundRank = outboundEdges.reduce((sum, edge) => sum + edge.rank, 0);
      const inboundRank = inboundEdges.reduce((sum, edge) => sum + edge.rank, 0);
      const externalWatchCount = outboundEdges.filter(
        (edge) => !edge.targetInPublicScope && (edge.scoreRole === "watch_only" || edge.scoreRole === "parked_gap"),
      ).length;
      const read = readsByGrain.get(node.label);

      return {
        grain: node.label,
        currentReadScore: read?.score ?? null,
        currentReadConfidence: read?.confidence ?? null,
        outboundRank,
        inboundRank,
        netRank: outboundRank + inboundRank,
        outboundCount: outboundEdges.length,
        inboundCount: inboundEdges.length,
        externalWatchCount,
        strongestOutbound: strongestLink(outboundEdges, "outbound"),
        strongestInbound: strongestLink(inboundEdges, "inbound"),
      };
    })
    .sort((left, right) => {
      if (left.netRank !== right.netRank) return right.netRank - left.netRank;
      if (left.outboundRank !== right.outboundRank) return right.outboundRank - left.outboundRank;
      return left.grain.localeCompare(right.grain);
    });
}

export function buildGrainImpactGraph(grain: string): GrainImpactGraphModel | null {
  const profile = getGrainImpactProfile(grain);
  if (!profile) return null;

  const nodes = new Map<string, GrainImpactGraphNode>();
  const edges: GrainImpactGraphEdge[] = [];
  const grainNodeId = graphId("grain", profile.grain);

  addNode(nodes, {
    id: grainNodeId,
    kind: "grain",
    label: profile.grain,
    detail: profile.marketStructure,
    layer: 3,
    rank: 100,
    scoreRole: "score_input",
  });

  const domainRanks = new Map<RatingDomainId, number>();

  for (const factor of profile.impactFactors) {
    const rank = visualRankForFactor(profile, factor);
    const factorNodeId = graphId("factor", factor.id);
    const domainNodeId = graphId("domain", factor.domain);

    addNode(nodes, factorNode(factor, rank));
    domainRanks.set(factor.domain, Math.max(domainRanks.get(factor.domain) ?? 0, rank));

    edges.push({
      id: graphId("edge", factor.id, factor.domain),
      kind: "factor_to_domain",
      from: factorNodeId,
      to: domainNodeId,
      label: "feeds",
      rank,
      sourceClass: factor.sourceClass,
      scoreRole: scoreRoleForSourceClass(factor.sourceClass),
    });

    for (const sourceId of factor.sourceIds) {
      const sourceNodeId = graphId("source", sourceId);
      addNode(nodes, sourceNode(sourceId, factor.sourceClass, rank));
      edges.push({
        id: graphId("edge", sourceId, factor.id),
        kind: "source_to_factor",
        from: sourceNodeId,
        to: factorNodeId,
        label: factor.sourceClass.replaceAll("_", " "),
        rank,
        sourceClass: factor.sourceClass,
        scoreRole: scoreRoleForSourceClass(factor.sourceClass),
      });
    }
  }

  for (const [domain, rank] of domainRanks) {
    const domainNodeId = graphId("domain", domain);
    addNode(nodes, domainNode(domain, rank));
    edges.push({
      id: graphId("edge", domain, profile.grain),
      kind: "domain_to_grain",
      from: domainNodeId,
      to: grainNodeId,
      label: "ranks into",
      rank,
      scoreRole: "score_input",
    });
  }

  for (const relationship of profile.relationships) {
    const rank = Math.round(sourceAuthorityWeight(relationship.sourceClass) * 70);
    const relationshipNodeId = graphId("relationship", relationship.target);
    addNode(nodes, relationshipNode(relationship, rank));
    edges.push({
      id: graphId("edge", relationship.target, profile.grain),
      kind: "relationship_to_grain",
      from: relationshipNodeId,
      to: grainNodeId,
      label: relationship.kind.replaceAll("_", " "),
      rank,
      sourceClass: relationship.sourceClass,
      scoreRole: scoreRoleForSourceClass(relationship.sourceClass),
    });
  }

  for (const response of profile.marketResponses) {
    const rank = Math.max(...response.sourceClasses.map(sourceAuthorityWeight).map((weight) => Math.round(weight * 60)));
    const responseNodeId = graphId("response", response.id);
    addNode(nodes, responseRuleNode(response, rank));
    edges.push({
      id: graphId("edge", response.id, profile.grain),
      kind: "response_rule_to_grain",
      from: responseNodeId,
      to: grainNodeId,
      label: "explains",
      rank,
      scoreRole: "watch_only",
    });
  }

  for (const gap of profile.parkedGaps) {
    const gapNodeId = graphId("gap", gap);
    addNode(nodes, {
      id: gapNodeId,
      kind: "parked_gap",
      label: gap,
      detail: "Known gap; cannot move the public score until source admission is complete.",
      layer: 0,
      rank: 8,
      sourceClass: "parked",
      scoreRole: "parked_gap",
    });
    edges.push({
      id: graphId("edge", gap, profile.grain),
      kind: "parked_gap_to_grain",
      from: gapNodeId,
      to: grainNodeId,
      label: "blocked",
      rank: 8,
      sourceClass: "parked",
      scoreRole: "parked_gap",
    });
  }

  const nodeList = Array.from(nodes.values()).sort((left, right) => {
    if (left.layer !== right.layer) return left.layer - right.layer;
    if (left.rank !== right.rank) return right.rank - left.rank;
    return left.label.localeCompare(right.label);
  });

  const sourceCount = nodeList.filter((node) => node.kind === "source").length;
  const factors = nodeList.filter((node) => node.kind === "factor");

  return {
    grain: profile.grain,
    marketShape: profile.marketShape,
    marketStructure: profile.marketStructure,
    nodes: nodeList,
    edges,
    coverage: {
      nodeCount: nodeList.length,
      edgeCount: edges.length,
      factorCount: factors.length,
      sourceCount,
      scoreInputFactorCount: factors.filter((node) => node.scoreRole === "score_input").length,
      boundedContextFactorCount: factors.filter((node) => node.scoreRole === "bounded_context").length,
      watchOnlyFactorCount: factors.filter((node) => node.scoreRole === "watch_only").length,
      parkedGapCount: profile.parkedGaps.length,
      strongestFactorIds: factors
        .slice()
        .sort((left, right) => right.rank - left.rank)
        .slice(0, 5)
        .map((node) => node.id),
    },
  };
}

export function buildGrainImpactGraphs(grains: readonly string[]): GrainImpactGraphModel[] {
  return grains
    .map((grain) => buildGrainImpactGraph(grain))
    .filter((graph): graph is GrainImpactGraphModel => graph !== null);
}
