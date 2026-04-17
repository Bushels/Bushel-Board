// WS3 Task 3.4 — Memory tool tests.
// Mocks a minimal Supabase client so we can assert:
//   - save_extraction rejects short reasoning + missing FSA
//   - save_extraction happy path produces a db insert with the expected shape
//   - supersede_knowledge rolls back old-row flip on insert failure
//   - query_working_memory calls the RPC with the right params

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "./types";
import {
  saveExtractionTool,
  supersedeKnowledgeTool,
  queryWorkingMemoryTool,
} from "./memory";

type InsertResolved = { data: { id: string } | null; error: { message: string } | null };
type UpdateResolved = { data: { id: string } | null; error: { message: string } | null };
type RpcResolved = { data: unknown[]; error: { message: string } | null };

interface MockClient {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  __inserts: Array<{ table: string; row: Record<string, unknown> }>;
  __updates: Array<{ table: string; patch: Record<string, unknown>; where: Record<string, unknown> }>;
  __rpcCalls: Array<{ name: string; params: Record<string, unknown> }>;
}

function mockSupabase(
  config: {
    insertResult?: (table: string) => InsertResolved;
    updateResult?: (table: string) => UpdateResolved;
    rpcResult?: (name: string) => RpcResolved;
  } = {},
): MockClient {
  const inserts: MockClient["__inserts"] = [];
  const updates: MockClient["__updates"] = [];
  const rpcCalls: MockClient["__rpcCalls"] = [];

  const from = vi.fn((table: string) => {
    const chain = {
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        const select = () => ({
          single: async () =>
            config.insertResult?.(table) ?? {
              data: { id: "00000000-0000-0000-0000-000000000abc" },
              error: null,
            },
        });
        return { select };
      },
      update: (patch: Record<string, unknown>) => {
        const whereStore: Record<string, unknown> = {};
        const chainable = {
          eq: (col: string, val: unknown) => {
            whereStore[col] = val;
            return chainable;
          },
          select: () => ({
            single: async () => {
              updates.push({ table, patch, where: { ...whereStore } });
              return (
                config.updateResult?.(table) ?? {
                  data: { id: String(whereStore.id ?? "") },
                  error: null,
                }
              );
            },
          }),
          // Terminal update-with-no-select (fire-and-forget).
          then: (onFulfilled: (v: UpdateResolved) => unknown) => {
            updates.push({ table, patch, where: { ...whereStore } });
            const result = config.updateResult?.(table) ?? {
              data: { id: String(whereStore.id ?? "") },
              error: null,
            };
            return Promise.resolve(result).then(onFulfilled);
          },
        };
        return chainable;
      },
    };
    return chain;
  });

  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    rpcCalls.push({ name, params });
    return (
      config.rpcResult?.(name) ?? { data: [], error: null }
    );
  });

  return {
    from: from as unknown as MockClient["from"],
    rpc: rpc as unknown as MockClient["rpc"],
    __inserts: inserts,
    __updates: updates,
    __rpcCalls: rpcCalls,
  };
}

function ctx(
  partial: Partial<ToolContext> & { supabase: SupabaseClient },
): ToolContext {
  return {
    userId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    fsaCode: "T0L",
    threadId: "22222222-2222-2222-2222-222222222222",
    messageId: "33333333-3333-3333-3333-333333333333",
    turnId: "turn-1",
    ...partial,
  };
}

