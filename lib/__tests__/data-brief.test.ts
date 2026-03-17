import { describe, expect, it } from "vitest";
import { computeAnalystRatios, type AnalystRatioInput, type AnalystRatios } from "../data-brief";

describe("computeAnalystRatios", () => {
  const baseData: AnalystRatioInput = {
    cyExportsKt: 3000,
    projectedExportsKt: 6000,
    cyCrushKt: 2000,
    projectedCrushKt: 4000,
    cyDeliveriesKt: 5000,
    totalSupplyKt: 20000,
    commercialStocksKt: 3000,
    annualCrushCapacityKt: 5000,
    latestDataWeek: 31,
    deliveriesHistAvg: 4500,
    exportsHistAvg: 2800,
    mmNetContracts: -15000,
    mmNetPctOi: -8.5,
  };

  it("computes export pace ratio correctly", () => {
    const ratios = computeAnalystRatios(baseData);
    expect(ratios.exportPaceRatio).toBeCloseTo(50.0, 1);
  });

  it("computes annualized export pace", () => {
    const ratios = computeAnalystRatios(baseData);
    // (3000 / 31) * 52 = 5032.3
    expect(ratios.annualizedExportPace).toBeCloseTo(5032.3, 0);
  });

  it("computes stocks-to-use ratio", () => {
    const ratios = computeAnalystRatios(baseData);
    // 3000 / (6000 + 4000) = 30%
    expect(ratios.stocksToUse).toBeCloseTo(30.0, 1);
  });

  it("computes delivery pace vs 5yr avg", () => {
    const ratios = computeAnalystRatios(baseData);
    // (5000 - 4500) / 4500 * 100 = 11.1%
    expect(ratios.deliveriesVs5yrPct).toBeCloseTo(11.1, 1);
  });

  it("computes crush utilization", () => {
    const ratios = computeAnalystRatios(baseData);
    // (2000 / 31 * 52) / 5000 * 100 = 67.1%
    expect(ratios.crushUtilizationPct).toBeCloseTo(67.1, 0);
  });

  it("returns null for missing data", () => {
    const ratios = computeAnalystRatios({
      ...baseData,
      projectedExportsKt: null,
      projectedCrushKt: null,
    });
    expect(ratios.exportPaceRatio).toBeNull();
    expect(ratios.stocksToUse).toBeNull();
  });

  it("returns null crush utilization when capacity is null", () => {
    const ratios = computeAnalystRatios({ ...baseData, annualCrushCapacityKt: null });
    expect(ratios.crushUtilizationPct).toBeNull();
  });

  it("formats prompt section with all ratios", () => {
    const ratios = computeAnalystRatios(baseData);
    expect(ratios.promptSection).toContain("Export pace:");
    expect(ratios.promptSection).toContain("Stocks-to-use:");
    expect(ratios.promptSection).toContain("Crush utilization:");
    expect(ratios.promptSection).toContain("Managed Money");
  });
});
