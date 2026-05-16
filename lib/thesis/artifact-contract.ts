import { z } from "zod";

export const ThesisArtifactV1Schema = z
  .object({
    region: z.enum(["CA", "US"]),
    market_key: z.string().min(1),
    crop_year: z.string().min(1),
    grain_week: z.number().int().min(1).max(53),
    source_cutoff_at: z.string().datetime({ offset: true }),
    artifact_hash: z.string().min(1),
    bull_points: z.array(z.string().min(1)).min(1),
    bear_points: z.array(z.string().min(1)).min(1),
    confidence: z.enum(["low", "medium", "high"]),
    stance_score: z.number().int().min(-100).max(100),
    dissent_notes: z.array(z.string().min(1)),
    model_metadata: z.object({
      generator_model: z.string().min(1),
      judge_model: z.string().min(1),
      generated_at: z.string().datetime({ offset: true }),
    }),
  })
  .superRefine((value, ctx) => {
    const cutoff = Date.parse(value.source_cutoff_at);
    const generated = Date.parse(value.model_metadata.generated_at);

    if (Number.isFinite(cutoff) && Number.isFinite(generated) && cutoff > generated) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_cutoff_at must be earlier than or equal to model_metadata.generated_at",
        path: ["source_cutoff_at"],
      });
    }
  });

export type ThesisArtifactV1 = z.infer<typeof ThesisArtifactV1Schema>;

export function parseThesisArtifactV1(input: unknown): ThesisArtifactV1 {
  return ThesisArtifactV1Schema.parse(input);
}

export function isThesisArtifactV1(input: unknown): input is ThesisArtifactV1 {
  return ThesisArtifactV1Schema.safeParse(input).success;
}
