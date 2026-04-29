import { describe, it, expect } from "vitest";
import { pickStrongestMove, computeWow } from "@/lib/queries/overview-data";
import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";

function makeRow(grain: string, score: number): GrainStanceData {
  return {
    grain,
    slug: grain.toLowerCase(),
    region: "CA",
    score,
    priorScore: null,
    confidence: "medium",
    cashPrice: null,
    priceChange: null,
    thesisSummary: null,
    bullPoints: [],
    bearPoints: [],
    recommendation: null,
    detailHref: `/grain/${grain.toLowerCase()}`,
  };
}

describe("pickStrongestMove", () => {
  it("returns null for empty array", () => {
    expect(pickStrongestMove([])).toBeNull();
  });

  it("returns the single item when there is only one", () => {
    const rows = [makeRow("Canola", 42)];
    expect(pickStrongestMove(rows)?.grain).toBe("Canola");
  });

  it("picks the grain with the highest absolute score (bull)", () => {
    const rows = [
      makeRow("Wheat", 18),
      makeRow("Canola", 42),
      makeRow("Barley", -12),
    ];
    expect(pickStrongestMove(rows)?.grain).toBe("Canola");
  });

  it("picks the grain with the highest absolute score (bear)", () => {
    const rows = [
      makeRow("Wheat", 18),
      makeRow("Canola", 30),
      makeRow("Flaxseed", -55),
    ];
    expect(pickStrongestMove(rows)?.grain).toBe("Flaxseed");
  });

  it("handles all-zero scores — returns first", () => {
    const rows = [makeRow("Wheat", 0), makeRow("Canola", 0)];
    // Both have abs = 0; first one should win (reduce starts with null → first row)
    expect(pickStrongestMove(rows)?.grain).toBe("Wheat");
  });

  it("handles equal absolute values — keeps earlier grain", () => {
    const rows = [makeRow("Wheat", 30), makeRow("Canola", -30)];
    expect(pickStrongestMove(rows)?.grain).toBe("Wheat");
  });
});

describe("computeWow", () => {
  it("returns null when prior is zero (avoid division by zero)", () => {
    expect(computeWow(10, 0)).toBeNull();
  });

  it("computes positive WoW %", () => {
    expect(computeWow(110, 100)).toBeCloseTo(10);
  });

  it("computes negative WoW %", () => {
    expect(computeWow(90, 100)).toBeCloseTo(-10);
  });

  it("handles negative prior correctly (uses abs for denominator)", () => {
    // current=50, prior=-100 → (50 - (-100)) / |-100| * 100 = 150
    expect(computeWow(50, -100)).toBeCloseTo(150);
  });

  it("returns 0 when current equals prior", () => {
    expect(computeWow(50, 50)).toBeCloseTo(0);
  });
});
