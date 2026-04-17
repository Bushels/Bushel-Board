// WS6 Task 6.4 — Harness orchestrator tests.
// Integration-style: mocks the service-role Supabase client + the adapter
// factory + tool registry. Asserts the orchestrator sequences calls in the
// right order and writes the expected SSE events + audit row shape.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SseEvent } from "./types";

// ─── Mocks ────────────────────────────────────────────────────────────────
// We mock the modules the harness imports rather than the harness itself.

const insertedRows: Array<{ table: string; row: Record<string, unknown> }> = [];
const rpcCalls: Array<{ name: string; params: unknown }> = [];
const selectedRows: Array<{ table: string; filters: Record<string, unknown> }> = [];

function createMockAdmin() {
  return {
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        gt: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          selectedRows.push({ table, filters: { ...filters } });
          if (table === "profiles") {
            return {
              data: {
                postal_code: "T0L 1A0",
                role: "farmer",
                full_name: "Kyle",
                company_name: null,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          selectedRows.push({ table, filters: { ...filters } });
          return { data: null, error: null };
        }),
        insert: (row: Record<string, unknown>) => {
          insertedRows.push({ table, row });
          const idByTable: Record<string, string> = {
            chat_threads: "thr-uuid",
            chat_messages:
              row.role === "user" ? "user-msg-uuid" : "assist-msg-uuid",
            chat_turns_audit: "audit-uuid",
          };
          const rowResp = { id: idByTable[table] ?? "other-uuid" };
          return {
            select: () => ({
              single: async () => ({ data: rowResp, error: null }),
            }),
            then: (cb: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(cb),
          };
        },
      };
      // Swap the threaded-history maybeSingle to a chainable terminal.
      return builder;
    }),
    rpc: vi.fn((name: string, params: unknown) => {
      rpcCalls.push({ name, params });
      if (name === "assign_chat_engine_variant") {
        return {
          maybeSingle: async () => ({
            data: {
              experiment_id: "exp-uuid",
              model_id: "claude-sonnet-4.6",
              variant: "control",
            },
            error: null,
          }),
        };
      }
      // Other RPCs (lessons, area knowledge) just return empty arrays.
      return Promise.resolve({ data: [], error: null });
    }),
  };
}

// History loader: second .from('chat_messages').select(...).order(...).limit(...)
// returns a resolved array. We intercept via a one-off mock.
let historyFixture: Array<{ role: string; content: string }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const base = createMockAdmin();
    const origFrom = base.from;
    base.from = vi.fn((table: string) => {
      if (table === "chat_messages") {
        // Distinguish select/insert via chain shape.
        const b = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          order: vi.fn(() => b),
          limit: vi.fn(async () => ({ data: historyFixture, error: null })),
          insert: (row: Record<string, unknown>) => {
            insertedRows.push({ table, row });
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id:
                      row.role === "user"
                        ? "user-msg-uuid"
                        : "assist-msg-uuid",
                  },
                  error: null,
                }),
              }),
            };
          },
        };
        return b;
      }
      return origFrom(table);
    }) as typeof origFrom;
    return base;
  },
}));

// Mock the adapter so we can assert streamCompletion receives our inputs
// + drive the onDelta/onToolCall callbacks directly.
type StreamArgs = {
  systemPrompt: string;
  messages: unknown[];
  tools: unknown[];
  onDelta: (d: { type: string; text?: string }) => void;
  onToolCall: (c: {
    id: string;
    function: { name: string; arguments: string };
  }) => Promise<string>;
};
let capturedStreamArgs: StreamArgs | null = null;

vi.mock("./adapters", () => ({
  getAdapter: () => ({
    provider: "anthropic",
    modelId: "claude-sonnet-4.6",
    streamCompletion: async (args: StreamArgs) => {
      capturedStreamArgs = args;
      // Emit two text deltas, one tool_call, then resolve.
      args.onDelta({ type: "text", text: "Hi. " });
      args.onDelta({ type: "text", text: "Wheat is neutral." });
      return {
        modelId: "claude-sonnet-4.6",
        promptTokens: 500,
        completionTokens: 50,
        cachedTokens: 200,
        costUsd: 0.002,
        latencyMs: 1000,
        toolCallCount: 0,
        finishReason: "stop" as const,
      };
    },
  }),
}));

// Minimal tool registry stub.
vi.mock("./tools", () => ({
  buildToolRegistry: async () => [
    {
      name: "get_weather",
      description: "get weather",
      parameters: { type: "object" },
      source: "native",
      execute: async () => ({ ok: true, data: {}, latencyMs: 10 }),
    },
  ],
  findTool: () => undefined,
}));

