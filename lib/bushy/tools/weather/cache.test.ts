// WS4 Task 4.4 — weather_cache helpers unit tests.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheKey, readCache, writeCache } from "./cache";
import type { WeatherSnapshot } from "./types";

const SNAP: WeatherSnapshot = {
  location: { name: "Edmonton", provinceOrState: "AB", country: "CA" },
  current: { tempC: 12, conditions: "Sunny", windKph: 10, humidityPct: 40 },
  forecast: [],
  source: "eccc",
  fetchedAt: new Date().toISOString(),
};

describe("cacheKey", () => {
  it("composes postal|includeForecast and uppercases postal", () => {
    expect(cacheKey("t0l 1a0", true)).toBe("T0L 1A0|true");
    expect(cacheKey("59401", false)).toBe("59401|false");
  });

  it("trims whitespace around postal", () => {
    expect(cacheKey("  T0L  ", true)).toBe("T0L|true");
  });
});

describe("readCache", () => {
  function mockSupabase(
    result: { data: unknown; error: { message: string } | null },
  ): SupabaseClient {
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        maybeSingle: async () => result,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("returns the snapshot when present + non-expired", async () => {
    const supabase = mockSupabase({
      data: { snapshot_json: SNAP, expires_at: new Date(Date.now() + 60000).toISOString() },
      error: null,
    });
    const got = await readCache(supabase, "T0L|true");
    expect(got).toEqual(SNAP);
  });

  it("returns null on miss", async () => {
    const supabase = mockSupabase({ data: null, error: null });
    const got = await readCache(supabase, "UNKNOWN|true");
    expect(got).toBeNull();
  });

  it("returns null when supabase errors", async () => {
    const supabase = mockSupabase({
      data: null,
      error: { message: "network down" },
    });
    const got = await readCache(supabase, "T0L|true");
    expect(got).toBeNull();
  });
});

describe("writeCache", () => {
  it("upserts with onConflict=cache_key and populates expires_at ~1h out", async () => {
    const upsertSpy = vi.fn(async () => ({ data: null, error: null }));
    const supabase = {
      from: vi.fn(() => ({ upsert: upsertSpy })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SupabaseClient;

    const before = Date.now();
    await writeCache(supabase, "T0L|true", "T0L 1A0", "CA", SNAP);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertSpy.mock.calls[0];
    expect(opts).toEqual({ onConflict: "cache_key" });
    expect(row).toMatchObject({
      cache_key: "T0L|true",
      postal_or_zip: "T0L 1A0",
      country: "CA",
    });
    // expires_at should be ~1 hour later (within a 2-minute tolerance)
    const expiresMs = new Date(row.expires_at).getTime();
    expect(expiresMs - before).toBeGreaterThanOrEqual(55 * 60 * 1000);
    expect(expiresMs - before).toBeLessThanOrEqual(62 * 60 * 1000);
  });

  it("swallows upsert errors (cache write is best-effort)", async () => {
    const upsertSpy = vi.fn(async () => ({
      data: null,
      error: { message: "cache table offline" },
    }));
    const supabase = {
      from: vi.fn(() => ({ upsert: upsertSpy })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SupabaseClient;

    // Should NOT throw
    await expect(
      writeCache(supabase, "T0L|true", "T0L", "CA", SNAP),
    ).resolves.toBeUndefined();
  });
});
