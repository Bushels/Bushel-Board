import { buildGrainImpactGraph, type GrainImpactGraphScoreRole } from "@/lib/thesis/grain-impact-graph";

export interface GrainReadLinkageLane {
  id: string;
  label: string;
  role: Exclude<GrainImpactGraphScoreRole, "parked_gap">;
  rank: number;
}

export interface GrainReadLinkageSummary {
  grain: string;
  scoredCount: number;
  priceContextCount: number;
  watchOnlyCount: number;
  parkedCount: number;
  topLanes: GrainReadLinkageLane[];
}

const LINKAGE_ROLE_ORDER: Record<Exclude<GrainImpactGraphScoreRole, "parked_gap">, number> = {
  score_input: 0,
  bounded_context: 1,
  watch_only: 2,
};

/**
 * Farmer-facing summary of what feeds a grain's Bull/Bear read, derived from the same
 * deterministic impact graph the audit surface renders. Counts mirror the graph coverage;
 * top lanes are the highest-ranked non-parked factors. This is a display summary only —
 * it adds no scoring authority and must never present watch-only lanes as score inputs.
 */
export function buildGrainReadLinkageSummary(grain: string, maxLanes = 4): GrainReadLinkageSummary | null {
  const graph = buildGrainImpactGraph(grain);
  if (!graph) return null;

  const topLanes = graph.nodes
    .filter(
      (node): node is typeof node & { scoreRole: Exclude<GrainImpactGraphScoreRole, "parked_gap"> } =>
        node.kind === "factor" && node.scoreRole !== "parked_gap",
    )
    .sort((left, right) => {
      const roleDelta = LINKAGE_ROLE_ORDER[left.scoreRole] - LINKAGE_ROLE_ORDER[right.scoreRole];
      if (roleDelta !== 0) return roleDelta;
      if (left.rank !== right.rank) return right.rank - left.rank;
      return left.label.localeCompare(right.label);
    })
    .slice(0, maxLanes)
    .map((node) => ({
      id: node.id,
      label: node.label,
      role: node.scoreRole,
      rank: node.rank,
    }));

  return {
    grain: graph.grain,
    scoredCount: graph.coverage.scoreInputFactorCount,
    priceContextCount: graph.coverage.boundedContextFactorCount,
    watchOnlyCount: graph.coverage.watchOnlyFactorCount,
    parkedCount: graph.coverage.parkedGapCount,
    topLanes,
  };
}
