import { describe, it, expect } from "vitest";
import { cadWriteEnvelope, usWriteEnvelope } from "../../scripts/desk/schemas";
import { usTrajectoryDeleteBound } from "../../scripts/desk/row-builders";
import { assertFailStatus } from "../../scripts/desk/contracts";
import { runTableRead } from "../../scripts/desk/reads";
import type { SupabaseClient } from "@supabase/supabase-js";

const cadBase = {
  side: "cad",
  crop_year: "2025-2026",
  grain_week: 46,
  rows: [
    {
      grain: "Wheat",
      stance_score: 9,
      initial_thesis: "t",
      bull_case: "b",
      bear_case: "b",
      data_freshness: { cgc_week: 46 },
    },
  ],
};

const usBase = {
  side: "us",
  crop_year: "2025-2026",
  market_year: 2025,
  week_ending: "2026-06-26",
  rows: [
    {
      market_name: "Wheat",
      stance_score: 11,
      initial_thesis: "t",
      bull_case: "b",
      bear_case: "b",
      recommendation: "HOLD",
    },
  ],
};

describe("write envelope format guards (M-2)", () => {
  it("accepts long-format crop_year", () => {
    expect(cadWriteEnvelope.parse(cadBase).crop_year).toBe("2025-2026");
  });
  it("rejects short-format crop_year on both sides", () => {
    expect(() => cadWriteEnvelope.parse({ ...cadBase, crop_year: "2025-26" })).toThrow();
    expect(() => usWriteEnvelope.parse({ ...usBase, crop_year: "2025-26" })).toThrow();
  });
  it("rejects a malformed week_ending", () => {
    expect(() => usWriteEnvelope.parse({ ...usBase, week_ending: "June 26 2026" })).toThrow();
  });
  it("rejects an out-of-range market_year", () => {
    expect(() => usWriteEnvelope.parse({ ...usBase, market_year: 1999 })).toThrow();
  });
});

describe("US weekly-anchor delete bound (H-1)", () => {
  it("bounds the delete to the run week's Friday midnight UTC", () => {
    expect(usTrajectoryDeleteBound("2026-06-26")).toBe("2026-06-26T00:00:00Z");
  });
});

describe("fail status restriction (M-3)", () => {
  it("allows failed and partial", () => {
    expect(assertFailStatus("failed")).toBe("failed");
    expect(assertFailStatus("partial")).toBe("partial");
  });
  it("rejects completed and unknown statuses", () => {
    expect(() => assertFailStatus("completed")).toThrow(/failed\|partial/);
    expect(() => assertFailStatus("running")).toThrow(/failed\|partial/);
  });
});

describe("embedded select rejection (M-1)", () => {
  it("rejects PostgREST embedding syntax before touching the client", async () => {
    await expect(
      runTableRead(null as unknown as SupabaseClient, {
        table: "x_market_signals",
        select: "*,signal_feedback(*)",
      }),
    ).rejects.toThrow(/embedded/);
  });
  it("no longer exposes raw grain_sentiment_votes (L-2)", async () => {
    await expect(
      runTableRead(null as unknown as SupabaseClient, { table: "grain_sentiment_votes" }),
    ).rejects.toThrow(/not in the desk read allow-list/);
  });
});
