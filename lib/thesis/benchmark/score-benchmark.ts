import { type ModelBenchmarkRunV1 } from "./types";

export type BenchmarkConfidence = "low" | "medium" | "high";

export interface BenchmarkScoreInput {
  expected_outcome_stance_score: number;
  predicted_stance_score: number;
  confidence: BenchmarkConfidence;
  evidence_ref_count: number;
  required_evidence_ref_count: number;
  unsupported_claim_count: number;
  overclaim_flag_count: number;
}

const WEIGHTS = {
  directional_accuracy: 0.45,
  evidence_coverage: 0.25,
  calibration_component: 0.2,
  overclaim_component: 0.1,
} as const;

const CONFIDENCE_TO_PROBABILITY: Record<BenchmarkConfidence, number> = {
  low: 0.35,
  medium: 0.6,
  high: 0.85,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundTo(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function stanceBucket(score: number): "bull" | "bear" | "neutral" {
  if (score >= 10) return "bull";
  if (score <= -10) return "bear";
  return "neutral";
}

function directionalAccuracy(expected: number, predicted: number): number {
  const expectedBucket = stanceBucket(expected);
  const predictedBucket = stanceBucket(predicted);

  if (expectedBucket === predictedBucket) return 1;
  if (expectedBucket === "neutral" || predictedBucket === "neutral") return 0.5;
  return 0;
}

function evidenceCoverage(evidenceRefCount: number, requiredEvidenceRefCount: number): number {
  if (requiredEvidenceRefCount <= 0) {
    return 1;
  }

  return clamp01(evidenceRefCount / requiredEvidenceRefCount);
}

function calibrationError(confidence: BenchmarkConfidence, directional_accuracy: number): number {
  const confidenceProbability = CONFIDENCE_TO_PROBABILITY[confidence];
  return clamp01(Math.abs(confidenceProbability - directional_accuracy));
}

function overclaimPenalty(unsupportedClaimCount: number, overclaimFlagCount: number): number {
  const unsupportedRatioDenominator = Math.max(1, unsupportedClaimCount + 2);
  const unsupportedRatio = unsupportedClaimCount / unsupportedRatioDenominator;
  const flagPenalty = overclaimFlagCount * 0.1;

  return clamp01(unsupportedRatio + flagPenalty);
}

function finalScore(subscores: {
  directional_accuracy: number;
  evidence_coverage: number;
  calibration_error: number;
  overclaim_penalty: number;
}): number {
  const raw =
    WEIGHTS.directional_accuracy * subscores.directional_accuracy +
    WEIGHTS.evidence_coverage * subscores.evidence_coverage +
    WEIGHTS.calibration_component * (1 - subscores.calibration_error) +
    WEIGHTS.overclaim_component * (1 - subscores.overclaim_penalty);

  return clamp01(raw);
}

export function scoreBenchmarkRun(input: BenchmarkScoreInput): ModelBenchmarkRunV1["scores"] {
  const directional = directionalAccuracy(
    input.expected_outcome_stance_score,
    input.predicted_stance_score,
  );

  const coverage = evidenceCoverage(input.evidence_ref_count, input.required_evidence_ref_count);
  const calibration = calibrationError(input.confidence, directional);
  const overclaim = overclaimPenalty(input.unsupported_claim_count, input.overclaim_flag_count);
  const final = finalScore({
    directional_accuracy: directional,
    evidence_coverage: coverage,
    calibration_error: calibration,
    overclaim_penalty: overclaim,
  });

  return {
    directional_accuracy: roundTo(directional, 6),
    evidence_coverage: roundTo(coverage, 6),
    calibration_error: roundTo(calibration, 6),
    overclaim_penalty: roundTo(overclaim, 6),
    final_score: roundTo(final, 6),
  };
}
