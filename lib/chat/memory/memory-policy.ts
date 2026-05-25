export type MemoryClass = "stable_fact" | "preference" | "volatile_signal";

export interface MemoryCandidate {
  key: string;
  value: string;
  memory_class: MemoryClass;
  confidence_score: number;
  extracted_at: string;
}

export interface ExistingActiveMemory {
  key: string;
  value: string;
  memory_class: MemoryClass;
  confidence_score: number;
  updated_at: string;
}

export interface MemoryPolicyInput {
  candidate: MemoryCandidate;
  now_iso: string;
  existing_active: ExistingActiveMemory[];
}

export interface MemoryPolicyDecision {
  decision: "accept" | "reject";
  reason?: string;
}

const MIN_CONFIDENCE_BY_CLASS: Record<Exclude<MemoryClass, "volatile_signal">, number> = {
  stable_fact: 0.8,
  preference: 0.65,
};

const MAX_AGE_DAYS_BY_CLASS: Record<Exclude<MemoryClass, "volatile_signal">, number> = {
  stable_fact: 120,
  preference: 180,
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function ageInDays(nowIso: string, pastIso: string): number {
  const now = Date.parse(nowIso);
  const past = Date.parse(pastIso);

  if (!Number.isFinite(now) || !Number.isFinite(past)) {
    return Number.POSITIVE_INFINITY;
  }

  return (now - past) / (1000 * 60 * 60 * 24);
}

function hasContradictoryCanonicalValue(input: MemoryPolicyInput): boolean {
  const candidate = input.candidate;
  const candidateNormalized = normalizeValue(candidate.value);
  const candidateExtractedAt = Date.parse(candidate.extracted_at);

  return input.existing_active.some((existing) => {
    if (existing.key !== candidate.key) {
      return false;
    }

    if (normalizeValue(existing.value) === candidateNormalized) {
      return false;
    }

    const confidenceGapOk = existing.confidence_score >= candidate.confidence_score + 0.1;
    const existingUpdatedAt = Date.parse(existing.updated_at);
    const recencyOk =
      Number.isFinite(existingUpdatedAt) &&
      Number.isFinite(candidateExtractedAt) &&
      existingUpdatedAt >= candidateExtractedAt;

    return confidenceGapOk && recencyOk;
  });
}

export function evaluateMemoryWritePolicy(input: MemoryPolicyInput): MemoryPolicyDecision {
  const candidate = input.candidate;

  if (candidate.memory_class === "volatile_signal") {
    return { decision: "reject", reason: "volatile_signal entries are excluded from durable memory writes." };
  }

  const minConfidence = MIN_CONFIDENCE_BY_CLASS[candidate.memory_class];
  if (candidate.confidence_score < minConfidence) {
    return {
      decision: "reject",
      reason: `low-confidence candidate (${candidate.confidence_score.toFixed(2)}) is below ${candidate.memory_class} threshold (${minConfidence.toFixed(2)}).`,
    };
  }

  const ageDays = ageInDays(input.now_iso, candidate.extracted_at);
  const maxAgeDays = MAX_AGE_DAYS_BY_CLASS[candidate.memory_class];
  if (ageDays > maxAgeDays) {
    return {
      decision: "reject",
      reason: `stale candidate (${Math.floor(ageDays)} days old) exceeds ${candidate.memory_class} max age (${maxAgeDays} days).`,
    };
  }

  if (hasContradictoryCanonicalValue(input)) {
    return {
      decision: "reject",
      reason: "contradictory candidate conflicts with newer high-confidence canonical memory value.",
    };
  }

  return { decision: "accept" };
}
