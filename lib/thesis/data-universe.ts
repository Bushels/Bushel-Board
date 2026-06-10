import {
  buildGrainImpactGraph,
  scoreRoleForSourceClass,
  type GrainImpactGraphModel,
  type GrainImpactGraphScoreRole,
} from "@/lib/thesis/grain-impact-graph";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

export type DataUniverseNodeKind = "source" | "domain" | "grain" | "board";

export type DataUniverseRole = Exclude<GrainImpactGraphScoreRole, "parked_gap">;

export interface DataUniverseRead {
  grain: string;
  score: number | null;
  confidence: number | null;
}

export interface DataUniverseNode {
  id: string;
  kind: DataUniverseNodeKind;
  label: string;
  detail: string;
  role: DataUniverseRole;
  position: readonly [number, number, number];
  radius: number;
  grainCount: number;
  read?: DataUniverseRead;
}

export interface DataUniverseLink {
  id: string;
  from: string;
  to: string;
  role: DataUniverseRole;
  weight: number;
}

export interface DataUniverseStats {
  sourceCount: number;
  officialSourceCount: number;
  priceContextSourceCount: number;
  watchSourceCount: number;
  domainCount: number;
  grainCount: number;
  linkCount: number;
}

export interface DataUniverseModel {
  nodes: DataUniverseNode[];
  links: DataUniverseLink[];
  stats: DataUniverseStats;
}

const BOARD_NODE_ID = "board";
const GRAIN_RING_RADIUS = 3.4;
const DOMAIN_RING_RADIUS = 6.2;
const SOURCE_RING_RADIUS = 9.4;

/** Farmer-readable names for the raw source lane labels coming out of the impact graph. */
const FRIENDLY_SOURCE_NAMES: Record<string, string> = {
  "cgc observations": "CGC weekly grain stats",
  "cgc imports": "CGC import ledger",
  "grain prices": "Daily futures prices",
  "fx rates": "USD/CAD exchange",
  "grain price intraday": "Intraday price checks",
  "usda wasde mapped": "USDA WASDE balance sheet",
  "usda wasde raw": "USDA world supply context",
  "usda export sales": "USDA export sales",
  "usda crop progress": "US crop conditions",
  "canada crop progress": "Prairie crop reports",
  "cftc cot positions": "Fund positioning (CFTC)",
  "usda quarterly stocks": "US quarterly stocks",
  "grain monitor snapshots": "Port and rail monitor",
  "producer car allocations": "Producer rail cars",
  "supply disposition": "AAFC supply and disposition",
  "x market signals": "X market chatter",
  "x scout runs": "X pulse scout",
};

const ROLE_PRIORITY: Record<DataUniverseRole, number> = {
  score_input: 3,
  bounded_context: 2,
  watch_only: 1,
};

function universeRole(scoreRole: GrainImpactGraphScoreRole): DataUniverseRole {
  return scoreRole === "parked_gap" ? "watch_only" : scoreRole;
}

function strongerRole(current: DataUniverseRole, candidate: DataUniverseRole): DataUniverseRole {
  return ROLE_PRIORITY[candidate] > ROLE_PRIORITY[current] ? candidate : current;
}

