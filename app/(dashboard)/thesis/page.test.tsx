import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ThesisPage from "./page";
import type { ThesisBoardData, ThesisBoardItem } from "@/lib/queries/thesis-board";

const { getThesisBoardDataMock } = vi.hoisted(() => ({
  getThesisBoardDataMock: vi.fn<() => Promise<ThesisBoardData>>(),
}));

vi.mock("@/lib/queries/thesis-board", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/thesis-board")>();
  return {
    ...actual,
    getThesisBoardData: getThesisBoardDataMock,
  };
});

const renderThesisPage = async (audit?: string) => {
  const Page = ThesisPage as unknown as (props: {
    searchParams?: Promise<{ audit?: string }>;
  }) => Promise<React.ReactElement>;
  const element = await Page({ searchParams: Promise.resolve(audit ? { audit } : {}) });
  return renderToStaticMarkup(element);
};

function item(overrides: Partial<ThesisBoardItem> = {}): ThesisBoardItem {
  return {
    id: "canada-canola",
    lane: "canada",
    name: "Canola",
    slug: "canola",
    cropYear: "2025-2026",
    grainWeek: 38,
    marketYear: null,
    packetGeneratedAt: "2026-05-08T18:00:00Z",
    stanceScore: 24,
    stanceLabel: "Bullish",
    confidence: "high",
    confidenceScore: 82,
    bullCase: "Bull case",
    bearCase: "Bear case",
    bullDrivers: [],
    bearDrivers: [],
    freshness: [],
    warnings: [],
    sourceCount: 2,
    strongSourceCount: 2,
    staleSourceCount: 0,
    optionalSourceCount: 0,
    vikingL2Chunks: [],
    ratingScorecard: {
      grain: "Canola",
      lane: "canada",
      period_anchor: "2025-2026:week:38",
      source_watermark: "2026-05-08T18:00:00Z",
      overall_score: 37.5,
      overall_label: "bull",
      confidence_score: 64,
      confidence_label: "medium",
      domains: [
        {
          domain: "demand",
          score: 60,
          weight: 0.25,
          weighted_score: 15,
          confidence: "high",
          freshness_status: "strong",
          sources: ["cgc_weekly_exports"],
          positive_evidence: ["exports above recent norm"],
          negative_evidence: [],
          blocked_claims: [],
        },
        {
          domain: "movement",
          score: -20,
          weight: 0.2,
          weighted_score: -4,
          confidence: "medium",
          freshness_status: "expected_lag",
          sources: ["producer_deliveries"],
          positive_evidence: [],
          negative_evidence: ["deliveries heavy versus disappearance"],
          blocked_claims: ["movement_without_current_week_cgc"],
        },
      ],
      contradictions: [],
      quality_adjustments: ["freshness:expected_lag:movement"],
      missing_required_sources: ["price"],
      llm_allowed_claims: ["exports above recent norm"],
      llm_blocked_claims: ["movement_without_current_week_cgc"],
    },
    ...overrides,
  };
}

function boardData(): ThesisBoardData {
  const canola = item();
  return {
    generatedAt: "2026-05-08T18:00:00Z",
    packetMode: "cached",
    cacheStatus: "fresh",
    sourceRunWatermark: "2026-05-08T18:00:00Z",
    latestAvailableSourceRunAt: "2026-05-08T18:00:00Z",
    cacheItemCount: 1,
    canadaItems: [canola],
    usItems: [],
    comparisonRows: [
      {
        grain: "Canola",
        canada: canola,
        us: null,
        status: "canada_only",
        statusLabel: "Canada only",
        readinessLabel: "Canada-first",
        readinessDetail: "US canola is not modeled in V1.",
        explanation: "Canada canola has source-backed thesis data.",
        strongestBullPoints: [],
        strongestBearPoints: [],
      },
    ],
    totals: {
      itemCount: 1,
      strongSourceCount: 2,
      staleSourceCount: 0,
      watchSourceInstanceCount: 0,
      uniqueWatchSourceCount: 0,
      optionalSourceCount: 0,
      blockerCount: 0,
    },
    sourceHealth: {
      strongSourceCount: 2,
      watchSourceInstanceCount: 0,
      uniqueWatchSourceCount: 0,
      optionalSourceCount: 0,
      uniqueWatchSources: [],
      optionalSources: [],
    },
  };
}

describe("ThesisPage scorecard audit mode", () => {
  beforeEach(() => {
    getThesisBoardDataMock.mockResolvedValue(boardData());
  });

  it("keeps scorecard audit details hidden on the normal thesis page", async () => {
    const html = await renderThesisPage();

    expect(html).not.toContain("Scorecard audit");
    expect(html).not.toContain("Overall rating: 37.5 / bull");
    expect(html).not.toContain("movement_without_current_week_cgc");
  });

  it("renders scorecard audit details only when audit=1 is present", async () => {
    const html = await renderThesisPage("1");

    expect(html).toContain("Scorecard audit");
    expect(html).toContain("Overall rating: 37.5 / bull");
    expect(html).toContain("Confidence: 64% / medium");
    expect(html).toContain("demand: 60 × 0.25");
    expect(html).toContain("movement: -20 × 0.2");
    expect(html).toContain("Quality adjustments: 1");
    expect(html).toContain("Missing required sources: price");
    expect(html).toContain("Blocked claims: movement_without_current_week_cgc");
  });
});
