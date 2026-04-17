// WS2 Task 2.2 — Bushy chat harness
// Pricing table + cost calculator.
//
// All rates are USD per token (divide the usual "$/M tokens" headline by
// 1,000,000). Cached-input rate is the billed rate for prompt-cache hits;
// adapters report cached_tokens from the API's usage object.
//
// Provider notes:
// - Anthropic: prompt-cache hits bill at 10% of input.
// - OpenAI: prompt-cache discount is ~50% of input for 4o/4.1.
// - xAI Grok: no cache discount as of writing — cached rate equals input.
// - OpenRouter: we let OpenRouter's usage.cost field drive actual billing;
//   this table is a fallback estimator only.
//
// Adding a new model: add an entry here BEFORE wiring it into
// chat_engine_config.control_model_id, otherwise turns will log cost=0.
// The test suite enforces cached <= input <= output as a sanity guard.

type Pricing = {
  /** USD per input token (uncached). */
  inputPerToken: number;
  /** USD per output/completion token. */
  outputPerToken: number;
  /** USD per cached input token. Equal to inputPerToken if no discount. */
  cachedInputPerToken: number;
};

export const MODEL_PRICING: Record<string, Pricing> = {
  // Anthropic
  "claude-sonnet-4.6": {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cachedInputPerToken: 0.3 / 1_000_000, // 10% of input
  },
  "claude-opus-4.7": {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cachedInputPerToken: 1.5 / 1_000_000, // 10% of input
  },
  "claude-haiku-4.6": {
    inputPerToken: 0.8 / 1_000_000,
    outputPerToken: 4 / 1_000_000,
    cachedInputPerToken: 0.08 / 1_000_000, // 10% of input
  },

  // OpenAI
  "gpt-4o": {
    inputPerToken: 2.5 / 1_000_000,
    outputPerToken: 10 / 1_000_000,
    cachedInputPerToken: 1.25 / 1_000_000, // ~50% of input
  },
  "gpt-4.1": {
    inputPerToken: 2 / 1_000_000,
    outputPerToken: 8 / 1_000_000,
    cachedInputPerToken: 0.5 / 1_000_000, // ~25% of input per OpenAI tier
  },

  // xAI (no cache discount)
  "grok-4.20-reasoning": {
    inputPerToken: 5 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cachedInputPerToken: 5 / 1_000_000,
  },
};

export function calculateCost(
  modelId: string,
  tokens: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
  },
): number {
  const p = MODEL_PRICING[modelId];
  if (!p) {
    // Loud failure: make it visible in logs. Returning 0 means CI/ops will
    // see cost=0 rows in chat_turns_audit and know to add the entry.
    console.warn(`[pricing] No pricing entry for model: ${modelId}`);
    return 0;
  }

  // Clamp uncached portion to >= 0 — some APIs report cached > prompt under
  // extended caching; we should never bill negative.
  const uncachedInput = Math.max(0, tokens.promptTokens - tokens.cachedTokens);

  return (
    uncachedInput * p.inputPerToken +
    tokens.cachedTokens * p.cachedInputPerToken +
    tokens.completionTokens * p.outputPerToken
  );
}
