import { z } from "zod";

export const BENCHMARK_RUN_STATUS = ["queued", "running", "completed", "failed"] as const;
export type BenchmarkRunStatus = (typeof BENCHMARK_RUN_STATUS)[number];

const BoundedScore = z.number().min(0).max(1);

export const BenchmarkScoresSchema = z.object({
  directional_accuracy: BoundedScore,
  evidence_coverage: BoundedScore,
  calibration_error: BoundedScore,
  overclaim_penalty: BoundedScore,
  final_score: BoundedScore,
});

export const BenchmarkReviewWindowSchema = z
  .object({
    start_at: z.string().datetime({ offset: true }),
    end_at: z.string().datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.start_at);
    const end = Date.parse(value.end_at);

    if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "review_window.start_at must be earlier than or equal to review_window.end_at",
        path: ["start_at"],
      });
    }
  });

export const ModelBenchmarkRunV1Schema = z.object({
  run_id: z.string().trim().min(1),
  model_id: z.string().trim().min(1),
  input_artifact_hash: z.string().trim().min(1),
  output_hash: z.string().trim().min(1),
  scores: BenchmarkScoresSchema,
  review_window: BenchmarkReviewWindowSchema,
  status: z.enum(BENCHMARK_RUN_STATUS),
});

export type ModelBenchmarkRunV1 = z.infer<typeof ModelBenchmarkRunV1Schema>;

export function parseModelBenchmarkRunV1(input: unknown): ModelBenchmarkRunV1 {
  return ModelBenchmarkRunV1Schema.parse(input);
}

export function isModelBenchmarkRunV1(input: unknown): input is ModelBenchmarkRunV1 {
  return ModelBenchmarkRunV1Schema.safeParse(input).success;
}
