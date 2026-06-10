import { describe, expect, it } from "vitest";

import { buildGrainImpactGraph } from "@/lib/thesis/grain-impact-graph";
import { buildGrainReadLinkageSummary } from "@/lib/thesis/grain-read-linkage";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

describe("buildGrainReadLinkageSummary", () => {
  it("builds a farmer-facing summary for every supported public V1 grain", () => {
    for (const grain of SUPPORTED_RATING_GRAINS) {
      const summary = buildGrainReadLinkageSummary(grain);
      expect(summary, grain).not.toBeNull();
      expect(summary!.scoredCount).toBeGreaterThan(0);
      expect(summary!.topLanes.length).toBeGreaterThan(0);
      expect(summary!.topLanes.length).toBeLessThanOrEqual(4);
    }
  });

  it("mirrors the impact graph coverage counts exactly", () => {
    const graph = buildGrainImpactGraph("Canola")!;
    const summary = buildGrainReadLinkageSummary("Canola")!;

    expect(summary.scoredCount).toBe(graph.coverage.scoreInputFactorCount);
    expect(summary.priceContextCount).toBe(graph.coverage.boundedContextFactorCount);
    expect(summary.watchOnlyCount).toBe(graph.coverage.watchOnlyFactorCount);
    expect(summary.parkedCount).toBe(graph.coverage.parkedGapCount);
  });

  it("never surfaces parked gaps as lanes and orders official inputs first", () => {
    for (const grain of SUPPORTED_RATING_GRAINS) {
      const summary = buildGrainReadLinkageSummary(grain)!;
      const roles = summary.topLanes.map((lane) => lane.role);

      expect(roles).not.toContain("parked_gap");
      // Official score inputs must come before price context and watch leads.
      const firstNonOfficial = roles.findIndex((role) => role !== "score_input");
      if (firstNonOfficial >= 0) {
        expect(roles.slice(firstNonOfficial)).not.toContain("score_input");
      }
    }
  });

  it("returns null for parked or unsupported grains", () => {
    expect(buildGrainReadLinkageSummary("Spring Wheat")).toBeNull();
    expect(buildGrainReadLinkageSummary("Peas")).toBeNull();
  });
});