describe("saveExtractionTool", () => {
  it("rejects short reasoning", async () => {
    const mock = mockSupabase();
    const result = await saveExtractionTool.execute(
      {
        category: "market",
        data_type: "posted_price",
        grain: "canola",
        value_numeric: 18.5,
        value_text: null,
        location_detail: null,
        confidence: "reported",
        reasoning: "short", // < 10 chars
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation failed/);
    expect(mock.__inserts).toHaveLength(0);
  });

  it("rejects when both values are null (has_value constraint)", async () => {
    const mock = mockSupabase();
    const result = await saveExtractionTool.execute(
      {
        category: "market",
        data_type: "posted_price",
        grain: "canola",
        value_numeric: null,
        value_text: null, // both null — rejected
        location_detail: null,
        confidence: "reported",
        reasoning: "user mentioned the posted basis is stale",
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(mock.__inserts).toHaveLength(0);
  });

  it("rejects when FSA is missing from both args and ctx", async () => {
    const mock = mockSupabase();
    const result = await saveExtractionTool.execute(
      {
        category: "market",
        data_type: "posted_price",
        grain: "canola",
        value_numeric: 18.5,
        value_text: null,
        location_detail: null,
        confidence: "reported",
        reasoning: "user mentioned the posted basis is stale",
      },
      ctx({
        fsaCode: null,
        supabase: mock as unknown as SupabaseClient,
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No FSA available/);
    expect(mock.__inserts).toHaveLength(0);
  });

  it("inserts the expected row with ctx defaults", async () => {
    const mock = mockSupabase();
    const result = await saveExtractionTool.execute(
      {
        category: "market",
        data_type: "posted_price",
        grain: "canola",
        value_numeric: 18.5,
        value_text: null,
        location_detail: "Viterra Vulcan",
        confidence: "reported",
        reasoning: "user mentioned Viterra posted $18.50/bu at Vulcan",
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      extraction_id: expect.any(String),
    });
    expect(mock.__inserts).toHaveLength(1);
    expect(mock.__inserts[0].table).toBe("chat_extractions");
    expect(mock.__inserts[0].row).toMatchObject({
      user_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      thread_id: "22222222-2222-2222-2222-222222222222",
      message_id: "33333333-3333-3333-3333-333333333333",
      fsa_code: "T0L", // ctx default
      category: "market",
      value_numeric: 18.5,
      confidence: "reported",
    });
  });

  it("prefers args.fsa_code over ctx.fsaCode when supplied", async () => {
    const mock = mockSupabase();
    await saveExtractionTool.execute(
      {
        category: "market",
        data_type: "posted_price",
        grain: "canola",
        value_numeric: 18.5,
        value_text: null,
        location_detail: null,
        confidence: "reported",
        reasoning: "neighbor in T0E said the elevator there is paying more",
        fsa_code: "T0E",
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(mock.__inserts[0].row.fsa_code).toBe("T0E");
  });
});

describe("supersedeKnowledgeTool", () => {
  it("happy path: flips old row + inserts new + links superseded_by", async () => {
    const mock = mockSupabase({
      updateResult: (table) =>
        table === "knowledge_state"
          ? { data: { id: "old-id" }, error: null }
          : { data: null, error: null },
      insertResult: (table) =>
        table === "knowledge_state"
          ? { data: { id: "new-id" }, error: null }
          : { data: null, error: null },
    });

    const result = await supersedeKnowledgeTool.execute(
      {
        old_knowledge_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        supersession_reason:
          "Elevator updated their basis posting on 2026-04-17",
        new_value: {
          category: "market",
          data_type: "posted_price",
          grain: "canola",
          value_numeric: 19.25,
          value_text: null,
          location_detail: "Viterra Vulcan",
          confidence_level: "single_report",
        },
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      new_knowledge_id: "new-id",
      superseded_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    });
    // First update: status=superseded; last update: superseded_by FK link
    const kStateUpdates = mock.__updates.filter(
      (u) => u.table === "knowledge_state",
    );
    expect(kStateUpdates.length).toBeGreaterThanOrEqual(2);
    expect(kStateUpdates[0].patch.status).toBe("superseded");
  });

  it("rolls back old-row flip if the new insert fails", async () => {
    const mock = mockSupabase({
      insertResult: () => ({
        data: null,
        error: { message: "simulated insert failure" },
      }),
    });

    const result = await supersedeKnowledgeTool.execute(
      {
        old_knowledge_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        supersession_reason: "Testing rollback behavior on insert failure",
        new_value: {
          category: "market",
          data_type: "posted_price",
          grain: "canola",
          value_numeric: 19.25,
          value_text: null,
          location_detail: null,
          confidence_level: "single_report",
        },
      },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/simulated insert failure/);
    // Expect 2 updates on knowledge_state: flip to superseded, then rollback
    // to active. (Final superseded_by link step isn't reached.)
    const kStateUpdates = mock.__updates.filter(
      (u) => u.table === "knowledge_state",
    );
    expect(kStateUpdates).toHaveLength(2);
    expect(kStateUpdates[0].patch.status).toBe("superseded");
    expect(kStateUpdates[1].patch.status).toBe("active");
  });
});

describe("queryWorkingMemoryTool", () => {
  it("calls get_area_knowledge RPC with the right params", async () => {
    const mock = mockSupabase({
      rpcResult: () => ({
        data: [{ id: "k-1", data_type: "posted_price" }],
        error: null,
      }),
    });

    const result = await queryWorkingMemoryTool.execute(
      { grain: "canola", category: "market" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(mock.__rpcCalls[0]).toEqual({
      name: "get_area_knowledge",
      params: { p_fsa_code: "T0L", p_grain: "canola", p_category: "market" },
    });
    expect(result.data).toMatchObject({
      rows: [{ id: "k-1" }],
      fsa_code: "T0L",
    });
  });

  it("returns RPC error to the caller", async () => {
    const mock = mockSupabase({
      rpcResult: () => ({
        data: [],
        error: { message: "RPC broken" },
      }),
    });
    const result = await queryWorkingMemoryTool.execute(
      {},
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RPC broken/);
  });

  it("rejects when no FSA is available", async () => {
    const mock = mockSupabase();
    const result = await queryWorkingMemoryTool.execute(
      {},
      ctx({
        fsaCode: null,
        supabase: mock as unknown as SupabaseClient,
      }),
    );
    expect(result.ok).toBe(false);
    expect(mock.__rpcCalls).toHaveLength(0);
  });
});
