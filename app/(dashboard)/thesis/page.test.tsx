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
  const canadaWheat = item({
    id: "canada-wheat",
    name: "Wheat",
    slug: "wheat",
    stanceScore: 20,
    confidenceScore: 80,
  });
  const usWheat = item({
    id: "us-wheat",
    lane: "us",
    name: "Wheat",
    slug: "wheat",
    cropYear: null,
    grainWeek: null,
    marketYear: 2025,
    stanceScore: -20,
    stanceLabel: "Bearish",
    confidenceScore: 80,
  });
  return {
    generatedAt: "2026-05-08T18:00:00Z",
    packetMode: "cached",
    cacheStatus: "fresh",
    sourceRunWatermark: "2026-05-08T18:00:00Z",
    latestAvailableSourceRunAt: "2026-05-08T18:00:00Z",
    cacheItemCount: 1,
    sourceRunContext: {
      canadaCropProgress: {
        prairieWeekStatus: null,
        finishedAt: "2026-05-08T18:00:00Z",
        sourcePeriodEnd: "2026-05-08",
        latestSourceLabel: null,
        loadedProvinces: [],
        missingProvinces: [],
        status: "success",
      },
    },
    canadaItems: [canola, canadaWheat],
    usItems: [usWheat],
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
        strongestBullPoints: [
          {
            country: "CA",
            tone: "bull",
            title: "Export pull visible",
            body: "Exports are above the recent run rate.",
            sourceName: "cgc_observations",
            confidence: "high",
            metricLabel: "260 kt",
          },
        ],
        strongestBearPoints: [],
      },
      {
        grain: "Wheat",
        canada: canadaWheat,
        us: usWheat,
        status: "mixed",
        statusLabel: "Country split",
        readinessLabel: "Source-backed",
        readinessDetail: "Canada and US packets are present.",
        explanation: "CA +20 Bullish; US -20 Bearish.",
        strongestBullPoints: [
          {
            country: "CA",
            tone: "bull",
            title: "Canada export basis stays firm",
            body: "Canada wheat flow is firmer than the US wheat packet.",
            sourceName: "cgc_observations",
            confidence: "high",
            metricLabel: "+20 stance",
          },
        ],
        strongestBearPoints: [
          {
            country: "US",
            tone: "bear",
            title: "Crop condition adds supply pressure",
            body: "Good crop ratings are keeping supply pressure in the US packet.",
            sourceName: "usda_crop_progress",
            confidence: "high",
            metricLabel: "76% good/excellent",
          },
        ],
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

  it("surfaces split-market top takeaways before weaker one-country reads", async () => {
    const html = await renderThesisPage();

    expect(html).toContain(
      "The strongest split-market bull pressure is Wheat at +20 (CA, 80% confidence).",
    );
    expect(html).toContain("Lead evidence: CA Canada export basis stays firm (+20 stance / CGC weekly grain stats).");
    expect(html).toContain(
      "The strongest split-market bear pressure is Wheat at -20 (US, 80% confidence).",
    );
    expect(html).toContain(
      "Lead evidence: US Crop condition adds supply pressure (76% good/excellent / USDA Crop Progress).",
    );
  });

  it("labels one-country top takeaways instead of calling them full Canada-US reads", async () => {
    const data = boardData();
    getThesisBoardDataMock.mockResolvedValue({
      ...data,
      comparisonRows: data.comparisonRows.filter((row) => row.grain === "Canola"),
    });
    const html = await renderThesisPage();

    expect(html).toContain(
      "The strongest one-country bull read is Canola at +24 (CA only, 82% confidence).",
    );
    expect(html).toContain("Lead evidence: CA Export pull visible (260 kt / CGC weekly grain stats).");
  });

  it("shows row action cues for one-country and split-market reads", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("One-country read");
    expect(html).toContain("Use as Canada context only; no matching US packet is modeled in V1.");
    expect(html).toContain("Open first");
    expect(html).toContain("Canada and US disagree; read both lead drivers before relying on this row.");
    expect(html).not.toContain("before changing a pricing plan");
  });

  it("labels partial Prairie crop-progress packages without calling source freshness broken", async () => {
    const data = boardData();
    getThesisBoardDataMock.mockResolvedValue({
      ...data,
      sourceRunContext: {
        canadaCropProgress: {
          prairieWeekStatus: "partial_prairie_week",
          finishedAt: "2026-05-31T15:10:06Z",
          sourcePeriodEnd: "2026-05-26",
          latestSourceLabel: "MB + SK loaded; AB pending",
          loadedProvinces: ["MB", "SK"],
          missingProvinces: [],
          status: "partial",
        },
      },
    });
    const html = await renderThesisPage();

    expect(html).toContain("Source health clean; Prairie crop-progress package is partial");
    expect(html).toContain(
      "Rendered public source groups are clean, but Canada crop progress reports partial prairie week.",
    );
    expect(html).toContain("0 stale, empty, lagged, or broken freshness rows.");
    expect(html).toContain("Prairie completeness is partial and shown below.");
    expect(html).toContain("Prairie crop progress: partial prairie week; loaded MB+SK (MB + SK loaded; AB pending)");
  });

  it("puts source health and the farmer read before KPI summary cards", async () => {
    const html = await renderThesisPage();

    expect(html.indexOf("Source health is clean for this board")).toBeLessThan(html.indexOf("Top takeaway"));
    expect(html.indexOf("Top takeaway")).toBeLessThan(html.indexOf("Current snapshot"));
    expect(html.indexOf("Current snapshot")).toBeLessThan(html.indexOf("Source Packets"));
    expect(html.indexOf("Top takeaway")).toBeLessThan(html.indexOf("Source Packets"));
    expect(html.indexOf("Top takeaway")).toBeLessThan(html.indexOf("All Grains at a Glance"));
  });

  it("keeps snapshot provenance compact ahead of the farmer read", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Current snapshot");
    expect(html).toContain("Direct packet data; no archive fallback.");
    expect(html).not.toContain("No retired AI archive fallback is used on this page.");
    expect(html).not.toContain("Stale, empty, lagged, and proxy source lanes stay visible.");
    expect(html.indexOf("Source health is clean for this board")).toBeLessThan(html.indexOf("Top takeaway"));
    expect(html.indexOf("Top takeaway")).toBeLessThan(html.indexOf("Current snapshot"));
  });

  it("summarizes priority rows in the top takeaway", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Start with: Wheat (country split), Canola (Canada-only read).");
    expect(html).not.toContain("Open first: Wheat (Open first)");
  });

  it("keeps quick-scan legend and takeaway badges tied to visible row statuses", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Country split = evidence disagrees");
    expect(html).toContain("One-country = V1 has only CA or US modeled");
    expect(html).not.toContain("Mapping needed = no class-safe source yet");
    expect(html).not.toContain("0 mapping gaps");
  });

  it("scales stance bar length by confidence", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("CA confidence-scaled stance score 24");
    expect(html).toContain('data-confidence-scaled-width="9.84%"');
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
