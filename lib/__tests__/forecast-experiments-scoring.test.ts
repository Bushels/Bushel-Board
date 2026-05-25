import { describe, expect, it } from "vitest";

import {
  calculateBrierScore,
  calculateMagnitudeErrorPct,
  calculatePriceChangePct,
  classifyConfidenceBucket,
  classifyDirectionalResult,
  scoreForecastOutcome,
  validatePriceContractForScoring,
  validateStartPriceTiming,
} from "../forecast-experiments/scoring";

describe("forecast experiment scoring", () => {
  it("classifies directional results with a neutral band", () => {
    expect(classifyDirectionalResult("bullish", 1.1)).toBe("correct");
    expect(classifyDirectionalResult("bearish", 1.1)).toBe("wrong");
    expect(classifyDirectionalResult("neutral", 0.2)).toBe("correct");
  });

  it("calculates price change and magnitude error deterministically", () => {
    expect(calculatePriceChangePct(720, 748.8)).toBeCloseTo(4);
    expect(calculateMagnitudeErrorPct({ low: 1, high: 3 }, 4.25)).toBeCloseTo(1.25);
    expect(calculateMagnitudeErrorPct({ low: -2, high: 2 }, 0.5)).toBe(0);
  });

  it("calculates Brier score and calibration buckets deterministically", () => {
    expect(calculateBrierScore(61, true)).toBeCloseTo(0.1521);
    expect(calculateBrierScore(61, false)).toBeCloseTo(0.3721);
    expect(classifyConfidenceBucket(50)).toBe("0-50");
    expect(classifyConfidenceBucket(51)).toBe("51-60");
    expect(classifyConfidenceBucket(100)).toBe("91-100");
  });

  it("requires contract and roll policy before scoring a 28-day forecast", () => {
    expect(() =>
      validatePriceContractForScoring({
        horizonDays: 28,
        priceContractCode: "RSX26",
        priceRollPolicy: undefined,
      }),
    ).toThrow(/roll policy/i);
  });

  it("rejects same-day settlement as the start price when the forecast was made before market close", () => {
    expect(() =>
      validateStartPriceTiming({
        forecastTimestamp: "2026-08-07T12:00:00-06:00",
        marketCloseTimestamp: "2026-08-07T13:15:00-06:00",
        startPriceTimestamp: "2026-08-07T13:15:00-06:00",
      }),
    ).toThrow(/same-day settlement/i);
  });

  it("scores a complete outcome without calling external systems", () => {
    expect(
      scoreForecastOutcome({
        direction: "bullish",
        confidencePct: 61,
        expectedMovePctRange: { low: 1, high: 3 },
        horizonDays: 28,
        priceContractCode: "RSX26",
        priceRollPolicy: "fixed_contract_no_roll",
        forecastTimestamp: "2026-08-07T14:30:00-06:00",
        marketCloseTimestamp: "2026-08-07T13:15:00-06:00",
        startPriceTimestamp: "2026-08-07T13:15:00-06:00",
        startPrice: 720,
        endPrice: 748.8,
      }),
    ).toEqual({
      priceChangePct: 4,
      directionResult: "correct",
      magnitudeErrorPct: 1,
      brierScore: 0.1521,
      confidenceBucket: "61-70",
    });
  });
});
