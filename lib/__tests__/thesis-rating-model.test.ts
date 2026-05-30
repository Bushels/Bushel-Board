import { describe, expect, it } from "vitest";

import {
  buildRatingScorecard,
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

const baseScorecardInput = {
  grain: "Canola",
  lane: "canada" as const,
  period_anchor: "2026-05-29",
  source_watermark: "2026-05-29T00:00:00.000Z",
};

const domainInput = (overrides: {
  domain: "supply" | "demand" | "movement" | "logistics" | "price" | "positioning" | "weather" | "farmer_local";
  score: number;
  confidence?: "high" | "medium" | "low";
  freshness_status?: "strong" | "watch" | "stale" | "empty" | "partial" | "expected_lag";
  sources?: string[];
  positive_evidence?: string[];
  negative_evidence?: string[];
  blocked_claims?: string[];
  isRequired?: boolean;
  isProxy?: boolean;
  missingFreshnessProof?: boolean;
  isPrimaryDirectSource?: boolean;
  structurallyAbsent?: boolean;
}) => ({
  confidence: "high" as const,
  freshness_status: "strong" as const,
  sources: [`${overrides.domain}_source`],
  positive_evidence: [`${overrides.domain}_positive`],
  negative_evidence: [],
  blocked_claims: [],
  isPrimaryDirectSource: true,
  ...overrides,
});

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

  it("aggregates weighted bullish domains into a bullish overall label", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 40 }),
        domainInput({ domain: "demand", score: 60 }),
        domainInput({ domain: "movement", score: 45 }),
        domainInput({ domain: "logistics", score: 20 }),
        domainInput({ domain: "price", score: 55 }),
        domainInput({ domain: "positioning", score: 10 }),
        domainInput({ domain: "weather", score: 0 }),
      ],
    });

    expect(scorecard.overall_score).toBeCloseTo(42.75, 6);
    expect(scorecard.overall_label).toBe("bull");
    expect(scorecard.confidence_score).toBe(85);
    expect(scorecard.confidence_label).toBe("high");
    expect(scorecard.domains.find((domain) => domain.domain === "demand")?.weighted_score).toBeCloseTo(15, 6);
    expect(scorecard.llm_allowed_claims).toContain("demand_positive");
  });

  it("lowers confidence and records contradiction notes for balanced conflicting domains", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: -60, negative_evidence: ["supply_bearish"] }),
        domainInput({ domain: "demand", score: 60, positive_evidence: ["demand_bullish"] }),
        domainInput({ domain: "movement", score: 0 }),
        domainInput({ domain: "logistics", score: 0 }),
        domainInput({ domain: "price", score: 0 }),
        domainInput({ domain: "positioning", score: 0 }),
        domainInput({ domain: "weather", score: 0 }),
      ],
    });

    expect(scorecard.overall_score).toBeCloseTo(3, 6);
    expect(scorecard.overall_label).toBe("balanced");
    expect(scorecard.contradictions).toContain("contradiction:supply_vs_demand");
    expect(scorecard.confidence_score).toBe(65);
    expect(scorecard.confidence_label).toBe("medium");
  });

  it("zeros empty required demand source and reduces confidence", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 40 }),
        domainInput({ domain: "demand", score: 80, freshness_status: "empty", sources: [], isRequired: true }),
        domainInput({ domain: "movement", score: 40 }),
        domainInput({ domain: "logistics", score: 40 }),
        domainInput({ domain: "price", score: 40 }),
        domainInput({ domain: "positioning", score: 40 }),
        domainInput({ domain: "weather", score: 40 }),
      ],
    });

    const demand = scorecard.domains.find((domain) => domain.domain === "demand");
    expect(demand?.score).toBe(0);
    expect(demand?.weighted_score).toBe(0);
    expect(scorecard.overall_score).toBeCloseTo(30, 6);
    expect(scorecard.missing_required_sources).toContain("demand");
    expect(scorecard.quality_adjustments).toContain("demand:required_source_empty");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:required_source_missing:demand");
    expect(scorecard.confidence_score).toBe(0);
    expect(scorecard.confidence_label).toBe("low");
  });

  it("zeros required source domains that have no admitted source rows even if freshness was mislabeled strong", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 40, isPrimaryDirectSource: true }),
        domainInput({ domain: "demand", score: 80, freshness_status: "strong", sources: [], isRequired: true, isPrimaryDirectSource: false }),
      ],
    });

    const demand = scorecard.domains.find((domain) => domain.domain === "demand");
    expect(demand?.score).toBe(0);
    expect(demand?.weighted_score).toBe(0);
    expect(scorecard.missing_required_sources).toContain("demand");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:required_source_missing:demand");
    expect(scorecard.confidence_score).toBe(0);
  });

  it("marks required sources missing freshness proof as insufficient data", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 40, isPrimaryDirectSource: true }),
        domainInput({ domain: "demand", score: 80, isRequired: true, missingFreshnessProof: true, isPrimaryDirectSource: false }),
      ],
    });

    const demand = scorecard.domains.find((domain) => domain.domain === "demand");
    expect(demand?.score).toBe(0);
    expect(scorecard.missing_required_sources).toContain("demand");
    expect(scorecard.quality_adjustments).toContain("demand:missing_freshness_proof");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:required_source_missing:demand");
    expect(scorecard.confidence_score).toBe(0);
  });

  it("returns insufficient-data scorecard when no primary direct source is present", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 55, isPrimaryDirectSource: false, isProxy: true }),
        domainInput({ domain: "demand", score: 55, isPrimaryDirectSource: false, isProxy: true }),
      ],
    });

    expect(scorecard.overall_score).toBe(0);
    expect(scorecard.overall_label).toBe("balanced");
    expect(scorecard.confidence_score).toBe(0);
    expect(scorecard.confidence_label).toBe("low");
    expect(scorecard.missing_required_sources).toContain("primary_direct_source");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:no_primary_direct_source");
  });

  it("clamps scorecard scores after quality-adjusted aggregation", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 150 }),
        domainInput({ domain: "demand", score: 150 }),
        domainInput({ domain: "movement", score: 150 }),
        domainInput({ domain: "logistics", score: 150 }),
        domainInput({ domain: "price", score: 150 }),
        domainInput({ domain: "positioning", score: 150 }),
        domainInput({ domain: "weather", score: 150 }),
      ],
    });

    expect(scorecard.overall_score).toBe(100);
    expect(scorecard.overall_label).toBe("strong_bull");
    expect(scorecard.domains.every((domain) => domain.score <= 100)).toBe(true);
  });

  it("does not count empty primary direct sources as sufficient data", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [domainInput({ domain: "supply", score: 55, freshness_status: "empty", sources: ["declared_but_empty"], isPrimaryDirectSource: true })],
    });

    expect(scorecard.overall_score).toBe(0);
    expect(scorecard.confidence_score).toBe(0);
    expect(scorecard.missing_required_sources).toContain("primary_direct_source");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:no_primary_direct_source");
  });

  it("returns insufficient data when duplicate domain inputs would double-count a weight", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [
        domainInput({ domain: "supply", score: 60 }),
        domainInput({ domain: "supply", score: 60 }),
        domainInput({ domain: "demand", score: 60 }),
      ],
    });

    expect(scorecard.overall_score).toBe(0);
    expect(scorecard.confidence_score).toBe(0);
    expect(scorecard.missing_required_sources).toContain("duplicate_domain:supply");
    expect(scorecard.quality_adjustments).toContain("insufficient_data:duplicate_domain:supply");
  });

  it("keeps contradiction reason strings stable regardless of input order", () => {
    const firstOrder = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [domainInput({ domain: "demand", score: 60 }), domainInput({ domain: "supply", score: -60 })],
    });
    const secondOrder = buildRatingScorecard({
      ...baseScorecardInput,
      domains: [domainInput({ domain: "supply", score: -60 }), domainInput({ domain: "demand", score: 60 })],
    });

    expect(firstOrder.contradictions).toEqual(["contradiction:supply_vs_demand"]);
    expect(secondOrder.contradictions).toEqual(["contradiction:supply_vs_demand"]);
  });

  it("rejects unsupported grains through the scorecard builder", () => {
    const scorecard = buildRatingScorecard({
      ...baseScorecardInput,
      grain: "Spring Wheat",
      domains: [domainInput({ domain: "supply", score: 60 })],
    });

    expect(scorecard.overall_score).toBe(0);
    expect(scorecard.confidence_score).toBe(0);
    expect(scorecard.quality_adjustments).toEqual([
      "unsupported_rating_lane:parked:grain_class_mapping_unresolved",
    ]);
  });
});
