// WS3 Task 3.1 — Bushy chat harness
// Tool registry types. Every tool the harness exposes to the LLM is a
// BushyTool — whether it's native (implemented in this repo) or provided
// by an MCP server (bridged via mcpServer name).
//
// Parameter schemas use Zod; the harness converts them to JSON Schema at
// adapter-time via `toToolDefinition`. Zod 4 ships native `z.toJSONSchema`
// which produces draft/2020-12 output — compatible with both OpenAI and
// Anthropic tool-parameter shapes (they accept draft-07 content unchanged).
//
// Execution contract: tools are called with unknown args + a ToolContext
// providing user/FSA/thread/turn identity plus a service-role Supabase
// client. Tools validate args with Zod, perform the work, and return a
// structured ToolResult. The harness writes a tool_call audit row using
// the latencyMs + costUsd fields.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDefinition } from "../adapters/types";

export interface BushyTool {
  /** Tool name exposed to the LLM. Must be unique across the registry. */
  name: string;
  /** Plain-English description injected into the model's tool list. */
  description: string;
  /** Zod schema for tool arguments. Converted to JSON Schema at adapter time. */
  parameters: z.ZodTypeAny;
  /** Source classifier: native (in-repo) vs mcp (bridged via MCP server). */
  source: "native" | "mcp";
  /** If source === 'mcp', which MCP server provides this tool. */
  mcpServer?: string;
  /** Estimated cost per invocation (USD). Used by ToolBudget guard. */
  costEstimateUsd?: number;
  /**
   * Per-turn + per-conversation call limits. ToolBudget reads these via
   * {@link BushyTool.rateLimit} and rejects calls that would exceed them.
   */
  rateLimit?: { perTurn: number; perConversation: number };
  /**
   * Execute the tool. Caller passes raw args (from the LLM's JSON-string
   * output) which the implementation validates with `parameters`. Return
   * a ToolResult — the harness surfaces `data` back to the model and
   * persists the audit row.
   */
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  /** auth.uid() of the caller. Derived server-side — never accept from body. */
  userId: string;
  /** Farmer's forward sortation area for area-scoped queries. Null if unknown. */
  fsaCode: string | null;
  /** chat_threads.id the turn belongs to. */
  threadId: string;
  /** chat_turns_audit.turn_id so tool calls can link back to the turn. */
  turnId: string;
  /** Service-role Supabase client. The harness passes this down — do NOT instantiate. */
  supabase: SupabaseClient;
}

export interface ToolResult {
  /** Whether the tool executed successfully. */
  ok: boolean;
  /**
   * Tool output returned to the LLM as the tool_result content. Caller
   * typically JSON-stringifies before emitting to the model.
   */
  data?: unknown;
  /** Human-readable error when ok === false. */
  error?: string;
  /** Incremental cost for external-API tools (search_x, weather fetches). */
  costUsd?: number;
  /** Wall-clock execution time — always populated, even on error. */
  latencyMs: number;
}

/**
 * Convert a BushyTool to the OpenAI-style ToolDefinition the LLM adapter
 * expects. Uses Zod 4's built-in `z.toJSONSchema` — same JSON Schema
 * produces for every adapter so we don't drift between providers.
 */
export function toToolDefinition(tool: BushyTool): ToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
    },
  };
}