function universeId(kind: DataUniverseNodeKind, label: string): string {
  return `${kind}-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function ringPosition(index: number, total: number, radius: number, y: number): [number, number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, total);
  // Deterministic gentle wave so rings read as organic, not mechanical.
  const wave = Math.sin(angle * 3) * 0.4;
  return [Math.cos(angle) * radius, y + wave, Math.sin(angle) * radius];
}

function sourceRingHeight(role: DataUniverseRole): number {
  if (role === "score_input") return 1.4;
  if (role === "bounded_context") return 0.2;
  return -1.2;
}

function roleDetail(role: DataUniverseRole, grainCount: number): string {
  const grains = `${grainCount} grain${grainCount === 1 ? "" : "s"}`;
  if (role === "score_input") return `Official source lane feeding the scored read for ${grains}.`;
  if (role === "bounded_context") return `Price context lane confirming or capping the read for ${grains}.`;
  return `Watch-only lane pointing at what to review for ${grains}. It never moves the score on its own.`;
}

interface SourceAccumulator {
  label: string;
  role: DataUniverseRole;
  grains: Set<string>;
}

interface LinkAccumulator {
  from: string;
  to: string;
  role: DataUniverseRole;
  weight: number;
}

function accumulateLink(
  links: Map<string, LinkAccumulator>,
  from: string,
  to: string,
  role: DataUniverseRole,
) {
  const key = `${from}->${to}`;
  const existing = links.get(key);
  if (existing) {
    existing.weight += 1;
    existing.role = strongerRole(existing.role, role);
  } else {
    links.set(key, { from, to, role, weight: 1 });
  }
}

function collectGraphContributions(
  graph: GrainImpactGraphModel,
  sources: Map<string, SourceAccumulator>,
  domains: Map<string, Set<string>>,
  links: Map<string, LinkAccumulator>,
) {
  const grainNodeId = universeId("grain", graph.grain);
  const factorDomains = new Map<string, string[]>();
  const factorRoles = new Map<string, DataUniverseRole>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const edge of graph.edges) {
    if (edge.kind !== "factor_to_domain") continue;
    const domainNode = nodeById.get(edge.to);
    if (!domainNode || domainNode.kind !== "domain") continue;
    const list = factorDomains.get(edge.from) ?? [];
    list.push(domainNode.label);
    factorDomains.set(edge.from, list);
    if (!domains.has(domainNode.label)) domains.set(domainNode.label, new Set());
    domains.get(domainNode.label)!.add(graph.grain);
  }

  for (const node of graph.nodes) {
    if (node.kind === "factor" && node.sourceClass) {
      factorRoles.set(node.id, universeRole(scoreRoleForSourceClass(node.sourceClass)));
    }
  }

  for (const edge of graph.edges) {
    if (edge.kind === "source_to_factor") {
      const sourceNode = nodeById.get(edge.from);
      if (!sourceNode || sourceNode.kind !== "source") continue;

      const role = universeRole(sourceNode.scoreRole);
      const existing = sources.get(sourceNode.label);
      if (existing) {
        existing.grains.add(graph.grain);
        existing.role = strongerRole(existing.role, role);
      } else {
        sources.set(sourceNode.label, { label: sourceNode.label, role, grains: new Set([graph.grain]) });
      }

      const sourceId = universeId("source", sourceNode.label);
      const factorRole = factorRoles.get(edge.to) ?? role;
      for (const domainLabel of factorDomains.get(edge.to) ?? []) {
        accumulateLink(links, sourceId, universeId("domain", domainLabel), factorRole);
      }
    }

    if (edge.kind === "domain_to_grain") {
      const domainNode = nodeById.get(edge.from);
      if (!domainNode || domainNode.kind !== "domain") continue;
      accumulateLink(links, universeId("domain", domainNode.label), grainNodeId, "score_input");
    }
  }
}

function readByGrain(reads: readonly DataUniverseRead[] | undefined): Map<string, DataUniverseRead> {
  return new Map((reads ?? []).map((read) => [read.grain, read]));
}

export interface DataUniverseLaneRead {
  score: number;
  confidence: number;
}

export interface DataUniverseComparisonRow {
  grain: string;
  canada: DataUniverseLaneRead | null;
  us: DataUniverseLaneRead | null;
}

/**
 * Merge Canada/US lane reads into one confidence-weighted universe read per grain,
 * mirroring how the thesis board's aggregate views weight split-market rows.
 */
export function buildUniverseReads(rows: readonly DataUniverseComparisonRow[]): DataUniverseRead[] {
  return rows.map((row) => {
    const lanes = [row.canada, row.us].filter((lane): lane is DataUniverseLaneRead => lane !== null);
    if (lanes.length === 0) return { grain: row.grain, score: null, confidence: null };

    const confidenceTotal = lanes.reduce((sum, lane) => sum + Math.max(0, lane.confidence), 0);
    const score =
      confidenceTotal > 0
        ? Math.round(lanes.reduce((sum, lane) => sum + lane.score * Math.max(0, lane.confidence), 0) / confidenceTotal)
        : Math.round(lanes.reduce((sum, lane) => sum + lane.score, 0) / lanes.length);
    const confidence = Math.round(
      lanes.reduce((sum, lane) => sum + Math.max(0, lane.confidence), 0) / lanes.length,
    );

    return { grain: row.grain, score, confidence };
  });
}

/**
 * Build the farmer-facing "data universe" system graph: every admitted source lane on the
 * outer ring, pressure domains in the middle, public V1 grains inside, and the Bull/Bear
 * board at the center. Derived entirely from the deterministic grain impact graphs — this
 * is a display model and adds no scoring authority.
 */
export function buildDataUniverse(reads?: readonly DataUniverseRead[]): DataUniverseModel {
  const sources = new Map<string, SourceAccumulator>();
  const domains = new Map<string, Set<string>>();
  const linkAccumulators = new Map<string, LinkAccumulator>();

  const graphs = SUPPORTED_RATING_GRAINS.map((grain) => buildGrainImpactGraph(grain)).filter(
    (graph): graph is GrainImpactGraphModel => graph !== null,
  );

  for (const graph of graphs) {
    collectGraphContributions(graph, sources, domains, linkAccumulators);
  }

  const reads_ = readByGrain(reads);
  const nodes: DataUniverseNode[] = [];

  nodes.push({
    id: BOARD_NODE_ID,
    kind: "board",
    label: "Bull/Bear board",
    detail: "Every lane ends here: one source-backed read per grain, refreshed as new data lands.",
    role: "score_input",
    position: [0, 0, 0],
    radius: 1.05,
    grainCount: graphs.length,
  });

  graphs.forEach((graph, index) => {
    const read = reads_.get(graph.grain);
    nodes.push({
      id: universeId("grain", graph.grain),
      kind: "grain",
      label: graph.grain,
      detail: graph.marketStructure,
      role: "score_input",
      position: ringPosition(index, graphs.length, GRAIN_RING_RADIUS, 0),
      radius: 0.62,
      grainCount: 1,
      read: read ?? { grain: graph.grain, score: null, confidence: null },
    });
  });

  const domainEntries = [...domains.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  domainEntries.forEach(([label, grains], index) => {
    nodes.push({
      id: universeId("domain", label),
      kind: "domain",
      label,
      detail: `${label} pressure lane drawing on ${grains.size} grain${grains.size === 1 ? "" : "s"}.`,
      role: "score_input",
      position: ringPosition(index, domainEntries.length, DOMAIN_RING_RADIUS, 0.5),
      radius: 0.5,
      grainCount: grains.size,
    });
  });

  const sourceEntries = [...sources.values()].sort((left, right) => {
    const roleDelta = ROLE_PRIORITY[right.role] - ROLE_PRIORITY[left.role];
    if (roleDelta !== 0) return roleDelta;
    return left.label.localeCompare(right.label);
  });
  sourceEntries.forEach((source, index) => {
    nodes.push({
      id: universeId("source", source.label),
      kind: "source",
      label: FRIENDLY_SOURCE_NAMES[source.label] ?? source.label,
      detail: roleDetail(source.role, source.grains.size),
      role: source.role,
      position: ringPosition(index, sourceEntries.length, SOURCE_RING_RADIUS, sourceRingHeight(source.role)),
      radius: 0.34 + Math.min(0.18, source.grains.size * 0.025),
      grainCount: source.grains.size,
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const links: DataUniverseLink[] = [];
  for (const acc of linkAccumulators.values()) {
    if (!nodeIds.has(acc.from) || !nodeIds.has(acc.to)) continue;
    links.push({ id: `${acc.from}->${acc.to}`, from: acc.from, to: acc.to, role: acc.role, weight: acc.weight });
  }
  for (const graph of graphs) {
    const grainId = universeId("grain", graph.grain);
    links.push({ id: `${grainId}->${BOARD_NODE_ID}`, from: grainId, to: BOARD_NODE_ID, role: "score_input", weight: 2 });
  }
  links.sort((left, right) => left.id.localeCompare(right.id));

  const stats: DataUniverseStats = {
    sourceCount: sourceEntries.length,
    officialSourceCount: sourceEntries.filter((source) => source.role === "score_input").length,
    priceContextSourceCount: sourceEntries.filter((source) => source.role === "bounded_context").length,
    watchSourceCount: sourceEntries.filter((source) => source.role === "watch_only").length,
    domainCount: domainEntries.length,
    grainCount: graphs.length,
    linkCount: links.length,
  };

  return { nodes, links, stats };
}
