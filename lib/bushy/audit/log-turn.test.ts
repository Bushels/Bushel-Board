// WS6 Task 6.3 — log-turn tests.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logTurn, hashSystemPrompt, providerForModel } from "./log-turn";
import type { AuditRecord } from "../types";

function mockSupabase(
  error: { message: string } | null = null,
): {
  client: SupabaseClient;
  __inserts: Array<{ table: string; row: Record<string, unknown> }>;
} {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from: vi.fn((table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: null, error });
      },
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, __inserts: inserts };
}

function sampleRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    turnId: "turn-1",
    threadId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    userId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    messageId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    responseMessageId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
    modelId: "claude-sonnet-4.6",
    provider: "anthropic",
    experimentId: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee",
    variant: "control",
    systemPromptHash: "abc123def456",
    systemPromptTokens: 1200,
    promptTokens: 1300,
    completionTokens: 250,
    cachedTokens: 800,
    costUsd: 0.0042,
    latencyMs: 1850,
    toolCallCount: 2,
    toolCallsLog: [
      { name: "get_weather", ok: true, latencyMs: 120 },
      { name: "query_posted_prices", ok: true, latencyMs: 80 },
    ],
    extractionIds: ["ffffffff-ffff-4fff-ffff-ffffffffffff"],
    finishReason: "stop",
    ...overrides,
  };
}

describe("logTurn", () => {
  it("inserts a row with expected column shape", async () => {
    const { client, __inserts } = mockSupabase();
    await logTurn(client, sampleRecord());

    expect(__inserts).toHaveLength(1);
    expect(__inserts[0].table).toBe("chat_turns_audit");
    expect(__inserts[0].row).toMatchObject({
      turn_id: "turn-1",
      model_id: "claude-sonnet-4.6",
      provider: "anthropic",
      assigned_variant: "control",
      prompt_tokens: 1300,
      completion_tokens: 250,
      cached_tokens: 800,
      cost_usd: 0.0042,
      tool_call_count: 2,
      extractions_written: 1,
      finish_reason: "stop",
    });
  });

  it("honors the v_tool_usage_7d schema contract on tool_calls_jsonb", async () => {
    const { client, __inserts } = mockSupabase();
    await logTurn(client, sampleRecord());

    const tcJsonb = __inserts[0].row.tool_calls_jsonb as {
      tools: string[];
      detail: unknown[];
    };
    // Must include a 'tools' key — v_tool_usage_7d uses
    // `tool_calls_jsonb ? 'tools'` guard and `jsonb_array_elements_text(... -> 'tools')`.
    expect(tcJsonb.tools).toEqual(["get_weather", "query_posted_prices"]);
    expect(tcJsonb.detail).toHaveLength(2);
  });

  it("defaults missing numeric fields to 0", async () => {
    const { client, __inserts } = mockSupabase();
    await logTurn(client, {
      ...sampleRecord(),
      promptTokens: undefined,
      completionTokens: undefined,
      cachedTokens: undefined,
      costUsd: undefined,
      toolCallCount: undefined,
      finishReason: undefined,
    });
    expect(__inserts[0].row).toMatchObject({
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
      cost_usd: 0,
      tool_call_count: 0,
      finish_reason: "stop",
    });
  });

  it("swallows insert errors with a console.warn rather than throwing", async () => {
    const { client } = mockSupabase({ message: "permission denied" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(logTurn(client, sampleRecord())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("chat_turns_audit insert failed"),
    );
    warnSpy.mockRestore();
  });

  it("records error finishReason and errorMessage when provided", async () => {
    const { client, __inserts } = mockSupabase();
    await logTurn(client, {
      ...sampleRecord(),
      finishReason: "error",
      errorMessage: "stream timed out",
    });
    expect(__inserts[0].row.finish_reason).toBe("error");
    expect(__inserts[0].row.error_message).toBe("stream timed out");
  });
});

describe("hashSystemPrompt", () => {
  it("returns a 16-character hex string", () => {
    const hash = hashSystemPrompt("You are Bushy. Lorem ipsum.");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces identical hashes for identical input", () => {
    const a = hashSystemPrompt("same prompt");
    const b = hashSystemPrompt("same prompt");
    expect(a).toBe(b);
  });

  it("produces different hashes for different input", () => {
    expect(hashSystemPrompt("a")).not.toBe(hashSystemPrompt("b"));
  });
});

describe("providerForModel", () => {
  it.each([
    ["claude-sonnet-4.6", "anthropic"],
    ["claude-opus-4.7", "anthropic"],
    ["grok-4.20-reasoning", "xai"],
    ["gpt-4o", "openai"],
    ["gpt-4.1", "openai"],
    ["o1-preview", "openai"],
    ["o3-mini", "openai"],
    ["deepseek/deepseek-chat", "openrouter"],
    ["meta-llama/llama-3.1-70b", "openrouter"],
  ])("routes %s → %s", (modelId, expected) => {
    expect(providerForModel(modelId)).toBe(expected);
  });
});
