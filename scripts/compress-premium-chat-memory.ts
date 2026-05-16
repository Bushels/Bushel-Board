#!/usr/bin/env npx tsx
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

import {
  evaluateMemoryWritePolicy,
  type MemoryClass,
} from "@/lib/chat/memory/memory-policy";

export interface CompressionCandidate {
  user_id: string;
  memory_key: string;
  memory_value: string;
  grain: string | null;
  memory_class: MemoryClass;
  confidence_score: number;
  extracted_at: string;
  source_thread_id: string | null;
}

export interface ExistingMemoryRow {
  user_id: string;
  memory_key: string;
  memory_value: string;
  grain: string | null;
  updated_at: string;
}

export interface CompressionSummaryArtifact {
  period: "weekly";
  compression_date: string;
  extractions_total: number;
  promoted: number;
  corroborated: number;
  superseded: number;
  discarded: number;
  deferred: number;
  summary: {
    status: "completed";
    promoted_keys: string[];
    archived_volatile: number;
    dropped_low_confidence: number;
    stable_facts_retained: number;
  };
}

function scopeKey(memory_key: string, grain: string | null): string {
  const normalizedGrain = grain?.trim() ? grain.trim().toLowerCase() : "*";
  return `${memory_key}::${normalizedGrain}`;
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function chooseBestCandidate(candidates: CompressionCandidate[]): CompressionCandidate {
  return candidates
    .slice()
    .sort((a, b) => {
      if (b.confidence_score !== a.confidence_score) {
        return b.confidence_score - a.confidence_score;
      }
      return Date.parse(b.extracted_at) - Date.parse(a.extracted_at);
    })[0]!;
}

export function compressPremiumChatMemory(input: {
  nowIso: string;
  candidates: CompressionCandidate[];
  existingMemory: ExistingMemoryRow[];
}): { toUpsert: CompressionCandidate[]; artifact: CompressionSummaryArtifact } {
  const extractionTotal = input.candidates.length;

  const durable = input.candidates.filter((candidate) => candidate.memory_class !== "volatile_signal");
  const archivedVolatile = extractionTotal - durable.length;

  const byScope = new Map<string, CompressionCandidate[]>();
  for (const candidate of durable) {
    const key = `${candidate.user_id}::${scopeKey(candidate.memory_key, candidate.grain)}`;
    const list = byScope.get(key) ?? [];
    list.push(candidate);
    byScope.set(key, list);
  }

  const existingByScope = new Map<string, ExistingMemoryRow>();
  for (const row of input.existingMemory) {
    const key = `${row.user_id}::${scopeKey(row.memory_key, row.grain)}`;
    existingByScope.set(key, row);
  }

  const toUpsert: CompressionCandidate[] = [];
  let droppedLowConfidence = 0;
  let promoted = 0;
  let corroborated = 0;
  let superseded = 0;
  let stableFactsRetained = 0;

  for (const [scoped, grouped] of byScope.entries()) {
    const best = chooseBestCandidate(grouped);
    const existing = existingByScope.get(scoped);

    const decision = evaluateMemoryWritePolicy({
      now_iso: input.nowIso,
      candidate: {
        key: best.memory_key,
        value: best.memory_value,
        memory_class: best.memory_class,
        confidence_score: best.confidence_score,
        extracted_at: best.extracted_at,
      },
      existing_active: existing
        ? [
            {
              key: existing.memory_key,
              value: existing.memory_value,
              memory_class: best.memory_class === "stable_fact" ? "stable_fact" : "preference",
              confidence_score: best.confidence_score,
              updated_at: existing.updated_at,
            },
          ]
        : [],
    });

    if (decision.decision === "reject") {
      droppedLowConfidence += grouped.length;
      continue;
    }

    toUpsert.push(best);

    if (!existing) {
      promoted += 1;
      if (best.memory_class === "stable_fact") stableFactsRetained += 1;
      continue;
    }

    if (existing.memory_value.trim().toLowerCase() === best.memory_value.trim().toLowerCase()) {
      corroborated += 1;
      if (best.memory_class === "stable_fact") stableFactsRetained += 1;
    } else {
      superseded += 1;
      if (best.memory_class === "stable_fact") stableFactsRetained += 1;
    }
  }

  const discarded = archivedVolatile + droppedLowConfidence;
  const deferred = Math.max(0, extractionTotal - (promoted + corroborated + superseded + discarded));

  const artifact: CompressionSummaryArtifact = {
    period: "weekly",
    compression_date: toDateOnly(input.nowIso),
    extractions_total: extractionTotal,
    promoted,
    corroborated,
    superseded,
    discarded,
    deferred,
    summary: {
      status: "completed",
      promoted_keys: toUpsert.map((row) => row.memory_key),
      archived_volatile: archivedVolatile,
      dropped_low_confidence: droppedLowConfidence,
      stable_facts_retained: stableFactsRetained,
    },
  };

  return { toUpsert, artifact };
}

async function main() {
  loadEnvConfig(process.cwd());

  const { values } = parseArgs({
    options: {
      dry: { type: "boolean", default: true },
      days: { type: "string", default: "7" },
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const days = Number(values.days ?? "7");
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    throw new Error("--days must be between 1 and 30");
  }

  const nowIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rawCandidates, error: candidatesError } = await supabase
    .from("chat_extractions")
    .select("user_id, thread_id, data_type, grain, value_text, confidence, extracted_at")
    .gte("extracted_at", sinceIso)
    .eq("discarded", false)
    .eq("promoted", false)
    .limit(1000);

  if (candidatesError) {
    throw new Error(`Failed to read chat_extractions: ${candidatesError.message}`);
  }

  const candidateRows: CompressionCandidate[] = (rawCandidates ?? []).map((row) => {
    const confidenceTag = String(row.confidence ?? "reported");
    const memoryClass: MemoryClass = confidenceTag === "inferred" ? "volatile_signal" : "preference";
    return {
      user_id: String(row.user_id),
      memory_key: String(row.data_type),
      memory_value: String(row.value_text ?? ""),
      grain: (row.grain as string | null) ?? null,
      memory_class: memoryClass,
      confidence_score: confidenceTag === "inferred" ? 0.55 : 0.82,
      extracted_at: String(row.extracted_at),
      source_thread_id: (row.thread_id as string | null) ?? null,
    };
  }).filter((row) => row.memory_value.trim().length > 0);

  const userIds = [...new Set(candidateRows.map((row) => row.user_id))];

  const { data: existingMemory, error: memoryError } = userIds.length
    ? await supabase
        .from("farmer_memory")
        .select("user_id, memory_key, memory_value, grain, updated_at")
        .in("user_id", userIds)
    : { data: [], error: null };

  if (memoryError) {
    throw new Error(`Failed to read farmer_memory: ${memoryError.message}`);
  }

  const result = compressPremiumChatMemory({
    nowIso,
    candidates: candidateRows,
    existingMemory: (existingMemory ?? []) as ExistingMemoryRow[],
  });

  if (!values.dry) {
    for (const row of result.toUpsert) {
      await supabase.from("farmer_memory").upsert(
        {
          user_id: row.user_id,
          memory_key: row.memory_key,
          memory_value: row.memory_value,
          grain: row.grain,
          source_thread_id: row.source_thread_id,
          updated_at: nowIso,
        },
        { onConflict: "user_id,memory_key,grain" },
      );
    }

    await supabase.from("compression_summaries").insert({
      period: "weekly",
      compression_date: result.artifact.compression_date,
      conversations_processed: userIds.length,
      extractions_total: result.artifact.extractions_total,
      promoted: result.artifact.promoted,
      corroborated: result.artifact.corroborated,
      superseded: result.artifact.superseded,
      discarded: result.artifact.discarded,
      deferred: result.artifact.deferred,
      summary: result.artifact.summary,
      patterns_detected: 0,
      flags_for_review: 0,
    });
  }

  console.log(JSON.stringify({ ok: true, dry_run: values.dry, ...result.artifact }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
