import { describe, it, expect } from "vitest";
import {
  runRpcRead,
  runTableRead,
  ALLOWED_RPCS,
  ALLOWED_RELATIONS,
} from "../../scripts/desk/reads";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal chainable PostgREST mock that resolves to {data,error}. */
function mockTableClient(result: { data: unknown; error: unknown }): SupabaseClient {
  const query: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit"]) {
    query[m] = () => query;
  }
  (query as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return { from: () => query } as unknown as SupabaseClient;
}

function mockRpcClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: async () => result } as unknown as SupabaseClient;
}

describe("runRpcRead allow-list", () => {
  it("rejects an RPC not on the allow-list before touching the client", async () => {
    const client = mockRpcClient({ data: null, error: null });
    await expect(runRpcRead(client, "drop_everything", {})).rejects.toThrow(/not in the desk read allow-list/);
  });
  it("returns data for an allow-listed RPC", async () => {
    const client = mockRpcClient({ data: [{ x: 1 }], error: null });
    await expect(runRpcRead(client, "get_pipeline_velocity", { p_grain: "Wheat" })).resolves.toEqual([
      { x: 1 },
    ]);
  });
  it("throws when the RPC returns an error", async () => {
    const client = mockRpcClient({ data: null, error: { message: "boom" } });
    await expect(runRpcRead(client, "get_cot_positioning", {})).rejects.toThrow(/boom/);
  });
});

describe("runTableRead allow-list", () => {
  it("rejects a relation not on the allow-list", async () => {
    const client = mockTableClient({ data: null, error: null });
    await expect(runTableRead(client, { table: "profiles" })).rejects.toThrow(
      /not in the desk read allow-list/,
    );
  });
  it("reads an allow-listed relation", async () => {
    const client = mockTableClient({ data: [{ grain: "Canola" }], error: null });
    await expect(runTableRead(client, { table: "grain_prices", limit: 5 })).resolves.toEqual([
      { grain: "Canola" },
    ]);
  });
});

describe("allow-list coverage", () => {
  it("includes the core scout RPCs", () => {
    for (const rpc of ["get_pipeline_velocity", "get_cot_positioning", "get_knowledge_context", "get_us_export_context"]) {
      expect(ALLOWED_RPCS.has(rpc)).toBe(true);
    }
  });
  it("includes the core scout relations", () => {
    for (const rel of ["cgc_observations", "grain_prices", "usda_export_sales", "v_grain_yoy_comparison"]) {
      expect(ALLOWED_RELATIONS.has(rel)).toBe(true);
    }
  });
});
