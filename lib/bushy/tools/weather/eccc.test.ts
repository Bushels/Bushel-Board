// WS4 Task 4.2 — ECCC client tests.
//
// Strategy: mock supabase (FSA lookup) + mock fetch (Atom XML response).
// The Atom parser is tested directly against the fixture too, isolating
// parsing logic from the I/O path.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanadianWeather, parseEcccAtom } from "./eccc";
import type { WeatherStation } from "./types";

const SAMPLE_XML = readFileSync(
  resolve(__dirname, "__fixtures__/eccc-sample.xml"),
  "utf-8",
);

const EDMONTON: WeatherStation = {
  fsa_code: "T0L",
  province: "AB",
  station_code: "ab-30",
  station_name: "Edmonton",
  lat: 53.5461,
  lon: -113.4938,
};

function mockSupabase(
  stationRow: Partial<WeatherStation> | null,
  error: { message: string } | null = null,
): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: stationRow,
        error,
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("parseEcccAtom (fixture-driven)", () => {
  it("extracts current conditions", () => {
    const snap = parseEcccAtom(SAMPLE_XML, EDMONTON);
    expect(snap.location).toEqual({
      name: "Edmonton",
      provinceOrState: "AB",
      country: "CA",
    });
    expect(snap.current.tempC).toBeCloseTo(12.3, 2);
    expect(snap.current.conditions).toBe("Mainly Sunny");
    expect(snap.current.windKph).toBe(18);
    expect(snap.current.humidityPct).toBe(38);
    expect(snap.source).toBe("eccc");
  });

  it("pairs day/night forecast entries into date-level high/low", () => {
    const snap = parseEcccAtom(SAMPLE_XML, EDMONTON);
    // Fixture has: Friday night (low 4), Saturday (high 16), Saturday night
    // (low -2), Sunday (high 18). Expect 3 paired forecast days.
    expect(snap.forecast.length).toBe(3);

    const sat = snap.forecast.find((f) => f.conditions.includes("sun and cloud"));
    expect(sat).toBeDefined();
    expect(sat?.highC).toBe(16);
    expect(sat?.lowC).toBe(-2);

    const sun = snap.forecast.find((f) => f.conditions === "Sunny");
    expect(sun?.highC).toBe(18);
  });

  it("extracts precipitation amount (upper bound)", () => {
    const snap = parseEcccAtom(SAMPLE_XML, EDMONTON);
    // Friday night: "Amount 5 to 10 mm" → precipMm should be 10
    const fri = snap.forecast.find((f) => f.conditions === "");
    // Friday-night-only days have no day-entry conditions; check precipMm
    expect(fri).toBeDefined();
    expect(fri?.precipMm).toBe(10);
  });

  it("handles XML-entity-encoded degrees + HTML noise in summary", () => {
    // The fixture has &#xB0;C (for °C) plus &lt;b&gt; HTML in summary.
    // Current conditions parse should still work despite the entities.
    const snap = parseEcccAtom(SAMPLE_XML, EDMONTON);
    expect(snap.current.tempC).toBeGreaterThan(0);
    expect(snap.current.humidityPct).toBeGreaterThan(0);
  });
});

describe("getCanadianWeather (integration)", () => {
  it("returns null for unknown FSA", async () => {
    const supabase = mockSupabase(null);
    const fetchSpy = vi.fn();
    const result = await getCanadianWeather(
      "T0L 1A0",
      supabase,
      fetchSpy as unknown as typeof fetch,
    );
    expect(result).toBeNull();
    // Never fetched because FSA lookup missed
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches ECCC feed and returns parsed snapshot on success", async () => {
    const supabase = mockSupabase(EDMONTON);
    const fetchImpl = vi.fn(
      async () =>
        new Response(SAMPLE_XML, {
          status: 200,
          headers: { "Content-Type": "application/atom+xml" },
        }),
    );

    const snap = await getCanadianWeather(
      "T0L 1A0",
      supabase,
      fetchImpl as unknown as typeof fetch,
    );
    expect(snap).toBeDefined();
    expect(snap?.location.name).toBe("Edmonton");
    expect(snap?.source).toBe("eccc");
    // URL should use station_code directly
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://weather.gc.ca/rss/city/ab-30_e.xml",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("BushelsApp"),
        }),
      }),
    );
  });

  it("throws on non-200 ECCC response", async () => {
    const supabase = mockSupabase(EDMONTON);
    const fetchImpl = vi.fn(
      async () => new Response("Service Unavailable", { status: 503 }),
    );
    await expect(
      getCanadianWeather(
        "T0L 1A0",
        supabase,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/ECCC fetch failed: 503/);
  });

  it("normalizes FSA to uppercase for lookup", async () => {
    const eqSpy = vi.fn().mockReturnThis();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: eqSpy,
        maybeSingle: async () => ({ data: null, error: null }),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SupabaseClient;

    await getCanadianWeather(
      "t0l 1a0",
      supabase,
      (async () => new Response("", { status: 200 })) as unknown as typeof fetch,
    );

    expect(eqSpy).toHaveBeenCalledWith("fsa_code", "T0L");
  });
});
