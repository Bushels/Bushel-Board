import { describe, expect, it } from "vitest";

import {
  buildWeeklyTrajectoryRow,
  mapScoreToRecommendation,
  mapScoreToTerm,
} from "../trajectory-mapping";

describe("mapScoreToRecommendation", () => {
  it("maps strong bullish scores to hold firm", () => {
    expect(mapScoreToRecommendation(75)).toBe("HOLD_FIRM");
  });

  it("maps mildly bullish scores to patience", () => {
    expect(mapScoreToRecommendation(25)).toBe("PATIENCE");
  });

  it("maps neutral scores to watch", () => {
    expect(mapScoreToRecommendation(5)).toBe("WATCH");
  });

  it("maps bearish scores to scale in and accelerate", () => {
    expect(mapScoreToRecommendation(-35)).toBe("SCALE_IN");
    expect(mapScoreToRecommendation(-75)).toBe("ACCELERATE");
  });
});

describe("mapScoreToTerm", () => {
  it("maps scores into bullish neutral bearish buckets", () => {
    expect(mapScoreToTerm(30)).toBe("bullish");
    expect(mapScoreToTerm(0)).toBe("neutral");
    expect(mapScoreToTerm(-30)).toBe("bearish");
  });
});

describe("buildWeeklyTrajectoryRow", () => {
  it("builds a weekly_debate trajectory row from a thesis score", () => {
    const row = buildWeeklyTrajectoryRow({
      grain: "Canola",
      cropYear: "2025-2026",
      grainWeek: 34,
      stanceScore: 40,
      confidenceScore: 68,
      modelSource: "grok-4.20-reasoning",
      trigger: "weekly thesis anchor",
      evidence: "Strong crush demand and supportive futures verification.",
      dataFreshness: {
        cgc: "Week 34",
        prices: "2026-04-10",
      },
    });

    expect(row).toMatchObject({
      grain: "Canola",
      crop_year: "2025-2026",
      grain_week: 34,
      scan_type: "weekly_debate",
      stance_score: 40,
      conviction_pct: 68,
      recommendation: "PATIENCE",
      near_term: "bullish",
      medium_term: "bullish",
      model_source: "grok-4.20-reasoning",
    });
  });
});
