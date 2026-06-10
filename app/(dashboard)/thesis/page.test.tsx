import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ThesisPage from "./page";
import type { ThesisBoardData, ThesisBoardItem } from "@/lib/queries/thesis-board";
import type { XPulseWatchSummary } from "@/lib/queries/x-scout-runs";
import type { SourceRunSummary } from "@/lib/queries/source-runs";
import type { DailyThesisUpdateSummary } from "@/lib/queries/daily-thesis-updates";
import type { Track54ReadinessSnapshot } from "@/lib/queries/track54-readiness";
import {
  PUBLIC_ADVICE_FORBIDDEN_TERMS,
  PUBLIC_BOARD_FORBIDDEN_TERMS,
  findPublicForbiddenTerms,
} from "@/lib/public-copy-guardrails";

const {
  getThesisBoardDataMock,
  getXPulseWatchSummaryMock,
  getLatestSourceRunSummariesMock,
  getLatestDailyThesisUpdatesMock,
  getLocalTrack54ReadinessSnapshotMock,
} = vi.hoisted(() => ({
  getThesisBoardDataMock: vi.fn<() => Promise<ThesisBoardData>>(),
  getXPulseWatchSummaryMock: vi.fn<() => Promise<XPulseWatchSummary>>(),
  getLatestSourceRunSummariesMock: vi.fn<() => Promise<SourceRunSummary[]>>(),
  getLatestDailyThesisUpdatesMock: vi.fn<() => Promise<DailyThesisUpdateSummary[]>>(),
  getLocalTrack54ReadinessSnapshotMock: vi.fn<() => Promise<Track54ReadinessSnapshot | null>>(),
}));

vi.mock("@/lib/queries/thesis-board", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/thesis-board")>();
  return {
    ...actual,
    getThesisBoardData: getThesisBoardDataMock,
  };
});

vi.mock("@/lib/queries/x-scout-runs", () => ({
  getXPulseWatchSummary: getXPulseWatchSummaryMock,
}));

vi.mock("@/lib/queries/source-runs", () => ({
  getLatestSourceRunSummaries: getLatestSourceRunSummariesMock,
}));

vi.mock("@/lib/queries/daily-thesis-updates", () => ({
  getLatestDailyThesisUpdates: getLatestDailyThesisUpdatesMock,
}));

vi.mock("@/lib/queries/track54-readiness", () => ({
  getLocalTrack54ReadinessSnapshot: getLocalTrack54ReadinessSnapshotMock,
}));

const renderThesisPage = async (audit?: string) => {
  const Page = ThesisPage as unknown as (props: {
    searchParams?: Promise<{ audit?: string }>;
  }) => Promise<React.ReactElement>;
  const element = await Page({ searchParams: Promise.resolve(audit ? { audit } : {}) });
  return renderToStaticMarkup(element);
};

