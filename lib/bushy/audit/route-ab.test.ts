// WS6 Task 6.2 — assignVariant tests.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignVariant } from "./route-ab";

function mockSupabase(
  result: { data: unknown; error: { message: string } | null },
): SupabaseClient {
  return {
    rpc: vi.fn(() => ({
      maybeSingle: async () => result,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("assignVariant", () => {
  it("maps RPC row to VariantAssignment shape", async () => {
    const supabase = mockSupabase({
      data: {
        experiment_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        model_id: "claude-sonnet-4.6",
        variant: "control",
      },
      error: null,
    });
    const got = await assignVariant(
      supabase,
      "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    );
    expect(got).toEqual({
      experimentId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      modelId: "claude-sonnet-4.6",
      variant: "control",
    });
  });

  it("throws on RPC error", async () => {
    const supabase = mockSupabase({
      data: null,
      error: { message: "No active chat_engine_config" },
    });
    await expect(
      assignVariant(supabase, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"),
    ).rejects.toThrow(/No active chat_engine_config/);
  });

  it("throws when RPC returns null data", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    await expect(
      assignVariant(supabase, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"),
    ).rejects.toThrow(/no config row returned/);
  });

  it("calls the RPC with the correct param name", async () => {
    const rpcSpy = vi.fn(() => ({
      maybeSingle: async () => ({
        data: {
          experiment_id: "a",
          model_id: "claude-sonnet-4.6",
          variant: "control",
        },
        error: null,
      }),
    }));
    const supabase = { rpc: rpcSpy } as unknown as SupabaseClient;
    await assignVariant(supabase, "user-1");
    expect(rpcSpy).toHaveBeenCalledWith("assign_chat_engine_variant", {
      p_user_id: "user-1",
    });
  });
});
