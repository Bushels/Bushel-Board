import { describe, expect, it } from "vitest";

import {
  CANADA_RATING_DOMAIN_WEIGHTS,
  clampConfidenceScore,
  clampRatingScore,
  getDomainWeights,
  getUnsupportedRatingLaneMetadata,
  isRatingSupportedGrain,
  normalizeDomainWeights,
  qualityAdjustmentForSource,
  scoreToRatingLabel,
  US_RATING_DOMAIN_WEIGHTS,
} from "@/lib/thesis/rating-model";

describe("thesis rating model shape", () => {
  it("locks Canada domain weights to the V1 reference table", () => {
    expect(CANADA_RATING_DOMAIN_WEIGHTS).toEqual({
      supply: 0.2,
      demand: 0.25,
      movement: 0.2,
      logistics: 0.1,
      price: 0.15,
      positioning: 0.05,
      weather: 0.05,
      farmer_local: 0,
    });

    const weights = getDomainWeights("canada");
    expect(weights.farmer_local).toBe(0);
    expect(Object.values(weights).reduce((total, weight) => total + weight, 0)).toBe(1);
  });

  it("locks US domain weights to the V1 reference table", () => {
    expect(US_RATING_DOMAIN_WEIGHTS).toEqual({
      supply: 0.25,
      demand: 0.25,
      movement: 0.1,
      logistics: 0.05,
      price: 0.15,
      positioning: 0.1,
      weather: 0.1,
      farmer_local: 0,
    });

    const weights = getDomainWeights("us");
    expect(weights.farmer_local).toBe(0);
    expect(Object.values(weights).reduce((total, weight) => total + weight, 0)).toBe(1);
  });

  it("averages Canada and US weights for the cross-border lane", () => {
    const weights = getDomainWeights("cross_border");

    expect(weights).toEqual({
      supply: 0.225,
      demand: 0.25,
      movement: 0.15,
      logistics: 0.075,
      price: 0.15,
      positioning: 0.075,
      weather: 0.075,
      farmer_local: 0,
    });
    expect(Object.values(weights).reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 6);
  });

  it("excludes structurally absent domains and renormalizes remaining domain weights to 1.0", () => {
    const weights = normalizeDomainWeights(CANADA_RATING_DOMAIN_WEIGHTS, ["farmer_local", "positioning"]);

    expect(weights).not.toHaveProperty("farmer_local");
    expect(weights).not.toHaveProperty("positioning");
    expect(Object.values(weights).reduce((total, weight) => total + weight, 0)).toBe(1);
    expect(weights.supply).toBeCloseTo(0.210526, 6);
    expect(weights.demand).toBeCloseTo(0.263158, 6);
    expect(weights.movement).toBeCloseTo(0.210526, 6);
  });

  it("keeps stale or empty domains in weighting and leaves freshness penalties to source quality adjustments", () => {
    const weights = getDomainWeights("canada");

    expect(weights).toHaveProperty("demand", 0.25);
    expect(weights).toHaveProperty("movement", 0.2);
    expect(weights).toHaveProperty("supply", 0.2);
    expect(weights).toHaveProperty("farmer_local", 0);
    expect(qualityAdjustmentForSource({ freshnessStatus: "stale" }).scoreMultiplier).toBe(0.75);
    expect(qualityAdjustmentForSource({ freshnessStatus: "empty" }).scoreMultiplier).toBe(0);
  });

  it("maps score bands to rating labels", () => {
    expect(scoreToRatingLabel(-100)).toBe("strong_bear");
    expect(scoreToRatingLabel(-70)).toBe("strong_bear");
    expect(scoreToRatingLabel(-69)).toBe("bear");
    expect(scoreToRatingLabel(-30)).toBe("bear");
    expect(scoreToRatingLabel(-29)).toBe("lean_bear");
    expect(scoreToRatingLabel(-10)).toBe("lean_bear");
    expect(scoreToRatingLabel(-9)).toBe("balanced");
    expect(scoreToRatingLabel(0)).toBe("balanced");
    expect(scoreToRatingLabel(9)).toBe("balanced");
    expect(scoreToRatingLabel(10)).toBe("lean_bull");
    expect(scoreToRatingLabel(29)).toBe("lean_bull");
    expect(scoreToRatingLabel(30)).toBe("bull");
    expect(scoreToRatingLabel(69)).toBe("bull");
    expect(scoreToRatingLabel(70)).toBe("strong_bull");
    expect(scoreToRatingLabel(100)).toBe("strong_bull");
  });

  it("clamps overall scores inside -100..100", () => {
    expect(clampRatingScore(-125)).toBe(-100);
    expect(clampRatingScore(-100)).toBe(-100);
    expect(clampRatingScore(0)).toBe(0);
    expect(clampRatingScore(100)).toBe(100);
    expect(clampRatingScore(125)).toBe(100);
  });

  it("clamps confidence scores inside 0..100", () => {
    expect(clampConfidenceScore(-20)).toBe(0);
    expect(clampConfidenceScore(0)).toBe(0);
    expect(clampConfidenceScore(55)).toBe(55);
    expect(clampConfidenceScore(100)).toBe(100);
    expect(clampConfidenceScore(120)).toBe(100);
  });

  it.each([
    ["strong source", { freshnessStatus: "strong" as const }, 0, 1.0, ["source_freshness_strong"]],
    ["watch source", { freshnessStatus: "watch" as const }, 0, 1.0, ["source_freshness_watch"]],
    ["expected lag source", { freshnessStatus: "expected_lag" as const }, -5, 1.0, ["source_expected_lag"]],
    ["stale source", { freshnessStatus: "stale" as const }, -15, 0.75, ["source_stale"]],
    ["empty optional source", { freshnessStatus: "empty" as const }, -15, 0, ["source_empty"]],
    [
      "empty required source",
      { freshnessStatus: "empty" as const, isRequired: true },
      -25,
      0,
      ["required_source_empty"],
    ],
    ["partial source", { freshnessStatus: "partial" as const }, -10, 0.7, ["source_partial"]],
  ])("returns base quality adjustment for %s", (_name, input, confidenceAdjustment, scoreMultiplier, reasons) => {
    expect(qualityAdjustmentForSource(input)).toEqual({
      confidenceAdjustment,
      scoreMultiplier,
      reasons,
    });
  });

  it("adds proxy mapping quality adjustment", () => {
    expect(qualityAdjustmentForSource({ freshnessStatus: "strong", isProxy: true })).toEqual({
      confidenceAdjustment: -10,
      scoreMultiplier: 0.8,
      reasons: ["source_freshness_strong", "proxy_source_mapping"],
    });
  });

  it("adds missing freshness proof quality adjustment", () => {
    expect(qualityAdjustmentForSource({ freshnessStatus: "strong", missingFreshnessProof: true })).toEqual({
      confidenceAdjustment: -15,
      scoreMultiplier: 0.8,
      reasons: ["source_freshness_strong", "missing_freshness_proof"],
    });
  });

  it("keeps empty required source multiplier at zero when additive penalties are present", () => {
    expect(
      qualityAdjustmentForSource({
        freshnessStatus: "empty",
        isRequired: true,
        isProxy: true,
        missingFreshnessProof: true,
      }),
    ).toEqual({
      confidenceAdjustment: -50,
      scoreMultiplier: 0,
      reasons: ["required_source_empty", "proxy_source_mapping", "missing_freshness_proof"],
    });
  });

  it("rounds combined source quality multipliers deterministically", () => {
    expect(qualityAdjustmentForSource({ freshnessStatus: "partial", isProxy: true, missingFreshnessProof: true })).toEqual({
      confidenceAdjustment: -35,
      scoreMultiplier: 0.45,
      reasons: ["source_partial", "proxy_source_mapping", "missing_freshness_proof"],
    });
  });

  it("marks Spring/Winter Wheat as parked unsupported lane metadata", () => {
    expect(isRatingSupportedGrain("Spring Wheat")).toBe(false);
    expect(isRatingSupportedGrain("Winter Wheat")).toBe(false);

    expect(getUnsupportedRatingLaneMetadata("Spring Wheat")).toEqual({
      supported: false,
      grain: "Spring Wheat",
      status: "parked",
      reason: "grain_class_mapping_unresolved",
      detail: "Spring Wheat is parked until class-safe source mapping exists.",
    });

    expect(getUnsupportedRatingLaneMetadata("Winter Wheat")).toEqual({
      supported: false,
      grain: "Winter Wheat",
      status: "parked",
      reason: "grain_class_mapping_unresolved",
      detail: "Winter Wheat is parked until class-safe source mapping exists.",
    });
  });

  it("supports only current V1 source-backed grain lanes", () => {
    for (const grain of ["Corn", "Soybeans", "Wheat", "Durum", "Canola", "Barley", "Oats"]) {
      expect(isRatingSupportedGrain(grain)).toBe(true);
    }

    expect(isRatingSupportedGrain("Rye")).toBe(false);
  });
});
