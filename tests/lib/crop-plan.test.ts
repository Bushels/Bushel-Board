import { describe, expect, it } from "vitest";
import {
  getCropPlanMarketingBreakdown,
  getCropPlanPaceBreakdown,
  getTotalMarketedVolumeKt,
} from "@/lib/utils/crop-plan";

describe("getTotalMarketedVolumeKt", () => {
  it("adds delivered and remaining inventory", () => {
    expect(
      getTotalMarketedVolumeKt({
        deliveredKt: 1.25,
        remainingToSellKt: 2.75,
      })
    ).toBe(4);
  });

  it("clamps negative inputs at zero", () => {
    expect(
      getTotalMarketedVolumeKt({
        deliveredKt: -2,
        remainingToSellKt: 1,
      })
    ).toBe(1);
  });
});

describe("getCropPlanPaceBreakdown", () => {
  it("uses delivered plus remaining as the denominator", () => {
    expect(
      getCropPlanPaceBreakdown({
        deliveredKt: 2,
        remainingToSellKt: 3,
        contractedKt: 1,
        uncontractedKt: 2,
      })
    ).toEqual({
      totalMarketedKt: 5,
      deliveredPct: 40,
      contractedPct: 20,
      uncontractedPct: 40,
    });
  });

  it("returns zeros when the plan has no tracked volume", () => {
    expect(
      getCropPlanPaceBreakdown({
        deliveredKt: 0,
        remainingToSellKt: 0,
      })
    ).toEqual({
      totalMarketedKt: 0,
      deliveredPct: 0,
      contractedPct: 0,
      uncontractedPct: 0,
    });
  });
});

describe("getCropPlanMarketingBreakdown", () => {
  it("breaks a crop plan into marketed, contracted, and open shares", () => {
    expect(
      getCropPlanMarketingBreakdown({
        startingGrainKt: 10,
        remainingToSellKt: 4,
        contractedKt: 1,
      })
    ).toEqual({
      startingGrainKt: 10,
      marketedKt: 6,
      pricedKt: 7,
      marketedPct: 60,
      pricedPct: 70,
      remainingPct: 40,
      contractedPct: 10,
      uncontractedPct: 30,
      grainLeftPct: 40,
      contractedShareOfRemainingPct: 25,
    });
  });

  it("falls back to remaining inventory when starting grain is missing", () => {
    const result = getCropPlanMarketingBreakdown({
      remainingToSellKt: 3,
      contractedKt: 1,
    });

    expect(result.startingGrainKt).toBe(3);
    expect(result.marketedKt).toBe(0);
    expect(result.pricedKt).toBe(1);
    expect(result.marketedPct).toBe(0);
    expect(result.remainingPct).toBe(100);
    expect(result.grainLeftPct).toBe(100);
    expect(result.pricedPct).toBeCloseTo(33.3333, 3);
    expect(result.contractedPct).toBeCloseTo(33.3333, 3);
    expect(result.uncontractedPct).toBeCloseTo(66.6667, 3);
    expect(result.contractedShareOfRemainingPct).toBeCloseTo(33.3333, 3);
  });

  it("keeps priced grain flat when a contracted load is hauled", () => {
    const before = getCropPlanMarketingBreakdown({
      startingGrainKt: 10,
      remainingToSellKt: 4,
      contractedKt: 2,
    });
    const afterContractedHaul = getCropPlanMarketingBreakdown({
      startingGrainKt: 10,
      remainingToSellKt: 3,
      contractedKt: 1,
    });

    expect(before.pricedKt).toBe(8);
    expect(afterContractedHaul.pricedKt).toBe(8);
    expect(afterContractedHaul.marketedKt).toBe(7);
    expect(afterContractedHaul.contractedPct).toBe(10);
  });

  it("increases priced grain when an open-market load is hauled", () => {
    const before = getCropPlanMarketingBreakdown({
      startingGrainKt: 10,
      remainingToSellKt: 4,
      contractedKt: 2,
    });
    const afterOpenHaul = getCropPlanMarketingBreakdown({
      startingGrainKt: 10,
      remainingToSellKt: 3,
      contractedKt: 2,
    });

    expect(before.pricedKt).toBe(8);
    expect(afterOpenHaul.pricedKt).toBe(9);
    expect(afterOpenHaul.marketedKt).toBe(7);
    expect(afterOpenHaul.contractedPct).toBe(20);
  });
});
