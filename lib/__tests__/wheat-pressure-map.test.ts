import { describe, expect, it } from "vitest";

import { buildWheatPressureMapModel, WHEAT_SOURCE_REGISTRY } from "@/lib/thesis/wheat-pressure-map";
import type { ThesisBoardItem, ThesisComparisonRow } from "@/lib/queries/thesis-board";
import type { SourceRunSummary } from "@/lib/queries/source-runs";
import type { XPulseWatchSummary } from "@/lib/queries/x-scout-runs";

function wheatItem(overrides: Partial<ThesisBoardItem>): ThesisBoardItem {
  return {
    id: "wheat",
    lane: "canada",
    name: "Wheat",
    slug: "wheat",
    cropYear: "2025-2026",
    grainWeek: 42,
    marketYear: null,
    packetGeneratedAt: "2026-06-04T12:00:00Z",
    stanceScore: 0,
    stanceLabel: "Balanced",
    confidence: "medium",
    confidenceScore: 50,
    bullCase: "",
    bearCase: "",
    bullDrivers: [],
    bearDrivers: [],
    freshness: [],
    warnings: [],
    sourceCount: 0,
    strongSourceCount: 0,
    staleSourceCount: 0,
    optionalSourceCount: 0,
    vikingL2Chunks: [],
    ratingScorecard: {} as ThesisBoardItem["ratingScorecard"],
    ...overrides,
  };
}

function wheatRow(overrides: Partial<ThesisComparisonRow> = {}): ThesisComparisonRow {
  const canada = wheatItem({
    id: "canada-wheat",
    lane: "canada",
    stanceScore: 20,
    stanceLabel: "Lean bull",
    confidenceScore: 80,
  });
  const us = wheatItem({
    id: "us-wheat",
    lane: "us",
    cropYear: null,
    grainWeek: null,
    marketYear: 2025,
    stanceScore: -20,
    stanceLabel: "Lean bear",
    confidenceScore: 80,
  });

  return {
    grain: "Wheat",
    canada,
    us,
    status: "mixed",
    statusLabel: "Country split",
    readinessLabel: "Source-backed",
    readinessDetail: "Canada and US packets are present.",
    explanation: "CA and US Wheat disagree.",
    strongestBullPoints: [
      {
        country: "CA",
        tone: "bull",
        title: "Canada export pull visible",
        body: "CGC wheat exports are firm.",
        sourceName: "cgc_observations",
        confidence: "high",
        metricLabel: "+20 stance",
      },
    ],
    strongestBearPoints: [
      {
        country: "US",
        tone: "bear",
        title: "US crop condition adds supply pressure",
        body: "US good/excellent ratings are comfortable.",
        sourceName: "usda_crop_progress",
        confidence: "high",
        metricLabel: "76% good/excellent",
      },
    ],
    ...overrides,
  };
}

function sourceRun(overrides: Partial<SourceRunSummary> = {}): SourceRunSummary {
  return {
    sourceName: "producer_car_allocations",
    collectorName: "import-producer-cars",
    status: "success",
    sourcePeriodEnd: "2026-06-05",
    latestSourceLabel: "Week 42",
    finishedAt: "2026-06-05T20:00:00Z",
    rowsInserted: 10,
    rowsUpdated: 2,
    rowsSkipped: 0,
    errorMessage: null,
    ...overrides,
  };
}

function xPulseWatch(): XPulseWatchSummary {
  return {
    latestRun: {
      id: "run-1",
      runDate: "2026-06-05",
      runStartedAt: "2026-06-05T22:10:00Z",
      runFinishedAt: "2026-06-05T22:12:00Z",
      mode: "daily_pulse",
      runner: "grok_cli",
      status: "success",
      promptVersion: "grok_x_scout_v1",
      artifactPath: "scratch/x/run.json",
      artifactSha256: "abc",
      rawSignalCount: 4,
      acceptedSignalCount: 2,
      rejectedSignalCount: 2,
      priceSnapshotRequired: true,
      priceSnapshotStatus: "fresh",
      errorMessage: null,
      metadata: {},
      rejectionReasons: [],
    },
    topSignals: [
      {
        id: "signal-1",
        grain: "Wheat",
        postSummary: "Trusted Wheat logistics chatter.",
        postUrl: "https://x.com/trusted/status/1",
        postAuthor: "trusted",
        postDate: "2026-06-05T21:30:00Z",
        sentiment: "bullish",
        category: "logistics",
        relevanceScore: 82,
        confidenceScore: 75,
        sourceCredTier: "tier1",
        primaryImpactGrain: "Wheat",
        affectedGrains: ["Wheat"],
        affectedRegions: ["Canada"],
        affectedDecisions: ["watch_logistics"],
        seasonalPhase: "growing_season",
        stalenessClass: "same_day",
        needsOfficialVerification: true,
        corroboration: {
          sameClaimCount: 1,
          independentSources: ["SaskWheat"],
          officialSourceMatch: false,
        },
        signalMetadata: {},
      },
    ],
  };
}

