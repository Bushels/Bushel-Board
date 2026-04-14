import { describe, expect, it } from "vitest";

import {
  formatRecommendationLabel,
  getUsMarketBySlug,
  toUsMarketSlug,
} from "@/lib/constants/us-markets";
import {
  normalizeUsCropYear,
  normalizeUsThesis,
} from "@/lib/us-thesis-normalization";

describe("US market config helpers", () => {
  it("maps market names and slugs consistently", () => {
    expect(toUsMarketSlug("Soybeans")).toBe("soybeans");
    expect(getUsMarketBySlug("wheat")?.name).toBe("Wheat");
  });

  it("formats recommendation labels for UI", () => {
    expect(formatRecommendationLabel("HOLD_FIRM")).toBe("HOLD FIRM");
    expect(formatRecommendationLabel(null)).toBe("WATCH");
  });
});

describe("normalizeUsCropYear", () => {
  it("uses long crop-year format", () => {
    expect(normalizeUsCropYear(2025)).toBe("2025-2026");
  });
});

describe("normalizeUsThesis", () => {
  it("normalizes score, recommendation, crop year, and signals", () => {
    const normalized = normalizeUsThesis(
      {
        market: "Wrong Market",
        crop_year: "2025/26",
        market_year: 9999,
        stance_score: 12.7,
        confidence_score: 82.3,
        recommendation: "hold firm",
        initial_thesis: "  Soybeans are tightening   on better demand. ",
        bull_case: "  Crush is helping. ",
        bear_case: "  South America is still heavy. ",
        final_assessment: "  Hold for now. ",
        key_signals: [
          {
            signal: "Bullish",
            title: " Demand pulse ",
            body: "  Export demand improved. ",
            source: " USDA ",
          },
        ],
      },
      { market: "Soybeans", marketYear: 2025 },
    );

    expect(normalized).toMatchObject({
      market: "Soybeans",
      crop_year: "2025-2026",
      market_year: 2025,
      stance_score: 13,
      confidence_score: 82,
      recommendation: "HOLD_FIRM",
      initial_thesis: "Soybeans are tightening on better demand.",
    });

    expect(normalized.key_signals[0]).toMatchObject({
      signal: "bullish",
      title: "Demand pulse",
      body: "Export demand improved.",
      source: "USDA",
    });
  });

  it("falls back to mapped recommendation and default signal when model output is weak", () => {
    const normalized = normalizeUsThesis(
      {
        stance_score: -44,
        confidence_score: "not-a-number",
        recommendation: "unknown",
        initial_thesis: "",
        bull_case: "",
        bear_case: "",
        final_assessment: "",
        key_signals: [],
      },
      { market: "Corn", marketYear: 2025 },
    );

    expect(normalized.recommendation).toBe("SCALE_IN");
    expect(normalized.confidence_score).toBe(50);
    expect(normalized.key_signals).toHaveLength(1);
    expect(normalized.key_signals[0]?.signal).toBe("watch");
  });
});
