import { describe, expect, it } from "vitest";

import {
  classifyUsAcreageFreshness,
  getLatestUsAcreageFromClient,
  pickLatestNationalUsAcreage,
} from "../queries/us-acreage";

describe("US acreage query helper", () => {
  it("treats latest USDA acreage reports as usable through the active marketing year", () => {
    expect(classifyUsAcreageFreshness("2026-01-12", new Date("2026-05-22T00:00:00Z"))).toBe("fresh");
    expect(classifyUsAcreageFreshness("2025-06-30", new Date("2026-05-22T00:00:00Z"))).toBe("aging");
    expect(classifyUsAcreageFreshness("2024-06-30", new Date("2026-05-22T00:00:00Z"))).toBe("stale");
  });

  it("picks the latest US TOTAL acreage row by source release date", () => {
    const row = pickLatestNationalUsAcreage([
      {
        region_code: "IA",
        commodity: "CORN",
        market_year: 2025,
        planted_acres: 13_100_000,
        source_program: "SURVEY",
        source_release_date: "2026-01-12",
      },
      {
        region_code: "US TOTAL",
        commodity: "CORN",
        market_year: 2025,
        planted_acres: 95_203_000,
        source_program: "ACREAGE",
        source_release_date: "2025-06-30",
      },
      {
        region_code: "US TOTAL",
        commodity: "CORN",
        market_year: 2025,
        planted_acres: 98_788_000,
        source_program: "SURVEY",
        source_release_date: "2026-01-12",
      },
    ]);

    expect(row).toEqual({
      market_year: 2025,
      commodity: "CORN",
      planted_acres: 98_788_000,
      source_program: "SURVEY",
      source_release_date: "2026-01-12",
    });
  });

  it("reads latest national commodity acreage from an injected Supabase client", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const client = {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return {
          select(columns: string) {
            calls.push({ method: "select", args: [columns] });
            return this;
          },
          ilike(column: string, value: string) {
            calls.push({ method: "ilike", args: [column, value] });
            return this;
          },
          eq(column: string, value: unknown) {
            calls.push({ method: "eq", args: [column, value] });
            return this;
          },
          order(column: string, options: { ascending: boolean }) {
            calls.push({ method: "order", args: [column, options] });
            return this;
          },
          limit(count: number) {
            calls.push({ method: "limit", args: [count] });
            return this;
          },
          maybeSingle() {
            calls.push({ method: "maybeSingle", args: [] });
            return Promise.resolve({
              data: {
                market_year: 2025,
                commodity: "CORN",
                planted_acres: 98_788_000,
                source_program: "SURVEY",
                source_release_date: "2026-01-12",
              },
              error: null,
            });
          },
        };
      },
    };

    await expect(
      getLatestUsAcreageFromClient(client, "corn", 2025, new Date("2026-05-22T00:00:00Z")),
    ).resolves.toEqual({
      market_year: 2025,
      commodity: "CORN",
      planted_acres: 98_788_000,
      planted_acres_million: 98.79,
      source_program: "SURVEY",
      source_release_date: "2026-01-12",
      freshness: "fresh",
    });

    expect(calls).toContainEqual({ method: "from", args: ["crop_acreage_estimates"] });
    expect(calls).toContainEqual({ method: "ilike", args: ["commodity", "CORN"] });
    expect(calls).toContainEqual({ method: "eq", args: ["region_code", "US TOTAL"] });
    expect(calls).toContainEqual({ method: "eq", args: ["market_year", 2025] });
  });
});
