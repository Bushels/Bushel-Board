import { describe, expect, it } from "vitest";
import { normalizeDailyThesisUpdateForTest } from "@/lib/queries/daily-thesis-updates";

describe("daily thesis update query helpers", () => {
  it("normalizes CAD daily pulse trajectory rows with text evidence", () => {
    const update = normalizeDailyThesisUpdateForTest("canada", {
      grain: "Wheat",
      crop_year: "2025-2026",
      grain_week: "42",
      scan_type: "opus_review_daily_pulse",
      stance_score: "19",
      conviction_pct: 82,
      recommendation: "WATCH",
      recorded_at: "2026-06-01T22:28:00Z",
      trigger: "Daily Thesis Review - official data, prices, and X Pulse",
      model_source: "claude-opus-soft-review",
      evidence: JSON.stringify({
        signal_note: "X Pulse Watch (tier1): Policy chatter is weighing on prairie wheat basis.",
        reasoning: "Source-linked watch evidence produced a bounded daily tick.",
        stance_delta_applied: -1,
        confidence_delta_applied: "+2",
        prior_stance: 20,
        prior_confidence: 80,
        new_stance: 19,
        new_confidence: 82,
        x_post_url: "https://x.com/trusted/status/1",
        x_scout_run_id: "run-1",
        x_affected_decisions: ["watch_basis"],
        x_allowed_claims: ["Source URL present."],
        x_blocked_claims: ["Unverified numeric claim."],
        x_needs_official_verification: true,
        x_corroboration: {
          same_claim_count: "2",
          independent_sources: ["SaskWheat"],
          official_source_match: false,
        },
      }),
    });

    expect(update).toEqual({
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
      reasoning: "Source-linked watch evidence produced a bounded daily tick.",
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
      blockedClaims: ["Unverified numeric claim."],
      needsOfficialVerification: true,
      corroboration: {
        sameClaimCount: 2,
        independentSources: ["SaskWheat"],
        officialSourceMatch: false,
      },
    });
  });

  it("normalizes US daily pulse trajectory rows with JSON evidence", () => {
    const update = normalizeDailyThesisUpdateForTest("us", {
      market_name: "Corn",
      crop_year: "2025-2026",
      market_year: 2025,
      scan_type: "opus_review_daily_pulse",
      stance_score: -12,
      conviction_pct: null,
      recommendation: "WATCH",
      recorded_at: "2026-06-01T22:35:00Z",
      evidence: {
        signal_note: "X Pulse Watch (tier2): Export chatter remains quiet.",
        stance_delta_applied: 0,
        confidence_delta_applied: 0,
      },
    });

    expect(update.side).toBe("us");
    expect(update.market).toBe("Corn");
    expect(update.marketYear).toBe(2025);
    expect(update.grainWeek).toBeNull();
    expect(update.stanceScore).toBe(-12);
    expect(update.confidenceScore).toBeNull();
    expect(update.stanceDelta).toBe(0);
    expect(update.signalNote).toContain("Export chatter remains quiet");
  });
});
