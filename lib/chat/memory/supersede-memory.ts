import { evaluateMemoryWritePolicy } from "./memory-policy";

export interface DurableMemoryEntry {
  key: string;
  value: string;
  grain: string | null;
  confidence_score: number;
  memory_class: "stable_fact" | "preference" | "volatile_signal";
  source_thread_id: string | null;
  extracted_at: string;
}

export interface SupersessionCandidate {
  key: string;
  value: string;
  grain: string | null;
  confidence_score: number;
  memory_class: "stable_fact" | "preference" | "volatile_signal";
  source_thread_id: string | null;
  extracted_at: string;
}

export interface SupersessionResult {
  decision: "accept" | "reject";
  reason?: string;
  active_entries: DurableMemoryEntry[];
  superseded_entries: DurableMemoryEntry[];
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
