import { describe, expect, it } from "vitest";

import { getImpactAdjustedDomainWeights } from "@/lib/thesis/grain-impact-domain-weights";
import { getDomainWeights } from "@/lib/thesis/rating-model";

function sumWeights(weights: Partial<Record<string, number>>): number {
  return Object.values(weights).reduce<number>((total, weight) => total + (weight ?? 0), 0);
}

describe("grain impact adjusted domain weights", () => {
  it("tilts Canada canola toward admitted flow and oilseed-context domains", () => {
    const base = getDomainWeights("canada");
    const adjusted = getImpactAdjustedDomainWeights("Canola", "canada");

    expect(sumWeights(adjusted)).toBeCloseTo(1, 6);
    expect(adjusted.supply).toBeGreaterThan(base.supply ?? 0);
    expect(adjusted.demand).toBeGreaterThan(base.demand ?? 0);
    expect(adjusted.logistics).toBeGreaterThan(base.logistics ?? 0);
    expect(adjusted.price).toBeGreaterThan(base.price ?? 0);
  });

  it("uses the public Durum profile for the Canada Amber Durum packet name", () => {
    expect(getImpactAdjustedDomainWeights("Amber Durum", "canada")).toEqual(
      getImpactAdjustedDomainWeights("Durum", "canada"),
    );
  });

  it("does not promote watch-only durum tender demand into extra score weight", () => {
    const adjusted = getImpactAdjustedDomainWeights("Durum", "canada");
    const base = getDomainWeights("canada");

    expect((adjusted.demand ?? 0) / (adjusted.supply ?? 1)).toBeCloseTo(
      (base.demand ?? 0) / (base.supply ?? 1),
      5,
    );
  });

  it("falls back to lane weights for unsupported or parked grain labels", () => {
    expect(getImpactAdjustedDomainWeights("Spring Wheat", "canada")).toEqual(getDomainWeights("canada"));
    expect(getImpactAdjustedDomainWeights("Peas", "canada")).toEqual(getDomainWeights("canada"));
  });
});
