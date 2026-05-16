import { createHash } from "node:crypto";

import type { ThesisArtifactV1 } from "../artifact-contract";
import { stableStringify } from "../../forecast-experiments/snapshot";

export type JudgeVerdictStatus = "accept" | "revise" | "reject";

export interface JudgeGateInput {
  thesis_draft: ThesisArtifactV1;
  evidence_refs: string[];
  review_now_iso: string;
  immutable_now_iso: string;
}

export interface JudgeVerdict {
  status: JudgeVerdictStatus;
  reasons: string[];
}

export interface FrozenRoundtableArtifact {
  should_publish: boolean;
  verdict: JudgeVerdict;
  immutable_generated_at: string | null;
  final_artifact_hash: string | null;
  thesis_artifact: ThesisArtifactV1 | null;
}

const OVERCLAIM_PATTERNS = [
  /\bguaranteed\b/i,
  /\bcertain\b/i,
  /\bcan['’]?t lose\b/i,
  /\brisk[- ]?free\b/i,
  /\bno downside\b/i,
  /\balways\b/i,
  /\bnever\b/i,
];

function hasOverclaimLanguage(text: string): boolean {
  return OVERCLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function isValidIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function evaluateRoundtableThesis(input: JudgeGateInput): JudgeVerdict {
  const reasons: string[] = [];

  if (input.evidence_refs.length === 0) {
    reasons.push("Missing evidence refs: at least one citation is required before publish.");
  }

  const allClaims = [...input.thesis_draft.bull_points, ...input.thesis_draft.bear_points];
  if (allClaims.some((claim) => hasOverclaimLanguage(claim))) {
    reasons.push("Overclaim language detected in thesis claims.");
  }

  const sourceCutoffTime = Date.parse(input.thesis_draft.source_cutoff_at);
  const generatedAtTime = Date.parse(input.thesis_draft.model_metadata.generated_at);

  if (!Number.isFinite(sourceCutoffTime) || !Number.isFinite(generatedAtTime)) {
    reasons.push("Invalid timestamp format in source cutoff or generated_at.");
  } else if (generatedAtTime < sourceCutoffTime) {
    reasons.push("Model generated_at cannot be earlier than source cutoff.");
  }

  if (!isValidIsoDate(input.review_now_iso) || !isValidIsoDate(input.immutable_now_iso)) {
    reasons.push("Invalid review/freeze timestamp.");
  }

  if (reasons.length > 0) {
    return {
      status: "reject",
      reasons,
    };
  }

  if (input.thesis_draft.confidence === "low") {
    return {
      status: "revise",
      reasons: ["Low confidence draft requires revision before publish."],
    };
  }

  return {
    status: "accept",
    reasons: [],
  };
}

function hashFrozenPayload(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(payload)).digest("hex")}`;
}

export function freezeRoundtableThesis(
  input: JudgeGateInput,
  verdict: JudgeVerdict,
): FrozenRoundtableArtifact {
  if (verdict.status === "reject") {
    return {
      should_publish: false,
      verdict,
      immutable_generated_at: null,
      final_artifact_hash: null,
      thesis_artifact: null,
    };
  }

  const immutableGeneratedAt = input.immutable_now_iso;
  const frozenArtifact: ThesisArtifactV1 = {
    ...input.thesis_draft,
    model_metadata: {
      ...input.thesis_draft.model_metadata,
      generated_at: immutableGeneratedAt,
    },
  };

  const finalHash = hashFrozenPayload({
    thesis_artifact: frozenArtifact,
    evidence_refs: [...input.evidence_refs].sort((a, b) => a.localeCompare(b)),
    verdict,
  });

  const artifactWithFinalHash: ThesisArtifactV1 = {
    ...frozenArtifact,
    artifact_hash: finalHash,
  };

  return {
    should_publish: true,
    verdict,
    immutable_generated_at: immutableGeneratedAt,
    final_artifact_hash: finalHash,
    thesis_artifact: artifactWithFinalHash,
  };
}
