// WS2 Task 2.5 — Bushy chat harness
// OpenAIAdapter: uses the `openai` SDK (v6+) streaming API. Mirrors
// XaiAdapter's tool-use loop pattern because OpenAI's and xAI's wire
// protocols are identical (both are OpenAI's /v1/chat/completions SSE).
//
// Cached tokens: OpenAI surfaces cache hits via
// usage.prompt_tokens_details.cached_tokens (~50% discount for 4o, ~25%
// for 4.1). Fed into pricing.ts for accurate cost.
//
// Subclassable by OpenRouterAdapter (Task 2.6) via the `baseURL` +
// `apiKey` env override pattern — OpenRouter serves an OpenAI-compatible
// endpoint at openrouter.ai/api/v1.

import OpenAI from "openai";
import { calculateCost } from "./pricing";
import type {
  LLMAdapter,
  StreamCompletionParams,
  ToolCall,
  TurnResult,
} from "./types";

type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export class OpenAIAdapter implements LLMAdapter {
  readonly provider: string = "openai";
  protected client: OpenAI;

  constructor(public readonly modelId: string, opts?: {
    apiKey?: string;
    baseURL?: string;
    providerName?: string;
  }) {
    const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAIAdapter: OPENAI_API_KEY is not set (or no apiKey override provided)",
      );
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL, // undefined → default https://api.openai.com/v1
    });
    if (opts?.providerName) this.provider = opts.providerName;
  }

  async streamCompletion(
    params: StreamCompletionParams,
  ): Promise<TurnResult> {
    const start = Date.now();
    const acc = {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      toolCallCount: 0,
    };

    const convo: WireMessage[] = [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map((m) => {
        const base: WireMessage = { role: m.role, content: m.content };
        if (m.role === "tool" && m.tool_call_id) {
          base.tool_call_id = m.tool_call_id;
        }
        return base;
      }),
    ];

    const MAX_TOOL_ROUNDS = 4;
    let round = 0;
    let finishReason: TurnResult["finishReason"] = "stop";

    while (round < MAX_TOOL_ROUNDS) {
      round += 1;
      const { pendingToolCalls, roundReason, roundUsage } =
        await this.streamOneRound(convo, params, acc);

      finishReason = roundReason;
      acc.promptTokens += roundUsage.prompt_tokens;
      acc.completionTokens += roundUsage.completion_tokens;
      acc.cachedTokens += roundUsage.cached_tokens;

      if (pendingToolCalls.length === 0 || finishReason !== "tool_use") {
        break;
      }

      const assistantMsg: WireMessage = {
        role: "assistant",
        content: "",
        tool_calls: pendingToolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: {
            name: c.function.name,
            arguments: c.function.arguments,
          },
        })),
      };
      convo.push(assistantMsg);

      for (const call of pendingToolCalls) {
        const result = await params.onToolCall(call);
        convo.push({
          role: "tool",
          content: result,
          tool_call_id: call.id,
        });
      }
    }

    params.onDelta({
      type: "done",
      usage: {
        prompt_tokens: acc.promptTokens,
        completion_tokens: acc.completionTokens,
        cached_tokens: acc.cachedTokens,
      },
    });

    return {
      modelId: this.modelId,
      promptTokens: acc.promptTokens,
      completionTokens: acc.completionTokens,
      cachedTokens: acc.cachedTokens,
      costUsd: calculateCost(this.modelId, {
        promptTokens: acc.promptTokens,
        completionTokens: acc.completionTokens,
        cachedTokens: acc.cachedTokens,
      }),
      latencyMs: Date.now() - start,
      toolCallCount: acc.toolCallCount,
      finishReason,
    };
  }

  private async streamOneRound(
    convo: WireMessage[],
    params: StreamCompletionParams,
    acc: { toolCallCount: number },
  ): Promise<{
    pendingToolCalls: ToolCall[];
    roundReason: TurnResult["finishReason"];
    roundUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      cached_tokens: number;
    };
  }> {
    const body = {
      model: this.modelId,
      messages: convo as never,
      stream: true as const,
      max_tokens: params.maxTokens ?? 2000,
      stream_options: { include_usage: true }, // opt-in to usage in final chunk
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0];

    if (typeof params.temperature === "number") {
      (body as unknown as { temperature: number }).temperature =
        params.temperature;
    }
    if (params.tools.length > 0) {
      (body as unknown as { tools: unknown; tool_choice: string }).tools =
        params.tools;
      (body as unknown as { tools: unknown; tool_choice: string }).tool_choice =
        "auto";
    }

    let stream: AsyncIterable<Record<string, unknown>>;
    try {
      stream = (await this.client.chat.completions.create(body)) as never;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      params.onDelta({ type: "error", error: msg });
      return {
        pendingToolCalls: [],
        roundReason: "error",
        roundUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          cached_tokens: 0,
        },
      };
    }

    const pendingToolCalls: ToolCall[] = [];
    // Tool calls can stream with index-addressed fragments (gpt-4o/4.1 may
    // return tool_calls[0].index=0, tool_calls[1].index=1, etc.). We track
    // by index rather than flushing on every new id.
    const accumulatingByIndex = new Map<number, ToolCall>();
    let roundReason: TurnResult["finishReason"] = "stop";
    const roundUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
    };

    for await (const rawChunk of stream) {
      const chunk = rawChunk as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };

      const delta = chunk.choices?.[0]?.delta;
      const finish = chunk.choices?.[0]?.finish_reason;

      if (delta?.content) {
        params.onDelta({ type: "text", text: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (tc.id) {
            accumulatingByIndex.set(idx, {
              id: tc.id,
              function: {
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              },
            });
            acc.toolCallCount += 1;
          } else if (tc.function?.arguments) {
            const pending = accumulatingByIndex.get(idx);
            if (pending) pending.function.arguments += tc.function.arguments;
          }
        }
      }
      if (finish) {
        roundReason = mapOpenAIFinishReason(finish);
      }
      if (chunk.usage) {
        roundUsage.prompt_tokens =
          chunk.usage.prompt_tokens ?? roundUsage.prompt_tokens;
        roundUsage.completion_tokens =
          chunk.usage.completion_tokens ?? roundUsage.completion_tokens;
        roundUsage.cached_tokens =
          chunk.usage.prompt_tokens_details?.cached_tokens ??
          roundUsage.cached_tokens;
      }
    }

    // Flush any accumulated tool calls as completed — the stream ended.
    for (const [, call] of accumulatingByIndex) {
      pendingToolCalls.push(call);
      params.onDelta({ type: "tool_call", toolCall: call });
    }

    return { pendingToolCalls, roundReason, roundUsage };
  }
}

function mapOpenAIFinishReason(
  reason: string,
): TurnResult["finishReason"] {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "tool_calls") return "tool_use";
  if (reason === "content_filter") return "stop";
  return "stop";
}
