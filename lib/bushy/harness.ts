// WS6 Task 6.4 — Bushy chat harness
// The orchestrator that stitches everything together. Called by the
// /api/bushy/chat route to run one chat turn:
//
//   1. Auth + profile lookup (caller-supplied userId; we trust it came from
//      a cookie-validated getAuthenticatedUserContext call)
//   2. Thread get-or-create + user-message insert
//   3. Variant routing (assign_chat_engine_variant RPC)
//   4. Build tool registry + per-turn budget
//   5. Load recent history + build system prompt
//   6. Stream completion through the assigned adapter
//      - Forward text deltas to the SSE writer
//      - On tool calls: resolve + budget-check + execute + record
//   7. Persist assistant message
//   8. Write chat_turns_audit row (swallows errors — audit is best-effort)
//   9. Emit terminal SSE 'done' event
//
// Uses a service-role Supabase client internally so tool writes
// (chat_extractions, knowledge_state) and audit writes bypass RLS.
// Never exposes the service-role client to the caller.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "./adapters";
import type { ChatMessage, ToolCall } from "./adapters/types";
import { buildToolRegistry, findTool } from "./tools";
import { ToolBudget } from "./tools/budget";
import { toToolDefinition } from "./tools/types";
import type { ToolContext } from "./tools/types";
import { buildSystemPrompt } from "./persona/system-prompt";
import { assignVariant } from "./audit/route-ab";
import {
  logTurn,
  hashSystemPrompt,
  providerForModel,
} from "./audit/log-turn";
import type {
  AuditRecord,
  ChatRequest,
  SseEvent,
  ToolCallDetail,
} from "./types";
import { sseFormat } from "./types";

/**
 * Per-conversation budget ceiling. Individual tools can tighten via their
 * BushyTool.rateLimit; these are the fleet-wide caps.
 */
const BUDGET = {
  perTurnMax: 4,
  perConvMax: 12,
  costCapUsd: 1.5,
};

/** History depth loaded for each turn. Balances context vs token cost. */
const HISTORY_LIMIT = 20;

interface ProfileRow {
  postal_code: string | null;
  role: string | null;
  full_name: string | null;
  company_name: string | null;
}

interface MessageRow {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at?: string;
}

export interface UserIdentity {
  id: string;
}

/**
 * Run one chat turn. Streams SSE events via `writeSse` callback.
 * Callers (the API route) are responsible for closing the underlying
 * stream once this promise resolves.
 */
