/**
 * LLM Adapter — model-agnostic streaming interface.
 * Grok 4.20 primary, swappable to OpenAI/Claude/Gemini.
 */

// ─── Types ───────────────────────────────────────────

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

export interface ToolResult {
  tool_call_id: string;
  content: string;
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

// ─── Grok (xAI Responses API) ─────────────────────────

export class GrokAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "grok-4.20-reasoning") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (delta: StreamDelta) => void;
    onToolCall: (call: ToolCall) => Promise<string>;
    maxTokens?: number;
  }): Promise<{ totalTokens: number; model: string }> {
    const allMessages: ChatMessage[] = [
      { role: "system", content: params.systemPrompt },
      ...params.messages,
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages: allMessages,
      stream: true,
      max_tokens: params.maxTokens ?? 1500,
    };

    if (params.tools.length > 0) {
      body.tools = params.tools;
      body.tool_choice = "auto";
    }

    let totalTokens = 0;
    let pendingToolCalls: ToolCall[] = [];
    let accumulatedToolCall: Partial<ToolCall> & { id?: string; function?: { name: string; arguments: string } } | null = null;

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
      params.onDelta({ type: "error", error: `xAI API error ${response.status}: ${err}` });
      return { totalTokens: 0, model: this.model };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      params.onDelta({ type: "error", error: "No response body" });
      return { totalTokens: 0, model: this.model };
    }

    const decoder = new TextDecoder();
    let buffer = "";

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
          // Process any pending tool calls
          for (const tc of pendingToolCalls) {
            const result = await params.onToolCall(tc);
            // After tool execution, continue with tool result
            allMessages.push({
              role: "assistant",
              content: "",
            });
            allMessages.push({
              role: "tool",
              content: result,
              tool_call_id: tc.id,
            });
          }

          if (pendingToolCalls.length > 0) {
            // Re-call for the follow-up response after tool execution
            pendingToolCalls = [];
            const followUp = await this.streamCompletion({
              ...params,
              messages: allMessages.slice(1), // skip system prompt (re-added in recursive call)
            });
            totalTokens += followUp.totalTokens;
          }

          params.onDelta({ type: "done" });
          continue;
        }

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            params.onDelta({ type: "text", text: delta.content });
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                // New tool call starting
                if (accumulatedToolCall?.id) {
                  pendingToolCalls.push(accumulatedToolCall as ToolCall);
                }
                accumulatedToolCall = {
                  id: tc.id,
                  function: {
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? "",
                  },
                };
              } else if (accumulatedToolCall && tc.function?.arguments) {
                accumulatedToolCall.function!.arguments += tc.function.arguments;
              }
            }
          }

          // Usage
          if (chunk.usage) {
            totalTokens = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Flush any remaining accumulated tool call
    if (accumulatedToolCall?.id) {
      pendingToolCalls.push(accumulatedToolCall as ToolCall);
    }

    return { totalTokens, model: this.model };
  }
}

// ─── Factory ──────────────────────────────────────────

export function createLLMAdapter(): LLMAdapter {
  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (xaiKey) {
    return new GrokAdapter(xaiKey);
  }
  throw new Error("No LLM API key configured. Set XAI_API_KEY.");
}
