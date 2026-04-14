import { describe, expect, it } from "vitest";

import {
  buildCalibrationPromptSection,
  buildPriceVerificationPromptSection,
  summarizeCalibrationOutcome,
  summarizePriceVerificationOutcome,
  type CalibrationContext,
  type PriceVerificationContext,
} from "../market-calibration";

describe("summarizeCalibrationOutcome", () => {
  it("marks a bullish prior call as confirmed when price moved higher", () => {
    const context: CalibrationContext = {
      grain: "Canola",
      latestGrainWeek: 35,
      priorAnalysis: {
        grainWeek: 34,
        stanceScore: 45,
        finalAssessment: "Hold firm until basis improves.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 702.5,
        changeAmount: 8.25,
        changePct: 1.19,
      },
    };

    const summary = summarizeCalibrationOutcome(context);
    expect(summary.status).toBe("confirmed");
    expect(summary.direction).toBe("bullish");
    expect(summary.accuracyLabel).toBe("good");
    expect(summary.summary).toContain("last week's bullish lean was confirmed");
  });

  it("marks a bearish prior call as missed when price rallied", () => {
    const context: CalibrationContext = {
      grain: "Wheat",
      latestGrainWeek: 35,
      priorAnalysis: {
        grainWeek: 34,
        stanceScore: -55,
        finalAssessment: "Haul it before the market softens further.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 6.12,
        changeAmount: 0.18,
        changePct: 3.03,
      },
    };

    const summary = summarizeCalibrationOutcome(context);
    expect(summary.status).toBe("missed");
    expect(summary.direction).toBe("bearish");
    expect(summary.accuracyLabel).toBe("poor");
    expect(summary.summary).toContain("did not hold up");
  });

  it("treats neutral prior calls as watch outcomes", () => {
    const context: CalibrationContext = {
      grain: "Oats",
      latestGrainWeek: 35,
      priorAnalysis: {
        grainWeek: 34,
        stanceScore: 8,
        finalAssessment: "Watch basis before moving more grain.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 3.48,
        changeAmount: -0.01,
        changePct: -0.29,
      },
    };

    const summary = summarizeCalibrationOutcome(context);
    expect(summary.status).toBe("watch");
    expect(summary.accuracyLabel).toBe("mixed");
    expect(summary.summary).toContain("watch call");
  });

  it("flags oversized week-over-week score swings for review", () => {
    const context: CalibrationContext = {
      grain: "Peas",
      latestGrainWeek: 35,
      priorAnalysis: {
        grainWeek: 34,
        stanceScore: -20,
        finalAssessment: "Scale in if bids are still there.",
      },
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 35,
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 11.05,
        changeAmount: 0.04,
        changePct: 0.36,
      },
    };

    const summary = summarizeCalibrationOutcome(context);
    expect(summary.reviewFlag).toContain("Score swing");
  });

  it("returns unavailable when prior analysis is missing", () => {
    const summary = summarizeCalibrationOutcome({
      grain: "Barley",
      latestGrainWeek: 35,
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 312,
        changeAmount: -2,
        changePct: -0.64,
      },
    });

    expect(summary.status).toBe("unavailable");
    expect(summary.summary).toContain("No prior Bushel Board call");
  });
});

describe("buildCalibrationPromptSection", () => {
  it("formats a calibration memo for prompt injection", () => {
    const section = buildCalibrationPromptSection({
      grain: "Canola",
      latestGrainWeek: 35,
      priorAnalysis: {
        grainWeek: 34,
        stanceScore: 45,
        finalAssessment: "Hold firm until basis improves.",
      },
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 30,
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 702.5,
        changeAmount: 8.25,
        changePct: 1.19,
      },
    });

    expect(section).toContain("Retrospective Calibration");
    expect(section).toContain("Week 34");
    expect(section).toContain("good");
    expect(section).toContain("Use this to calibrate conviction");
  });
});

describe("summarizePriceVerificationOutcome", () => {
  it("confirms a bullish call when fresh price action agrees", () => {
    const context: PriceVerificationContext = {
      grain: "Canola",
      latestGrainWeek: 35,
      analysisDate: "2026-04-13",
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 42,
        finalAssessment: "Hold firm while the market still has lift.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 702.5,
        changeAmount: 8.25,
        changePct: 1.19,
      },
    };

    const summary = summarizePriceVerificationOutcome(context);
    expect(summary.status).toBe("confirmed");
    expect(summary.shouldBlockBullish).toBe(false);
    expect(summary.summary).toContain("fresh futures price is confirming the bullish lean");
  });

  it("blocks a bullish publish when price action is moving the wrong way", () => {
    const context: PriceVerificationContext = {
      grain: "Wheat",
      latestGrainWeek: 35,
      analysisDate: "2026-04-13",
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 38,
        finalAssessment: "Hold firm for another leg higher.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 6.12,
        changeAmount: -0.18,
        changePct: -2.86,
      },
    };

    const summary = summarizePriceVerificationOutcome(context);
    expect(summary.status).toBe("contradicted");
    expect(summary.shouldBlockBullish).toBe(true);
    expect(summary.reviewFlag).toContain("Bullish publish gate");
  });

  it("flags stale prices when the latest close is too old", () => {
    const context: PriceVerificationContext = {
      grain: "Barley",
      latestGrainWeek: 35,
      analysisDate: "2026-04-13",
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 30,
      },
      latestPrice: {
        priceDate: "2026-04-04",
        settlementPrice: 312,
        changeAmount: 1.2,
        changePct: 0.39,
      },
    };

    const summary = summarizePriceVerificationOutcome(context);
    expect(summary.status).toBe("stale");
    expect(summary.shouldBlockBullish).toBe(true);
    expect(summary.summary).toContain("price signal is stale");
  });
});

describe("buildPriceVerificationPromptSection", () => {
  it("formats a price verification memo for prompt injection", () => {
    const section = buildPriceVerificationPromptSection({
      grain: "Canola",
      latestGrainWeek: 35,
      analysisDate: "2026-04-13",
      currentAnalysis: {
        grainWeek: 35,
        stanceScore: 42,
        finalAssessment: "Hold firm while the market still has lift.",
      },
      latestPrice: {
        priceDate: "2026-04-12",
        settlementPrice: 702.5,
        changeAmount: 8.25,
        changePct: 1.19,
      },
    });

    expect(section).toContain("Price Verification");
    expect(section).toContain("Bullish publish gate");
    expect(section).toContain("cash truth");
  });
});