export async function runChatTurn(
  req: ChatRequest,
  user: UserIdentity,
  writeSse: (event: SseEvent) => void,
): Promise<void> {
  const supabase = createAdminClient();
  const turnId = randomUUID();

  // Initialize per-turn state so the error path can still write a partial
  // audit row with whatever we managed to populate.
  let fsaCode: string | null = null;
  let threadId: string | null = req.threadId ?? null;
  let messageId: string | null = null;
  let responseMessageId: string | null = null;
  let experimentId = "";
  let modelId = "";
  let variant: "control" | "variant" = "control";
  let systemPromptHash = "";
  let systemPromptTokens = 0;
  const toolCallsLog: ToolCallDetail[] = [];
  const extractionIds: string[] = [];

  try {
    // 1. Profile lookup
    const { data: profile } = await supabase
      .from("profiles")
      .select("postal_code, role, full_name, company_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();
    fsaCode = extractFsa(profile?.postal_code);

    // 2. Thread + user message
    threadId = req.threadId ?? (await createThread(supabase, user.id, req));
    messageId = await insertUserMessage(
      supabase,
      threadId,
      user.id,
      req.message,
    );

    // 3. Variant routing
    const assignment = await assignVariant(supabase, user.id);
    experimentId = assignment.experimentId;
    modelId = assignment.modelId;
    variant = assignment.variant;

    // 4. Tools + budget
    const tools = await buildToolRegistry();
    const budget = new ToolBudget(BUDGET);
    budget.startTurn();

    // 5. History + system prompt
    const history = await loadHistory(supabase, threadId);
    const systemPrompt = await buildSystemPrompt({
      supabase,
      userId: user.id,
      fsaCode,
      currentMessage: req.message,
      history,
      toolRegistry: tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
      farmerCard: {
        name: profile?.full_name ?? profile?.company_name ?? undefined,
        fsaCode,
      },
    });
    systemPromptHash = hashSystemPrompt(systemPrompt);
    systemPromptTokens = estimateTokens(systemPrompt);

    // 6. Stream completion
    const adapter = getAdapter(modelId);
    const toolDefs = tools.map(toToolDefinition);
    let assistantText = "";

    const onDelta = makeDeltaForwarder(writeSse, (text) => {
      assistantText += text;
    });

    const onToolCall = makeToolCallHandler({
      supabase,
      userId: user.id,
      fsaCode,
      threadId,
      turnId,
      messageId,
      budget,
      toolCallsLog,
      extractionIds,
      writeSse,
    });

    const turnResult = await adapter.streamCompletion({
      systemPrompt,
      messages: history,
      tools: toolDefs,
      onDelta,
      onToolCall,
    });

    // 7. Assistant message
    responseMessageId = await insertAssistantMessage(
      supabase,
      threadId,
      user.id,
      assistantText,
      turnResult,
    );

    // 8. Audit
    const audit: AuditRecord = {
      turnId,
      threadId,
      userId: user.id,
      messageId,
      responseMessageId,
      modelId,
      provider: providerForModel(modelId),
      experimentId,
      variant,
      systemPromptHash,
      systemPromptTokens,
      toolCallsLog,
      extractionIds,
      promptTokens: turnResult.promptTokens,
      completionTokens: turnResult.completionTokens,
      cachedTokens: turnResult.cachedTokens,
      costUsd: turnResult.costUsd,
      latencyMs: turnResult.latencyMs,
      toolCallCount: turnResult.toolCallCount,
      finishReason: turnResult.finishReason,
    };
    await logTurn(supabase, audit);

    // 9. Done
    writeSse({ type: "done", turnId });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Partial audit row so ops can see the failure in chat_turns_audit.
    const partialAudit: AuditRecord = {
      turnId,
      threadId: threadId ?? "unknown",
      userId: user.id,
      messageId,
      responseMessageId: null,
      modelId: modelId || "unknown",
      provider: modelId ? providerForModel(modelId) : "unknown",
      experimentId: experimentId || "00000000-0000-0000-0000-000000000000",
      variant,
      systemPromptHash,
      systemPromptTokens,
      toolCallsLog,
      extractionIds,
      finishReason: "error",
      errorMessage,
    };
    await logTurn(supabase, partialAudit);

    writeSse({ type: "error", error: errorMessage });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractFsa(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const trimmed = postalCode.trim().toUpperCase();
  if (trimmed.length < 3) return null;
  const fsa = trimmed.slice(0, 3);
  return /^[A-Z][0-9][A-Z]$/.test(fsa) ? fsa : null;
}

async function createThread(
  supabase: SupabaseClient,
  userId: string,
  req: ChatRequest,
): Promise<string> {
  const grainContext = req.grainContext?.grain
    ? [req.grainContext.grain]
    : [];
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      user_id: userId,
      title: req.message.slice(0, 40),
      grain_context: grainContext,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to create thread: ${error?.message ?? "no data returned"}`,
    );
  }
  return (data as { id: string }).id;
}

async function insertUserMessage(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "user",
      content,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to insert user message: ${error?.message ?? "no data returned"}`,
    );
  }
  return (data as { id: string }).id;
}

async function insertAssistantMessage(
  supabase: SupabaseClient,
  threadId: string,
  userId: string,
  content: string,
  turnResult: {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "assistant",
      content,
      model_used: turnResult.modelId,
      input_tokens: turnResult.promptTokens,
      output_tokens: turnResult.completionTokens,
      latency_ms: turnResult.latencyMs,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Non-fatal: the turn completed + audit will capture the content.
    console.warn(
      `[bushy.harness] Assistant message insert failed: ${error?.message}`,
    );
    return null;
  }
  return (data as { id: string }).id;
}

async function loadHistory(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  return ((data as MessageRow[]) ?? [])
    .filter((m) => m.role !== "system") // adapter gets system prompt separately
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Rough token estimate: ~4 chars per token for English prose. Off by
 * 20-30% but fine for the cost-drift signal we care about. Upgrade to a
 * real tokenizer when we need tighter caching analysis.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Stream callbacks ────────────────────────────────────────────────────

function makeDeltaForwarder(
  writeSse: (event: SseEvent) => void,
  onText: (text: string) => void,
) {
  return (delta: { type: string; text?: string }) => {
    if (delta.type === "text" && delta.text) {
      onText(delta.text);
      writeSse({ type: "delta", text: delta.text });
    } else if (delta.type === "tool_call") {
      // Note: the adapter may surface tool_call events for UI "Bushy is
      // looking up X..." indicators. We forward a minimal event.
      const tc = (delta as { toolCall?: { function?: { name?: string } } })
        .toolCall;
      if (tc?.function?.name) {
        writeSse({ type: "tool_call", tool: tc.function.name });
      }
    }
  };
}

interface ToolCallHandlerDeps {
  supabase: SupabaseClient;
  userId: string;
  fsaCode: string | null;
  threadId: string;
  turnId: string;
  messageId: string;
  budget: ToolBudget;
  toolCallsLog: ToolCallDetail[];
  extractionIds: string[];
  writeSse: (event: SseEvent) => void;
}

/**
 * Build the onToolCall handler the adapter invokes for each tool_use
 * block. Resolves the tool, checks budget, executes with ToolContext,
 * records cost/latency/extraction-ids, and returns JSON to the adapter.
 *
 * Always returns a string (JSON-encoded) — adapters feed this back to
 * the model as the tool_result content.
 */
function makeToolCallHandler(deps: ToolCallHandlerDeps) {
  return async (call: ToolCall): Promise<string> => {
    const name = call.function.name;
    const tool = findTool(name);

    if (!tool) {
      deps.toolCallsLog.push({
        name,
        ok: false,
        latencyMs: 0,
        error: "unknown tool",
      });
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    if (!deps.budget.canCall(name, tool.rateLimit)) {
      deps.toolCallsLog.push({
        name,
        ok: false,
        latencyMs: 0,
        error: "budget exceeded",
      });
      return JSON.stringify({
        error: "Tool budget exceeded for this turn/conversation.",
      });
    }

    const toolCtx: ToolContext = {
      userId: deps.userId,
      fsaCode: deps.fsaCode,
      threadId: deps.threadId,
      turnId: deps.turnId,
      messageId: deps.messageId,
      supabase: deps.supabase,
    };

    try {
      const args = safeJsonParse(call.function.arguments);
      const result = await tool.execute(args, toolCtx);
      deps.budget.recordCall(name, result.costUsd ?? 0);
      deps.toolCallsLog.push({
        name,
        ok: result.ok,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        error: result.error,
      });

      // save_extraction returns { extraction_id } — capture for audit.
      if (result.ok && result.data && typeof result.data === "object") {
        const eid = (result.data as { extraction_id?: string }).extraction_id;
        if (typeof eid === "string") deps.extractionIds.push(eid);
      }

      // Return either the data payload or the error — model sees both.
      return JSON.stringify(result.ok ? (result.data ?? {}) : { error: result.error });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.toolCallsLog.push({ name, ok: false, latencyMs: 0, error: msg });
      return JSON.stringify({ error: msg });
    }
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
