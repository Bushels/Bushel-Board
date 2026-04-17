// WS3 Task 3.6 — search_x stub tests.
// Exercises the three documented behaviors of the stub:
//   - Missing XAPI_BEARER_TOKEN → ok=false with specific error
//   - Token present → ok=true, status='not_wired' (real impl deferred)
//   - Validation rejects empty queries + lookback_days outside [1,7]

import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "./types";
import { searchXTool } from "./x-api";

function ctx(): ToolContext {
  return {
    userId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    fsaCode: "T0L",
    threadId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    messageId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    turnId: "t1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as unknown as SupabaseClient,
  };
}

beforeEach(() => {
  delete process.env.XAPI_BEARER_TOKEN;
});

describe("searchXTool (stub)", () => {
  it("returns ok=false when XAPI_BEARER_TOKEN is unset", async () => {
    const result = await searchXTool.execute(
      { query: "canola prices alberta" },
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/XAPI_BEARER_TOKEN/);
  });

  it("returns ok=true + status='not_wired' when token is set", async () => {
    process.env.XAPI_BEARER_TOKEN = "test-bearer";
    const result = await searchXTool.execute(
      { query: "canola prices alberta", lookback_days: 3 },
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      status: "not_wired",
      query: "canola prices alberta",
      lookback_days: 3,
      tweets: [],
    });
    expect(result.costUsd).toBe(0);
  });

  it("rejects empty query", async () => {
    process.env.XAPI_BEARER_TOKEN = "test-bearer";
    const result = await searchXTool.execute({ query: "" }, ctx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation/);
  });

  it("rejects lookback_days outside [1,7]", async () => {
    process.env.XAPI_BEARER_TOKEN = "test-bearer";
    const result = await searchXTool.execute(
      { query: "wheat", lookback_days: 30 },
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation/);
  });

  it("defaults lookback_days to 2 when omitted", async () => {
    process.env.XAPI_BEARER_TOKEN = "test-bearer";
    const result = await searchXTool.execute({ query: "soybeans" }, ctx());
    expect(result.ok).toBe(true);
    expect(
      (result.data as { lookback_days: number }).lookback_days,
    ).toBe(2);
  });
});
