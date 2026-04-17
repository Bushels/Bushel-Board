// WS6 Task 6.1 — Bushy chat harness
// Harness-level types. Distinct from:
//   - lib/bushy/adapters/types.ts  (LLM adapter surface)
//   - lib/bushy/tools/types.ts     (tool registry surface)
//
// These types are consumed by harness.ts + the API route + audit helpers.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TurnResult } from "./adapters/types";

export interface ChatRequest {
  /**
   * Existing thread to append to. If omitted, the harness creates a new
   * chat_threads row.
   */
  threadId?: string;
  message: string;
  /**
   * Optional grain-detail-page context. When the user opens the chat from
   * a specific grain page, we pass the grain + week so the persona
   * composer can short-circuit intent detection on "the current grain."
   */
  grainContext?: { grain: string; grainWeek: number };
}

/**
 * Resolved-per-turn context. Built by harness.runChatTurn from the
 * request + auth + variant routing. Passed to tool calls so they can
 * attribute writes to the right user/thread/turn.
 */
export interface ChatTurnContext {
  supabase: SupabaseClient;
  userId: string;
  fsaCode: string | null;
  threadId: string;
  turnId: string;
  messageId: string;
  experimentId: string;
  modelId: string;
  variant: "control" | "variant";
}

/**
 * One-row-per-turn audit record written to chat_turns_audit by the
 * harness AFTER the LLM stream completes. Extends Partial<TurnResult>
 * because the stream may error before all fields are populated.
 */
export interface AuditRecord extends Partial<TurnResult> {
  turnId: string;
  threadId: string;
  userId: string;
  messageId: string | null;
  responseMessageId: string | null;
  modelId: string;
  provider: string;
  experimentId: string;
  variant: "control" | "variant";
  systemPromptHash: string;
  systemPromptTokens: number;
  /**
   * Per-tool-call invocation log. Shape matches what v_tool_usage_7d
   * expects: { tools: string[], detail: ToolCallDetail[] }.
   */
  toolCallsLog: ToolCallDetail[];
  extractionIds: string[];
  errorMessage?: string;
}

export interface ToolCallDetail {
  name: string;
  ok: boolean;
  latencyMs: number;
  costUsd?: number;
  error?: string;
}

/**
 * SSE event envelope for responses streamed back to the client.
 * Discriminated union so clients can switch on type.
 */
export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; tool: string }
  | { type: "done"; turnId: string }
  | { type: "error"; error: string };

/** Encode an SseEvent into the `data: <json>\n\n` wire format. */
export function sseFormat(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