// toToolDefinition passthrough
vi.mock("./tools/types", async (orig) => {
  const actual = (await orig()) as typeof import("./tools/types");
  return {
    ...actual,
    toToolDefinition: () => ({
      type: "function",
      function: { name: "get_weather", description: "w", parameters: {} },
    }),
  };
});

// Stub the system-prompt composer so we don't actually build a full prompt.
vi.mock("./persona/system-prompt", () => ({
  buildSystemPrompt: async () =>
    "SYSTEM_PROMPT_STUB: You are Bushy. (~120 chars) xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
}));

// ─── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  insertedRows.length = 0;
  rpcCalls.length = 0;
  selectedRows.length = 0;
  historyFixture = [];
  capturedStreamArgs = null;
});

describe("runChatTurn", () => {
  it("creates a new thread, inserts user message, streams deltas, persists assistant msg, audits", async () => {
    const { runChatTurn } = await import("./harness");
    const events: SseEvent[] = [];

    await runChatTurn(
      { message: "what's the wheat thesis?" },
      { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
      (e) => events.push(e),
    );

    // SSE events: two deltas + done (no tool_call events since streamCompletion
    // didn't emit any)
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas).toHaveLength(2);
    expect(events.at(-1)?.type).toBe("done");

    // Thread + user message + assistant message + audit all inserted
    const tables = insertedRows.map((r) => r.table);
    expect(tables).toContain("chat_threads");
    expect(tables).toContain("chat_messages");
    expect(tables).toContain("chat_turns_audit");

    // User message has role=user and the payload we passed
    const userMsg = insertedRows.find(
      (r) => r.table === "chat_messages" && r.row.role === "user",
    );
    expect(userMsg?.row.content).toBe("what's the wheat thesis?");

    // Assistant message has accumulated text from deltas
    const assistMsg = insertedRows.find(
      (r) => r.table === "chat_messages" && r.row.role === "assistant",
    );
    expect(assistMsg?.row.content).toBe("Hi. Wheat is neutral.");

    // Variant RPC fired
    expect(rpcCalls.some((c) => c.name === "assign_chat_engine_variant")).toBe(
      true,
    );

    // Audit row captures tokens + cost
    const audit = insertedRows.find((r) => r.table === "chat_turns_audit");
    expect(audit?.row).toMatchObject({
      model_id: "claude-sonnet-4.6",
      provider: "anthropic",
      assigned_variant: "control",
      prompt_tokens: 500,
      completion_tokens: 50,
      cached_tokens: 200,
      cost_usd: 0.002,
      finish_reason: "stop",
    });
  });

  it("reuses threadId when provided", async () => {
    const { runChatTurn } = await import("./harness");
    await runChatTurn(
      { threadId: "existing-thr-uuid", message: "follow-up" },
      { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
      () => {},
    );
    const threadInserts = insertedRows.filter(
      (r) => r.table === "chat_threads",
    );
    expect(threadInserts).toHaveLength(0);
  });

  it("passes loaded history to the adapter", async () => {
    historyFixture = [
      { role: "user", content: "hey" },
      { role: "assistant", content: "howdy" },
      { role: "user", content: "now what's new?" }, // the just-inserted current turn
    ];
    const { runChatTurn } = await import("./harness");
    await runChatTurn(
      { threadId: "thr-1", message: "now what's new?" },
      { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
      () => {},
    );
    expect(capturedStreamArgs?.messages).toHaveLength(3);
  });

  it("on error, still writes a partial audit row with finish_reason='error'", async () => {
    // Force the adapter to throw
    const errAdapter = await import("./adapters");
    const originalGetAdapter = errAdapter.getAdapter;
    (errAdapter as { getAdapter: typeof originalGetAdapter }).getAdapter = () =>
      ({
        provider: "anthropic",
        modelId: "claude-sonnet-4.6",
        streamCompletion: async () => {
          throw new Error("upstream 503");
        },
      }) as unknown as ReturnType<typeof originalGetAdapter>;

    const { runChatTurn } = await import("./harness");
    const events: SseEvent[] = [];
    await runChatTurn(
      { message: "trigger an error" },
      { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
      (e) => events.push(e),
    );

    // Error event emitted
    expect(events.some((e) => e.type === "error")).toBe(true);

    // Audit row still written, with error status
    const audit = insertedRows.find((r) => r.table === "chat_turns_audit");
    expect(audit?.row.finish_reason).toBe("error");
    expect(audit?.row.error_message).toBe("upstream 503");

    // Restore
    (errAdapter as { getAdapter: typeof originalGetAdapter }).getAdapter =
      originalGetAdapter;
  });
});
