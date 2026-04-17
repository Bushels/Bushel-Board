// WS2 Task 2.4 — Bushy chat harness
// XaiAdapter unit tests. Mocks global.fetch to return scripted SSE streams.
//
// Coverage:
// - Basic text streaming: deltas + usage → cost
// - Tool call: multi-chunk tool_calls accumulation + onToolCall execution
// - 4xx / 5xx error path: adapter emits 'error' delta, returns error finishReason
// - Missing XAI_API_KEY throws at construction

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type SseChunk = string;

function sseReadableStream(chunks: SseChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

function mockFetch(
  scripts: Array<{ status?: number; chunks: SseChunk[] } | Error>,
) {
  return vi.fn(async () => {
    const next = scripts.shift();
    if (!next) {
      throw new Error("Test bug: fetch script exhausted");
    }
    if (next instanceof Error) throw next;
    return new Response(sseReadableStream(next.chunks), {
      status: next.status ?? 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });
}

beforeEach(() => {
  process.env.XAI_API_KEY = "test-xai-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("XaiAdapter", () => {
  it("streams text and reports usage + cost", async () => {
    const script = [
      {
        chunks: [
          // Two text chunks + usage + DONE
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "Hello " } }],
          })}\n`,
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "world." }, finish_reason: "stop" }],
            usage: { prompt_tokens: 50, completion_tokens: 3 },
          })}\n`,
          `data: [DONE]\n`,
        ],
      },
    ];
    global.fetch = mockFetch(script) as typeof fetch;

    const { XaiAdapter } = await import("./xai");
    const adapter = new XaiAdapter("grok-4.20-reasoning");
    const deltas: Array<{ type: string; text?: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "you are grok",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onDelta: (d) => deltas.push(d as never),
      onToolCall: async () => "",
    });

    expect(deltas[0]).toEqual({ type: "text", text: "Hello " });
    expect(deltas[1]).toEqual({ type: "text", text: "world." });
    expect(result.promptTokens).toBe(50);
    expect(result.completionTokens).toBe(3);
    // grok-4.20-reasoning: 5e-6 input + 15e-6 output per token
    expect(result.costUsd).toBeCloseTo(50 * 5e-6 + 3 * 15e-6, 10);
    expect(result.finishReason).toBe("stop");
    expect(adapter.provider).toBe("xai");
  });

  it("accumulates split tool_calls args + runs tool loop", async () => {
    const script = [
      // Round 1: streaming tool call, split across 2 chunks
      {
        chunks: [
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      id: "call_1",
                      function: { name: "get_price", arguments: '{"gr' },
                    },
                  ],
                },
              },
            ],
          })}\n`,
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [{ function: { arguments: 'ain":"wheat"}' } }],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 80, completion_tokens: 10 },
          })}\n`,
          `data: [DONE]\n`,
        ],
      },
      // Round 2: model answers after tool result
      {
        chunks: [
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: "$8.50/bu" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 4 },
          })}\n`,
          `data: [DONE]\n`,
        ],
      },
    ];
    global.fetch = mockFetch(script) as typeof fetch;

    const { XaiAdapter } = await import("./xai");
    const adapter = new XaiAdapter("grok-4.20-reasoning");
    const observedCalls: Array<{ id: string; args: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "grain oracle",
      messages: [{ role: "user", content: "wheat price?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_price",
            description: "price",
            parameters: { type: "object" },
          },
        },
      ],
      onDelta: () => {},
      onToolCall: async (c) => {
        observedCalls.push({ id: c.id, args: c.function.arguments });
        return JSON.stringify({ price: 8.5 });
      },
    });

    expect(observedCalls).toHaveLength(1);
    expect(observedCalls[0].id).toBe("call_1");
    expect(JSON.parse(observedCalls[0].args)).toEqual({ grain: "wheat" });
    // Tokens sum across rounds
    expect(result.promptTokens).toBe(180); // 80 + 100
    expect(result.completionTokens).toBe(14); // 10 + 4
    expect(result.toolCallCount).toBe(1);
    expect(result.finishReason).toBe("stop"); // last round
  });

  it("emits error delta and returns error finishReason on 4xx", async () => {
    global.fetch = mockFetch([
      { status: 429, chunks: [] },
    ]) as typeof fetch;

    const { XaiAdapter } = await import("./xai");
    const adapter = new XaiAdapter("grok-4.20-reasoning");
    const deltas: Array<{ type: string; error?: string }> = [];
    const result = await adapter.streamCompletion({
      systemPrompt: "",
      messages: [{ role: "user", content: "rate-limit me" }],
      tools: [],
      onDelta: (d) => deltas.push(d as never),
      onToolCall: async () => "",
    });

    expect(deltas.some((d) => d.type === "error")).toBe(true);
    expect(result.finishReason).toBe("error");
    expect(result.promptTokens).toBe(0);
  });

  it("throws at construction when XAI_API_KEY is unset", async () => {
    delete process.env.XAI_API_KEY;
    const { XaiAdapter } = await import("./xai");
    expect(() => new XaiAdapter("grok-4.20-reasoning")).toThrow(
      /XAI_API_KEY/,
    );
  });
});
