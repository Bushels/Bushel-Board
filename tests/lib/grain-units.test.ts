import { describe, expect, it } from "vitest";
import {
  convertKtToTonnes,
  convertMetricTonnesToUnit,
  convertToMetricTonnes,
  convertTonnesToKt,
  getDefaultBushelWeightLbs,
  getYieldMetrics,
} from "@/lib/utils/grain-units";

describe("grain unit conversions", () => {
  it("converts bushels to metric tonnes using bushel weight", () => {
    expect(convertToMetricTonnes(2204.6226218488 / 50, "bushels", 50)).toBeCloseTo(1, 6);
  });

  it("converts pounds to metric tonnes", () => {
    expect(convertToMetricTonnes(2204.6226218488, "pounds", 60)).toBeCloseTo(1, 6);
  });

  it("converts metric tonnes back to bushels", () => {
    expect(convertMetricTonnesToUnit(1, "bushels", 50)).toBeCloseTo(44.0924524, 6);
  });

  it("converts between tonnes and kilotonnes", () => {
    expect(convertTonnesToKt(1250)).toBe(1.25);
    expect(convertKtToTonnes(1.25)).toBe(1250);
  });
});

describe("grain defaults and yield metrics", () => {
  it("returns grain-specific default bushel weights", () => {
    expect(getDefaultBushelWeightLbs("Canola")).toBe(50);
    expect(getDefaultBushelWeightLbs("Unknown Grain")).toBe(60);
  });

  it("calculates yield in both tonnes per acre and bushels per acre", () => {
    const result = getYieldMetrics({
      acres: 100,
      startingGrainKt: 0.1,
      bushelWeightLbs: 50,
    });

    expect(result.tonnesPerAcre).toBeCloseTo(1, 6);
    expect(result.bushelsPerAcre).toBeCloseTo(44.0924524, 6);
  });

  it("returns zero yield when acres are missing", () => {
    expect(
      getYieldMetrics({
        acres: 0,
        startingGrainKt: 2,
        bushelWeightLbs: 60,
      })
    ).toEqual({
      tonnesPerAcre: 0,
      bushelsPerAcre: 0,
    });
  });
});
