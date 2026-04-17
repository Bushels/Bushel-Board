// WS2 Task 2.7 — Bushy chat harness
// Adapter factory: dispatch LLM provider by model-id prefix.
//
// Dispatch order (deterministic):
//   claude-*         → AnthropicAdapter
//   grok-*           → XaiAdapter
//   gpt-*, o1-*, o3-*→ OpenAIAdapter
//   anything else    → OpenRouterAdapter
//
// Adding a new first-class provider: add a prefix check above the
// OpenRouter fall-through. OpenRouter model IDs use provider/slug form
// (e.g. deepseek/deepseek-chat) which can't collide with the prefixes.

import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";
import { OpenRouterAdapter } from "./openrouter";
import { XaiAdapter } from "./xai";
import type { LLMAdapter } from "./types";

export function getAdapter(modelId: string): LLMAdapter {
  if (modelId.startsWith("claude-")) return new AnthropicAdapter(modelId);
  if (modelId.startsWith("grok-")) return new XaiAdapter(modelId);
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1-") ||
    modelId.startsWith("o3-") ||
    modelId.startsWith("o4-")
  ) {
    return new OpenAIAdapter(modelId);
  }
  return new OpenRouterAdapter(modelId);
}

export { MODEL_PRICING, calculateCost } from "./pricing";
export type {
  ChatMessage,
  ChatRole,
  LLMAdapter,
  StreamCompletionParams,
  StreamDelta,
  ToolCall,
  ToolDefinition,
  TurnResult,
} from "./types";
