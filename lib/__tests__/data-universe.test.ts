import { describe, expect, it } from "vitest";

import { buildDataUniverse } from "@/lib/thesis/data-universe";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

describe("buildDataUniverse", () => {
  it("builds the full system graph: sources, domains, V1 grains, and the board hub", () => {
    const universe = buildDataUniverse();

    expect(universe.stats.grainCount).toBe(SUPPORTED_RATING_GRAINS.length);
    expect(universe.stats.domainCount).toBeGreaterThanOrEqual(5);
    expect(universe.stats.sourceCount).toBeGreaterThanOrEqual(15);
    expect(universe.stats.officialSourceCount).toBeGreaterThan(universe.stats.watchSourceCount);
    expect(universe.nodes.filter((node) => node.kind === "board")).toHaveLength(1);
    expect(universe.stats.linkCount).toBe(universe.links.length);
  });

  it("resolves every link endpoint to a node and keeps positions finite", () => {
    const universe = buildDataUniverse();
    const ids = new Set(universe.nodes.map((node) => node.id));

    expect(universe.links.length).toBeGreaterThan(0);
    for (const link of universe.links) {
      expect(ids.has(link.from), link.id).toBe(true);
      expect(ids.has(link.to), link.id).toBe(true);
      expect(link.weight).toBeGreaterThan(0);
    }
    for (const node of universe.nodes) {
      for (const coord of node.position) {
        expect(Number.isFinite(coord), node.id).toBe(true);
      }
      expect(node.radius).toBeGreaterThan(0);
    }
  });

  it("links flow inward only: sources to domains, domains to grains, grains to board", () => {
    const universe = buildDataUniverse();
    const kindById = new Map(universe.nodes.map((node) => [node.id, node.kind]));

    for (const link of universe.links) {
      const fromKind = kindById.get(link.from);
      const toKind = kindById.get(link.to);
      expect(
        (fromKind === "source" && toKind === "domain") ||
          (fromKind === "domain" && toKind === "grain") ||
          (fromKind === "grain" && toKind === "board"),
        link.id,
      ).toBe(true);
    }

    // Every grain reaches the board, and every domain feeds at least one grain.
    const grainIds = universe.nodes.filter((node) => node.kind === "grain").map((node) => node.id);
    for (const grainId of grainIds) {
      expect(universe.links.some((link) => link.from === grainId && link.to === "board")).toBe(true);
    }
    const domainIds = universe.nodes.filter((node) => node.kind === "domain").map((node) => node.id);
    for (const domainId of domainIds) {
      expect(universe.links.some((link) => link.from === domainId)).toBe(true);
      expect(universe.links.some((link) => link.to === domainId)).toBe(true);
    }
  });

  it("uses farmer-readable source names with no raw table labels or parked grains", () => {
    const universe = buildDataUniverse();
    const sourceLabels = universe.nodes.filter((node) => node.kind === "source").map((node) => node.label);

    expect(sourceLabels).toContain("CGC weekly grain stats");
    expect(sourceLabels).toContain("USDA export sales");
    expect(sourceLabels).toContain("Fund positioning (CFTC)");
    for (const label of sourceLabels) {
      expect(label).not.toMatch(/_/);
    }
    const allText = universe.nodes.map((node) => `${node.label} ${node.detail}`).join(" ");
    expect(allText).not.toMatch(/spring wheat|winter wheat/i);
    expect(allText).not.toMatch(/trade signal|price advice|pricing plan/i);
  });

  it("attaches board reads to grain nodes and defaults missing reads to null", () => {
    const universe = buildDataUniverse([
      { grain: "Canola", score: 24, confidence: 82 },
      { grain: "Corn", score: -10, confidence: 40 },
    ]);

    const canola = universe.nodes.find((node) => node.kind === "grain" && node.label === "Canola");
    const wheat = universe.nodes.find((node) => node.kind === "grain" && node.label === "Wheat");

    expect(canola?.read).toEqual({ grain: "Canola", score: 24, confidence: 82 });
    expect(wheat?.read).toEqual({ grain: "Wheat", score: null, confidence: null });
  });

  it("is deterministic: two builds produce identical output", () => {
    expect(buildDataUniverse()).toEqual(buildDataUniverse());
  });
});

describe("buildUniverseReads", () => {
  it("confidence-weights split-market rows and passes single-lane rows through", async () => {
    const { buildUniverseReads } = await import("@/lib/thesis/data-universe");
    const reads = buildUniverseReads([
      { grain: "Corn", canada: { score: 10, confidence: 50 }, us: { score: -20, confidence: 100 } },
      { grain: "Canola", canada: { score: 24, confidence: 82 }, us: null },
      { grain: "Oats", canada: null, us: null },
    ]);

    // (10*50 + -20*100) / 150 = -10
    expect(reads[0]).toEqual({ grain: "Corn", score: -10, confidence: 75 });
    expect(reads[1]).toEqual({ grain: "Canola", score: 24, confidence: 82 });
    expect(reads[2]).toEqual({ grain: "Oats", score: null, confidence: null });
  });

  it("clamps negative confidence to zero in both the weighted score and the average", async () => {
    const { buildUniverseReads } = await import("@/lib/thesis/data-universe");
    const reads = buildUniverseReads([
      { grain: "Wheat", canada: { score: 40, confidence: -30 }, us: { score: -10, confidence: 60 } },
    ]);

    // Negative confidence contributes 0 weight: score = -10, confidence = (0 + 60) / 2 = 30.
    expect(reads[0]).toEqual({ grain: "Wheat", score: -10, confidence: 30 });
  });

  it("falls back to an unweighted average when every lane has zero confidence", async () => {
    const { buildUniverseReads } = await import("@/lib/thesis/data-universe");
    const reads = buildUniverseReads([
      { grain: "Barley", canada: { score: 30, confidence: 0 }, us: { score: -10, confidence: 0 } },
    ]);

    expect(reads[0]).toEqual({ grain: "Barley", score: 10, confidence: 0 });
  });
});
