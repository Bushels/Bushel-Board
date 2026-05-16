import { describe, expect, it } from "vitest";

import {
  compressPremiumChatMemory,
  type CompressionCandidate,
  type ExistingMemoryRow,
} from "../../scripts/compress-premium-chat-memory";

describe("compressPremiumChatMemory", () => {
  const nowIso = "2026-05-16T00:00:00Z";

  it("keeps only durable items and archives volatile chatter", () => {
    const candidates: CompressionCandidate[] = [
      {
        user_id: "u1",
        memory_key: "preferred_elevator",
        memory_value: "Regina Inland",
        grain: "Canola",
        memory_class: "preference",
        confidence_score: 0.9,
        extracted_at: "2026-05-15T00:00:00Z",
        source_thread_id: "t1",
      },
      {
        user_id: "u1",
        memory_key: "weather_rumor",
        memory_value: "maybe frost",
        grain: "Canola",
        memory_class: "volatile_signal",
        confidence_score: 0.4,
        extracted_at: "2026-05-15T00:00:00Z",
        source_thread_id: "t1",
      },
    ];

    const result = compressPremiumChatMemory({ nowIso, candidates, existingMemory: [] });

    expect(result.toUpsert).toHaveLength(1);
    expect(result.toUpsert[0]?.memory_key).toBe("preferred_elevator");
    expect(result.artifact.summary.archived_volatile).toBe(1);
  });

  it("emits superseded when durable fact changes against existing memory", () => {
    const candidates: CompressionCandidate[] = [
      {
        user_id: "u1",
        memory_key: "delivery_preference",
        memory_value: "haul",
        grain: "Wheat",
        memory_class: "preference",
        confidence_score: 0.88,
        extracted_at: "2026-05-15T00:00:00Z",
        source_thread_id: "t2",
      },
    ];

    const existingMemory: ExistingMemoryRow[] = [
      {
        user_id: "u1",
        memory_key: "delivery_preference",
        memory_value: "hold",
        grain: "Wheat",
        updated_at: "2026-05-10T00:00:00Z",
      },
    ];

    const result = compressPremiumChatMemory({ nowIso, candidates, existingMemory });

    expect(result.artifact.superseded).toBe(1);
    expect(result.artifact.corroborated).toBe(0);
    expect(result.toUpsert[0]?.memory_value).toBe("haul");
  });

  it("retains high-confidence stable facts with no data loss", () => {
    const candidates: CompressionCandidate[] = [
      {
        user_id: "u1",
        memory_key: "farm_size_acres",
        memory_value: "2800",
        grain: null,
        memory_class: "stable_fact",
        confidence_score: 0.95,
        extracted_at: "2026-05-15T00:00:00Z",
        source_thread_id: "t3",
      },
      {
        user_id: "u1",
        memory_key: "farm_size_acres",
        memory_value: "2700",
        grain: null,
        memory_class: "stable_fact",
        confidence_score: 0.82,
        extracted_at: "2026-05-14T00:00:00Z",
        source_thread_id: "t2",
      },
    ];

    const result = compressPremiumChatMemory({ nowIso, candidates, existingMemory: [] });

    expect(result.toUpsert).toHaveLength(1);
    expect(result.toUpsert[0]?.memory_value).toBe("2800");
    expect(result.artifact.summary.stable_facts_retained).toBe(1);
    expect(result.artifact.discarded).toBe(0);
  });

  it("drops low-confidence durable candidates via policy", () => {
    const candidates: CompressionCandidate[] = [
      {
        user_id: "u1",
        memory_key: "delivery_preference",
        memory_value: "hold",
        grain: "Canola",
        memory_class: "preference",
        confidence_score: 0.5,
        extracted_at: "2026-05-15T00:00:00Z",
        source_thread_id: "t4",
      },
    ];

    const result = compressPremiumChatMemory({ nowIso, candidates, existingMemory: [] });

    expect(result.toUpsert).toHaveLength(0);
    expect(result.artifact.summary.dropped_low_confidence).toBe(1);
    expect(result.artifact.discarded).toBe(1);
  });
});
