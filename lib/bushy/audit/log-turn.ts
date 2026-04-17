// WS6 Task 6.3 — Bushy chat harness
// Audit logger. Inserts one row per turn into chat_turns_audit (WS1 Task 1.4).
//
// Fields map 1:1 onto DB columns. tool_calls_jsonb honors the SCHEMA
// CONTRACT set in v_tool_usage_7d (WS1 Task 1.10):
//   { tools: string[], detail: ToolCallDetail[] }
// If that shape changes, v_tool_usage_7d returns 0 rows silently.
//
// The logger swallows insert failures rather than bubbling — we don't want
// an audit-table outage to fail the user's chat response. A failed audit
// shows up in Supabase logs but doesn't block the SSE stream close.
//
// Requires a service-role Supabase client (chat_turns_audit is RLS-
// admin-only; service_role bypasses).

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRecord } from "../types";

export async function logTurn(
  supabase: SupabaseClient,
  record: AuditRecord,
): Promise<void> {
  const toolNames = record.toolCallsLog.map((t) => t.name);

  const { error } = await supabase.from("chat_turns_audit").insert({
    turn_id: record.turnId,
    thread_id: record.threadId,
    user_id: record.userId,
    message_id: record.messageId,
    response_message_id: record.responseMessageId,
    model_id: record.modelId,
    provider: record.provider,
    experiment_id: record.experimentId,
    assigned_variant: record.variant,
    system_prompt_hash: record.systemPromptHash,
    system_prompt_tokens: record.systemPromptTokens,
    prompt_tokens: record.promptTokens ?? 0,
    completion_tokens: record.completionTokens ?? 0,
    cached_tokens: record.cachedTokens ?? 0,
    cost_usd: record.costUsd ?? 0,
    latency_total_ms: record.latencyMs,
    tool_call_count: record.toolCallCount ?? 0,
    tool_calls_jsonb: {
      tools: toolNames, // keyed under 'tools' per v_tool_usage_7d contract
      detail: record.toolCallsLog,
    },
    extractions_written: record.extractionIds.length,
    extraction_ids: record.extractionIds,
    finish_reason: record.finishReason ?? "stop",
    error_message: record.errorMessage,
  });

  if (error) {
    // Log but don't throw — the user's turn already completed; we don't
    // want a full-system failure because the audit DB is hiccuping.
    console.warn(
      `[bushy.audit] chat_turns_audit insert failed for turn ${record.turnId}: ${error.message}`,
    );
  }
}

/**
 * Short, collision-resistant-enough hash of the system prompt. Used to
 * detect prompt drift across turns + correlate turns against the same
 * persona/viking context.
 *
 * SHA-1 first 16 hex chars. Not cryptographic — just a stable ID for
 * equivalent prompts.
 */
export function hashSystemPrompt(prompt: string): string {
  return createHash("sha1").update(prompt).digest("hex").slice(0, 16);
}

/**
 * Derive the `provider` audit column from an LLM adapter's model_id.
 * Matches the dispatch in lib/bushy/adapters/index.ts.
 * Prefer passing adapter.provider when available — this function exists
 * for call sites that only have the model_id string.
 */
export function providerForModel(modelId: string): string {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("grok-")) return "xai";
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1-") ||
    modelId.startsWith("o3-") ||
    modelId.startsWith("o4-")
  ) {
    return "openai";
  }
  return "openrouter";
}
