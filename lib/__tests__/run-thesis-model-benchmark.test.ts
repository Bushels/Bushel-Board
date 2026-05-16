import { describe, expect, it } from "vitest";

import {
  runThesisModelBenchmark,
  type ThesisBenchmarkInput,
} from "../thesis/benchmark/run-benchmark";

function baseInput(): ThesisBenchmarkInput {
  return {
    run_id: "bench-2026w20-canola",
    input_artifact_hash: "sha256:frozen-artifact-123",
    review_window: {
      start_at: "2026-05-15T18:00:00Z",
      end_at: "2026-05-22T18:00:00Z",
    },
    replay_mode: true,
    model_runs: [
      {
        model_id: "openai/gpt-5.3-codex",
        replay_output: {
          bull_points: ["Crush demand strong"],
          bear_points: ["Exports soft"],
          stance_score: 12,
        },
      },
      {
        model_id: "anthropic/claude-sonnet-4",
        replay_output: {
          bull_points: ["Crush demand strong"],
          bear_points: ["Exports soft"],
          stance_score: 11,
        },
      },
    ],
  };
}

describe("runThesisModelBenchmark", () => {
  it("builds deterministic benchmark records from one frozen input hash", () => {
    const first = runThesisModelBenchmark(baseInput());
    const second = runThesisModelBenchmark(baseInput());

    expect(first.package_hash).toBe(second.package_hash);
    expect(first.runs).toHaveLength(2);
    expect(new Set(first.runs.map((run) => run.input_artifact_hash))).toEqual(
      new Set(["sha256:frozen-artifact-123"]),
    );
    expect(first.runs.every((run) => run.status === "completed")).toBe(true);
  });

  it("rejects replay mode when any model output is missing", () => {
    expect(() =>
      runThesisModelBenchmark({
        ...baseInput(),
        model_runs: [
          {
            model_id: "openai/gpt-5.3-codex",
          },
        ],
      }),
    ).toThrow(/replay_output is required/i);
  });

  it("enforces no-production-coupling guardrails", () => {
    const result = runThesisModelBenchmark(baseInput());

    expect(result.guardrails.executes_production_writes).toBe(false);
    expect(result.guardrails.production_tables).toEqual([]);
    expect(result.guardrails.forbidden_operations).toContain("production_thesis_write");
  });
});
