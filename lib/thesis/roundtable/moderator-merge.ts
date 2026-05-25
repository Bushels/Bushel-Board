import { parseThesisArtifactV1, type ThesisArtifactV1 } from "../artifact-contract";
import {
  RoundtableRoleOutputSchema,
  normalizeRoundtableRoleOutput,
  type RoundtableConfidence,
  type RoundtableRoleOutput,
} from "./types";

type MergeConfidenceValue = 1 | 2 | 3;

const CONFIDENCE_TO_NUMERIC: Record<RoundtableConfidence, MergeConfidenceValue> = {
  low: 1,
  medium: 2,
  high: 3,
};

const NUMERIC_TO_CONFIDENCE: Record<MergeConfidenceValue, RoundtableConfidence> = {
  1: "low",
  2: "medium",
  3: "high",
};

export interface ModeratorMergeInput {
  region: ThesisArtifactV1["region"];
  market_key: string;
  crop_year: string;
  grain_week: number;
  source_cutoff_at: string;
  artifact_hash: string;
  generated_at: string;
  generator_model: string;
  judge_model: string;
  role_outputs: unknown[];
}

function toSortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function stanceScoreFromClaims(bullCount: number, bearCount: number): number {
  const total = bullCount + bearCount;
  if (total === 0) return 0;
  return Math.max(-100, Math.min(100, Math.round(((bullCount - bearCount) / total) * 100)));
}

function aggregateConfidence(outputs: RoundtableRoleOutput[]): RoundtableConfidence {
  if (outputs.length === 0) return "low";

  const avg =
    outputs.reduce((sum, output) => sum + CONFIDENCE_TO_NUMERIC[output.confidence], 0) / outputs.length;

  const rounded = Math.max(1, Math.min(3, Math.round(avg))) as MergeConfidenceValue;
  return NUMERIC_TO_CONFIDENCE[rounded];
}

function buildDissentNotes(outputs: RoundtableRoleOutput[]): string[] {
  const notes: string[] = [];

  for (const output of outputs) {
    if (output.role !== "bull") {
      for (const claim of output.bull_claims) {
        notes.push(`Minority bull view (${output.role}): ${claim}`);
      }
    }

    if (output.role !== "bear") {
      for (const claim of output.bear_claims) {
        notes.push(`Minority bear view (${output.role}): ${claim}`);
      }
    }

    for (const flag of output.risk_flags) {
      notes.push(`Risk flag: ${flag}`);
    }
  }

  return toSortedUnique(notes);
}

function normalizeAndFilterEvidenceBacked(outputs: unknown[]): RoundtableRoleOutput[] {
  return outputs
    .flatMap((output) => {
      const parsed = RoundtableRoleOutputSchema.safeParse(output);
      if (!parsed.success) {
        return [];
      }
      return [normalizeRoundtableRoleOutput(parsed.data)];
    })
    .filter((output) => output.evidence_refs.length > 0);
}

export function mergeRoundtableOutputsToThesisDraft(input: ModeratorMergeInput): ThesisArtifactV1 {
  const normalizedOutputs = normalizeAndFilterEvidenceBacked(input.role_outputs);

  const bullPoints = toSortedUnique(normalizedOutputs.flatMap((output) => output.bull_claims));
  const bearPoints = toSortedUnique(normalizedOutputs.flatMap((output) => output.bear_claims));

  const artifact = {
    region: input.region,
    market_key: input.market_key,
    crop_year: input.crop_year,
    grain_week: input.grain_week,
    source_cutoff_at: input.source_cutoff_at,
    artifact_hash: input.artifact_hash,
    bull_points: bullPoints.length > 0 ? bullPoints : ["No evidence-backed bull claims"],
    bear_points: bearPoints.length > 0 ? bearPoints : ["No evidence-backed bear claims"],
    confidence: aggregateConfidence(normalizedOutputs),
    stance_score: stanceScoreFromClaims(bullPoints.length, bearPoints.length),
    dissent_notes: buildDissentNotes(normalizedOutputs),
    model_metadata: {
      generator_model: input.generator_model,
      judge_model: input.judge_model,
      generated_at: input.generated_at,
    },
  };

  return parseThesisArtifactV1(artifact);
}
