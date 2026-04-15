import { describe, it, expect } from "vitest";
import {
  isFarmingRelevant,
  buildFarmingQuery,
  getGrainTier,
} from "@/lib/x-api/farming-filter";

describe("isFarmingRelevant", () => {
  it("accepts grain price discussion", () => {
    expect(
      isFarmingRelevant(
        "Canola basis tightening in SK -35 under at the elevator"
      )
    ).toBe(true);
  });

  it("rejects crypto spam", () => {
    expect(
      isFarmingRelevant("WHEAT token to the moon crypto defi NFT")
    ).toBe(false);
  });

  it("accepts weather impact on crops", () => {
    expect(
      isFarmingRelevant(
        "Frost hit the canola hard last night in SE Saskatchewan"
      )
    ).toBe(true);
  });

  it("accepts futures in farming context", () => {
    expect(
      isFarmingRelevant(
        "Wheat futures down on CBOT, basis widening at prairie elevators"
      )
    ).toBe(true);
  });

  it("rejects non-farming content with grain keywords", () => {
    expect(
      isFarmingRelevant("Just had some great wheat beer at the brewery!")
    ).toBe(false);
  });

  it("accepts harvest progress reports", () => {
    expect(
      isFarmingRelevant(
        "Harvest is about 60% done in southern Alberta for barley"
      )
    ).toBe(true);
  });

  it("rejects fantasy sports with grain-like words", () => {
    expect(
      isFarmingRelevant(
        "My fantasy football draft picks are golden this season"
      )
    ).toBe(false);
  });
});

describe("buildFarmingQuery", () => {
  it("builds query for major grain", () => {
    const query = buildFarmingQuery("Canola", "major");
    expect(query).toContain("canola");
    expect(query).toContain("-is:retweet");
    expect(query).toContain("lang:en");
    expect(query).toContain("-crypto");
  });

  it("builds narrower query for minor grain", () => {
    const query = buildFarmingQuery("Mustard", "minor");
    expect(query).toContain("mustard");
    expect(query).toContain("prairie OR Saskatchewan");
  });
});

describe("getGrainTier", () => {
  it("classifies Wheat as major", () => {
    expect(getGrainTier("Wheat")).toBe("major");
  });
  it("classifies Lentils as mid", () => {
    expect(getGrainTier("Lentils")).toBe("mid");
  });
  it("classifies Mustard as minor", () => {
    expect(getGrainTier("Mustard")).toBe("minor");
  });
});
