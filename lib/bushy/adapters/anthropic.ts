// WS2 Task 2.3 — Bushy chat harness
// AnthropicAdapter: streams Claude responses, emits text + tool-call deltas,
// executes tool calls via onToolCall(), and continues the conversation with
// structured tool_result blocks until the model stops normally.
//
// Why an internal AnthropicMessage[]: the public ChatMessage interface has
// string content, but the Anthropic API needs structured content blocks
// (tool_use, tool_result) to continue a conversation after tools fire. We
// convert ChatMessage[] to AnthropicMessage[] once at entry and mutate that
// local array for the tool-use loop, keeping the structured shape internal.
//
// Prompt caching: system prompt is tagged with cache_control: ephemeral
// (5-minute TTL). Anthropic bills cache reads at 10% of input — captured
// in cachedTokens and fed into pricing.ts.
//
// Testing strategy: mocked SDK (see anthropic.test.ts). No live API hits in
// unit tests. Integration smoke tests live in WS6 with a real key.

import Anthropic from "@anthropic-ai/sdk";
import { calculateCost } from "./pricing";
import type {
  ChatMessage,
  LLMAdapter,
  StreamCompletionParams,
  ToolCall,
  TurnResult,
} from "./types";

// Minimal structural alias for the SDK's stream event. The real type is a
// large discriminated union — we narrow with `event.type === '...'` checks
// at the call sites.
type StreamEvent = {
  type: string;
  index?: number;
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    text?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = "anthropic";
  private client: Anthropic;

  constructor(public readonly modelId: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fail at construction rather than on first call — surfaces misconfig
      // at factory time, not after a user has already sent a message.
      throw new Error(
        "AnthropicAdapter: ANTHROPIC_API_KEY is not set in process.env",
      );
    }
    this.client = new Anthropic({ apiKey });
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

    // Convert ChatMessage[] → AnthropicMessage[] once. Drop 'system' and
    // 'tool' roles (system goes via the top-level `system` param; tool
    // messages are represented via tool_result blocks we'll append below).
    const convo: AnthropicMessage[] = params.messages
      .filter((m) => m.role !== "system" && m.role !== "tool")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    const anthropicTools = params.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    // Safety cap: at most 4 tool-use rounds per turn. Prevents runaway loops
    // if a tool returns data that triggers more tool calls indefinitely.
    const MAX_TOOL_ROUNDS = 4;
    let round = 0;
    let finishReason: TurnResult["finishReason"] = "stop";

    while (round < MAX_TOOL_ROUNDS) {
      round += 1;

      const stream = this.client.messages.stream({
        model: this.modelId,
        system: [
          {
            type: "text",
            text: params.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: convo as never, // SDK types are strict; ours is structural
        tools: anthropicTools as never,
        max_tokens: params.maxTokens ?? 2000,
        temperature: params.temperature ?? 0.7,
      });

      // Accumulate tool calls by content-block index — see module docstring
      // for the streaming-event sequence.
      const toolCallsByIndex = new Map<
        number,
        { id: string; name: string; argsBuffer: string }
      >();
      const completedToolCalls: ToolCall[] = [];
      // Per-round totals, reconciled from finalMessage at round end and
      // folded into `acc` so multi-round tool loops accumulate correctly
      // without double-counting message_delta cumulative output_tokens.
      const perRound = { input: 0, output: 0, cached: 0 };

      for await (const rawEvent of stream) {
        const event = rawEvent as StreamEvent;

        if (
          event.type === "content_block_start" &&
          event.content_block?.type === "tool_use" &&
          typeof event.index === "number" &&
          event.content_block.id &&
          event.content_block.name
        ) {
          toolCallsByIndex.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            argsBuffer: "",
          });
          acc.toolCallCount += 1;
          continue;
        }

        if (
          event.type === "content_block_delta" &&
          typeof event.index === "number"
        ) {
          if (event.delta?.type === "text_delta" && event.delta.text) {
            params.onDelta({ type: "text", text: event.delta.text });
            continue;
          }
          if (
            event.delta?.type === "input_json_delta" &&
            typeof event.delta.partial_json === "string"
          ) {
            const pending = toolCallsByIndex.get(event.index);
            if (pending) pending.argsBuffer += event.delta.partial_json;
            continue;
          }
        }

        if (
          event.type === "content_block_stop" &&
          typeof event.index === "number"
        ) {
          const pending = toolCallsByIndex.get(event.index);
          if (pending) {
            const call: ToolCall = {
              id: pending.id,
              function: {
                name: pending.name,
                arguments: pending.argsBuffer || "{}",
              },
            };
            completedToolCalls.push(call);
            params.onDelta({ type: "tool_call", toolCall: call });
            toolCallsByIndex.delete(event.index);
          }
          continue;
        }

        if (event.type === "message_delta") {
          if (event.delta?.stop_reason) {
            finishReason = mapStopReason(event.delta.stop_reason);
          }
          // Intentionally ignore event.usage here — message_delta reports
          // cumulative-so-far counts per round, which would double with
          // finalMessage reconciliation. finalMessage is the source of
          // truth for per-round totals.
        }
      }

      // Reconcile with final usage (authoritative per-round totals).
      try {
        const final = await stream.finalMessage();
        const u = final.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number | null;
        };
        perRound.input = u.input_tokens ?? 0;
        perRound.output = u.output_tokens ?? 0;
        perRound.cached = u.cache_read_input_tokens ?? 0;
      } catch {
        finishReason = finishReason === "stop" ? "error" : finishReason;
        break;
      }

      // Fold this round into the running totals.
      acc.promptTokens += perRound.input;
      acc.completionTokens += perRound.output;
      acc.cachedTokens += perRound.cached;

      // Terminate if no tool calls fired or model didn't request more tools.
      if (finishReason !== "tool_use" || completedToolCalls.length === 0) {
        break;
      }

      // Execute tools + append structured blocks for the next round.
      const assistantContent: AnthropicContentBlock[] = completedToolCalls.map(
        (c) => ({
          type: "tool_use",
          id: c.id,
          name: c.function.name,
          input: safeParseJson(c.function.arguments),
        }),
      );
      convo.push({ role: "assistant", content: assistantContent });

      const toolResults: AnthropicContentBlock[] = [];
      for (const call of completedToolCalls) {
        const output = await params.onToolCall(call);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: output,
        });
      }
      convo.push({ role: "user", content: toolResults });
    }

    if (round >= MAX_TOOL_ROUNDS && finishReason === "tool_use") {
      // We hit the safety cap with pending tool_use — still report it as
      // tool_use so the caller knows the loop was truncated.
      finishReason = "tool_use";
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapStopReason(reason: string): TurnResult["finishReason"] {
  if (reason === "end_turn") return "stop";
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_use";
  if (reason === "stop_sequence") return "stop";
  return "stop";
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
