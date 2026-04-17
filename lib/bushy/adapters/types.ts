// WS2 Task 2.1 — Bushy chat harness
// LLM adapter interface + shared types. Every provider (Anthropic, xAI,
// OpenAI, OpenRouter) implements LLMAdapter behind getAdapter() factory
// dispatching by model_id prefix.
//
// Contract: adapters stream deltas via onDelta(), invoke tools via
// onToolCall(), and return a complete TurnResult that the harness writes
// directly to chat_turns_audit. Cost math lives in pricing.ts — adapters
// just report token counts.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /**
   * When role === 'tool', this is the ID of the tool call this message is
   * responding to. Required by OpenAI/xAI; Anthropic uses a different shape
   * internally but the adapter maps it.
   */
  tool_call_id?: string;
}

/**
 * OpenAI-style tool definition. All adapters translate this into their
 * provider-native format internally (Anthropic uses { name, description,
 * input_schema }, xAI follows OpenAI's shape directly).
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Unit of streamed output. The harness forwards these to the SSE connection
 * so the UI can render token-by-token. 'done' carries final usage so the
 * client can show a cost/latency footer without a separate round-trip.
 */
export interface StreamDelta {
  type: "text" | "tool_call" | "done" | "error";
  text?: string;
  toolCall?: ToolCall;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens?: number;
  };
}

/**
 * Canonical per-turn result. Every field maps 1:1 onto a column in
 * chat_turns_audit (WS1 Task 1.4). Keeping these aligned lets the harness
 * do a single INSERT without translation.
 *
 * cachedTokens is always present (0 if the provider doesn't support prompt
 * caching) so cost math stays uniform — see MODEL_PRICING.cachedInputPerToken.
 */
export interface TurnResult {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number;
  toolCallCount: number;
  finishReason: "stop" | "length" | "tool_use" | "error";
}

export interface StreamCompletionParams {
  systemPrompt: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  onDelta: (delta: StreamDelta) => void;
  /**
   * Executed once per tool call. Must return the tool output as a string
   * (JSON-stringified if structured). The adapter is responsible for
   * feeding the result back into the model and continuing the stream.
   */
  onToolCall: (call: ToolCall) => Promise<string>;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMAdapter {
  readonly modelId: string;
  readonly provider: string;
  streamCompletion(params: StreamCompletionParams): Promise<TurnResult>;
}
