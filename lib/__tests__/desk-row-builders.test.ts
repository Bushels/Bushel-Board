import { describe, it, expect } from "vitest";
import { cadRowSchema, usRowSchema } from "../../scripts/desk/schemas";
import {
  buildMarketAnalysisRow,
  buildCadTrajectoryRow,
  buildUsMarketAnalysisRow,
  buildUsTrajectoryRow,
  buildPipelineRunRow,
} from "../../scripts/desk/row-builders";
import { CAD_DESK_MODEL, US_DESK_MODEL } from "../../scripts/desk/contracts";

const cadInput = {
  grain: "Canola",
  stance_score: 15,
  initial_thesis: "t",
  bull_case: "b",
  bear_case: "be",
  data_freshness: { cgc: "2026-06-12" },
};

describe("CAD row builders", () => {
  const row = cadRowSchema.parse(cadInput);
  const ctx = { cropYear: "2025-2026", grainWeek: 35 };

  it("market_analysis row carries exact columns + NOT-NULL defaults", () => {
    const r = buildMarketAnalysisRow(row, ctx);
    expect(r).toMatchObject({
      grain: "Canola",
      crop_year: "2025-2026",
      grain_week: 35,
      initial_thesis: "t",
      bull_case: "b",
      bear_case: "be",
      historical_context: {},
      data_confidence: "medium",
      key_signals: [],
      model_used: CAD_DESK_MODEL,
      stance_score: 15,
      bull_reasoning: [],
      bear_reasoning: [],
      confidence_score: null,
      final_assessment: null,
    });
    expect(r).not.toHaveProperty("market_name");
    expect(r).not.toHaveProperty("recommendation");
    expect(r).not.toHaveProperty("generated_at"); // injected by CLI, not the pure builder
    expect(r).not.toHaveProperty("metadata"); // column is llm_metadata
  });

  it("score_trajectory row uses CHECK-valid enums derived from stance_score", () => {
    const r = buildCadTrajectoryRow(row, ctx);
    expect(r.scan_type).toBe("weekly_debate");
    expect(r.model_source).toBe(CAD_DESK_MODEL);
    expect(["PATIENCE", "WATCH", "SCALE_IN", "ACCELERATE", "HOLD_FIRM", "PRICE"]).toContain(
      r.recommendation,
    );
    expect(["bearish", "neutral", "bullish"]).toContain(r.near_term);
    expect(["bearish", "neutral", "bullish"]).toContain(r.medium_term);
    expect(r.recommendation).toBe("PATIENCE"); // stance 15 -> PATIENCE
    expect(r.near_term).toBe("neutral"); // stance 15 -> neutral
    expect(r.evidence).toBe(""); // text passthrough
    expect(r.data_freshness).toEqual({ cgc: "2026-06-12" });
  });
});

const usInput = {
  market_name: "Soybeans",
  stance_score: 10,
  initial_thesis: "t",
  bull_case: "b",
  bear_case: "be",
  recommendation: "HOLD with tactical sell-rally bias",
  data_freshness: { week_ending: "2026-06-12" },
};

describe("US row builders", () => {
  const row = usRowSchema.parse(usInput);
  const ctx = { cropYear: "2025-2026", marketYear: 2025, weekEnding: "2026-06-12" };

  it("us_market_analysis row shape (no top-level bull_reasoning, no grain_week)", () => {
    const r = buildUsMarketAnalysisRow(row, ctx);
    expect(r).toMatchObject({
      market_name: "Soybeans",
      crop_year: "2025-2026",
      market_year: 2025,
      recommendation: "HOLD with tactical sell-rally bias",
      model_used: US_DESK_MODEL,
      key_signals: [],
    });
    expect(r).not.toHaveProperty("bull_reasoning"); // US: reasoning lives in llm_metadata
    expect(r).not.toHaveProperty("grain_week");
    expect(r).not.toHaveProperty("metadata");
  });

  it("us_score_trajectory row: free-text recommendation, jsonb evidence, no near/medium term", () => {
    const r = buildUsTrajectoryRow(row, ctx);
    expect(r.scan_type).toBe("weekly_debate");
    expect(r.model_source).toBe(US_DESK_MODEL);
    expect(r.recommendation).toBe("HOLD with tactical sell-rally bias");
    expect(r).not.toHaveProperty("near_term");
    expect(r).not.toHaveProperty("medium_term");
    expect(r.evidence).toEqual({}); // jsonb default
  });
});

describe("pipeline_runs builder", () => {
  it("uses real columns only (no source/metadata), triggered_by=cron", () => {
    const r = buildPipelineRunRow({
      cropYear: "2025-2026",
      grainWeek: 35,
      status: "completed",
      grainsRequested: ["Canola", "Wheat"],
    });
    expect(r).toMatchObject({
      crop_year: "2025-2026",
      grain_week: 35,
      status: "completed",
      triggered_by: "cron",
      grains_requested: ["Canola", "Wheat"],
      grains_completed: [],
      grains_failed: [],
      failure_details: {},
    });
    expect(r).not.toHaveProperty("source");
    expect(r).not.toHaveProperty("metadata");
  });
});
