import { describe, expect, it } from "vitest";

import {
  getGrainImpactProfile,
  getImpactFactorsBySourceClass,
  getOfficialImpactFactorCount,
  GRAIN_IMPACT_PROFILES,
  GRAIN_IMPACT_PROFILE_LIST,
  IMPACT_SOURCE_CLASSES,
  isImpactSourceClass,
} from "@/lib/thesis/grain-impact-map";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

describe("grain impact map", () => {
  it("defines one profile for every supported public V1 grain", () => {
    expect(Object.keys(GRAIN_IMPACT_PROFILES).sort()).toEqual([...SUPPORTED_RATING_GRAINS].sort());
    expect(GRAIN_IMPACT_PROFILE_LIST).toHaveLength(SUPPORTED_RATING_GRAINS.length);
  });

  it("keeps every impact factor classified in the admitted/watch/parked model", () => {
    const allowed = new Set<string>(IMPACT_SOURCE_CLASSES);

    for (const profile of GRAIN_IMPACT_PROFILE_LIST) {
      for (const factor of profile.impactFactors) {
        expect(allowed.has(factor.sourceClass)).toBe(true);
        expect(isImpactSourceClass(factor.sourceClass)).toBe(true);
      }
    }

    expect(isImpactSourceClass("rumor")).toBe(false);
  });

  it("gives every public grain at least one official thesis input and one parked gap", () => {
    for (const grain of SUPPORTED_RATING_GRAINS) {
      expect(getOfficialImpactFactorCount(grain)).toBeGreaterThan(0);
      expect(getGrainImpactProfile(grain)?.parkedGaps.length).toBeGreaterThan(0);
    }
  });

  it("defines market-response rules that stay tied to source classes and Viking topics", () => {
    const allowedSourceClasses = new Set<string>(IMPACT_SOURCE_CLASSES);
    const responseIds = new Set<string>();

    for (const profile of GRAIN_IMPACT_PROFILE_LIST) {
      expect(profile.marketResponses.length).toBeGreaterThanOrEqual(2);
      const profileTopics = new Set<string>(profile.vikingTopics);

      for (const response of profile.marketResponses) {
        expect(responseIds.has(response.id)).toBe(false);
        responseIds.add(response.id);
        expect(response.when.length).toBeGreaterThan(20);
        expect(response.marketResponse.length).toBeGreaterThan(20);
        expect(response.confidenceImpact.length).toBeGreaterThan(20);
        expect(response.sourceClasses.length).toBeGreaterThan(0);
        expect(response.vikingTopics.length).toBeGreaterThan(0);

        for (const sourceClass of response.sourceClasses) {
          expect(allowedSourceClasses.has(sourceClass)).toBe(true);
        }
        for (const topic of response.vikingTopics) {
          expect(profileTopics.has(topic)).toBe(true);
        }
      }
    }
  });

  it("keeps canola tied to soy complex price context while admitting world veg-oil balance as bounded demand context", () => {
    const profile = getGrainImpactProfile("Canola");
    expect(profile).not.toBeNull();

    expect(profile?.relationships.map((item) => item.target)).toContain("Soybeans");
    const oilseedFactor = profile?.impactFactors.find((factor) => factor.id === "canola-oilseed-complex");
    expect(oilseedFactor).toMatchObject({
      domain: "price",
      sourceClass: "price_context",
    });
    expect(oilseedFactor?.boundary).toContain("parked");

    const vegOilBalance = profile?.impactFactors.find((factor) => factor.id === "canola-global-veg-oil-balance");
    expect(vegOilBalance).toMatchObject({
      domain: "demand",
      scope: "world",
      sourceClass: "bounded_context",
      sourceIds: ["usda_wasde_raw"],
    });
    expect(vegOilBalance?.boundary).toMatch(/bounded/i);
    expect(vegOilBalance?.boundary).toMatch(/cannot create, carry, or flip/i);
    expect(profile?.parkedGaps).not.toContain("palm oil collector");
  });

  it("keeps wheat global and class-safe instead of using Spring/Winter proxies", () => {
    const profile = getGrainImpactProfile("Wheat");

    expect(profile?.marketShape).toBe("global_benchmark");
    expect(profile?.parkedGaps).toContain("Spring Wheat mapping");
    expect(profile?.parkedGaps).toContain("Winter Wheat mapping");
    expect(profile?.impactFactors.some((factor) => factor.boundary.includes("Do not use generic Wheat"))).toBe(true);
    expect(profile?.impactFactors.map((factor) => factor.id)).toEqual(
      expect.arrayContaining(["wheat-canada-supply-baseline", "wheat-logistics", "wheat-x-pulse-watch"]),
    );
    expect(profile?.impactFactors.find((factor) => factor.id === "wheat-logistics")).toMatchObject({
      domain: "logistics",
      sourceClass: "official_thesis_input",
      sourceIds: ["grain_monitor_snapshots", "producer_car_allocations"],
    });
    expect(profile?.impactFactors.find((factor) => factor.id === "wheat-x-pulse-watch")).toMatchObject({
      sourceClass: "watch_only",
      sourceIds: ["x_scout_runs", "x_market_signals"],
    });
    expect(profile?.impactFactors.find((factor) => factor.id === "wheat-feed-substitution")?.sourceIds).toContain(
      "grain_price_intraday",
    );
  });

  it("separates official, price-context, and watch-only factors for future UI panels", () => {
    const soybeans = getGrainImpactProfile("Soybeans");
    expect(soybeans).not.toBeNull();

    expect(getImpactFactorsBySourceClass(soybeans!, "official_thesis_input").map((factor) => factor.id)).toContain(
      "soybean-demand",
    );
    expect(getImpactFactorsBySourceClass(soybeans!, "price_context").map((factor) => factor.id)).toContain(
      "soybean-canola-cross-market",
    );
    expect(soybeans?.relationships.some((relationship) => relationship.sourceClass === "watch_only")).toBe(true);
  });

  it("admits Saskatchewan crop-development timing as official proxy input for mapped grains only", () => {
    const developmentFactors = [
      ["Canola", "canola-saskatchewan-oilseed-development"],
      ["Wheat", "wheat-saskatchewan-spring-cereal-development"],
      ["Durum", "durum-saskatchewan-spring-cereal-development"],
      ["Barley", "barley-saskatchewan-spring-cereal-development"],
      ["Oats", "oats-saskatchewan-spring-cereal-development"],
    ] as const;

    for (const [grain, factorId] of developmentFactors) {
      const profile = getGrainImpactProfile(grain);
      const factor = profile?.impactFactors.find((item) => item.id === factorId);

      expect(factor).toMatchObject({
        domain: "weather",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
      });
      expect(factor?.boundary).toMatch(/group-level|proxy/i);
      expect(getImpactFactorsBySourceClass(profile!, "official_thesis_input").map((item) => item.id)).toContain(
        factorId,
      );
    }

    expect(getGrainImpactProfile("Corn")?.impactFactors.some((factor) => factor.id.includes("saskatchewan"))).toBe(
      false,
    );
    expect(getGrainImpactProfile("Soybeans")?.impactFactors.some((factor) => factor.id.includes("saskatchewan"))).toBe(
      false,
    );
  });

  it("admits Prairie cropland moisture as official proxy input for Prairie grains only", () => {
    const moistureFactors = [
      ["Canola", "canola-prairie-cropland-moisture"],
      ["Wheat", "wheat-prairie-cropland-moisture"],
      ["Durum", "durum-prairie-cropland-moisture"],
      ["Barley", "barley-prairie-cropland-moisture"],
      ["Oats", "oats-prairie-cropland-moisture"],
    ] as const;

    for (const [grain, factorId] of moistureFactors) {
      const profile = getGrainImpactProfile(grain);
      const factor = profile?.impactFactors.find((item) => item.id === factorId);

      expect(factor).toMatchObject({
        domain: "weather",
        scope: "canada",
        sourceClass: "official_thesis_input",
        sourceIds: ["canada_crop_progress"],
      });
      expect(factor?.boundary).toMatch(/proxy/i);
      expect(factor?.boundary).toMatch(/not crop-specific/i);
      expect(factor?.boundary).toMatch(/condition, .*quality, or yield/i);
      expect(getImpactFactorsBySourceClass(profile!, "official_thesis_input").map((item) => item.id)).toContain(
        factorId,
      );
    }

    expect(getGrainImpactProfile("Corn")?.impactFactors.some((factor) => factor.id.includes("cropland-moisture"))).toBe(
      false,
    );
    expect(
      getGrainImpactProfile("Soybeans")?.impactFactors.some((factor) => factor.id.includes("cropland-moisture")),
    ).toBe(false);
  });

  it("keeps global competitor pressure visible without admitting it as direct score truth", () => {
    const globalFactors = [
      ["Canola", "canola-china-policy-watch"],
      ["Wheat", "wheat-global-origin-competition"],
      ["Durum", "durum-import-tender-watch"],
      ["Barley", "barley-global-feed-malt-competition"],
      ["Oats", "oats-cross-border-milling-import-watch"],
      ["Corn", "corn-south-america-competition"],
      ["Soybeans", "soybean-south-america-china-watch"],
    ] as const;

    for (const [grain, factorId] of globalFactors) {
      const profile = getGrainImpactProfile(grain);
      const factor = profile?.impactFactors.find((item) => item.id === factorId);

      expect(factor).toMatchObject({
        sourceClass: "watch_only",
        sourceIds: ["usda_wasde_raw"],
      });
      expect(["world", "cross_border"]).toContain(factor?.scope);
      expect(factor?.boundary).toMatch(/not admitted|not direct admitted|need source admission/i);
      expect(getImpactFactorsBySourceClass(profile!, "official_thesis_input").map((item) => item.id)).not.toContain(
        factorId,
      );
    }
  });

  it("returns null and zero counts for parked or unsupported grains", () => {
    expect(getGrainImpactProfile("Spring Wheat")).toBeNull();
    expect(getOfficialImpactFactorCount("Spring Wheat")).toBe(0);
    expect(getGrainImpactProfile("Peas")).toBeNull();
  });

  it("maps the Canada source name Amber Durum to the public Durum profile", () => {
    expect(getGrainImpactProfile("Amber Durum")?.grain).toBe("Durum");
    expect(getOfficialImpactFactorCount("Amber Durum")).toBeGreaterThan(0);
  });
});
