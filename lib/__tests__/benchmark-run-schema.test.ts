import { describe, expect, it } from "vitest";

import {
  isModelBenchmarkRunV1,
  parseModelBenchmarkRunV1,
} from "../thesis/benchmark/types";

describe("ModelBenchmarkRunV1Schema", () => {
  const validRecord = {
    run_id: "run-2026w20-canola-a",
    model_id: "openai/gpt-5.3-codex",
    input_artifact_hash: "sha256:input123",
    output_hash: "sha256:output456",
    scores: {
      directional_accuracy: 0.8,
      evidence_coverage: 0.75,
      calibration_error: 0.2,
      overclaim_penalty: 0.1,
      final_score: 0.74,
    },
    review_window: {
      start_at: "2026-05-15T18:00:00Z",
      end_at: "2026-05-22T18:00:00Z",
    },
    status: "completed",
  } as const;

  it("parses valid benchmark run", () => {
    const parsed = parseModelBenchmarkRunV1(validRecord);
    expect(parsed.run_id).toBe(validRecord.run_id);
    expect(parsed.status).toBe("completed");
  });

  it("rejects out-of-range score values", () => {
    expect(() =>
      parseModelBenchmarkRunV1({
        ...validRecord,
        scores: {
          ...validRecord.scores,
          final_score: 1.2,
        },
      }),
    ).toThrow(/Too big|final_score/);
  });

  it("rejects review window when start_at is after end_at", () => {
    expect(() =>
      parseModelBenchmarkRunV1({
        ...validRecord,
        review_window: {
          start_at: "2026-05-23T18:00:00Z",
          end_at: "2026-05-22T18:00:00Z",
        },
      }),
    ).toThrow(/review_window\.start_at must be earlier than or equal to review_window\.end_at/);
  });

  it("type guard returns true for valid records and false for invalid records", () => {
    expect(isModelBenchmarkRunV1(validRecord)).toBe(true);
    expect(
      isModelBenchmarkRunV1({
        ...validRecord,
        status: "unknown",
      }),
    ).toBe(false);
  });
});
