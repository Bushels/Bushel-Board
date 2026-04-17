// WS2 Task 2.4 — Bushy chat harness
// XaiAdapter: ports the legacy GrokAdapter from
// supabase/functions/_shared/llm-adapter.ts to Node 22. Functional parity
// with the Edge Function version PLUS the extras this harness needs (cost
// math, cached-token surfaces, latency, finishReason, toolCallCount).
//
// API: xAI's /v1/chat/completions (OpenAI-compatible). SSE framing identical
// to OpenAI — 'data: {...}\n' events, 'data: [DONE]\n' terminator.
//
// Tool-use loop: like AnthropicAdapter, we convert the public ChatMessage[]
// to a mutable local array, execute tools via onToolCall, and continue the
// conversation with tool_call_id-tagged tool messages. Max 4 rounds to
// prevent infinite loops.
//
// Cached tokens: xAI currently bills cached input at full rate (see
// pricing.ts comment) — cachedInputPerToken === inputPerToken. We still
// surface the field if the API returns it, for future-proofing.

import { calculateCost } from "./pricing";
import type {
  LLMAdapter,
  StreamCompletionParams,
  ToolCall,
  TurnResult,
} from "./types";

// OpenAI-compatible chat message shape for the wire protocol. tool_call_id
// is required when role === 'tool'.
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

export class XaiAdapter implements LLMAdapter {
  readonly provider = "xai";
  private apiKey: string;

  constructor(public readonly modelId: string) {
    const key = process.env.XAI_API_KEY;
    if (!key) {
      throw new Error(
        "XaiAdapter: XAI_API_KEY is not set in process.env",
      );
    }
    this.apiKey = key;
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

    // Build initial wire history. Include the system prompt as the first
    // message (xAI doesn't have a separate top-level system field).
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

      // Execute tools + append to conversation for next round.
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

  /**
   * Runs one streaming round against xAI. Returns pending tool calls the
   * caller must execute and append to the conversation for the next round.
   */
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
    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: convo,
      stream: true,
      max_tokens: params.maxTokens ?? 2000,
    };
    if (typeof params.temperature === "number") {
      body.temperature = params.temperature;
    }
    if (params.tools.length > 0) {
      body.tools = params.tools;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      params.onDelta({
        type: "error",
        error: `xAI API error ${response.status}: ${err}`,
      });
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

    const reader = response.body?.getReader();
    if (!reader) {
      params.onDelta({ type: "error", error: "xAI: no response body" });
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

    const decoder = new TextDecoder();
    let buffer = "";
    const pendingToolCalls: ToolCall[] = [];
    let accumulating: ToolCall | null = null;
    let roundReason: TurnResult["finishReason"] = "stop";
    const roundUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          // Flush the final accumulated tool call, if any.
          if (accumulating?.id) {
            pendingToolCalls.push(accumulating);
            params.onDelta({ type: "tool_call", toolCall: accumulating });
            accumulating = null;
          }
          continue;
        }

        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue; // Skip malformed SSE lines silently.
        }

        const choices = chunk.choices as
          | Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>
          | undefined;
        const delta = choices?.[0]?.delta;
        const finishField = choices?.[0]?.finish_reason;

        if (delta?.content) {
          params.onDelta({ type: "text", text: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) {
              // Start of a new tool call — flush any previous accumulator.
              if (accumulating?.id) {
                pendingToolCalls.push(accumulating);
                params.onDelta({ type: "tool_call", toolCall: accumulating });
              }
              accumulating = {
                id: tc.id,
                function: {
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? "",
                },
              };
              acc.toolCallCount += 1;
            } else if (accumulating && tc.function?.arguments) {
              accumulating.function.arguments += tc.function.arguments;
            }
          }
        }

        if (finishField) {
          roundReason = mapOpenAIFinishReason(finishField);
        }

        // xAI may emit usage mid-stream or once at the end — capture it
        // whenever present. Values are cumulative for the request.
        const usage = chunk.usage as
          | {
              prompt_tokens?: number;
              completion_tokens?: number;
              cached_tokens?: number;
              prompt_tokens_details?: { cached_tokens?: number };
            }
          | undefined;
        if (usage) {
          roundUsage.prompt_tokens =
            usage.prompt_tokens ?? roundUsage.prompt_tokens;
          roundUsage.completion_tokens =
            usage.completion_tokens ?? roundUsage.completion_tokens;
          roundUsage.cached_tokens =
            usage.cached_tokens ??
            usage.prompt_tokens_details?.cached_tokens ??
            roundUsage.cached_tokens;
        }
      }
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