function ratingScorecard(
  domains: ThesisBoardItem["ratingScorecard"]["domains"],
): ThesisBoardItem["ratingScorecard"] {
  return {
    grain: "Wheat",
    lane: "canada",
    period_anchor: "2025-2026:week:42",
    source_watermark: "2026-06-04T12:00:00Z",
    overall_score: domains.reduce((sum, domain) => sum + domain.weighted_score, 0),
    overall_label: "lean_bull",
    confidence_score: 80,
    confidence_label: "high",
    domains,
    contradictions: [],
    quality_adjustments: [],
    missing_required_sources: [],
    llm_allowed_claims: domains.flatMap((domain) => [...domain.positive_evidence, ...domain.negative_evidence]),
    llm_blocked_claims: domains.flatMap((domain) => domain.blocked_claims),
  };
}

describe("wheat pressure map", () => {
  it("builds a Wheat-only causal model from the comparison row", () => {
    const model = buildWheatPressureMapModel(wheatRow());

    expect(model).not.toBeNull();
    expect(model?.grain).toBe("Wheat");
    expect(model?.statusLabel).toBe("Country split");
    expect(model?.aggregateTone).toBe("mixed");
    expect(model?.aggregateScore).toBe(0);
    expect(model?.aggregateConfidence).toBe(80);
    expect(model?.statusDetail).toBe("Country split: CA +20 versus US -20.");
  });

  it("maps active Wheat drivers back to admitted impact factors", () => {
    const model = buildWheatPressureMapModel(wheatRow());

    expect(model?.driverNodes).toHaveLength(2);
    expect(model?.driverNodes[0]).toMatchObject({
      tone: "bull",
      country: "CA",
      sourceClass: "official_thesis_input",
      domain: "demand",
      factorLabel: "CGC exports, USDA export sales, and global tender pressure",
    });
    expect(model?.driverNodes[1]).toMatchObject({
      tone: "bear",
      country: "US",
      sourceClass: "official_thesis_input",
      domain: "supply",
      factorLabel: "Canada and US crop condition, acreage, WASDE supply, and stocks",
    });
  });

  it("maps Wheat COT and quarterly-stocks drivers instead of leaving them as watch-only", () => {
    const model = buildWheatPressureMapModel(
      wheatRow({
        strongestBullPoints: [
          {
            country: "US",
            tone: "bull",
            title: "Managed money net long",
            body: "Managed money is leaning supportive.",
            sourceName: "cftc_cot_positions",
            confidence: "medium",
            metricLabel: "23,602 net contracts",
          },
        ],
        strongestBearPoints: [
          {
            country: "US",
            tone: "bear",
            title: "Quarterly stocks heavier than expected",
            body: "Measured stocks are heavier.",
            sourceName: "usda_quarterly_stocks",
            confidence: "medium",
            metricLabel: "+5.2%",
          },
        ],
      }),
    );

    expect(model?.driverNodes[0]).toMatchObject({
      sourceClass: "official_thesis_input",
      domain: "positioning",
      factorLabel: "CFTC wheat positioning and fund crowding",
    });
    expect(model?.driverNodes[1]).toMatchObject({
      sourceClass: "official_thesis_input",
      domain: "supply",
      factorLabel: "Canada and US crop condition, acreage, WASDE supply, and stocks",
    });
  });

  it("keeps Wheat relationship links and class-safe parked gaps visible", () => {
    const model = buildWheatPressureMapModel(wheatRow());

    expect(model?.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "Corn", sourceClass: "price_context" }),
        expect.objectContaining({ target: "Black Sea/EU/Australia", sourceClass: "watch_only" }),
      ]),
    );
    expect(model?.parkedGaps).toContain("Spring Wheat mapping");
    expect(model?.parkedGaps).toContain("Winter Wheat mapping");
  });

  it("enumerates every known Wheat source lane even when it is not a top driver", () => {
    const model = buildWheatPressureMapModel(wheatRow());

    expect(model?.sourceNodes.map((source) => source.sourceId)).toEqual(
      WHEAT_SOURCE_REGISTRY.map((source) => source.sourceId),
    );
    expect(model?.graphCoverage.knownSourceCount).toBe(WHEAT_SOURCE_REGISTRY.length);
    expect(model?.sourceNodes.find((source) => source.sourceId === "grain_monitor_snapshots")).toMatchObject({
      scoreRole: "score_input",
      includedInPressure: true,
    });
    expect(model?.sourceNodes.find((source) => source.sourceId === "x_scout_runs")).toMatchObject({
      scoreRole: "watch_only",
      includedInPressure: false,
    });
  });

  it("uses all item drivers for graph evidence instead of the comparison row top-driver slice", () => {
    const canada = wheatItem({
      id: "canada-wheat",
      lane: "canada",
      name: "Wheat",
      bullDrivers: [
        {
          tone: "bull",
          title: "Export pull visible",
          body: "CGC flow is active.",
          sourceName: "cgc_observations",
          confidence: "high",
          metricLabel: "260 kt",
        },
        {
          tone: "bull",
          title: "Supply baseline tight",
          body: "Carryout is tight.",
          sourceName: "supply_disposition",
          confidence: "medium",
          metricLabel: "7.5% carryout",
        },
        {
          tone: "bull",
          title: "Logistics room available",
          body: "Terminal capacity is not binding.",
          sourceName: "grain_monitor_snapshots",
          confidence: "medium",
          metricLabel: "62% terminal capacity",
        },
        {
          tone: "bull",
          title: "Producer cars confirm movement",
          body: "Producer-car applications are active.",
          sourceName: "producer_car_allocations",
          confidence: "medium",
          metricLabel: "42 cars",
        },
      ],
    });

    const model = buildWheatPressureMapModel(
      wheatRow({
        canada,
        strongestBullPoints: [
          {
            country: "CA",
            tone: "bull",
            title: "Export pull visible",
            body: "CGC flow is active.",
            sourceName: "cgc_observations",
            confidence: "high",
            metricLabel: "260 kt",
          },
        ],
        strongestBearPoints: [],
      }),
    );

    expect(model?.driverNodes.map((driver) => driver.sourceName)).toEqual([
      "cgc_observations",
      "supply_disposition",
      "grain_monitor_snapshots",
      "producer_car_allocations",
    ]);
    expect(model?.factorNodes.find((factor) => factor.factorId === "wheat-logistics")).toMatchObject({
      activeDriverCount: 2,
      domain: "logistics",
    });
    expect(model?.sourceNodes.find((source) => source.sourceId === "supply_disposition")).toMatchObject({
      readiness: "active_driver",
      factorLabels: ["Canada Wheat supply-disposition baseline"],
    });
  });

  it("keeps X Pulse in the graph as watch-only evidence that cannot score", () => {
    const model = buildWheatPressureMapModel(wheatRow(), { xPulseWatch: xPulseWatch() });
    const xScoutNode = model?.sourceNodes.find((source) => source.sourceId === "x_scout_runs");
    const xSignalNode = model?.sourceNodes.find((source) => source.sourceId === "x_market_signals");
    const xEdges = model?.graphEdges.filter((edge) => edge.from === xScoutNode?.id || edge.from === xSignalNode?.id);

    expect(xScoutNode).toMatchObject({
      readiness: "watch_only",
      scoreRole: "watch_only",
      includedInPressure: false,
    });
    expect(xSignalNode).toMatchObject({
      readiness: "watch_only",
      scoreRole: "watch_only",
      includedInPressure: false,
    });
    expect(xEdges?.length).toBeGreaterThan(0);
    expect(xEdges?.every((edge) => edge.includedInPressure === false)).toBe(true);
    expect(model?.graphCoverage.xPulseAcceptedWheatCount).toBe(1);
  });

  it("uses source-run proof for source lanes outside the active row drivers", () => {
    const model = buildWheatPressureMapModel(wheatRow(), {
      sourceRuns: [
        sourceRun({ sourceName: "producer_car_allocations" }),
        sourceRun({ sourceName: "grain_price_intraday", collectorName: "import-barchart-canola-intraday" }),
      ],
    });

    expect(model?.sourceNodes.find((source) => source.sourceId === "producer_car_allocations")).toMatchObject({
      readiness: "available",
      latestRunStatus: "success",
    });
    expect(model?.sourceNodes.find((source) => source.sourceId === "grain_price_intraday")).toMatchObject({
      readiness: "available",
      scoreRole: "bounded_context",
    });
  });

  it("attaches current packet contribution math to admitted Wheat sources and factors", () => {
    const canada = wheatItem({
      id: "canada-wheat",
      lane: "canada",
      name: "Wheat",
      ratingScorecard: ratingScorecard([
        {
          domain: "demand",
          score: 60,
          weight: 0.25,
          weighted_score: 15,
          confidence: "high",
          freshness_status: "strong",
          sources: ["cgc_observations"],
          metrics: [
            {
              source: "cgc_observations",
              label: "Current-week export/delivery ratio",
              value: "47.0%",
              numericValue: 47,
              unit: "pct",
            },
          ],
          positive_evidence: ["CGC wheat exports are firm."],
          negative_evidence: [],
          blocked_claims: [],
        },
        {
          domain: "price",
          score: -20,
          weight: 0.08,
          weighted_score: -1.6,
          confidence: "medium",
          freshness_status: "strong",
          sources: ["grain_prices"],
          metrics: [
            {
              source: "grain_prices",
              label: "Futures change",
              value: "-0.8%",
              numericValue: -0.8,
              unit: "pct",
            },
          ],
          positive_evidence: [],
          negative_evidence: ["Fresh futures pressure is visible."],
          blocked_claims: [],
        },
        {
          domain: "demand",
          score: 40,
          weight: 0.1,
          weighted_score: 4,
          confidence: "low",
          freshness_status: "watch",
          sources: ["unknown_social_source"],
          positive_evidence: ["Unmapped chatter should not count."],
          negative_evidence: [],
          blocked_claims: [],
        },
      ]),
    });

    const model = buildWheatPressureMapModel(
      wheatRow({
        canada,
        us: null,
        status: "canada_only",
        statusLabel: "Canada only",
        strongestBullPoints: [],
        strongestBearPoints: [],
      }),
    );

    expect(model?.graphCoverage.packetContributionCount).toBe(3);
    expect(model?.graphCoverage.scoredPacketContributionCount).toBe(2);
    expect(model?.sourceNodes.find((source) => source.sourceId === "cgc_observations")).toMatchObject({
      totalWeightedScore: 15,
      packetContributions: [
        expect.objectContaining({
          country: "CA",
          domain: "demand",
          weightedScore: 15,
          metrics: [
            expect.objectContaining({
              label: "Current-week export/delivery ratio",
              value: "47.0%",
            }),
          ],
        }),
      ],
    });
    expect(model?.factorNodes.find((factor) => factor.factorId === "wheat-export-demand")).toMatchObject({
      totalWeightedScore: 15,
      packetContributions: [expect.objectContaining({ sourceIds: ["cgc_observations"] })],
    });
    expect(model?.sourceNodes.find((source) => source.sourceId === "grain_prices")).toMatchObject({
      totalWeightedScore: -1.6,
      packetContributions: [expect.objectContaining({ domain: "price", weightedScore: -1.6 })],
    });
    expect(model?.sourceNodes.some((source) =>
      source.packetContributions.some((contribution) => contribution.sourceIds.includes("unknown_social_source")),
    )).toBe(false);
  });

  it("connects source lanes to factors and factors to the final Wheat pressure node", () => {
    const model = buildWheatPressureMapModel(wheatRow());

    expect(model?.graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "source_to_factor",
          fromLabel: "USDA Quarterly Grain Stocks",
          toLabel: "Canada and US crop condition, acreage, WASDE supply, and stocks",
          includedInPressure: true,
        }),
        expect.objectContaining({
          kind: "source_to_factor",
          fromLabel: "Raw WASDE/PSD world balance",
          toLabel: "Black Sea, EU, Australia, and other export-origin competition",
          includedInPressure: false,
        }),
        expect.objectContaining({
          kind: "factor_to_score",
          fromLabel: "Canadian port, rail, terminal, and producer-car execution",
          toLabel: "Wheat Bull/Bear pressure",
          includedInPressure: true,
        }),
      ]),
    );
  });

  it("does not build the Wheat artifact for other grain rows", () => {
    expect(buildWheatPressureMapModel({ ...wheatRow(), grain: "Canola" })).toBeNull();
  });
});