function textFromMarkup(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function renderedForbiddenHits(html: string, terms: readonly string[]): string[] {
  return findPublicForbiddenTerms(textFromMarkup(html), terms);
}

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

function freshnessRow(
  sourceName: string,
  freshnessStatus: string,
  latestPeriodEnd = "2026-06-02",
): ThesisBoardItem["freshness"][number] {
  return {
    sourceName,
    sourceLane: null,
    expectedCadence: "weekly",
    latestPeriod: latestPeriodEnd,
    latestPeriodEnd,
    rowsAvailable: 12,
    freshnessStatus,
    thesisUse: "board input",
    lastSuccessAt: "2026-06-02T14:42:00Z",
    lastRunStatus: "success",
    actionHint: null,
  };
}

function sourceRun(overrides: Partial<SourceRunSummary> = {}): SourceRunSummary {
  return {
    sourceName: "grain_monitor_snapshots",
    collectorName: "import-grain-monitor-weekly",
    status: "success",
    sourcePeriodEnd: "2026-05-29",
    latestSourceLabel: "Week 42",
    finishedAt: "2026-06-01T20:17:00Z",
    rowsInserted: 7,
    rowsUpdated: 3,
    rowsSkipped: 0,
    errorMessage: null,
    ...overrides,
  };
}

function dailyUpdate(overrides: Partial<DailyThesisUpdateSummary> = {}): DailyThesisUpdateSummary {
  return {
    side: "canada",
    market: "Wheat",
    cropYear: "2025-2026",
    grainWeek: 42,
    marketYear: null,
    recordedAt: "2026-06-01T22:28:00Z",
    stanceScore: 19,
    confidenceScore: 82,
    recommendation: "WATCH",
    trigger: "Daily Thesis Review - official data, prices, and X Pulse",
    modelSource: "claude-opus-soft-review",
    signalNote: "X Pulse Watch (tier1): Policy chatter is weighing on prairie wheat basis.",
    reasoning:
      "Accepted X Pulse evidence is source-linked and bounded to a small daily trajectory tick.",
    stanceDelta: -1,
    confidenceDelta: 2,
    priorStance: 20,
    priorConfidence: 80,
    newStance: 19,
    newConfidence: 82,
    sourcePostUrl: "https://x.com/trusted/status/1",
    sourceScoutRunId: "run-1",
    affectedDecisions: ["watch_basis"],
    allowedClaims: ["Source URL present."],
    blockedClaims: [],
    needsOfficialVerification: false,
    corroboration: {
      sameClaimCount: 1,
      independentSources: ["SaskWheat"],
      officialSourceMatch: false,
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
    ratingScorecard: {
      grain: "Wheat",
      lane: "canada",
      period_anchor: "2025-2026:week:42",
      source_watermark: "2026-06-04T12:00:00Z",
      overall_score: 20.4,
      overall_label: "lean_bull",
      confidence_score: 80,
      confidence_label: "high",
      domains: [
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
          positive_evidence: ["CGC wheat exports are firm against producer deliveries."],
          negative_evidence: [],
          blocked_claims: [],
        },
        {
          domain: "supply",
          score: 30,
          weight: 0.18,
          weighted_score: 5.4,
          confidence: "medium",
          freshness_status: "expected_lag",
          sources: ["supply_disposition"],
          positive_evidence: ["Canada supply-disposition carryout is tight."],
          negative_evidence: [],
          blocked_claims: [],
        },
      ],
      contradictions: [],
      quality_adjustments: [],
      missing_required_sources: [],
      llm_allowed_claims: ["CGC wheat exports are firm against producer deliveries."],
      llm_blocked_claims: [],
    },
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
    ratingScorecard: {
      grain: "Wheat",
      lane: "us",
      period_anchor: "2025:week:42",
      source_watermark: "2026-06-04T12:00:00Z",
      overall_score: -19.8,
      overall_label: "lean_bear",
      confidence_score: 80,
      confidence_label: "high",
      domains: [
        {
          domain: "weather",
          score: -30,
          weight: 0.16,
          weighted_score: -4.8,
          confidence: "high",
          freshness_status: "strong",
          sources: ["usda_crop_progress"],
          metrics: [
            {
              source: "usda_crop_progress",
              label: "Good/excellent",
              value: "76.0%",
              numericValue: 76,
              unit: "pct",
            },
          ],
          positive_evidence: [],
          negative_evidence: ["US crop condition adds supply cushion."],
          blocked_claims: [],
        },
        {
          domain: "supply",
          score: -25,
          weight: 0.24,
          weighted_score: -6,
          confidence: "medium",
          freshness_status: "strong",
          sources: ["usda_wasde_mapped", "usda_quarterly_stocks"],
          positive_evidence: [],
          negative_evidence: ["WASDE and quarterly stocks lean heavier."],
          blocked_claims: [],
        },
      ],
      contradictions: [],
      quality_adjustments: [],
      missing_required_sources: [],
      llm_allowed_claims: ["US crop condition adds supply cushion."],
      llm_blocked_claims: [],
    },
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

function xPulseWatch(): XPulseWatchSummary {
  return {
    latestRun: {
      id: "run-1",
      runDate: "2026-06-01",
      runStartedAt: "2026-06-01T22:10:00Z",
      runFinishedAt: "2026-06-01T22:12:00Z",
      mode: "daily_pulse",
      runner: "grok_cli",
      status: "success",
      promptVersion: "grok_x_scout_v1",
      artifactPath: "data/X Scout Runs/2026-06-01/daily_pulse-raw.json",
      artifactSha256: "abc123",
      rawSignalCount: 5,
      acceptedSignalCount: 1,
      rejectedSignalCount: 4,
      priceSnapshotRequired: true,
      priceSnapshotStatus: "fresh",
      errorMessage: null,
      metadata: {
        rejection_reasons: ["missing_or_invalid_source_url", "unsupported_grain:Rye"],
      },
      rejectionReasons: ["missing_or_invalid_source_url", "unsupported_grain:Rye"],
    },
    topSignals: [
      {
        id: "signal-1",
        grain: "Canola",
        postSummary: "Canola basis chatter is picking up around Saskatchewan delivery slots.",
        postUrl: "https://x.com/trusted/status/1",
        postAuthor: "trusted",
        postDate: "2026-06-01T21:40:00Z",
        sentiment: "bullish",
        category: "basis",
        relevanceScore: 92,
        confidenceScore: 83,
        sourceCredTier: "tier1",
        primaryImpactGrain: "Canola",
        affectedGrains: ["Canola"],
        affectedRegions: ["Saskatchewan"],
        affectedDecisions: ["watch_basis"],
        seasonalPhase: "planting",
        stalenessClass: "same_day",
        needsOfficialVerification: false,
        corroboration: {
          sameClaimCount: 1,
          independentSources: ["SaskWheat"],
          officialSourceMatch: false,
        },
        signalMetadata: {
          allowed_claims: ["Source URL present."],
          blocked_claims: [],
        },
      },
    ],
  };
}

function readinessSnapshot(overrides: Partial<Track54ReadinessSnapshot> = {}): Track54ReadinessSnapshot {
  return {
    generatedAt: "2026-06-02T20:39:00.884Z",
    reportAgeHours: 0.25,
    reportFreshEnough: true,
    overallStatus: "blocked_by_artifact_gates",
    productionWritesEnabled: false,
    humanApprovalRequiredBeforeWrites: true,
    browserSmokeClean: true,
    browserSmokeProof: {
      checked: true,
      ok: true,
      generatedAt: "2026-06-02T20:30:00.000Z",
      ageHours: 0.15,
      freshEnough: true,
    },
    grokRunner: null,
    modeGates: [
      {
        mode: "daily_pulse",
        readinessStatus: "blocked_by_artifact_gates",
        reviewVerdict: "insufficient_artifacts",
        promotionStatus: "not_ready",
        artifactDaysFound: 1,
        requiredArtifactDays: 5,
        acceptedSignalCount: 3,
        acceptedDecisionGradeCount: 2,
        nextEligibleRunDates: ["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
        promotionBlockers: ["Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1."],
      },
      {
        mode: "friday_deep",
        readinessStatus: "blocked_by_artifact_gates",
        reviewVerdict: "insufficient_artifacts",
        promotionStatus: "not_ready",
        artifactDaysFound: 0,
        requiredArtifactDays: 1,
        acceptedSignalCount: 0,
        acceptedDecisionGradeCount: 0,
        nextEligibleRunDates: ["2026-06-05"],
        promotionBlockers: ["Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0."],
      },
    ],
    completionBlockers: [
      "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
    ],
    nextActions: ["Keep production Grok write routines disabled."],
    ...overrides,
  };
}

describe("ThesisPage scorecard audit mode", () => {
  beforeEach(() => {
    vi.useRealTimers();
    getThesisBoardDataMock.mockResolvedValue(boardData());
    getXPulseWatchSummaryMock.mockResolvedValue(xPulseWatch());
    getLatestSourceRunSummariesMock.mockResolvedValue([]);
    getLatestDailyThesisUpdatesMock.mockResolvedValue([]);
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(null);
  });

  it("keeps scorecard audit details hidden in thesis audit mode", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Wheat Pressure Map");
    expect(html).not.toContain("Scorecard audit");
    expect(html).not.toContain("Impact Map audit");
    expect(html).not.toContain("Grain Impact Graph");
    expect(html).not.toContain("3D Relationship Constellation");
    expect(html).not.toContain("Data coverage matrix");
    expect(html).not.toContain("Next source admissions");
    expect(html).not.toContain("Market response rules");
    expect(html).not.toContain("Track 54 production gate");
    expect(html).not.toContain("Overall rating: 37.5 / bull");
    expect(html).not.toContain("movement_without_current_week_cgc");
    expect(html).not.toContain("Soybeans and soy products are the main public cross-market context for canola.");
  });

  it("keeps the normal farmer board clear of shared public forbidden terms", async () => {
    const html = await renderThesisPage();

    expect(renderedForbiddenHits(html, PUBLIC_BOARD_FORBIDDEN_TERMS)).toEqual([]);
  });

  it("keeps audit mode clear of shared public advice terms", async () => {
    const html = await renderThesisPage("1");

    expect(renderedForbiddenHits(html, PUBLIC_ADVICE_FORBIDDEN_TERMS)).toEqual([]);
  });

  it("renders the Wheat pressure map from active source-backed drivers", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Active Wheat evidence, relationship links, and guardrails");
    expect(html).toContain("Source data lanes");
    expect(html).toContain("Causal factors");
    expect(html).toContain("All graph links");
    expect(html).toContain("Packet contributions");
    expect(html).toContain("Current packet contribution +15");
    expect(html).toContain("CA demand: +15 (+60 x 25%)");
    expect(html).toContain("Current-week export/delivery ratio: 47.0%");
    expect(html).toContain("US weather: -4.8 (-30 x 16%)");
    expect(html).toContain("Good/excellent: 76.0%");
    expect(html).toContain("CGC Producer Cars");
    expect(html).toContain("Canada Grain Monitor");
    expect(html).toContain("Canada supply-disposition table");
    expect(html).toContain("Raw WASDE/PSD world balance");
    expect(html).toContain("Intraday grain-price quotes");
    expect(html).toContain("X Pulse scout proof");
    expect(html).toContain("watch-only links");
    expect(html).toContain("Canada export basis stays firm");
    expect(html).toContain("CGC weekly grain stats");
    expect(html).toContain("Linked factor: CGC exports, USDA export sales, and global tender pressure");
    expect(html).toContain("Crop condition adds supply pressure");
    expect(html).toContain("Linked factor: Canada and US crop condition, acreage, WASDE supply, and stocks");
    expect(html).toContain("Relationship links");
    expect(html).toContain("Corn");
    expect(html).toContain("Feed wheat competes with corn when spreads narrow.");
    expect(html).toContain("Black Sea/EU/Australia");
    expect(html).toContain("Global origins can cap wheat even when local data is supportive.");
    expect(html).toContain("Final read");
    expect(html).toContain("Country split: CA +20 versus US -20.");
    expect(html).toContain("Parked Wheat gaps");
    expect(html).toContain("class-specific Wheat mapping");
    expect(html).not.toContain("Spring Wheat mapping");
    expect(html).not.toContain("Winter Wheat mapping");
  });

  it("shows sanitized Track 54 production gate status in audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot());

    const html = await renderThesisPage("1");

    expect(html).toContain("Track 54 production gate");
    expect(html).toContain("Audit-only operator view for whether daily Bull/Bear write mode is ready to promote.");
    expect(html).toContain("blocked by artifact gates");
    expect(html).toContain("Production writes");
    expect(html).toContain("disabled");
    expect(html).toContain("Human approval is required before");
    expect(html).toContain("Browser proof");
    expect(html).toContain("clean");
    expect(html).toContain("Completion blockers");
    expect(html).toContain("daily_pulse");
    expect(html).toContain("1/5 artifact days");
    expect(html).toContain("Accepted 3; decision-grade 2.");
    expect(html).toContain("friday_deep");
    expect(html).toContain("0/1 artifact days");
    expect(html).toContain("Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.");
    expect(html).not.toContain("scratch/track54-readiness");
    expect(html).not.toContain("artifact_sha256");
  });

  it("labels stale Track 54 gate counts as last-known proof in audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      reportAgeHours: 8.5,
      reportFreshEnough: false,
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("Track 54 production gate");
    expect(html).toContain("readiness report stale");
    expect(html).toContain("Readiness report is stale; gate counts are last-known proof, not current proof.");
    expect(html).toContain("Accepted 3; decision-grade 2.");
    expect(html).not.toContain("scratch/track54-readiness");
    expect(html).not.toContain("artifact_sha256");
  });

  it("keeps stale ready-for-approval proof visually lagged instead of green", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      reportAgeHours: 8.5,
      reportFreshEnough: false,
      overallStatus: "ready_for_human_approval",
      completionBlockers: [],
      modeGates: [
        {
          mode: "daily_pulse",
          readinessStatus: "ready_for_human_approval",
          reviewVerdict: "candidate_for_enablement",
          promotionStatus: "ready_for_human_approval",
          artifactDaysFound: 5,
          requiredArtifactDays: 5,
          acceptedSignalCount: 8,
          acceptedDecisionGradeCount: 5,
          nextEligibleRunDates: [],
          promotionBlockers: [],
        },
        {
          mode: "friday_deep",
          readinessStatus: "ready_for_human_approval",
          reviewVerdict: "candidate_for_enablement",
          promotionStatus: "ready_for_human_approval",
          artifactDaysFound: 1,
          requiredArtifactDays: 1,
          acceptedSignalCount: 2,
          acceptedDecisionGradeCount: 1,
          nextEligibleRunDates: [],
          promotionBlockers: [],
        },
      ],
    }));

    const normalHtml = await renderThesisPage("1");
    const auditHtml = await renderThesisPage("1");

    expect(normalHtml).toContain("readiness report stale");
    expect(normalHtml).toContain("Last-known proof: 5/5 clean no-write artifact days; accepted 8, decision-grade 5.");
    expect(normalHtml).toMatch(/border-canola\/30 bg-canola\/10 text-canola[^>]*>5\/5 clean days/);
    expect(normalHtml).not.toMatch(/border-prairie\/25 bg-prairie\/10 text-prairie[^>]*>5\/5 clean days/);
    expect(auditHtml).toContain("ready for human approval");
    expect(auditHtml).toContain("Readiness report is stale; gate counts are last-known proof, not current proof. No completion blockers listed in the readiness report.");
    expect(auditHtml).toMatch(/border-canola\/30 bg-canola\/10 text-canola[^>]*>ready for human approval/);
    expect(auditHtml).toMatch(/border-canola\/30 bg-canola\/10 text-canola[^>]*>5\/5 artifact days/);
    expect(auditHtml).not.toMatch(/border-prairie\/25 bg-prairie\/10 text-prairie[^>]*>ready for human approval/);
    expect(auditHtml).not.toMatch(/border-prairie\/25 bg-prairie\/10 text-prairie[^>]*>5\/5 artifact days/);
    expect(auditHtml).not.toContain("scratch/track54-readiness");
    expect(auditHtml).not.toContain("artifact_sha256");
  });

  it("keeps audit mode explicit when the local readiness report is missing", async () => {
    const html = await renderThesisPage("1");

    expect(html).toContain("Track 54 production gate");
    expect(html).toContain("Readiness report missing");
    expect(html).toContain("write-mode routines stay disabled");
  });

  it("surfaces split-market top takeaways before weaker one-country reads", async () => {
    const html = await renderThesisPage();

    expect(html).toContain(
      "Wheat shows the strongest source-backed bull pressure in the CA read at +20 (80% confidence).",
    );
    expect(html).toContain("Lead evidence: CA Canada export basis stays firm (+20 stance / CGC weekly grain stats).");
    expect(html).toContain(
      "Wheat shows the strongest source-backed bear pressure in the US read at -20 (80% confidence).",
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
      "Canola shows the strongest source-backed one-country bull pressure at +24 (CA only, 82% confidence).",
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
    const html = await renderThesisPage("1");

    expect(html).toContain("Official source rows clean; Prairie crop-progress package is partial");
    expect(html).toContain(
      "Rendered public source groups are clean, but Canada crop progress reports partial prairie week.",
    );
    expect(html).toContain("0 stale, empty, lagged, or broken freshness rows.");
    expect(html).toContain("Prairie completeness is partial and shown below.");
    expect(html).toContain("Prairie crop progress: partial prairie week; loaded MB+SK (MB + SK loaded; AB pending)");
  });

  it("leads with the farmer read and keeps operator telemetry off the normal board", async () => {
    const html = await renderThesisPage();

    // Farmer read first: takeaway, then the quick scan, then source health and snapshot.
    expect(html.indexOf("Source-backed pressure summary")).toBeLessThan(html.indexOf("All Grains at a Glance"));
    expect(html.indexOf("All Grains at a Glance")).toBeLessThan(
      html.indexOf("Official source rows are clean for this board"),
    );
    expect(html.indexOf("Official source rows are clean for this board")).toBeLessThan(
      html.indexOf("Current snapshot"),
    );

    // Operator telemetry must not render on the normal farmer view.
    expect(html).not.toContain("Daily Update Status");
    expect(html).not.toContain("X Pulse Watch");
    expect(html).not.toContain("Weekly Data Intake");
    expect(html).not.toContain("Source Packets");
    expect(html).not.toContain("Daily automation gate progress");
    expect(html).not.toContain("Readiness proof");
    expect(html).not.toContain("Track 54 production gate");
  });

  it("keeps the operator telemetry panels in audit mode, after the farmer read", async () => {
    const html = await renderThesisPage("1");

    expect(html.indexOf("Source-backed pressure summary")).toBeLessThan(html.indexOf("Daily Update Status"));
    expect(html.indexOf("Daily Update Status")).toBeLessThan(html.indexOf("X Pulse Watch"));
    expect(html.indexOf("X Pulse Watch")).toBeLessThan(html.indexOf("Weekly Data Intake"));
    expect(html).toContain("Source Packets");
    expect(html).toContain("Track 54 production gate");
  });

  it("shows daily update readiness from board packets, prices, and X Pulse proof", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T18:30:00Z"));
    const data = boardData();
    data.canadaItems[0]!.freshness = [
      freshnessRow("grain_prices", "strong"),
      freshnessRow("posted_prices", "empty"),
    ];
    getThesisBoardDataMock.mockResolvedValue(data);
    const html = await renderThesisPage("1");

    expect(html).toContain("Daily Update Status");
    expect(html).toContain("Board packet");
    expect(html).toContain("Price context");
    expect(html).toContain("Latest X Pulse dry-run proof");
    expect(html).toContain("Daily soft update");
    expect(html).toContain("Daily decision path");
    expect(html).toContain("Price/FX refresh");
    expect(html).toContain("X Pulse dry-run proof");
    expect(html).toContain("Bounded daily review");
    expect(html).toContain("Friday thesis stays source-of-record");
    expect(html).toContain("Today update window");
    expect(html).toContain("Today Jun 2");
    expect(html).toContain("Not due yet");
    expect(html).toContain("Waiting for 4:10 PM MT X Pulse proof; current board keeps the latest proven packet and review-gated daily overlays.");
    expect(html).toContain("Today update checklist");
    expect(html).toContain("Price/FX context");
    expect(html).toContain("fresh today");
    expect(html).toContain("X Pulse proof");
    expect(html).toContain("not due yet");
    expect(html).toContain("Bounded daily row");
    expect(html).toContain("not stored");
    expect(html).toContain("Daily automation gate");
    expect(html).toContain("proof-gated");
    expect(html).toContain("Generated May 8");
    expect(html).toContain("1 packet row; latest period 2026-06-02.");
    expect(html).not.toContain("empty + strong");
    expect(html).toContain("Latest stored proof from Jun 1: accepted 1, rejected 4");
    expect(html).toContain("Current-day proof follows the Today update window below; X Pulse remains watch-only and gate-held.");
    expect(html).toContain("Daily deltas stay review-gated until fresh prices, accepted watch leads, and the no-write artifact gate clear.");
    expect(html).toContain("Board update mode");
    expect(html).toContain("weekly packet");
    expect(html).toContain("0/3 today");
    expect(html).toContain("No visible Bull/Bear row has a daily overlay; weekly thesis packet controls the displayed scores until a review-gated daily row matches the current period.");
  });

  it("shows sanitized daily automation gate progress in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      modeGates: [
        {
          mode: "daily_pulse",
          readinessStatus: "blocked_by_artifact_gates",
          reviewVerdict: "insufficient_artifacts",
          promotionStatus: "not_ready",
          artifactDaysFound: 2,
          requiredArtifactDays: 5,
          acceptedSignalCount: 4,
          acceptedDecisionGradeCount: 3,
          nextEligibleRunDates: ["2026-06-03", "2026-06-04", "2026-06-05"],
          promotionBlockers: ["Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 2."],
        },
        {
          mode: "friday_deep",
          readinessStatus: "blocked_by_artifact_gates",
          reviewVerdict: "insufficient_artifacts",
          promotionStatus: "not_ready",
          artifactDaysFound: 0,
          requiredArtifactDays: 1,
          acceptedSignalCount: 0,
          acceptedDecisionGradeCount: 0,
          nextEligibleRunDates: ["2026-06-05"],
          promotionBlockers: ["Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0."],
        },
      ],
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("Daily automation gate progress");
    expect(html).toContain("write mode disabled");
    expect(html).toContain("Readiness proof");
    expect(html).toContain("browser proof clean");
    expect(html).toContain("Readiness report generated Jun 2");
    expect(html).toContain("fresh for the eight-hour review window");
    expect(html).toContain("Browser proof generated Jun 2");
    expect(html).toContain("fresh for the six-hour proof window");
    expect(html).toContain("overall status blocked by artifact gates");
    expect(html).toContain("Current blocker: no-write artifact gate is incomplete.");
    expect(html).toContain("Daily pulse");
    expect(html).toContain("2/5 clean days");
    expect(html).toContain("2/5 clean no-write artifact days; accepted 4, decision-grade 3.");
    expect(html).toContain("Next proof dates: Jun 3, Jun 4, Jun 5.");
    expect(html).toContain("Friday deep");
    expect(html).toContain("0/1 clean no-write artifact days; accepted 0, decision-grade 0.");
    // Audit mode legitimately shows the production gate panel, but sanitized readiness
    // proof must still never leak local paths or artifact hashes.
    expect(html).toContain("Track 54 production gate");
    expect(html).not.toContain("scratch/track54-readiness");
    expect(html).not.toContain("artifact_sha256");
  });

  it("marks stale Track 54 browser proof in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      browserSmokeClean: true,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: "2026-06-02T20:30:00.000Z",
        ageHours: 6.5,
        freshEnough: false,
      },
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("browser proof stale");
    expect(html).toContain("Browser proof generated Jun 2");
    expect(html).toContain("stale for the six-hour proof window");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("marks future-dated Track 54 browser proof as invalid in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      browserSmokeClean: true,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: "2026-06-03T04:30:00.000Z",
        ageHours: -0.5,
        freshEnough: false,
      },
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("browser proof future-dated");
    expect(html).toContain("Browser proof generated Jun 2");
    expect(html).toContain("future-dated; not valid for the six-hour proof window");
    expect(html).not.toContain("browser proof stale");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("marks missing Track 54 browser proof separately from timestamp-missing proof", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      browserSmokeClean: true,
      browserSmokeProof: null,
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("browser proof missing");
    expect(html).toContain("Browser proof is missing.");
    expect(html).not.toContain("browser proof timestamp missing");
    expect(html).not.toContain("Browser proof timestamp is not present.");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("marks Track 54 browser proof with no generated timestamp as timestamp missing", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      browserSmokeClean: true,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: null,
        ageHours: null,
        freshEnough: false,
      },
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("browser proof timestamp missing");
    expect(html).toContain("Browser proof timestamp is not present.");
    expect(html).not.toContain("browser proof missing");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("marks stale Track 54 readiness reports in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      reportAgeHours: 8.5,
      reportFreshEnough: false,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: "2026-06-03T04:00:00.000Z",
        ageHours: 1,
        freshEnough: true,
      },
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("readiness report stale");
    expect(html).toContain("Readiness report generated Jun 2");
    expect(html).toContain("stale for the eight-hour review window");
    expect(html).toContain("Browser proof generated Jun 2");
    expect(html).toContain("fresh for the six-hour proof window");
    expect(html).toContain("Readiness report is stale; gate counts are last-known proof, not current proof.");
    expect(html).toContain("Last-known daily gate: 1/5 clean no-write artifacts, 2 decision-grade accepted signals.");
    expect(html).toContain("Last-known proof: 1/5 clean no-write artifact days; accepted 3, decision-grade 2.");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("marks future-dated Track 54 readiness reports as invalid in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      reportAgeHours: -1,
      reportFreshEnough: false,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: "2026-06-03T04:00:00.000Z",
        ageHours: 1,
        freshEnough: true,
      },
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("readiness report future-dated");
    expect(html).toContain("future-dated; not valid for the eight-hour review window");
    expect(html).toContain("Readiness report is future-dated; gate counts are last-known proof, not current proof.");
    expect(html).toContain("Last-known daily gate: 1/5 clean no-write artifacts, 2 decision-grade accepted signals.");
    expect(html).not.toContain("readiness report stale");
    expect(html).not.toContain("browser proof clean");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("flags enabled Track 54 production writes as broken in thesis audit mode", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      productionWritesEnabled: true,
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("write mode enabled");
    expect(html).toMatch(/border-red-500\/25 bg-red-500\/10 text-red-700[^>]*>write mode enabled/);
    expect(html).not.toMatch(/border-prairie\/25 bg-prairie\/10 text-prairie[^>]*>write mode enabled/);
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("shows exact Grok credential issue without exposing raw readiness proof", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      overallStatus: "hold_manual_review",
      grokRunner: {
        ok: false,
        credentialSource: "none",
        credentialIssue: "missing_credential",
        xaiApiKeyPresent: false,
        cliAuthFilePresent: false,
        cliAuthExpiresAt: null,
        cliAuthExpired: null,
      },
      completionBlockers: [
        "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
      ],
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("Daily X Pulse paused: scout credential issue is missing credential.");
    expect(html).toContain("Current blocker: X Pulse scout credential issue: missing credential; source none.");
    expect(html).not.toContain("npm run track54:grok-preflight");
    expect(html).not.toContain("Run `grok login`");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("shows audit-mode safe recovery action for missing Grok credentials", async () => {
    getLocalTrack54ReadinessSnapshotMock.mockResolvedValue(readinessSnapshot({
      overallStatus: "hold_manual_review",
      grokRunner: {
        ok: false,
        credentialSource: "none",
        credentialIssue: "missing_credential",
        xaiApiKeyPresent: false,
        cliAuthFilePresent: false,
        cliAuthExpiresAt: null,
        cliAuthExpired: null,
      },
      completionBlockers: [
        "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
      ],
    }));

    const html = await renderThesisPage("1");

    expect(html).toContain("Grok credential: missing credential; source none.");
    expect(html).toContain(
      "Safe recovery: run local Grok login or add XAI_API_KEY, then use the no-write recovery shortcut.",
    );
    expect(html).not.toContain("artifact_sha256");
    expect(html).not.toContain("scratch/track54-readiness");
  });

  it("shows the latest bounded daily thesis trajectory movement when present", async () => {
    getLatestDailyThesisUpdatesMock.mockResolvedValue([dailyUpdate()]);
    const html = await renderThesisPage("1");

    expect(html).toContain("Daily soft update");
    expect(html).toContain("prior-day overlay");
    expect(html).toContain("No current-day daily trajectory row is stored yet.");
    expect(html).toContain("CAD Wheat -1");
    expect(html).toContain("Latest Daily Trajectory Moves");
    expect(html).toContain("Latest CAD Wheat: -1 stance / +2 confidence");
    expect(html).toContain("current +19");
    expect(html).toContain("Prior-day overlay can still affect the displayed score until the current local-day bounded review");
    expect(html).toContain("Policy chatter is weighing on prairie wheat basis.");
  });

  it("labels same-day trajectory rows as today's bounded daily update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T18:30:00Z"));
    getLatestDailyThesisUpdatesMock.mockResolvedValue([
      dailyUpdate({
        recordedAt: "2026-06-02T18:20:00Z",
        cropYear: "2025-2026",
        grainWeek: 38,
      }),
    ]);

    const html = await renderThesisPage("1");

    expect(html).toContain("Daily soft update");
    expect(html).toContain("CAD Wheat -1");
    expect(html).toContain("Today&#x27;s current-score overlay only; Friday thesis text remains the source-of-record.");
    expect(html).toContain("Today update checklist");
    expect(html).toContain("row stored");
    expect(html).toContain("1/4 complete");
    expect(html).toContain("Board update mode");
    expect(html).toContain("partial today");
    expect(html).toContain("1/3 visible Bull/Bear rows have same-day bounded overlays;");
    expect(html).toContain("write automation stays approval-gated");
    expect(html).toContain("1/3 today");
    expect(html).toContain("1 of 3 board rows have current-period daily trajectory overlays;");
    expect(html).toContain("1 of those are stamped today.");
  });

  it("uses the latest daily trajectory row as the current visible bull bear score", async () => {
    getLatestDailyThesisUpdatesMock.mockResolvedValue([
      dailyUpdate({
        cropYear: "2025-2026",
        grainWeek: 38,
        stanceScore: 19,
        confidenceScore: 82,
        stanceDelta: -1,
        priorStance: 20,
        newStance: 19,
      }),
    ]);

    const html = await renderThesisPage("1");

    expect(html).toContain(
      "Wheat shows the strongest source-backed bull pressure in the CA read at +19 (82% confidence).",
    );
    expect(html).toContain("CA +19 Lean bull");
    expect(html).toContain("Review-gated movement rows overlaid on visible scores");
    expect(html).not.toContain(
      "Wheat shows the strongest source-backed bull pressure in the CA read at +20 (80% confidence).",
    );
  });

  it("shows how much of the visible board is covered by daily trajectory overlays", async () => {
    getLatestDailyThesisUpdatesMock.mockResolvedValue([
      dailyUpdate({
        cropYear: "2025-2026",
        grainWeek: 38,
        stanceScore: 19,
        confidenceScore: 82,
      }),
    ]);

    const html = await renderThesisPage("1");

    expect(html).toContain("Review-gated daily overlay coverage");
    expect(html).toContain("Board update mode");
    expect(html).toContain("prior overlay active");
    expect(html).toContain("0/3 today");
    expect(html).toContain("1/3 visible Bull/Bear rows use current-period review-gated daily overlays, but none are stamped today.");
    expect(html).toContain("1 of 3 board rows have current-period daily trajectory overlays;");
    expect(html).toContain("0 of those are stamped today.");
    expect(html).toContain("2 rows remain on weekly packet scores until a matching daily row exists.");
    expect(html).toContain("Latest overlay row Jun 1");
    expect(html).toContain("Review-gated overlay rows");
    expect(html).toContain("CAD Wheat: review-gated daily overlay");
    expect(html).toContain("Weekly packet rows");
    expect(html).toContain("CAD Canola: weekly packet score");
    expect(html).toContain("US Wheat: weekly packet score");
    expect(html).toContain("Score source: Daily overlay Jun 1 (review-gated)");
    expect(html).toContain("Score source: Daily overlay");
    expect(html).toContain("Score source: Weekly packet");
  });

  it("explains weekly data pulls and what each source signifies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T18:30:00Z"));
    const data = boardData();
    data.canadaItems[0]!.freshness = [
      freshnessRow("cgc_observations", "strong"),
      freshnessRow("grain_prices", "strong"),
    ];
    data.usItems[0]!.freshness = [
      freshnessRow("usda_crop_progress", "strong", "2026-06-01"),
      freshnessRow("usda_export_sales", "expected_lag", "2026-05-28"),
    ];
    getThesisBoardDataMock.mockResolvedValue(data);
    getLatestSourceRunSummariesMock.mockResolvedValue([
      sourceRun(),
      sourceRun({
        sourceName: "cgc_observations",
        collectorName: "import-cgc-weekly",
        sourcePeriodEnd: "2026-05-30",
      }),
    ]);
    const html = await renderThesisPage("1");

    expect(html).toContain("Weekly Data Intake");
    expect(html).toContain("12 inputs");
    expect(html).toContain("Mobile weekly intake cards");
    expect(html).toContain("Mobile quick-read cards for the same pull list; desktop keeps the full audit table.");
    expect(html).toContain("Analyzed data");
    expect(html).toContain("What it changes");
    expect(html).toContain("How the week updates the board");
    expect(html).toContain("Current week pull tracker");
    expect(html).toContain("Today Jun 2");
    expect(html).toContain("3 scheduled lanes today");
    expect(html).toContain("Manitoba Crop Report; Futures prices + USD/CAD; Supervised X Pulse dry run");
    expect(html).toContain("Weekly pull calendar");
    expect(html).toContain("Monday");
    expect(html).toContain("USDA Crop Progress; Futures prices + USD/CAD; Supervised X Pulse dry run");
    expect(html).toContain("Thursday");
    expect(html).toContain("USDA Export Sales; Saskatchewan Crop Report; CGC Weekly Grain Stats; CGC Producer Cars; Futures prices + USD/CAD; Supervised X Pulse dry run");
    expect(html).toContain("Friday");
    expect(html).toContain("Alberta Crop Report; CFTC Commitments of Traders; Futures prices + USD/CAD; Supervised X Pulse dry run");
    expect(html).toContain("Current proof for today lanes");
    expect(html).toContain("2/3 current proofs are strong or successful.");
    expect(html).toContain("Next official pull");
    expect(html).toContain("Canada Grain Monitor");
    expect(html).toContain("Friday handoff watch");
    expect(html).toContain("Alberta Crop Report; CFTC Commitments of Traders");
    expect(html).toContain("Daily price base");
    expect(html).toContain("Prices and FX refresh first so weekday score moves are not judged on stale context.");
    expect(html).toContain("Thu flow check");
    expect(html).toContain("CGC, Export Sales, SK crop progress, Producer Cars, and Grain Monitor test real movement and demand.");
    expect(html).toContain("Fri thesis handoff");
    expect(html).toContain("AB crop progress, CFTC positioning, and Friday desk review decide what deserves source-of-record treatment.");
    expect(html).toContain("How data becomes Bull/Bear pressure");
    expect(html).toContain("Bullish when crop stress, delayed harvest, or lower production risk tightens supply.");
    expect(html).toContain("Bearish when conditions improve, harvest accelerates, or supply risk eases.");
    expect(html).toContain("Bullish when exports, shipments, or disappearance run ahead of expectations.");
    expect(html).toContain("Bearish when sales lag, movement slows, or stocks build.");
    expect(html).toContain("Watch-only; never decisive alone.");
    expect(html).toContain("Only changes the board after official-source or desk review corroborates the lead.");
    expect(html).toContain("Current board status");
    expect(html).toContain("Role");
    expect(html).toContain("Pressure lane");
    expect(html).toContain("USDA Crop Progress");
    expect(html).toContain("Planting, emergence, crop condition, harvest progress, state, crop, period, and week-over-week percentage moves.");
    expect(html).toContain("Official thesis input");
    expect(html).toContain("Supply/weather pressure");
    expect(html).toContain("moves US supply/weather reads");
    expect(html).toContain("USDA Crop Progress appears in 1 packet row");
    expect(html).toContain("Latest source period 2026-06-01.");
    expect(html).toContain("CGC Weekly Grain Stats");
    expect(html).toContain("Producer deliveries, primary stocks, process use, terminal receipts, terminal exports, and export-destination flows.");
    expect(html).toContain("Demand/flow pressure");
    expect(html).toContain("core Canada flow pressure");
    expect(html).toContain("CGC weekly grain stats + CGC weekly import run appears in 1 packet row");
    expect(html).toContain("Latest collector import-cgc-weekly finished Jun 1");
    expect(html).toContain("Canada Grain Monitor");
    expect(html).toContain("Grain Monitor latest collector success");
    expect(html).toContain("Latest collector import-grain-monitor-weekly finished Jun 1");
    expect(html).toContain("Futures prices + USD/CAD");
    expect(html).toContain("Daily futures settlement, contract changes, USD/CAD, CAD-normalized prices, and tracked-contract freshness.");
    expect(html).toContain("Price context");
    expect(html).toContain("required before weekday thesis deltas");
    expect(html).toContain("Grain price feed + USD/CAD FX rates + Intraday grain-price quotes appears in 1 packet row");
    expect(html).toContain("Supervised X Pulse dry run");
    expect(html).toContain("Trusted-handle posts, source tier, timestamp, affected grains/regions/decisions, allowed claims, blocked claims, and price snapshot status.");
    expect(html).toContain("Watch-only evidence");
    expect(html).toContain("Social/evidence risk");
    expect(html).toContain("they stay secondary until official-source or desk review corroborates them");
    expect(html).toContain("Accepted 1; rejected 4");
    expect(html).toContain("price fresh");
    expect(getLatestSourceRunSummariesMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "cgc_imports",
        "fx_rates",
        "grain_price_intraday",
        "supply_disposition",
        "usda_wasde_raw",
      ]),
    );
  });

  it("renders X Pulse as a separate watch-only lane", async () => {
    const html = await renderThesisPage("1");

    expect(html).toContain("X Pulse Watch");
    expect(html).toContain("Watch-only social evidence");
    expect(html).toContain("Accepted 1");
    expect(html).toContain("Rejected 4");
    expect(html).toContain("Canola basis chatter is picking up around Saskatchewan delivery slots.");
    expect(html).toContain("X Pulse can add watch evidence only.");
    expect(html).toContain("It cannot update thesis rows without official-source or desk-review corroboration");
  });

  it("shows X Pulse audit metadata only in audit mode", async () => {
    const normalHtml = await renderThesisPage();
    const auditHtml = await renderThesisPage("1");

    expect(normalHtml).not.toContain("Scout run audit");
    expect(normalHtml).not.toContain("Runner: grok_cli");
    expect(auditHtml).toContain("Scout run audit");
    expect(auditHtml).toContain("Runner: grok_cli");
    expect(auditHtml).toContain("Allowed claims: Source URL present.");
    expect(auditHtml).toContain("Corroboration: 1 matching claims; official source not matched; independent sources SaskWheat");
    expect(auditHtml).toContain("Rejected signal reasons");
    expect(auditHtml).toContain("missing or invalid source url; unsupported grain: Rye");
  });

  it("scrubs forbidden advice language from X Pulse copy", async () => {
    getXPulseWatchSummaryMock.mockResolvedValue({
      ...xPulseWatch(),
      topSignals: [
        {
          ...xPulseWatch().topSignals[0]!,
          postSummary:
            "buy Canola, sell Wheat, trade signal, pricing plan, price advice, pricing recommendation, pricing call, trading advice, hedging advice, financial advice",
          signalMetadata: {
            allowed_claims: ["buy copied claim", "buy signal copied claim"],
            blocked_claims: [
              "sell copied claim",
              "sell signal copied claim",
              "trade signal copied claim",
              "pricing plan copied claim",
              "price-advice copied claim",
              "pricing recommendation copied claim",
              "pricing call copied claim",
              "trading advice copied claim",
              "hedging advice copied claim",
              "financial advice copied claim",
            ],
          },
        },
      ],
    });

    const html = (await renderThesisPage("1")).toLowerCase();

    expect(html).not.toContain("trade signal");
    expect(html).not.toContain("pricing plan");
    expect(html).not.toContain("price advice");
    expect(html).not.toContain("price-advice");
    expect(html).not.toContain("pricing recommendation");
    expect(html).not.toContain("pricing call");
    expect(html).not.toContain("trading advice");
    expect(html).not.toContain("hedging advice");
    expect(html).not.toContain("financial advice");
    expect(html).not.toContain("buy canola");
    expect(html).not.toContain("sell wheat");
    expect(html).not.toContain("buy copied claim");
    expect(html).not.toContain("buy signal copied claim");
    expect(html).not.toContain("sell copied claim");
    expect(html).not.toContain("sell signal copied claim");
    expect(html).toContain(
      "watch term canola, watch term wheat, watch term, watch term, watch term, watch term, watch term, watch term, watch term, watch term",
    );
    expect(html).toContain("allowed claims: watch term copied claim; watch term copied claim");
  });

  it("keeps snapshot provenance compact and below the farmer read", async () => {
    const html = await renderThesisPage();

    expect(html).toContain("Current snapshot");
    expect(html).toContain("Direct packet data; no archive fallback.");
    expect(html).not.toContain("No retired AI archive fallback is used on this page.");
    expect(html).not.toContain("Stale, empty, lagged, and proxy source lanes stay visible.");
    // Farmer-first split: the read leads; source health and snapshot provenance follow it.
    expect(html.indexOf("Source-backed pressure summary")).toBeLessThan(
      html.indexOf("Official source rows are clean for this board"),
    );
    expect(html.indexOf("Source-backed pressure summary")).toBeLessThan(html.indexOf("Current snapshot"));
    expect(html.indexOf("Official source rows are clean for this board")).toBeLessThan(html.indexOf("Current snapshot"));
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
    expect(html).toContain("Data coverage matrix");
    expect(html).toContain("Audit-only map of pulled, packeted, scored, explanation-only, and missing lanes for Canola.");
    expect(html).toContain("Pull");
    expect(html).toContain("Packet");
    expect(html).toContain("Score");
    expect(html).toContain("Explain");
    expect(html).toContain("Gap");
    expect(html).toContain("Source IDs: cgc_observations, cgc_imports");
    expect(html).toContain("Use for explanation and inspection priority until packet admission and mapper tests are added.");
    expect(html).toContain("Next source admissions");
    expect(html).toContain("Ranked by lowest-friction path from the current impact map");
    expect(html).toContain("Priority 1");
    expect(html).toContain("Promote watch lane");
    expect(html).toContain("Candidate source IDs: usda_wasde_raw");
    expect(html).toContain("Currently explanation-only. It may guide review priority, but it cannot move the deterministic score.");
    expect(html).toContain("Saskatchewan Oilseeds rows are official group-level timing proxies");
    expect(html).toContain("Missing source admissions");
    expect(html).toContain("Admit a source contract, collector, units, freshness proof, and mapper before it can affect the thesis.");
    expect(html).toContain("Impact Map audit");
    expect(html).toContain("Grain Impact Graph");
    expect(html).toContain("Operator-only relationship map showing how source lanes, factors, domains, watch leads, and parked gaps rank into each grain.");
    expect(html).toContain("3D Relationship Constellation");
    expect(html).toContain("Spatial view of the same ranked relationship model.");
    expect(html).toContain("Three.js audit layer");
    expect(html).toContain("Cross-Grain Relationship Map");
    expect(html).toContain("Board-wide view of which grains influence each other directly");
    expect(html).toContain("Current board overlay");
    expect(html).toContain("Canola current board read +24 / 82% (weekly packet)");
    expect(html).toContain("Wheat current board read 0 / 80% (weekly packet)");
    expect(html).toContain("Canola to Soybeans");
    expect(html).toContain("Influence ranking matrix");
    expect(html).toContain("Which grains talk to each other most");
    expect(html).toContain("Net rank combines inbound and outbound relationship strength.");
    expect(html).toContain("Strongest outbound");
    expect(html).toContain("Strongest inbound");
    expect(html).toContain("Grain Focus Explorer");
    expect(html).toContain("Selected-grain relationship lanes with inbound anchors, outbound influence, and ranked link strength.");
    expect(html).toContain("Grain conversation matrix");
    expect(html).toContain("Who talks to whom");
    expect(html).toContain("Rows push influence. Columns receive it.");
    expect(html).toContain("Selected grain summary");
    expect(html).toContain("Selected Influence Lens");
    expect(html).toContain("relationship lens");
    expect(html).toContain("net relationship rank");
    expect(html).toContain("Watch-only anchor");
    expect(html).toContain("Inbound ranked links");
    expect(html).toContain("Outbound ranked links");
    expect(html).toContain("Current Driver Stack");
    expect(html).toContain("Canola source-to-score trail");
    expect(html).toContain("Top scoring lanes");
    expect(html).toContain("Watch and blocked lanes");
    expect(html).toContain("Canola relationship graph");
    expect(html).toContain("Ranked relationship network");
    expect(html).toContain("Canola ranked relationship network");
    expect(html).toContain("Source, relationship, and gap lanes");
    expect(html).toContain("Top ranked links");
    expect(html).toContain(
      "Canada-first oilseed with strong crush, export, vegetable-oil, soy-complex, China, and policy sensitivity.",
    );
    expect(html).toContain("canada first");
    expect(html).toContain("Official input");
    expect(html).toContain("Price context");
    expect(html).toContain("Bounded context");
    expect(html).toContain("Market response rules");
    expect(html).toContain("Flow plus soy-complex confirmation");
    expect(html).toContain("Viking overlay: basis pricing, logistics exports, market structure, grain specifics");
    expect(html).toContain("Soybeans and soy products are the main public cross-market context for canola.");
    expect(html).toContain("Parked gaps: local basis, explicit crush margins, quality-grade scoring.");
  });
});
