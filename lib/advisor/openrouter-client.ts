import OpenAI from "openai";

export const XAI_BASE_URL = "https://api.x.ai/v1";

export const CHAT_MODELS = {
  /** Primary advisor model — Grok 4.1 Fast via xAI */
  primary: "grok-4.20-reasoning",
} as const;

/**
 * Create an OpenAI-compatible client for xAI.
 * Requires XAI_API_KEY env var.
 */
export function createXaiClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is required for advisor chat");
  }

  return new OpenAI({
    baseURL: XAI_BASE_URL,
    apiKey,
  });
}
