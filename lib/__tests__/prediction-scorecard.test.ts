import { describe, expect, it } from "vitest";

import {
  buildPredictionScorecardRow,
  classifyActionResult,
  classifyDirectionResult,
  classifyTimingResult,
  type PredictionCall,
  type PriceWindow,
} from "../prediction-scorecard";

const weeklyBullishCall: PredictionCall = {
  grain: "Canola",
  cropYear: "2025-2026",
  grainWeek: 35,
  recordedAt: "2026-04-13T14:00:00.000Z",
  scanType: "weekly_debate",
  stanceScore: 42,
  recommendation: "HOLD_FIRM",
  modelSource: "grok-4.20-reasoning",
};

describe("classifyDirectionResult", () => {
  it("marks a bullish call correct when the market rallies", () => {
    expect(classifyDirectionResult(42, 3.2)).toBe("correct");
  });

  it("marks a bearish call wrong when the market rallies", () => {
    expect(classifyDirectionResult(-48, 2.1)).toBe("wrong");
  });

  it("treats watch-range calls as neutral when the move is small", () => {
    expect(classifyDirectionResult(8, 0.4)).toBe("neutral");
  });
});

describe("classifyActionResult", () => {
  it("rewards accelerate when the market weakens after the call", () => {
    expect(classifyActionResult("ACCELERATE", -2.6)).toBe("helpful");
  });

  it("penalizes hold firm when the market breaks lower", () => {
    expect(classifyActionResult("HOLD_FIRM", -2.6)).toBe("wrong");
  });

  it("treats watch as helpful when the move stays mixed or small", () => {
    expect(classifyActionResult("WATCH", 0.6)).toBe("helpful");
  });
});

describe("classifyTimingResult", () => {
  it("marks timing good when the favorable move starts early", () => {
    expect(classifyTimingResult(42, [0.8, 1.6, 2.2])).toBe("good");
  });

  it("marks timing late when the first clear move comes only at the end", () => {
    expect(classifyTimingResult(42, [-0.6, 0.1, 2.4])).toBe("late");
  });

  it("marks timing early when the market first breaks the wrong way", () => {
    expect(classifyTimingResult(42, [-2.1, 0.4, 1.8])).toBe("early");
  });
});

describe("buildPredictionScorecardRow", () => {
  it("builds a 14-day weekly scorecard row with direction, action, and timing", () => {
    const window: PriceWindow = {
      evalWindowDays: 14,
      startPriceDate: "2026-04-13",
      startSettlementPrice: 702.5,
      endPriceDate: "2026-04-27",
      endSettlementPrice: 724.8,
      priceChangePct: 3.175,
      pathChangePcts: [0.9, 1.8, 3.175],
    };

    const row = buildPredictionScorecardRow(weeklyBullishCall, window);

    expect(row).toMatchObject({
      grain: "Canola",
      evalWindowDays: 14,
      directionResult: "correct",
      actionResult: "helpful",
      timingResult: "good",
    });
  });

  it("returns unresolved outcomes when the end of the price window is missing", () => {
    const window: PriceWindow = {
      evalWindowDays: 7,
      startPriceDate: "2026-04-13",
      startSettlementPrice: 702.5,
      endPriceDate: null,
      endSettlementPrice: null,
      priceChangePct: null,
      pathChangePcts: [],
    };

    const row = buildPredictionScorecardRow(weeklyBullishCall, window);

    expect(row.directionResult).toBe("unresolved");
    expect(row.actionResult).toBe("unresolved");
    expect(row.timingResult).toBe("unclear");
  });
});
