export const CHAT_MODELS = {
  primary: "claude-sonnet-4-5",
} as const;

export function createXaiClient(): never {
  throw new Error("Grok/xAI advisor client is retired. Use Claude/Codex routing.");
}
