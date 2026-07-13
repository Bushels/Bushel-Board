import { describe, expect, it } from "vitest";
import type { XPulseWatchSummary } from "@/lib/queries/x-scout-runs";
import {
  boardStanceFromScore,
  buildTensionNote,
  computeWheatXSentiment,
  WHEAT_X_RANKING_NOTES,
} from "@/lib/thesis/x-pulse-sentiment";

function prairieBearishWatch(): XPulseWatchSummary {
  return {
    latestRun: {
      id: "run-1",
      runDate: "2026-06-24",
      runStartedAt: "2026-06-24T22:10:00Z",
      runFinishedAt: "2026-06-24T22:12:00Z",
      mode: "daily_pulse",
      runner: "manual",
      status: "success",
      promptVersion: "grok_x_scout_v1",
      artifactPath: "data/X Scout Runs/2026-06-24/daily_pulse-raw.json",
      artifactSha256: "abc",
      rawSignalCount: 2,
      acceptedSignalCount: 2,
      rejectedSignalCount: 0,
      priceSnapshotRequired: true,
      priceSnapshotStatus: "fresh",
      errorMessage: null,
      metadata: {},
      rejectionReasons: [],
    },
    topSignals: [
      {
        id: "sig-1",
        grain: "Wheat",
        postSummary: "New-crop prairie wheat basis under pressure with good supply chatter",
        postUrl: "https://x.com/SaskWheat/status/123",
        postAuthor: "SaskWheat",
        postDate: "2026-06-24T15:00:00Z",
        sentiment: "bearish",
        category: "basis",
        relevanceScore: 88,
        confidenceScore: 82,
        sourceCredTier: "tier3",
        primaryImpactGrain: "Wheat",
        affectedGrains: ["Wheat"],
        affectedRegions: ["Saskatchewan"],
        affectedDecisions: ["watch_basis"],
        seasonalPhase: "growing",
        stalenessClass: "fresh",
        needsOfficialVerification: true,
        corroboration: {
          sameClaimCount: 1,
          independentSources: [],
          officialSourceMatch: false,
        },
        signalMetadata: {},
      },
      {
        id: "sig-2",
        grain: "Wheat",
        postSummary: "Excess moisture delaying prairie wheat development in pockets",
        postUrl: "https://x.com/realagriculture/status/456",
        postAuthor: "realagriculture",
        postDate: "2026-06-24T14:00:00Z",
        sentiment: "bearish",
        category: "weather",
        relevanceScore: 80,
        confidenceScore: 75,
        sourceCredTier: "tier1",
        primaryImpactGrain: "Wheat",
        affectedGrains: ["Wheat", "Durum"],
        affectedRegions: ["Saskatchewan", "Alberta"],
        affectedDecisions: ["watch_yield_risk"],
        seasonalPhase: "growing",
        stalenessClass: "fresh",
        needsOfficialVerification: true,
        corroboration: {
          sameClaimCount: 2,
          independentSources: ["SaskWheat"],
          officialSourceMatch: false,
        },
        signalMetadata: {},
      },
    ],
  };
}

describe("computeWheatXSentiment", () => {
  it("returns quiet when there is no watch data", () => {
    const result = computeWheatXSentiment(null, -6);
    expect(result.lean).toBe("quiet");
    expect(result.signalCount).toBe(0);
    expect(result.tensionAlignment).toBe("quiet");
    expect(result.thematicWatches.length).toBeGreaterThan(0);
    expect(result.rankingNotes.scoreAuthority).toContain("watch-only");
  });

  it("filters non-wheat signals and ranks prairie bearish posts", () => {
    const watch = prairieBearishWatch();
    watch.topSignals.push({
      id: "canola-only",
      grain: "Canola",
      postSummary: "Canola crush chatter",
      postUrl: "https://x.com/example/status/1",
      postAuthor: "example",
      postDate: "2026-06-24T12:00:00Z",
      sentiment: "bullish",
      category: "price",
      relevanceScore: 90,
      confidenceScore: 90,
      sourceCredTier: "tier1",
      primaryImpactGrain: "Canola",
      affectedGrains: ["Canola"],
      affectedRegions: ["Saskatchewan"],
      affectedDecisions: [],
      seasonalPhase: null,
      stalenessClass: null,
      needsOfficialVerification: false,
      corroboration: { sameClaimCount: 0, independentSources: [], officialSourceMatch: false },
      signalMetadata: {},
    });

    const result = computeWheatXSentiment(watch, -8);
    expect(result.signalCount).toBe(2);
    expect(result.prairieSignalCount).toBe(2);
    expect(result.wheatSentimentScore).toBeLessThan(0);
    expect(result.lean).toMatch(/bearish/);
    expect(result.topSignals[0]?.handle).toBeTruthy();
    expect(result.dataProvenance.sourceTables).toEqual(["x_scout_runs", "x_market_signals"]);
    expect(result.dataProvenance.scoutMode).toBe("daily_pulse");
  });

  it("marks aligned tension when X and board agree", () => {
    const result = computeWheatXSentiment(prairieBearishWatch(), -10);
    expect(result.boardStance).toBe("bearish");
    expect(result.tensionAlignment).toBe("aligned");
    expect(result.tensionNote.toLowerCase()).toContain("align");
  });

  it("marks divergent tension when X and board disagree", () => {
    const result = computeWheatXSentiment(prairieBearishWatch(), 12);
    expect(result.boardStance).toBe("bullish");
    expect(result.tensionAlignment).toBe("divergent");
    expect(result.tensionNote.toLowerCase()).toContain("tension");
  });
});

describe("boardStanceFromScore / buildTensionNote", () => {
  it("maps board scores to stance buckets", () => {
    expect(boardStanceFromScore(null)).toBe("missing");
    expect(boardStanceFromScore(0)).toBe("balanced");
    expect(boardStanceFromScore(5)).toBe("bullish");
    expect(boardStanceFromScore(-5)).toBe("bearish");
  });

  it("keeps ranking notes desk-readable", () => {
    expect(WHEAT_X_RANKING_NOTES.weights.sourceTier).toBeCloseTo(0.25);
    expect(WHEAT_X_RANKING_NOTES.deskImpact.toLowerCase()).toContain("early warning");
  });

  it("handles quiet tension copy", () => {
    const quiet = buildTensionNote("quiet", "bearish", 0);
    expect(quiet.alignment).toBe("quiet");
  });
});
