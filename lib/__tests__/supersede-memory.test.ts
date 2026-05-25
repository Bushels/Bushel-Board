import { describe, expect, it } from "vitest";

import {
  applyMemorySupersession,
  type DurableMemoryEntry,
  type SupersessionCandidate,
} from "../chat/memory/supersede-memory";

describe("applyMemorySupersession", () => {
  it("replaces existing same key+grain and keeps one canonical active value", () => {
    const existing: DurableMemoryEntry[] = [
      {
        key: "preferred_elevator",
        value: "Lethbridge South",
        grain: "Canola",
        confidence_score: 0.78,
        memory_class: "preference",
        source_thread_id: "thread-old",
        extracted_at: "2026-05-10T00:00:00Z",
      },
    ];

    const candidate: SupersessionCandidate = {
      key: "preferred_elevator",
      value: "Regina Inland",
      grain: "Canola",
      confidence_score: 0.91,
      memory_class: "preference",
      source_thread_id: "thread-new",
      extracted_at: "2026-05-16T00:00:00Z",
    };

    const result = applyMemorySupersession(existing, candidate);

    expect(result.active_entries).toHaveLength(1);
    expect(result.active_entries[0]?.value).toBe("Regina Inland");
    expect(result.superseded_entries).toHaveLength(1);
    expect(result.superseded_entries[0]?.source_thread_id).toBe("thread-old");
  });

  it("keeps grain-specific memories independent", () => {
    const existing: DurableMemoryEntry[] = [
      {
        key: "delivery_preference",
        value: "hold",
        grain: "Canola",
        confidence_score: 0.82,
        memory_class: "preference",
        source_thread_id: "thread-a",
        extracted_at: "2026-05-10T00:00:00Z",
      },
    ];

    const candidate: SupersessionCandidate = {
      key: "delivery_preference",
      value: "haul",
      grain: "Wheat",
      confidence_score: 0.84,
      memory_class: "preference",
      source_thread_id: "thread-b",
      extracted_at: "2026-05-16T00:00:00Z",
    };

    const result = applyMemorySupersession(existing, candidate);

    expect(result.active_entries).toHaveLength(2);
    expect(result.superseded_entries).toHaveLength(0);
  });

  it("normalizes empty grain to null and supersedes grain-agnostic key", () => {
    const existing: DurableMemoryEntry[] = [
      {
        key: "farm_size_acres",
        value: "2500",
        grain: null,
        confidence_score: 0.88,
        memory_class: "stable_fact",
        source_thread_id: "thread-a",
        extracted_at: "2026-05-10T00:00:00Z",
      },
    ];

    const candidate: SupersessionCandidate = {
      key: "farm_size_acres",
      value: "2800",
      grain: "",
      confidence_score: 0.93,
      memory_class: "stable_fact",
      source_thread_id: "thread-b",
      extracted_at: "2026-05-16T00:00:00Z",
    };

    const result = applyMemorySupersession(existing, candidate);

    expect(result.active_entries).toHaveLength(1);
    expect(result.active_entries[0]?.grain).toBeNull();
    expect(result.active_entries[0]?.value).toBe("2800");
    expect(result.superseded_entries).toHaveLength(1);
  });
});
