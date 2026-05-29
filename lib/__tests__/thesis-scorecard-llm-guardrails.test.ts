import { describe, expect, it } from "vitest";

import {
  SCORECARD_LLM_GUARDRAIL_INSTRUCTIONS,
  buildScorecardLlmPayload,
} from "../thesis/scorecard-llm-guardrails";
import type { ThesisRatingScorecard } from "../thesis/rating-model";

const scorecard = (): ThesisRatingScorecard => ({
  grain: "Canola",
  lane: "canada",
  period_anchor: "2025-2026:week:38",
  source_watermark: "2026-05-17",
  overall_score: 42.75,
  overall_label: "bull",
  confidence_score: 0,
  confidence_label: "low",
  domains: [
    {
      domain: "demand",
      score: 60,
      weight: 0.25,
      weighted_score: 15,
      confidence: "high",
      freshness_status: "strong",
      sources: ["cgc_weekly_stats"],
      positive_evidence: ["exports_and_processing_support_demand"],
      negative_evidence: [],
      blocked_claims: ["export_projection_pace_unavailable"],
    },
    {
      domain: "weather",
      score: 0,
      weight: 0.05,
      weighted_score: 0,
      confidence: "low",
      freshness_status: "empty",
      sources: [],
      positive_evidence: [],
      negative_evidence: [],
      blocked_claims: ["crop_condition_unavailable"],
    },
  ],
  contradictions: ["contradiction:demand_vs_movement"],
  quality_adjustments: [
    "weather:required_source_empty",
    "insufficient_data:required_source_missing:weather",
  ],
  missing_required_sources: ["weather"],
  llm_allowed_claims: ["exports_and_processing_support_demand"],
  llm_blocked_claims: ["export_projection_pace_unavailable"],
});

describe("scorecard LLM guardrail payload", () => {
  it("separates allowed claims from blocked and missing-source limitations", () => {
    const payload = buildScorecardLlmPayload(scorecard());

    expect(payload.rating).toEqual({
      grain: "Canola",
      lane: "canada",
      period_anchor: "2025-2026:week:38",
      source_watermark: "2026-05-17",
      overall_score: 42.75,
      overall_label: "bull",
      confidence_score: 0,
      confidence_label: "low",
    });
    expect(payload.allowed_claims).toEqual(["exports_and_processing_support_demand"]);
    expect(payload.blocked_claims).toEqual([
      "export_projection_pace_unavailable",
      "crop_condition_unavailable",
    ]);
    expect(payload.missing_required_sources).toEqual(["weather"]);
    expect(payload.quality_adjustments).toContain("insufficient_data:required_source_missing:weather");
    expect(payload.domains).toEqual([
      {
        domain: "demand",
        score: 60,
        weight: 0.25,
        confidence: "high",
        freshness_status: "strong",
        sources: ["cgc_weekly_stats"],
        allowed_claims: ["exports_and_processing_support_demand"],
        blocked_claims: ["export_projection_pace_unavailable"],
      },
      {
        domain: "weather",
        score: 0,
        weight: 0.05,
        confidence: "low",
        freshness_status: "empty",
        sources: [],
        allowed_claims: [],
        blocked_claims: ["crop_condition_unavailable"],
      },
    ]);
  });

  it("dedupes blocked claims and never promotes blocked claims into allowed claims", () => {
    const payload = buildScorecardLlmPayload({
      ...scorecard(),
      llm_allowed_claims: [
        "exports_and_processing_support_demand",
        "export_projection_pace_unavailable",
      ],
      llm_blocked_claims: [
        "export_projection_pace_unavailable",
        "export_projection_pace_unavailable",
      ],
    });

    expect(payload.allowed_claims).toEqual(["exports_and_processing_support_demand"]);
    expect(payload.blocked_claims).toEqual([
      "export_projection_pace_unavailable",
      "crop_condition_unavailable",
    ]);
  });

  it("does not expose domain evidence that is absent from the top-level allowed claims", () => {
    const payload = buildScorecardLlmPayload({
      ...scorecard(),
      domains: [
        ...scorecard().domains,
        {
          domain: "price",
          score: 10,
          weight: 0.15,
          weighted_score: 1.5,
          confidence: "medium",
          freshness_status: "watch",
          sources: ["basis_snapshot"],
          positive_evidence: ["basis_firmed_unapproved_claim"],
          negative_evidence: [],
          blocked_claims: [],
        },
      ],
    });

    expect(payload.allowed_claims).toEqual(["exports_and_processing_support_demand"]);
    expect(payload.domains.find((domain) => domain.domain === "price")?.allowed_claims).toEqual([]);
  });

  it("suppresses allowed claims from domains with missing required sources", () => {
    const payload = buildScorecardLlmPayload({
      ...scorecard(),
      llm_allowed_claims: [
        "exports_and_processing_support_demand",
        "crop_condition_improved_untrusted",
      ],
      domains: scorecard().domains.map((domain) =>
        domain.domain === "weather"
          ? {
              ...domain,
              positive_evidence: ["crop_condition_improved_untrusted"],
            }
          : domain,
      ),
    });

    expect(payload.allowed_claims).toEqual(["exports_and_processing_support_demand"]);
    expect(payload.domains.find((domain) => domain.domain === "weather")?.allowed_claims).toEqual([]);
    expect(payload.missing_required_sources).toEqual(["weather"]);
  });

  it("exports explicit instructions that prevent recomputing or overriding ratings", () => {
    expect(SCORECARD_LLM_GUARDRAIL_INSTRUCTIONS).toContain("source of truth");
    expect(SCORECARD_LLM_GUARDRAIL_INSTRUCTIONS).toContain("Do not recompute");
    expect(SCORECARD_LLM_GUARDRAIL_INSTRUCTIONS).toContain("Do not infer missing source values");
    expect(SCORECARD_LLM_GUARDRAIL_INSTRUCTIONS).toContain("Do not upgrade confidence");
  });
});
