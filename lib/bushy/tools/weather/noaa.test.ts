// WS4 Task 4.3 — NOAA client tests.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  getUSWeather,
  normalizeNoaa,
  parseWindMphToKph,
} from "./noaa";

const ZIPPOPOTAM = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/noaa-zippopotam.json"),
    "utf-8",
  ),
);
const POINTS = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/noaa-points.json"),
    "utf-8",
  ),
);
const FORECAST = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/noaa-forecast.json"),
    "utf-8",
  ),
);

describe("parseWindMphToKph", () => {
  it("parses simple mph", () => {
    expect(parseWindMphToKph("15 mph")).toBeCloseTo(24.1, 1);
    expect(parseWindMphToKph("5 mph")).toBeCloseTo(8, 0);
  });

  it("takes upper bound from ranges", () => {
    expect(parseWindMphToKph("10 to 15 mph")).toBeCloseTo(24.1, 1);
  });

  it("returns 0 on unparseable input", () => {
    expect(parseWindMphToKph("calm")).toBe(0);
    expect(parseWindMphToKph("")).toBe(0);
  });
});

describe("normalizeNoaa (fixture-driven)", () => {
  it("converts F->C with 1-decimal rounding", () => {
    const snap = normalizeNoaa(FORECAST, { name: "Great Falls", state: "MT" });
    // 62F = 16.7C
    expect(snap.current.tempC).toBeCloseTo(16.7, 1);
    expect(snap.current.conditions).toBe("Mostly Sunny");
    // 15 mph ~= 24.1 km/h
    expect(snap.current.windKph).toBeCloseTo(24.1, 1);
  });

  it("pairs day/night periods into per-date high/low", () => {
    const snap = normalizeNoaa(FORECAST, { name: "Great Falls", state: "MT" });
    // Fixture has 5 periods spanning 3 dates (Friday: current + tonight,
    // Saturday day+night, Sunday day). Expect 3 forecast days.
    expect(snap.forecast.length).toBe(3);

    const sat = snap.forecast.find((f) => f.date === "2026-04-18");
    expect(sat).toBeDefined();
    // Saturday high 58F = 14.4C, low 35F = 1.7C
    expect(sat?.highC).toBeCloseTo(14.4, 1);
    expect(sat?.lowC).toBeCloseTo(1.7, 1);
    expect(sat?.conditions).toBe("Rain Likely");
    // 70% POP -> rough 10 mm proxy (round 10.5 -> 11)
    expect(sat?.precipMm).toBe(11);
  });

  it("sets source='noaa' and country='US'", () => {
    const snap = normalizeNoaa(FORECAST, { name: "Great Falls", state: "MT" });
    expect(snap.source).toBe("noaa");
    expect(snap.location.country).toBe("US");
    expect(snap.location.provinceOrState).toBe("MT");
  });
});

describe("getUSWeather (three-hop integration)", () => {
  function scriptedFetch(
    scripts: Array<{ status?: number; body: unknown }>,
  ) {
    return vi.fn(async (url: string) => {
      const next = scripts.shift();
      if (!next) throw new Error(`Unexpected fetch: ${url}`);
      return new Response(
        typeof next.body === "string"
          ? next.body
          : JSON.stringify(next.body),
        {
          status: next.status ?? 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
  }

  it("happy path: chains zippopotam -> points -> forecast", async () => {
    const fetchImpl = scriptedFetch([
      { body: ZIPPOPOTAM },
      { body: POINTS },
      { body: FORECAST },
    ]);
    const snap = await getUSWeather("59401", fetchImpl as unknown as typeof fetch);
    expect(snap).toBeDefined();
    expect(snap?.location.name).toBe("Great Falls");
    expect(snap?.source).toBe("noaa");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // All three calls should carry User-Agent
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]).toMatchObject({
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("BushelsApp"),
        }),
      });
    }
  });

  it("strips ZIP+4 before calling Zippopotam", async () => {
    const fetchImpl = scriptedFetch([
      { body: ZIPPOPOTAM },
      { body: POINTS },
      { body: FORECAST },
    ]);
    await getUSWeather("59401-1234", fetchImpl as unknown as typeof fetch);
    // First call URL should have only the 5-digit ZIP
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.zippopotam.us/us/59401",
    );
  });

  it("returns null when ZIP lookup fails (invalid ZIP)", async () => {
    const fetchImpl = scriptedFetch([
      { status: 404, body: {} },
    ]);
    const snap = await getUSWeather("00000", fetchImpl as unknown as typeof fetch);
    expect(snap).toBeNull();
  });

  it("throws when NOAA /points returns 500", async () => {
    const fetchImpl = scriptedFetch([
      { body: ZIPPOPOTAM },
      { status: 500, body: {} },
    ]);
    await expect(
      getUSWeather("59401", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/NOAA \/points fetch failed: 500/);
  });
});
