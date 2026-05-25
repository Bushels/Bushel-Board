import { describe, expect, it } from "vitest";

import {
  buildThesisBenchmarkReport,
  type BenchmarkReportInput,
} from "../thesis/benchmark/build-report";

describe("buildThesisBenchmarkReport", () => {
  it("builds deterministic report with top model and recommendation", () => {
    const input: BenchmarkReportInput = {
      run_id: "run-2026w20-canola",
      market_key: "canola",
      grain_week: 20,
      review_window: {
        start_at: "2026-05-10T00:00:00Z",
        end_at: "2026-05-16T00:00:00Z",
      },
      runs: [
        {
          run_id: "run-2026w20-canola",
          model_id: "openai/gpt-5.3-codex",
          input_artifact_hash: "sha256:abc",
          output_hash: "sha256:o1",
          status: "completed",
          review_window: {
            start_at: "2026-05-10T00:00:00Z",
            end_at: "2026-05-16T00:00:00Z",
          },
          scores: {
            directional_accuracy: 0.9,
            evidence_coverage: 0.8,
            calibration_error: 0.2,
            overclaim_penalty: 0.1,
            final_score: 0.86,
          },
        },
        {
          run_id: "run-2026w20-canola",
          model_id: "anthropic/claude-sonnet-4",
          input_artifact_hash: "sha256:abc",
          output_hash: "sha256:o2",
          status: "completed",
          review_window: {
            start_at: "2026-05-10T00:00:00Z",
            end_at: "2026-05-16T00:00:00Z",
          },
          scores: {
            directional_accuracy: 0.75,
            evidence_coverage: 0.75,
            calibration_error: 0.25,
            overclaim_penalty: 0.2,
            final_score: 0.74,
          },
        },
      ],
    };

    const reportA = buildThesisBenchmarkReport(input);
    const reportB = buildThesisBenchmarkReport(input);

    expect(reportA).toEqual(reportB);
    expect(reportA.summary.top_model_id).toBe("openai/gpt-5.3-codex");
    expect(reportA.summary.recommendation).toMatch(/promote/i);
    expect(reportA.review_only).toBe(true);
    expect(reportA.markdown).toContain("## Weekly Thesis Benchmark Report");
    expect(reportA.markdown).toContain("Top model: openai/gpt-5.3-codex");
  });

  it("flags low-score and failed runs as failure cases", () => {
    const input: BenchmarkReportInput = {
      run_id: "run-2026w21-wheat",
      market_key: "wheat",
      grain_week: 21,
      review_window: {
        start_at: "2026-05-17T00:00:00Z",
        end_at: "2026-05-23T00:00:00Z",
      },
      runs: [
        {
          run_id: "run-2026w21-wheat",
          model_id: "model/high",
          input_artifact_hash: "sha256:def",
          output_hash: "sha256:o3",
          status: "completed",
          review_window: {
            start_at: "2026-05-17T00:00:00Z",
            end_at: "2026-05-23T00:00:00Z",
          },
          scores: {
            directional_accuracy: 0.8,
            evidence_coverage: 0.8,
            calibration_error: 0.2,
            overclaim_penalty: 0.1,
            final_score: 0.82,
          },
        },
        {
          run_id: "run-2026w21-wheat",
          model_id: "model/low",
          input_artifact_hash: "sha256:def",
          output_hash: "sha256:o4",
          status: "completed",
          review_window: {
            start_at: "2026-05-17T00:00:00Z",
            end_at: "2026-05-23T00:00:00Z",
          },
          scores: {
            directional_accuracy: 0.4,
            evidence_coverage: 0.4,
            calibration_error: 0.7,
            overclaim_penalty: 0.8,
            final_score: 0.33,
          },
        },
        {
          run_id: "run-2026w21-wheat",
          model_id: "model/failed",
          input_artifact_hash: "sha256:def",
          output_hash: "sha256:o5",
          status: "failed",
          review_window: {
            start_at: "2026-05-17T00:00:00Z",
            end_at: "2026-05-23T00:00:00Z",
          },
          scores: {
            directional_accuracy: 0,
            evidence_coverage: 0,
            calibration_error: 1,
            overclaim_penalty: 1,
            final_score: 0,
          },
        },
      ],
    };

    const report = buildThesisBenchmarkReport(input);

    expect(report.summary.failure_cases).toEqual([
      "model/failed (status=failed)",
      "model/low (final_score=0.33)",
    ]);
    expect(report.summary.recommendation).toMatch(/review/i);
  });
});
