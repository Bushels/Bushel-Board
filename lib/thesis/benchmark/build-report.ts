import { type ModelBenchmarkRunV1 } from "./types";

export interface BenchmarkReportInput {
  run_id: string;
  market_key: string;
  grain_week: number;
  review_window: {
    start_at: string;
    end_at: string;
  };
  runs: ModelBenchmarkRunV1[];
}

export interface BenchmarkReportOutput {
  review_only: true;
  summary: {
    run_id: string;
    market_key: string;
    grain_week: number;
    top_model_id: string;
    top_model_score: number;
    model_count: number;
    failure_cases: string[];
    recommendation: string;
  };
  markdown: string;
}

function sortRuns(runs: ModelBenchmarkRunV1[]): ModelBenchmarkRunV1[] {
  return [...runs].sort((a, b) => {
    if (b.scores.final_score !== a.scores.final_score) {
      return b.scores.final_score - a.scores.final_score;
    }

    return a.model_id.localeCompare(b.model_id);
  });
}

function identifyFailureCases(runs: ModelBenchmarkRunV1[]): string[] {
  return runs
    .flatMap((run) => {
      if (run.status !== "completed") {
        return [`${run.model_id} (status=${run.status})`];
      }

      if (run.scores.final_score < 0.5) {
        return [`${run.model_id} (final_score=${run.scores.final_score.toFixed(2)})`];
      }

      return [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function recommendation(topScore: number, failureCount: number): string {
  if (topScore >= 0.8 && failureCount === 0) {
    return "Promote top model to next review cycle candidate and continue weekly verification.";
  }

  return "Review failure cases before any promotion decision; keep benchmark lane in review-only mode.";
}

function toMarkdown(input: BenchmarkReportInput, sortedRuns: ModelBenchmarkRunV1[], failureCases: string[]): string {
  const top = sortedRuns[0];

  const lines: string[] = [
    "## Weekly Thesis Benchmark Report",
    "",
    `- Run ID: ${input.run_id}`,
    `- Market: ${input.market_key}`,
    `- Grain week: ${input.grain_week}`,
    `- Review window: ${input.review_window.start_at} -> ${input.review_window.end_at}`,
    `- Top model: ${top.model_id}`,
    `- Top score: ${top.scores.final_score.toFixed(3)}`,
    "",
    "### Model results",
    ...sortedRuns.map(
      (run) =>
        `- ${run.model_id}: final=${run.scores.final_score.toFixed(3)}, status=${run.status}, direction=${run.scores.directional_accuracy.toFixed(3)}, evidence=${run.scores.evidence_coverage.toFixed(3)}`,
    ),
    "",
    "### Failure cases",
    ...(failureCases.length > 0 ? failureCases.map((value) => `- ${value}`) : ["- None"]),
    "",
    "### Recommendation",
    `- ${recommendation(top.scores.final_score, failureCases.length)}`,
    "",
    "_Review-only artifact. Do not auto-promote to production publish path._",
  ];

  return lines.join("\n");
}

export function buildThesisBenchmarkReport(input: BenchmarkReportInput): BenchmarkReportOutput {
  if (input.runs.length === 0) {
    throw new Error("At least one benchmark run is required to build report.");
  }

  const sortedRuns = sortRuns(input.runs);
  const top = sortedRuns[0];
  const failureCases = identifyFailureCases(sortedRuns);
  const recommendationText = recommendation(top.scores.final_score, failureCases.length);

  return {
    review_only: true,
    summary: {
      run_id: input.run_id,
      market_key: input.market_key,
      grain_week: input.grain_week,
      top_model_id: top.model_id,
      top_model_score: top.scores.final_score,
      model_count: sortedRuns.length,
      failure_cases: failureCases,
      recommendation: recommendationText,
    },
    markdown: toMarkdown(input, sortedRuns, failureCases),
  };
}
