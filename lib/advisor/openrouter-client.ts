import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const CHAT_MODELS = {
  /** Primary advisor model — Nemotron Super 120B (57 tok/s, free) */
  primary: "nvidia/nemotron-3-super-120b-a12b:free",
  /** Fallback — Trinity Large 400B (free) */
  fallback: "arcee-ai/trinity-large-preview:free",
  // Legacy aliases for any code still referencing old names
  voice: "nvidia/nemotron-3-super-120b-a12b:free",
  voiceFallback: "arcee-ai/trinity-large-preview:free",
} as const;

/**
 * Create an OpenAI-compatible client for OpenRouter.
 * Requires OPENROUTER_API_KEY env var.
 */
export function createOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required for advisor chat");
  }

  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://bushelboard.com",
      "X-Title": "Bushel Board Advisor",
    },
  });
}
