/**
 * LLM Adapter interface for Supabase chat functions.
 *
 * The Grok/xAI implementation was retired with the Grok analysis workflow.
 * Keep the interface stable for callers while refusing to route any request
 * through xAI. A Claude/Codex-backed adapter can replace this tombstone later.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamDelta {
  type: "text" | "tool_call" | "done" | "error";
  text?: string;
  toolCall?: ToolCall;
  error?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface LLMAdapter {
  streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (delta: StreamDelta) => void;
    onToolCall: (call: ToolCall) => Promise<string>;
    maxTokens?: number;
  }): Promise<{ totalTokens: number; model: string }>;
}

class RetiredAdapter implements LLMAdapter {
  async streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (delta: StreamDelta) => void;
    onToolCall: (call: ToolCall) => Promise<string>;
    maxTokens?: number;
  }): Promise<{ totalTokens: number; model: string }> {
    params.onDelta({
      type: "error",
      error:
        "Grok/xAI chat adapter is retired. Route chat through the Claude/Codex path before re-enabling.",
    });
    return { totalTokens: 0, model: "grok-xai-retired" };
  }
}

export function createLLMAdapter(): LLMAdapter {
  return new RetiredAdapter();
}
