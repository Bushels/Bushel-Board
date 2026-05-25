export type MemoryClass = "stable_fact" | "preference" | "volatile_signal";

export interface DurableMemoryEntry {
  key: string;
  value: string;
  grain: string | null;
  confidence_score: number;
  memory_class: MemoryClass;
  source_thread_id: string | null;
  extracted_at: string;
}

export interface SupersessionCandidate {
  key: string;
  value: string;
  grain: string | null;
  confidence_score: number;
  memory_class: MemoryClass;
  source_thread_id: string | null;
  extracted_at: string;
}

export interface SupersessionResult {
  decision: "accept" | "reject";
  reason?: string;
  active_entries: DurableMemoryEntry[];
  superseded_entries: DurableMemoryEntry[];
}

interface MemoryCandidate {
  key: string;
  value: string;
  memory_class: MemoryClass;
  confidence_score: number;
  extracted_at: string;
}

interface ExistingActiveMemory {
  key: string;
  value: string;
  memory_class: MemoryClass;
  confidence_score: number;
  updated_at: string;
}

interface MemoryPolicyInput {
  candidate: MemoryCandidate;
  now_iso: string;
  existing_active: ExistingActiveMemory[];
}

interface MemoryPolicyDecision {
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

function evaluateMemoryWritePolicy(input: MemoryPolicyInput): MemoryPolicyDecision {
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

function normalizeGrain(grain: string | null): string | null {
  const value = grain?.trim();
  return value ? value : null;
}

function sameScope(a: { key: string; grain: string | null }, b: { key: string; grain: string | null }): boolean {
  return a.key === b.key && normalizeGrain(a.grain) === normalizeGrain(b.grain);
}

export function applyMemorySupersession(
  existing: DurableMemoryEntry[],
  candidate: SupersessionCandidate,
  nowIso = new Date().toISOString(),
): SupersessionResult {
  const normalizedCandidate: SupersessionCandidate = {
    ...candidate,
    grain: normalizeGrain(candidate.grain),
  };

  const decision = evaluateMemoryWritePolicy({
    candidate: {
      key: normalizedCandidate.key,
      value: normalizedCandidate.value,
      memory_class: normalizedCandidate.memory_class,
      confidence_score: normalizedCandidate.confidence_score,
      extracted_at: normalizedCandidate.extracted_at,
    },
    now_iso: nowIso,
    existing_active: existing
      .filter((entry) => sameScope(entry, normalizedCandidate))
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
        memory_class: entry.memory_class,
        confidence_score: entry.confidence_score,
        updated_at: entry.extracted_at,
      })),
  });

  if (decision.decision === "reject") {
    return {
      decision: "reject",
      reason: decision.reason,
      active_entries: [...existing],
      superseded_entries: [],
    };
  }

  const superseded = existing.filter((entry) => sameScope(entry, normalizedCandidate));
  const retained = existing.filter((entry) => !sameScope(entry, normalizedCandidate));

  const nextEntry: DurableMemoryEntry = {
    key: normalizedCandidate.key,
    value: normalizedCandidate.value,
    grain: normalizedCandidate.grain,
    confidence_score: normalizedCandidate.confidence_score,
    memory_class: normalizedCandidate.memory_class,
    source_thread_id: normalizedCandidate.source_thread_id,
    extracted_at: normalizedCandidate.extracted_at,
  };

  return {
    decision: "accept",
    active_entries: [...retained, nextEntry],
    superseded_entries: superseded,
  };
}
