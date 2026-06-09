import { describe, expect, it } from "vitest";

import { getGrainDataCoverageProfile } from "@/lib/thesis/grain-data-coverage";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

describe("grain data coverage matrix", () => {
  it("builds a coverage profile for every public V1 grain", () => {
    for (const grain of SUPPORTED_RATING_GRAINS) {
      const coverage = getGrainDataCoverageProfile(grain);

      expect(coverage?.grain).toBe(grain);
      expect(coverage?.rows.length).toBeGreaterThan(0);
      expect(coverage?.summary.scored).toBeGreaterThan(0);
      expect(coverage?.summary.missing).toBeGreaterThan(0);
      expect(coverage?.summary.admissionPriorities).toBeGreaterThan(0);
      expect(coverage?.admissionPriorities.length).toBeLessThanOrEqual(5);
    }
  });

  it("classifies official and price-context factors as score inputs", () => {
    const canola = getGrainDataCoverageProfile("Canola");

    expect(canola?.rows.find((row) => row.id === "canola-crush-export-demand")).toMatchObject({
      currentStep: "scored",
      checklist: {
        pulled: true,
        packeted: true,
        scored: true,
        explanation_only: false,
        missing: false,
      },
    });
    expect(canola?.rows.find((row) => row.id === "canola-oilseed-complex")).toMatchObject({
      currentStep: "scored",
      sourceClass: "price_context",
    });
  });

  it("keeps watch-only global context out of deterministic scoring", () => {
    const wheat = getGrainDataCoverageProfile("Wheat");
    const originCompetition = wheat?.rows.find((row) => row.id === "wheat-global-origin-competition");

    expect(originCompetition).toMatchObject({
      currentStep: "explanation_only",
      sourceClass: "watch_only",
      checklist: {
        pulled: true,
        packeted: false,
        scored: false,
        explanation_only: true,
        missing: false,
      },
    });
  });

  it("classifies admitted Saskatchewan development timing as a scored proxy input", () => {
    const canola = getGrainDataCoverageProfile("Canola");

    expect(canola?.rows.find((row) => row.id === "canola-saskatchewan-oilseed-development")).toMatchObject({
      currentStep: "scored",
      sourceClass: "official_thesis_input",
      sourceIds: ["canada_crop_progress"],
    });
  });

  it("classifies admitted Prairie cropland moisture as a scored proxy input", () => {
    const canola = getGrainDataCoverageProfile("Canola");

    expect(canola?.rows.find((row) => row.id === "canola-prairie-cropland-moisture")).toMatchObject({
      currentStep: "scored",
      sourceClass: "official_thesis_input",
      sourceIds: ["canada_crop_progress"],
    });
  });

  it("turns parked gaps into missing coverage rows instead of source facts", () => {
    const oats = getGrainDataCoverageProfile("Oats");
    const qualityGap = oats?.gaps.find((gap) => gap.label === "milling bids");

    expect(qualityGap).toMatchObject({
      currentStep: "missing",
      checklist: {
        pulled: false,
        packeted: false,
        scored: false,
        explanation_only: false,
        missing: true,
      },
    });
    expect(qualityGap?.nextAction).toContain("Admit a source contract");
  });

  it("prioritizes watch-lane promotion before missing-source admission", () => {
    const canola = getGrainDataCoverageProfile("Canola");

    expect(canola?.admissionPriorities[0]).toMatchObject({
      rank: 1,
      id: "promote-canola-global-policy-veg-oil-watch",
      kind: "promote_watch_lane",
      currentStep: "explanation_only",
      domain: "demand",
      sourceIds: ["usda_wasde_raw"],
    });
    expect(canola?.admissionPriorities.some((priority) => priority.kind === "admit_missing_source")).toBe(true);
    expect(canola?.admissionPriorities.every((priority) => priority.scoreBoundary.includes("Currently"))).toBe(true);
    expect(canola?.admissionPriorities[0].admissionRequirement).toContain("thesis-packet admission");
  });

  it("uses the public Durum profile for Amber Durum source names", () => {
    expect(getGrainDataCoverageProfile("Amber Durum")?.grain).toBe("Durum");
  });

  it("returns null for parked or unsupported grains", () => {
    expect(getGrainDataCoverageProfile("Spring Wheat")).toBeNull();
    expect(getGrainDataCoverageProfile("Rye")).toBeNull();
  });
});
