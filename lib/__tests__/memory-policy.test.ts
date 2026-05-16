import { describe, expect, it } from "vitest";

import {
  evaluateMemoryWritePolicy,
  type MemoryPolicyInput,
} from "../chat/memory/memory-policy";

describe("evaluateMemoryWritePolicy", () => {
  it("accepts high-confidence stable fact", () => {
    const input: MemoryPolicyInput = {
      candidate: {
        key: "preferred_elevator",
        value: "Lethbridge South",
        memory_class: "stable_fact",
        confidence_score: 0.92,
        extracted_at: "2026-05-15T00:00:00Z",
      },
      now_iso: "2026-05-16T00:00:00Z",
      existing_active: [],
    };

    const result = evaluateMemoryWritePolicy(input);
    expect(result.decision).toBe("accept");
  });

  it("rejects low-confidence candidate", () => {
    const input: MemoryPolicyInput = {
      candidate: {
        key: "delivery_preference",
        value: "spot",
        memory_class: "preference",
        confidence_score: 0.41,
        extracted_at: "2026-05-15T00:00:00Z",
      },
      now_iso: "2026-05-16T00:00:00Z",
      existing_active: [],
    };

    const result = evaluateMemoryWritePolicy(input);
    expect(result.decision).toBe("reject");
    expect(result.reason).toMatch(/low-confidence/i);
  });

  it("rejects stale candidate", () => {
    const input: MemoryPolicyInput = {
      candidate: {
        key: "grain_marketing_style",
        value: "incremental",
        memory_class: "stable_fact",
        confidence_score: 0.95,
        extracted_at: "2025-12-01T00:00:00Z",
      },
      now_iso: "2026-05-16T00:00:00Z",
      existing_active: [],
    };

    const result = evaluateMemoryWritePolicy(input);
    expect(result.decision).toBe("reject");
    expect(result.reason).toMatch(/stale/i);
  });

  it("rejects contradictory candidate when newer high-confidence canonical value exists", () => {
    const input: MemoryPolicyInput = {
      candidate: {
        key: "preferred_elevator",
        value: "Regina Inland",
        memory_class: "preference",
        confidence_score: 0.76,
        extracted_at: "2026-05-15T00:00:00Z",
      },
      now_iso: "2026-05-16T00:00:00Z",
      existing_active: [
        {
          key: "preferred_elevator",
          value: "Lethbridge South",
          memory_class: "preference",
          confidence_score: 0.9,
          updated_at: "2026-05-15T12:00:00Z",
        },
      ],
    };

    const result = evaluateMemoryWritePolicy(input);
    expect(result.decision).toBe("reject");
    expect(result.reason).toMatch(/contradict/i);
  });

  it("rejects volatile_signal class from durable memory writes", () => {
    const input: MemoryPolicyInput = {
      candidate: {
        key: "today_mood",
        value: "stressed",
        memory_class: "volatile_signal",
        confidence_score: 0.99,
        extracted_at: "2026-05-15T00:00:00Z",
      },
      now_iso: "2026-05-16T00:00:00Z",
      existing_active: [],
    };

    const result = evaluateMemoryWritePolicy(input);
    expect(result.decision).toBe("reject");
    expect(result.reason).toMatch(/volatile/i);
  });
});
