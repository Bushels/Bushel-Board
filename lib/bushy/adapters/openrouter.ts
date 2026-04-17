// WS2 Task 2.6 — Bushy chat harness
// OpenRouterAdapter: thin wrapper around OpenAIAdapter with a different
// baseURL and OPENROUTER_API_KEY. OpenRouter serves an OpenAI-compatible
// endpoint at https://openrouter.ai/api/v1.
//
// Used for offline shadow evals against models we don't run directly —
// e.g. deepseek/*, qwen/*, llama/*. MODEL_PRICING in pricing.ts won't have
// entries for those, so calculateCost returns 0. OpenRouter includes a
// `usage.cost` field on most models — we prefer that over our table when
// present, so audit rows record the actual billed cost.

import { OpenAIAdapter } from "./openai";
import type { StreamCompletionParams, TurnResult } from "./types";

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

  // Override to substitute OpenRouter's own usage.cost when available —
  // our pricing table doesn't cover most OpenRouter-only models.
  async streamCompletion(
    params: StreamCompletionParams,
  ): Promise<TurnResult> {
    // Intercept the stream so we can observe the final chunk's usage.cost
    // if OpenRouter includes it. We wrap params.onDelta to sniff 'done'.
    let sniffed: number | null = null;
    const wrapped: StreamCompletionParams = {
      ...params,
      onDelta: (d) => {
        // The SDK chunk with usage.cost will flow through the underlying
        // adapter's stream loop; we don't see cost here because OpenAIAdapter
        // only surfaces { prompt_tokens, completion_tokens, cached_tokens }.
        // So we rely on the sniff mechanism set up below via a Proxy.
        params.onDelta(d);
      },
    };

    // Monkey-patch this.client.chat.completions.create to tee the stream
    // and capture usage.cost as chunks flow by. The wrapped stream is
    // returned unchanged so OpenAIAdapter's loop sees the same events.
    const originalCreate = this.client.chat.completions.create.bind(
      this.client.chat.completions,
    );
    this.client.chat.completions.create = (async (body: unknown) => {
      const upstream = (await originalCreate(body as never)) as AsyncIterable<
        Record<string, unknown>
      >;
      async function* tee() {
        for await (const chunk of upstream) {
          const u = (chunk as { usage?: { cost?: number } }).usage;
          if (u && typeof u.cost === "number" && u.cost >= 0) {
            sniffed = u.cost;
          }
          yield chunk;
        }
      }
      return tee();
    }) as typeof this.client.chat.completions.create;

    let result: TurnResult;
    try {
      result = await super.streamCompletion(wrapped);
    } finally {
      // Restore.
      this.client.chat.completions.create = originalCreate;
    }

    if (sniffed !== null) {
      result = { ...result, costUsd: sniffed };
    }
    return result;
  }
}
