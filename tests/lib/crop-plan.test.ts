import { describe, expect, it } from "vitest";
import {
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
