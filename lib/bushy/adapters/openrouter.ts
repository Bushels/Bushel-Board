// WS2 Task 2.6 — Bushy chat harness
// OpenRouterAdapter: thin subclass of OpenAIAdapter with a different
// baseURL and OPENROUTER_API_KEY. OpenRouter serves an OpenAI-compatible
// endpoint at https://openrouter.ai/api/v1.
//
// Cost signal: OpenRouter embeds usage.cost (USD) on each streaming chunk.
// OpenAIAdapter natively sniffs that field and substitutes it for the
// pricing-table cost when present — so this subclass is purely a config
// wrapper. No monkey-patching needed.
//
// Used for offline shadow evals against models we don't run directly
// (deepseek/*, qwen/*, llama/*). MODEL_PRICING won't have entries for
// those, so calculateCost() returns 0; OpenRouter's usage.cost fills in.

import { OpenAIAdapter } from "./openai";

export class OpenRouterAdapter extends OpenAIAdapter {
  constructor(modelId: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenRouterAdapter: OPENROUTER_API_KEY is not set in process.env",
      );
    }
    super(modelId, {
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      providerName: "openrouter",
    });
  }
}
