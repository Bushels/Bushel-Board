import { describe, expect, it } from "vitest";

import {
  scoreBenchmarkRun,
  type BenchmarkScoreInput,
} from "../thesis/benchmark/score-benchmark";

describe("scoreBenchmarkRun", () => {
  it("computes expected score for strong aligned case", () => {
    const input: BenchmarkScoreInput = {
      expected_outcome_stance_score: 72,
      predicted_stance_score: 80,
      confidence: "high",
      evidence_ref_count: 6,
      required_evidence_ref_count: 6,
      unsupported_claim_count: 0,
      overclaim_flag_count: 0,
    };

    const scored = scoreBenchmarkRun(input);

    expect(scored.directional_accuracy).toBe(1);
    expect(scored.evidence_coverage).toBe(1);
    expect(scored.calibration_error).toBe(0.15);
    expect(scored.overclaim_penalty).toBe(0);
    expect(scored.final_score).toBe(0.97);
  });

  it("computes expected score for wrong high-confidence overclaim case", () => {
    const input: BenchmarkScoreInput = {
      expected_outcome_stance_score: -65,
      predicted_stance_score: 90,
      confidence: "high",
      evidence_ref_count: 2,
      required_evidence_ref_count: 4,
      unsupported_claim_count: 2,
      overclaim_flag_count: 2,
    };

    const scored = scoreBenchmarkRun(input);

    expect(scored.directional_accuracy).toBe(0);
    expect(scored.evidence_coverage).toBe(0.5);
    expect(scored.calibration_error).toBe(0.85);
    expect(scored.overclaim_penalty).toBe(0.7);
    expect(scored.final_score).toBe(0.185);
  });

  it("bounds outputs to 0..1 and handles neutral direction as partial credit", () => {
    const input: BenchmarkScoreInput = {
      expected_outcome_stance_score: 0,
      predicted_stance_score: 48,
      confidence: "low",
      evidence_ref_count: 12,
      required_evidence_ref_count: 5,
      unsupported_claim_count: 10,
      overclaim_flag_count: 20,
    };

    const scored = scoreBenchmarkRun(input);

    expect(scored.directional_accuracy).toBe(0.5);
    expect(scored.evidence_coverage).toBe(1);
    expect(scored.calibration_error).toBe(0.15);
    expect(scored.overclaim_penalty).toBe(1);
    expect(scored.final_score).toBe(0.645);
  });
});
