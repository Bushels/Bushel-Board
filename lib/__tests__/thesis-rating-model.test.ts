import { describe, expect, it } from "vitest";

import {
  clampConfidenceScore,
  clampRatingScore,
  getUnsupportedRatingLaneMetadata,
  isRatingSupportedGrain,
  scoreToRatingLabel,
} from "@/lib/thesis/rating-model";

describe("thesis rating model shape", () => {
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
