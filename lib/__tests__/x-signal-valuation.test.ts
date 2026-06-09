import { describe, expect, it } from "vitest";
import { groupAllowedHandles, getSourceCredTier } from "@/lib/x-api/trusted-accounts";
import {
  classifySeasonalPhase,
  classifyStaleness,
  scoreXSignalImpact,
} from "@/lib/x-api/x-signal-valuation";
import type { XScoutSignal } from "@/lib/x-api/x-scout-contract";

const wheatSignal: XScoutSignal = {
  source_url: "https://x.com/LeftFieldCR/status/123",
  post_id: "123",
  handle: "LeftFieldCR",
  posted_at: "2026-06-01T15:00:00Z",
  raw_quote: "Planting progress is lagging.",
  summary: "Prairie spring wheat planting progress is lagging badly.",
  primary_grain: "Wheat",
  affected_grains: ["Wheat", "Durum"],
  affected_regions: ["Saskatchewan", "Alberta"],
  category: "weather",
  direction: "bullish",
  time_sensitivity: "same_day",
  seasonal_phase: "planting",
  why_it_matters: "Delayed planting can tighten yield expectations.",
  confidence: 0.72,
  needs_official_verification: true,
  claimed_numbers: [],
};

describe("x signal valuation", () => {
  it("groups trusted handles into xAI-safe batches of 20 or fewer", () => {
    const groups = groupAllowedHandles();

    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((group) => group.length <= 20)).toBe(true);
    expect(getSourceCredTier("@LeftFieldCR")).toBe("tier1");
    expect(getSourceCredTier("SaskWheat")).toBe("tier3");
  });

  it("scores a fresh Tier 1 planting signal above the display gate", () => {
    const valuation = scoreXSignalImpact(wheatSignal, "2026-06-01", "fresh");

    expect(valuation.relevanceScore).toBeGreaterThanOrEqual(75);
    expect(valuation.stalenessClass).toBe("same_day");
    expect(valuation.sourceTier).toBe("tier1");
    expect(valuation.seasonalPhase).toBe("planting");
    expect(valuation.impactBreakdown.supply).toBeGreaterThan(0);
  });

  it("classifies stale high-sensitivity chatter separately from structural context", () => {
    expect(classifyStaleness("2026-05-20T00:00:00Z", "2026-06-01", "weather")).toBe("stale");
    expect(classifyStaleness("2026-05-20T00:00:00Z", "2026-06-01", "policy")).toBe("week_context");
    expect(classifySeasonalPhase("elevators report basis bids firming")).toBe("marketing");
  });
});
