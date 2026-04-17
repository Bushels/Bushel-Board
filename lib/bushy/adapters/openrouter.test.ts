// WS2 Task 2.6 — Bushy chat harness
// OpenRouterAdapter tests. Uses the same openai SDK mock pattern as
// OpenAIAdapter — OpenRouter just subclasses it with baseURL override.
//
// Core assertion: when OpenRouter's usage.cost field is present, it
// overrides the pricing-table cost (which would be 0 for OpenRouter-only
// models like deepseek/deepseek-chat not in MODEL_PRICING).

import { describe, it, expect, beforeEach, vi } from "vitest";

type ChunkScript = { chunks: Array<Record<string, unknown>> };
const scripts: ChunkScript[] = [];
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
  process.env.OPENROUTER_API_KEY = "test-or-key";
  process.env.OPENAI_API_KEY = "test-openai-key"; // Parent ctor reads it
});

describe("OpenRouterAdapter", () => {
  it("uses openrouter.ai baseURL + OPENROUTER_API_KEY", async () => {
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
      ],
    });
    const { OpenRouterAdapter } = await import("./openrouter");
    const adapter = new OpenRouterAdapter("deepseek/deepseek-chat");
    await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: () => {},
      onToolCall: async () => "",
    });
    expect(adapter.provider).toBe("openrouter");
    expect(sdkCalls[0]).toEqual({
      apiKey: "test-or-key",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("prefers OpenRouter's usage.cost over pricing-table value", async () => {
    // deepseek/deepseek-chat is NOT in MODEL_PRICING, so calculateCost
    // returns 0. OpenRouter's usage.cost should win.
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "y" }, finish_reason: "stop" }] },
        {
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 10,
            cost: 0.00042, // OpenRouter-billed USD
          },
        },
      ],
    });
    const { OpenRouterAdapter } = await import("./openrouter");
    const adapter = new OpenRouterAdapter("deepseek/deepseek-chat");
    const result = await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: () => {},
      onToolCall: async () => "",
    });
    expect(result.costUsd).toBeCloseTo(0.00042, 10);
  });

  it("falls back to pricing-table cost when usage.cost is absent", async () => {
    // gpt-4o IS in MODEL_PRICING, so calculateCost returns a real value
    // that the adapter should keep when OpenRouter omits usage.cost.
    scripts.push({
      chunks: [
        { choices: [{ delta: { content: "z" }, finish_reason: "stop" }] },
        {
          choices: [],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
          // no cost field
        },
      ],
    });
    const { OpenRouterAdapter } = await import("./openrouter");
    const adapter = new OpenRouterAdapter("gpt-4o");
    const result = await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: () => {},
      onToolCall: async () => "",
    });
    // gpt-4o: 100*2.5e-6 + 10*10e-6 = 0.00035
    expect(result.costUsd).toBeCloseTo(100 * 2.5e-6 + 10 * 10e-6, 10);
  });

  it("throws at construction when OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { OpenRouterAdapter } = await import("./openrouter");
    expect(() => new OpenRouterAdapter("deepseek/deepseek-chat")).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });
});
