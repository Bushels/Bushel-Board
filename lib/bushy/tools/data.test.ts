// WS3 Task 3.5 — Data tool tests.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "./types";
import {
  queryMarketThesisTool,
  queryPostedPricesTool,
  queryAreaIntelligenceTool,
} from "./data";

type RpcResolved = { data: unknown[] | unknown; error: { message: string } | null };
type SelectResolved = { data: unknown; error: { message: string } | null };

interface MockClient {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  __inserts: Array<{ table: string; row: Record<string, unknown> }>;
  __selects: Array<{ table: string; filters: Record<string, unknown> }>;
  __rpcCalls: Array<{ name: string; params: Record<string, unknown> }>;
}

function mockSupabase(
  config: {
    selectResult?: (table: string) => SelectResolved;
    rpcResult?: (name: string) => RpcResolved;
  } = {},
): MockClient {
  const inserts: MockClient["__inserts"] = [];
  const selects: MockClient["__selects"] = [];
  const rpcCalls: MockClient["__rpcCalls"] = [];

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const builder = {
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
      select: (_cols?: string) => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => {
        selects.push({ table, filters: { ...filters } });
        return Promise.resolve(
          config.selectResult?.(table) ?? { data: null, error: null },
        );
      },
    };
    return builder;
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
    __selects: selects,
    __rpcCalls: rpcCalls,
  };
}

function ctx(
  partial: Partial<ToolContext> & { supabase: SupabaseClient },
): ToolContext {
  return {
    userId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    fsaCode: "T0L",
    threadId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    messageId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    turnId: "t1",
    ...partial,
  };
}

describe("queryMarketThesisTool", () => {
  it("returns the latest thesis row + auto-extraction fires", async () => {
    const mock = mockSupabase({
      selectResult: () => ({
        data: {
          grain: "canola",
          crop_year: "2025-2026",
          grain_week: 32,
          initial_thesis: "Neutral — Chinese demand capped by tariff talks",
          bull_case: "Winter frost could trim Canadian supply",
          bear_case: "South American acreage expanding 4%",
          data_confidence: "medium",
          key_signals: [],
          generated_at: "2026-04-10T12:00:00Z",
        },
        error: null,
      }),
    });
    const result = await queryMarketThesisTool.execute(
      { grain: "canola" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      found: true,
      grain: "canola",
      grain_week: 32,
    });
    // Auto-extraction should have fired
    expect(mock.__inserts).toHaveLength(1);
    expect(mock.__inserts[0].table).toBe("chat_extractions");
    expect(mock.__inserts[0].row).toMatchObject({
      category: "market",
      data_type: "thesis_lookup",
      grain: "canola",
      confidence: "inferred",
    });
  });

  it("returns found=false without auto-extraction when no row exists", async () => {
    const mock = mockSupabase({
      selectResult: () => ({ data: null, error: null }),
    });
    const result = await queryMarketThesisTool.execute(
      { grain: "durum" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ found: false, grain: "durum" });
    expect(mock.__inserts).toHaveLength(0);
  });
});

describe("queryPostedPricesTool", () => {
  it("calls get_area_prices with fsa_code, grain, business_type", async () => {
    const mock = mockSupabase({
      rpcResult: () => ({
        data: [
          { facility_name: "Viterra Vulcan", price_per_tonne: 685.0 },
          { facility_name: "Cargill Strathmore", price_per_tonne: 680.0 },
        ],
        error: null,
      }),
    });

    const result = await queryPostedPricesTool.execute(
      { grain: "canola", business_type: "elevator" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(mock.__rpcCalls[0]).toEqual({
      name: "get_area_prices",
      params: {
        p_fsa_code: "T0L",
        p_grain: "canola",
        p_business_type: "elevator",
      },
    });
    expect(result.data).toMatchObject({ count: 2, fsa_code: "T0L" });
    // Auto-extraction fired
    expect(mock.__inserts).toHaveLength(1);
    expect(mock.__inserts[0].row.data_type).toBe("posted_prices_lookup");
  });

  it("rejects when no FSA available", async () => {
    const mock = mockSupabase();
    const result = await queryPostedPricesTool.execute(
      {},
      ctx({
        fsaCode: null,
        supabase: mock as unknown as SupabaseClient,
      }),
    );
    expect(result.ok).toBe(false);
    expect(mock.__rpcCalls).toHaveLength(0);
  });

  it("rejects invalid business_type", async () => {
    const mock = mockSupabase();
    const result = await queryPostedPricesTool.execute(
      { business_type: "nonexistent-type" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation/);
  });
});

describe("queryAreaIntelligenceTool", () => {
  it("fetches knowledge + patterns in parallel", async () => {
    const mock = mockSupabase({
      rpcResult: (name) => {
        if (name === "get_area_knowledge") {
          return {
            data: [{ data_type: "posted_price", value_numeric: 18.5 }],
            error: null,
          };
        }
        if (name === "get_area_patterns") {
          return {
            data: [{ pattern_type: "area_shift", confidence_score: 0.8 }],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    });

    const result = await queryAreaIntelligenceTool.execute(
      { grain: "wheat" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      fsa_code: "T0L",
      counts: { knowledge: 1, patterns: 1 },
    });
    // Both RPCs were called in parallel
    expect(
      mock.__rpcCalls.map((c) => c.name).sort(),
    ).toEqual(["get_area_knowledge", "get_area_patterns"]);
    // Auto-extraction fired
    expect(mock.__inserts).toHaveLength(1);
  });

  it("surfaces RPC error when either call fails", async () => {
    const mock = mockSupabase({
      rpcResult: (name) => {
        if (name === "get_area_patterns") {
          return { data: [], error: { message: "patterns unavailable" } };
        }
        return { data: [], error: null };
      },
    });
    const result = await queryAreaIntelligenceTool.execute(
      {},
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/patterns unavailable/);
  });
});
