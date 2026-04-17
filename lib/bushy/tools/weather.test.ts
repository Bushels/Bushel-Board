// WS4 Task 4.4 — get_weather composition tests.
// Mocks the three underlying helpers (readCache, detectCountry via route,
// getCanadianWeather / getUSWeather) by stubbing the module-level imports.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "./types";
import type { WeatherSnapshot } from "./weather/types";

// Mock the client modules so the composition test focuses on routing +
// cache + auto-extraction, not the HTTP mechanics we covered elsewhere.
const readCacheMock = vi.fn();
const writeCacheMock = vi.fn();
const getCanadianWeatherMock = vi.fn();
const getUSWeatherMock = vi.fn();

vi.mock("./weather/cache", async () => {
  const actual = await vi.importActual<typeof import("./weather/cache")>(
    "./weather/cache",
  );
  return {
    ...actual,
    readCache: (...args: unknown[]) =>
      readCacheMock(...(args as Parameters<typeof actual.readCache>)),
    writeCache: (...args: unknown[]) =>
      writeCacheMock(...(args as Parameters<typeof actual.writeCache>)),
  };
});

vi.mock("./weather/eccc", () => ({
  getCanadianWeather: (...args: unknown[]) => getCanadianWeatherMock(...args),
}));

vi.mock("./weather/noaa", () => ({
  getUSWeather: (...args: unknown[]) => getUSWeatherMock(...args),
}));

const FAKE_SNAP: WeatherSnapshot = {
  location: { name: "Edmonton", provinceOrState: "AB", country: "CA" },
  current: {
    tempC: 12,
    conditions: "Mainly Sunny",
    windKph: 18,
    humidityPct: 38,
  },
  forecast: [],
  source: "eccc",
  fetchedAt: new Date().toISOString(),
};

interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  __inserts: Array<{ table: string; row: Record<string, unknown> }>;
}

function mockSupabase(): MockSupabase {
  const inserts: MockSupabase["__inserts"] = [];
  const from = vi.fn((table: string) => ({
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return Promise.resolve({ data: null, error: null });
    },
  }));
  return {
    from: from as unknown as MockSupabase["from"],
    __inserts: inserts,
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

beforeEach(() => {
  readCacheMock.mockReset();
  writeCacheMock.mockReset();
  getCanadianWeatherMock.mockReset();
  getUSWeatherMock.mockReset();
});

describe("getWeatherTool (composition)", () => {
  it("cache hit: returns cached snapshot without hitting ECCC/NOAA", async () => {
    readCacheMock.mockResolvedValueOnce(FAKE_SNAP);
    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0L 1A0", includeForecast: true },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ cached: true, source: "eccc" });
    expect(getCanadianWeatherMock).not.toHaveBeenCalled();
    expect(getUSWeatherMock).not.toHaveBeenCalled();
    expect(writeCacheMock).not.toHaveBeenCalled();
  });

  it("Canadian postal: routes to ECCC, caches, and auto-extracts", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    getCanadianWeatherMock.mockResolvedValueOnce(FAKE_SNAP);
    writeCacheMock.mockResolvedValueOnce(undefined);

    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0L 1A0" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ cached: false });
    expect(getCanadianWeatherMock).toHaveBeenCalledTimes(1);
    expect(getUSWeatherMock).not.toHaveBeenCalled();
    expect(writeCacheMock).toHaveBeenCalledTimes(1);
    // Auto-extraction inserted
    expect(mock.__inserts).toHaveLength(1);
    expect(mock.__inserts[0].table).toBe("chat_extractions");
    expect(mock.__inserts[0].row).toMatchObject({
      category: "weather",
      data_type: "snapshot",
      confidence: "inferred",
    });
  });

  it("US ZIP: routes to NOAA", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    getUSWeatherMock.mockResolvedValueOnce({
      ...FAKE_SNAP,
      source: "noaa",
      location: { name: "Great Falls", provinceOrState: "MT", country: "US" },
    });
    writeCacheMock.mockResolvedValueOnce(undefined);

    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "59401" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(true);
    expect(getUSWeatherMock).toHaveBeenCalledTimes(1);
    expect(getCanadianWeatherMock).not.toHaveBeenCalled();
  });

  it("unrecognized postal: rejects without calling any provider", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "ABCDE" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unrecognized postal/);
    expect(getCanadianWeatherMock).not.toHaveBeenCalled();
    expect(getUSWeatherMock).not.toHaveBeenCalled();
  });

  it("provider returns null (unknown FSA): ok=false with helpful message", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    getCanadianWeatherMock.mockResolvedValueOnce(null);
    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0L 1A0" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No weather data available/);
    expect(writeCacheMock).not.toHaveBeenCalled();
  });

  it("provider throws: surfaced as ok=false with error detail", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    getCanadianWeatherMock.mockRejectedValueOnce(new Error("ECCC 503"));
    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0L 1A0" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECCC 503/);
  });

  it("skips auto-extraction when ctx.fsaCode is null", async () => {
    readCacheMock.mockResolvedValueOnce(null);
    getCanadianWeatherMock.mockResolvedValueOnce(FAKE_SNAP);
    writeCacheMock.mockResolvedValueOnce(undefined);

    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0L 1A0" },
      ctx({ fsaCode: null, supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(true);
    // Cache write still happens; extraction is skipped
    expect(writeCacheMock).toHaveBeenCalled();
    expect(mock.__inserts).toHaveLength(0);
  });

  it("rejects validation on too-short postal", async () => {
    const mock = mockSupabase();
    const { getWeatherTool } = await import("./weather");
    const result = await getWeatherTool.execute(
      { postalOrZip: "T0" },
      ctx({ supabase: mock as unknown as SupabaseClient }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/validation/);
  });
});
