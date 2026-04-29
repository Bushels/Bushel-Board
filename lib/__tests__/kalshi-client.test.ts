import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  FEATURED_KALSHI_TICKERS,
  __clearKalshiCacheForTests,
  __getKalshiCacheForTests,
  deriveYesProbability,
  fetchKalshiMarkets,
  fetchTopMarketForSeries,
  formatCloseLabel,
  formatVolume,
  normalizeKalshiMarket,
  parseKalshiNumber,
} from "@/lib/kalshi/client";
import type { KalshiRawMarket, KalshiSeriesSpec } from "@/lib/kalshi/types";

const CORN_SPEC: KalshiSeriesSpec = {
  seriesTicker: "KXCORNMON",
  crop: "CORN",
};

const SOY_SPEC: KalshiSeriesSpec = {
  seriesTicker: "KXSOYBEANMON",
  crop: "SOY",
};

// Real Kalshi API row shape captured from
// GET /markets?series_ticker=KXCORNMON on 2026-04-28.
const REAL_CORN_ROW: KalshiRawMarket = {
  ticker: "KXCORNMON-26APR3017-T455.99",
  event_ticker: "KXCORNMON-26APR3017",
  title: "Will the corn close price be above $455.99 on Apr 30, 2026 at 5pm EDT?",
  yes_sub_title: "above 455.99¢",
  status: "active",
  yes_bid_dollars: "0.6600",
  yes_ask_dollars: "0.6800",
  last_price_dollars: "0.6600",
  volume_fp: "3013.54",
  open_interest_fp: "1940.74",
  close_time: "2026-04-30T21:00:00Z",
};

// Same shape but a market with no liquidity (still listed).
const EMPTY_CORN_ROW: KalshiRawMarket = {
  ticker: "KXCORNMON-26APR3017-T999.99",
  event_ticker: "KXCORNMON-26APR3017",
  title: "Will the corn close price be above $999.99 on Apr 30, 2026 at 5pm EDT?",
  status: "active",
  yes_bid_dollars: null,
  yes_ask_dollars: null,
  last_price_dollars: null,
  volume_fp: "0",
  open_interest_fp: "0",
  close_time: "2026-04-30T21:00:00Z",
};

function makeFetchImpl(
  responses: Record<string, { status: number; body: unknown; throw?: boolean }>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const matched = Object.entries(responses).find(([key]) => url.includes(key));
    if (!matched) {
      return new Response(JSON.stringify({ markets: [] }), { status: 200 });
    }
    const [, spec] = matched;
    if (spec.throw) throw new Error("network down");
    return new Response(
      typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body),
      { status: spec.status },
    );
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __clearKalshiCacheForTests();
});

