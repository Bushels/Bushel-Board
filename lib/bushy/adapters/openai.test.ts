// WS2 Task 2.5 — Bushy chat harness
// OpenAIAdapter unit tests. Mocks the `openai` SDK client.

import { describe, it, expect, beforeEach, vi } from "vitest";

type ChunkScript = {
  chunks: Array<Record<string, unknown>>;
};

const scripts: ChunkScript[] = [];
// Record last-used apiKey + baseURL for OpenRouter test to inspect.
const sdkCalls: Array<{ apiKey?: string; baseURL?: string }> = [];

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: async (_body: Record<string, unknown>) => {
          const script = scripts.shift();
          if (!script) throw new Error("Test bug: script exhausted");
          return {
            [Symbol.asyncIterator]: async function* () {
              for (const c of script.chunks) yield c;
            },
          };
        },
      },
    };
    constructor(opts: { apiKey?: string; baseURL?: string }) {
      sdkCalls.push(opts);
    }
  }
  return { default: MockOpenAI };
});

beforeEach(() => {
  scripts.length = 0;
  sdkCalls.length = 0;
  process.env.OPENAI_API_KEY = "test-openai-key";
});

describe("OpenAIAdapter", () => {
  it("streams text and reports usage with cached token discount", async () => {
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "Hi " } }] },
        {
          choices: [{ delta: { content: "there." }, finish_reason: "stop" }],
        },
        {
          choices: [],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 2,
            prompt_tokens_details: { cached_tokens: 400 },
          },
        },
      ],
    });

    const { OpenAIAdapter } = await import("./openai");
    const adapter = new OpenAIAdapter("gpt-4o");
    const deltas: Array<{ type: string; text?: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      onDelta: (d) => deltas.push(d as never),
      onToolCall: async () => "",
    });

    expect(deltas[0]).toEqual({ type: "text", text: "Hi " });
    expect(deltas[1]).toEqual({ type: "text", text: "there." });
    expect(result.promptTokens).toBe(1000);
    expect(result.completionTokens).toBe(2);
    expect(result.cachedTokens).toBe(400);
    // gpt-4o: 2.5e-6 input, 10e-6 output, 1.25e-6 cached (50% discount).
    const expected =
      (1000 - 400) * 2.5e-6 + 400 * 1.25e-6 + 2 * 10e-6;
    expect(result.costUsd).toBeCloseTo(expected, 10);
  });

  it("accumulates tool_calls by index across chunks", async () => {
    scripts.push({
      chunks: [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_abc",
                    function: { name: "f", arguments: "{\"a\":" },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: "1}" } }],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 5 },
        },
      ],
    });
    // Round 2: final answer
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "done" }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 60, completion_tokens: 1 } },
      ],
    });

    const { OpenAIAdapter } = await import("./openai");
    const adapter = new OpenAIAdapter("gpt-4o");
    const toolCalls: Array<{ id: string; args: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "call tool" }],
      tools: [
        {
          type: "function",
          function: {
            name: "f",
            description: "f",
            parameters: { type: "object" },
          },
        },
      ],
      onDelta: () => {},
      onToolCall: async (c) => {
        toolCalls.push({ id: c.id, args: c.function.arguments });
        return "tool result";
      },
    });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe("call_abc");
    expect(JSON.parse(toolCalls[0].args)).toEqual({ a: 1 });
    expect(result.toolCallCount).toBe(1);
    expect(result.finishReason).toBe("stop");
    expect(result.promptTokens).toBe(110);
  });

  it("emits error delta when SDK throws", async () => {
    // Don't push a script — adapter will see "exhausted" throw, which our
    // mock converts into a thrown Error inside create(). OpenAIAdapter
    // catches and emits an 'error' delta.
    const { OpenAIAdapter } = await import("./openai");
    const adapter = new OpenAIAdapter("gpt-4o");
    const deltas: Array<{ type: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "x" }],
      tools: [],
      onDelta: (d) => deltas.push(d as never),
      onToolCall: async () => "",
    });
    expect(deltas.some((d) => d.type === "error")).toBe(true);
    expect(result.finishReason).toBe("error");
  });

  it("accepts baseURL + apiKey override (used by OpenRouterAdapter)", async () => {
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "." }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
      ],
    });

    const { OpenAIAdapter } = await import("./openai");
    const adapter = new OpenAIAdapter("gpt-4o", {
      apiKey: "override-key",
      baseURL: "https://openrouter.ai/api/v1",
      providerName: "openrouter",
    });
    await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: () => {},
      onToolCall: async () => "",
    });
    expect(adapter.provider).toBe("openrouter");
    expect(sdkCalls[0]).toEqual({
      apiKey: "override-key",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("throws at construction when OPENAI_API_KEY is unset", async () => {
    delete process.env.OPENAI_API_KEY;
    const { OpenAIAdapter } = await import("./openai");
    expect(() => new OpenAIAdapter("gpt-4o")).toThrow(/OPENAI_API_KEY/);
  });
});
