// WS2 Task 2.3 — Bushy chat harness
// AnthropicAdapter unit tests. SDK is fully mocked — no network calls.
//
// Coverage:
// - Text streaming: adapter emits { type:'text', text } deltas token-by-token.
// - Usage accounting: final input/output/cached tokens match finalMessage.
// - Cost math: costUsd > 0 and matches pricing.ts formula.
// - Tool-use loop: two-round conversation (model calls tool → tool result →
//   model completes).
// - Missing API key: constructor throws at factory time, not mid-call.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Stateful mock storage so we can swap event scripts per test.
type MockEvent = Record<string, unknown>;
type MockStream = {
  [Symbol.asyncIterator]: () => AsyncGenerator<MockEvent>;
  finalMessage: () => Promise<{
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number | null;
    };
  }>;
};

const mockStreamScripts: MockStream[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  // Class-based mock so `new Anthropic(...)` works across vitest's ESM interop.
  // A vi.fn mock-implementation is not reliably `new`-able; a real class is.
  class MockAnthropic {
    messages = {
      stream: () => {
        const next = mockStreamScripts.shift();
        if (!next) {
          throw new Error(
            "Test setup bug: mock stream script exhausted (adapter requested one more stream() than configured)",
          );
        }
        return next;
      },
    };
    constructor(_opts: unknown) {
      // Accept {apiKey:...} quietly
    }
  }
  return { default: MockAnthropic };
});

function makeStream(
  events: MockEvent[],
  final: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  },
): MockStream {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of events) yield e;
    },
    finalMessage: async () => ({ usage: final }),
  };
}

beforeEach(() => {
  mockStreamScripts.length = 0;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("AnthropicAdapter", () => {
  it("streams text deltas and returns a populated TurnResult", async () => {
    mockStreamScripts.push(
      makeStream(
        [
          // Two text chunks, then a stop with usage
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hello " },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "world" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 2 },
          },
        ],
        { input_tokens: 100, output_tokens: 2, cache_read_input_tokens: 0 },
      ),
    );

    const { AnthropicAdapter } = await import("./anthropic");
    const adapter = new AnthropicAdapter("claude-sonnet-4.6");
    const deltas: unknown[] = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "You are Bushy",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: (d) => deltas.push(d),
      onToolCall: async () => "",
    });

    // First two deltas are text; last delta is 'done'
    expect(deltas[0]).toEqual({ type: "text", text: "Hello " });
    expect(deltas[1]).toEqual({ type: "text", text: "world" });
    expect(deltas[2]).toMatchObject({ type: "done" });
    expect(result.modelId).toBe("claude-sonnet-4.6");
    expect(result.provider ?? "anthropic").toBe("anthropic"); // provider comes from adapter instance
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(2);
    expect(result.cachedTokens).toBe(0);
    // Sonnet 4.6: 100 input * 3e-6 + 2 output * 15e-6
    expect(result.costUsd).toBeCloseTo(100 * 3e-6 + 2 * 15e-6, 10);
    expect(result.finishReason).toBe("stop");
    expect(result.toolCallCount).toBe(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("captures cached tokens and discounts them in the cost", async () => {
    mockStreamScripts.push(
      makeStream(
        [
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "cached hello" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 3 },
          },
        ],
        {
          input_tokens: 1000,
          output_tokens: 3,
          cache_read_input_tokens: 800,
        },
      ),
    );

    const { AnthropicAdapter } = await import("./anthropic");
    const adapter = new AnthropicAdapter("claude-sonnet-4.6");
    const result = await adapter.streamCompletion({
      systemPrompt: "cached system prompt",
      messages: [{ role: "user", content: "hi again" }],
      tools: [],
      onDelta: () => {},
      onToolCall: async () => "",
    });

    expect(result.cachedTokens).toBe(800);
    // Expected: 200 uncached * 3e-6 + 800 cached * 0.3e-6 + 3 out * 15e-6
    const expected = 200 * 3e-6 + 800 * 0.3e-6 + 3 * 15e-6;
    expect(result.costUsd).toBeCloseTo(expected, 10);
  });

  it("runs the tool-use loop: executes tool, continues, reports round totals", async () => {
    // Round 1: model emits a tool_use block with JSON args, then stops with
    // stop_reason=tool_use.
    mockStreamScripts.push(
      makeStream(
        [
          {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "tool_1",
              name: "get_weather",
            },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "input_json_delta",
              partial_json: '{"postal":"T0L',
            },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: ' 1A0"}' },
          },
          { type: "content_block_stop", index: 0 },
          {
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
            usage: { output_tokens: 8 },
          },
        ],
        { input_tokens: 100, output_tokens: 8 },
      ),
    );

    // Round 2: model sees the tool_result and answers.
    mockStreamScripts.push(
      makeStream(
        [
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "It's sunny." },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 4 },
          },
        ],
        { input_tokens: 120, output_tokens: 4 },
      ),
    );

    const { AnthropicAdapter } = await import("./anthropic");
    const adapter = new AnthropicAdapter("claude-sonnet-4.6");
    const toolCalls: unknown[] = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "weather bot",
      messages: [{ role: "user", content: "weather in T0L?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "weather",
            parameters: { type: "object" },
          },
        },
      ],
      onDelta: () => {},
      onToolCall: async (c) => {
        toolCalls.push(c);
        expect(c.id).toBe("tool_1");
        expect(c.function.name).toBe("get_weather");
        expect(JSON.parse(c.function.arguments)).toEqual({ postal: "T0L 1A0" });
        return JSON.stringify({ tempC: 12, condition: "sunny" });
      },
    });

    expect(toolCalls).toHaveLength(1);
    expect(result.toolCallCount).toBe(1);
    // Prompt tokens sum across rounds: 100 + 120 = 220
    expect(result.promptTokens).toBe(220);
    // finishReason is from the LAST round, which ended normally
    expect(result.finishReason).toBe("stop");
  });

  it("throws at construction when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { AnthropicAdapter } = await import("./anthropic");
    expect(() => new AnthropicAdapter("claude-sonnet-4.6")).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
});