describe("parseKalshiNumber", () => {
  it("parses string decimals", () => {
    expect(parseKalshiNumber("0.6600")).toBe(0.66);
  });

  it("returns null for null/undefined", () => {
    expect(parseKalshiNumber(null)).toBeNull();
    expect(parseKalshiNumber(undefined)).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(parseKalshiNumber("abc")).toBeNull();
    expect(parseKalshiNumber("")).toBeNull();
  });

  it("passes plain numbers through", () => {
    expect(parseKalshiNumber(42)).toBe(42);
  });

  it("rejects NaN/Infinity", () => {
    expect(parseKalshiNumber(Number.NaN)).toBeNull();
    expect(parseKalshiNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatCloseLabel", () => {
  it("renders short month + day in UTC", () => {
    expect(formatCloseLabel("2026-04-30T21:00:00Z")).toBe("Apr 30");
  });

  it("falls back to TBD on null or invalid input", () => {
    expect(formatCloseLabel(null)).toBe("TBD");
    expect(formatCloseLabel(undefined)).toBe("TBD");
    expect(formatCloseLabel("not-a-date")).toBe("TBD");
  });
});

describe("formatVolume", () => {
  it("uses k for thousands and m for millions", () => {
    expect(formatVolume(284_000)).toBe("$284.0k");
    expect(formatVolume(1_500_000)).toBe("$1.5m");
  });

  it("rounds small values to whole dollars", () => {
    expect(formatVolume(125.4)).toBe("$125");
  });

  it("renders em-dash for zero / negative", () => {
    expect(formatVolume(0)).toBe("—");
    expect(formatVolume(-12)).toBe("—");
  });
});

describe("deriveYesProbability", () => {
  it("prefers a valid last traded price", () => {
    expect(deriveYesProbability(0.66, 0.6, 0.68)).toBe(0.66);
  });

  it("falls back to bid/ask midpoint when last is zero", () => {
    expect(deriveYesProbability(0, 0.6, 0.7)).toBeCloseTo(0.65);
  });

  it("falls back to bid alone when ask is missing", () => {
    expect(deriveYesProbability(null, 0.5, null)).toBe(0.5);
  });

  it("returns null when nothing is usable", () => {
    expect(deriveYesProbability(null, null, null)).toBeNull();
    expect(deriveYesProbability(0, null, null)).toBeNull();
  });

  it("rejects out-of-range probabilities", () => {
    expect(deriveYesProbability(1.5, null, null)).toBeNull();
  });
});

describe("normalizeKalshiMarket", () => {
  it("maps a real API row into our shape", () => {
    const m = normalizeKalshiMarket(REAL_CORN_ROW, CORN_SPEC);
    expect(m).not.toBeNull();
    expect(m?.ticker).toBe("KXCORNMON-26APR3017-T455.99");
    expect(m?.crop).toBe("CORN");
    expect(m?.seriesTicker).toBe("KXCORNMON");
    expect(m?.yesBid).toBe(0.66);
    expect(m?.yesAsk).toBe(0.68);
    expect(m?.lastPrice).toBe(0.66);
    expect(m?.volume).toBe(3013.54);
    expect(m?.openInterest).toBe(1940.74);
    expect(m?.yesProbability).toBe(0.66);
    expect(m?.closeLabel).toBe("Apr 30");
  });

  it("returns null when the row is missing required identifiers", () => {
    expect(normalizeKalshiMarket({ title: "no ticker" }, CORN_SPEC)).toBeNull();
    expect(
      normalizeKalshiMarket({ ticker: "X", title: "" } as KalshiRawMarket, CORN_SPEC),
    ).toBeNull();
  });

  it("handles a settled market with missing prices", () => {
    const settled: KalshiRawMarket = {
      ticker: "KXCORNW-25DEC0114-T400",
      title: "Old corn weekly",
      status: "settled",
      yes_bid_dollars: null,
      yes_ask_dollars: null,
      last_price_dollars: null,
      volume_fp: "100",
    };
    const m = normalizeKalshiMarket(settled, CORN_SPEC);
    expect(m?.status).toBe("settled");
    expect(m?.yesProbability).toBeNull();
    expect(m?.volume).toBe(100);
  });

  it("falls back from yes_sub_title for subtitle", () => {
    const m = normalizeKalshiMarket(REAL_CORN_ROW, CORN_SPEC);
    expect(m?.subtitle).toBe("above 455.99¢");
  });
});

describe("fetchTopMarketForSeries", () => {
  it("returns the highest-volume open market for a series", async () => {
    const lowVol = { ...REAL_CORN_ROW, ticker: "LOW", volume_fp: "10" };
    const highVol = { ...REAL_CORN_ROW, ticker: "HIGH", volume_fp: "5000" };
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": {
        status: 200,
        body: { markets: [lowVol, highVol] },
      },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result?.ticker).toBe("HIGH");
  });

  it("filters out markets that have zero liquidity AND no quoted price", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": {
        status: 200,
        body: { markets: [EMPTY_CORN_ROW, REAL_CORN_ROW] },
      },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result?.ticker).toBe(REAL_CORN_ROW.ticker);
  });

  it("returns null on a 500 error", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": { status: 500, body: { error: "boom" } },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": { status: 0, body: null, throw: true },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": { status: 200, body: "<<not-json>>" },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result).toBeNull();
  });

  it("returns null when markets array is empty", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": { status: 200, body: { markets: [] } },
    });

    const result = await fetchTopMarketForSeries(CORN_SPEC, fetchImpl);
    expect(result).toBeNull();
  });
});

describe("fetchKalshiMarkets", () => {
  it("fetches multiple specs in parallel and returns all live markets", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": {
        status: 200,
        body: {
          markets: [{ ...REAL_CORN_ROW, ticker: "CORN-A", volume_fp: "100" }],
        },
      },
      "series_ticker=KXSOYBEANMON": {
        status: 200,
        body: {
          markets: [{ ...REAL_CORN_ROW, ticker: "SOY-A", volume_fp: "200" }],
        },
      },
    });

    const result = await fetchKalshiMarkets([CORN_SPEC, SOY_SPEC], fetchImpl);
    expect(result.map((m) => m.ticker).sort()).toEqual(["CORN-A", "SOY-A"]);
    expect(result.find((m) => m.ticker === "SOY-A")?.crop).toBe("SOY");
  });

  it("silently skips a series whose fetch fails", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": {
        status: 200,
        body: {
          markets: [{ ...REAL_CORN_ROW, ticker: "CORN-A", volume_fp: "100" }],
        },
      },
      "series_ticker=KXSOYBEANMON": { status: 500, body: { error: "boom" } },
    });

    const result = await fetchKalshiMarkets([CORN_SPEC, SOY_SPEC], fetchImpl);
    expect(result.map((m) => m.ticker)).toEqual(["CORN-A"]);
  });

  it("returns an empty array when all series fail", async () => {
    const fetchImpl = makeFetchImpl({
      "series_ticker=KXCORNMON": { status: 502, body: null },
      "series_ticker=KXSOYBEANMON": { status: 502, body: null },
    });

    const result = await fetchKalshiMarkets([CORN_SPEC, SOY_SPEC], fetchImpl);
    expect(result).toEqual([]);
  });

  it("caches results within the 5-minute window", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ markets: [REAL_CORN_ROW] }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    await fetchKalshiMarkets([CORN_SPEC], fetchImpl);
    await fetchKalshiMarkets([CORN_SPEC], fetchImpl);

    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    const cached = __getKalshiCacheForTests();
    expect(cached.size).toBe(1);
  });

  it("exposes a non-empty default ticker list", () => {
    expect(FEATURED_KALSHI_TICKERS.length).toBeGreaterThanOrEqual(4);
    expect(FEATURED_KALSHI_TICKERS.every((s) => s.seriesTicker.startsWith("KX"))).toBe(true);
  });
});
