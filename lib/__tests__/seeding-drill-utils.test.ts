import { describe, it, expect } from "vitest";
import {
  tickerForCommodity,
  buildConditionSegments,
  wowPctChange,
  type FuturesPoint,
} from "@/lib/queries/seeding-drill-utils";

// ─── tickerForCommodity ────────────────────────────────────────────────────────
describe("tickerForCommodity", () => {
  it("returns ZC ticker for CORN (uppercase)", () => {
    const result = tickerForCommodity("CORN");
    expect(result.ticker).toBe("ZC");
    expect(result.label).toContain("Corn");
  });

  it("is case-insensitive — lowercase corn matches", () => {
    const result = tickerForCommodity("corn");
    expect(result.ticker).toBe("ZC");
  });

  it("returns ZS for SOYBEANS", () => {
    expect(tickerForCommodity("SOYBEANS").ticker).toBe("ZS");
  });

  it("returns ZW for WHEAT", () => {
    expect(tickerForCommodity("WHEAT").ticker).toBe("ZW");
  });

  it("returns ZO for OATS", () => {
    expect(tickerForCommodity("OATS").ticker).toBe("ZO");
  });

  it("falls back to empty ticker for unknown commodity", () => {
    const result = tickerForCommodity("LENTILS");
    expect(result.ticker).toBe("");
    expect(result.label).toBe("LENTILS");
  });
});

// ─── buildConditionSegments ────────────────────────────────────────────────────
describe("buildConditionSegments", () => {
  it("returns 5 segments with correct labels for normal input", () => {
    const result = buildConditionSegments({
      very_poor: 2,
      poor: 8,
      fair: 20,
      good: 52,
      excellent: 18,
    });
    expect(result).not.toBeNull();
    expect(result).toHaveLength(5);
    const labels = result!.map((s) => s.label);
    expect(labels).toEqual(["VP", "P", "F", "G", "E"]);
  });

  it("substitutes 0 for null values rather than dropping them", () => {
    const result = buildConditionSegments({
      very_poor: null,
      poor: null,
      fair: 30,
      good: 50,
      excellent: 20,
    });
    expect(result).not.toBeNull();
    expect(result!.find((s) => s.label === "VP")?.pct).toBe(0);
    expect(result!.find((s) => s.label === "P")?.pct).toBe(0);
    expect(result!.find((s) => s.label === "F")?.pct).toBe(30);
  });

  it("returns null when ALL values are null (edge case — no condition data)", () => {
    const result = buildConditionSegments({
      very_poor: null,
      poor: null,
      fair: null,
      good: null,
      excellent: null,
    });
    expect(result).toBeNull();
  });

  it("returns segments even when only one segment has data", () => {
    const result = buildConditionSegments({
      very_poor: null,
      poor: null,
      fair: null,
      good: 100,
      excellent: null,
    });
    expect(result).not.toBeNull();
    expect(result!.find((s) => s.label === "G")?.pct).toBe(100);
  });
});

// ─── wowPctChange ─────────────────────────────────────────────────────────────
describe("wowPctChange", () => {
  it("returns null when array is empty", () => {
    expect(wowPctChange([])).toBeNull();
  });

  it("returns null when only one point exists", () => {
    const points: FuturesPoint[] = [{ date: "2026-04-25", settle: 500 }];
    expect(wowPctChange(points)).toBeNull();
  });

  it("returns null when no point is ~7 days before the latest", () => {
    // Two points only 1 day apart — no ~7-day match
    const points: FuturesPoint[] = [
      { date: "2026-04-24", settle: 490 },
      { date: "2026-04-25", settle: 500 },
    ];
    expect(wowPctChange(points)).toBeNull();
  });

  it("computes positive WoW when price rose ~7 days ago", () => {
    const points: FuturesPoint[] = [
      { date: "2026-04-18", settle: 480 }, // ~7 days before latest
      { date: "2026-04-20", settle: 485 },
      { date: "2026-04-22", settle: 490 },
      { date: "2026-04-25", settle: 504 }, // latest
    ];
    const result = wowPctChange(points);
    // (504 - 480) / 480 * 100 = 5%
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(5.0, 0);
  });

  it("computes negative WoW when price fell ~7 days ago", () => {
    const points: FuturesPoint[] = [
      { date: "2026-04-18", settle: 520 },
      { date: "2026-04-22", settle: 510 },
      { date: "2026-04-25", settle: 494 },
    ];
    const result = wowPctChange(points);
    // (494 - 520) / 520 * 100 ≈ -5%
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });
});
