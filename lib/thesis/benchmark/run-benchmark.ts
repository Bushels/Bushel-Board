import { createHash } from "node:crypto";

import { stableStringify } from "../../forecast-experiments/snapshot";
import {
  parseModelBenchmarkRunV1,
  type ModelBenchmarkRunV1,
} from "./types";

export interface ThesisBenchmarkModelRunInput {
  model_id: string;
  replay_output?: unknown;
}

export interface ThesisBenchmarkInput {
  run_id: string;
  input_artifact_hash: string;
  review_window: {
    start_at: string;
    end_at: string;
  };
  replay_mode: boolean;
  model_runs: ThesisBenchmarkModelRunInput[];
}

export interface ThesisBenchmarkPackage {
  run_id: string;
  replay_mode: boolean;
  guardrails: {
    executes_production_writes: false;
    production_tables: readonly [];
    target_tables: readonly ["experimental.model_benchmark_runs"];
    forbidden_operations: readonly string[];
  };
  runs: ModelBenchmarkRunV1[];
  package_hash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function outputHash(output: unknown): string {
  return `sha256:${sha256(stableStringify(output))}`;
}

function buildDeterministicScores(): ModelBenchmarkRunV1["scores"] {
  return {
    directional_accuracy: 0,
    evidence_coverage: 0,
    calibration_error: 0,
    overclaim_penalty: 0,
    final_score: 0,
  };
}

export function runThesisModelBenchmark(input: ThesisBenchmarkInput): ThesisBenchmarkPackage {
  if (!input.replay_mode) {
    throw new Error("Only replay_mode is supported in no-write benchmark executor v1.");
  }

  const runs = input.model_runs
    .map((modelRun) => {
      if (modelRun.replay_output === undefined) {
        throw new Error(`replay_output is required for model ${modelRun.model_id} in replay mode.`);
      }

      return parseModelBenchmarkRunV1({
        run_id: input.run_id,
        model_id: modelRun.model_id,
        input_artifact_hash: input.input_artifact_hash,
        output_hash: outputHash(modelRun.replay_output),
        scores: buildDeterministicScores(),
        review_window: input.review_window,
        status: "completed",
      });
    })
    .sort((a, b) => a.model_id.localeCompare(b.model_id));

  const packageWithoutHash = {
    run_id: input.run_id,
    replay_mode: input.replay_mode,
    guardrails: {
      executes_production_writes: false,
      production_tables: [],
      target_tables: ["experimental.model_benchmark_runs"],
      forbidden_operations: [
        "production_thesis_write",
        "production_market_analysis_write",
        "supabase_mutation",
        "live_model_api_call",
      ],
    } as const,
    runs,
  };

  return {
    ...packageWithoutHash,
    package_hash: `sha256:${sha256(stableStringify(packageWithoutHash))}`,
  };
}
