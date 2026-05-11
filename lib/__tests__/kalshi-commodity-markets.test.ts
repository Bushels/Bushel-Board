import { describe, expect, it } from "vitest";

import {
  KALSHI_CALIBRATION_GRAINS,
  KALSHI_COMMODITY_SERIES,
  buildBushelBoardImpliedLine,
  buildKalshiCalibrationRows,
  fetchKalshiCommoditySnapshot,
  normalizeKalshiCommodityMarket,
} from "@/lib/kalshi/commodity-markets";
import type { ThesisBoardItem, ThesisComparisonRow, ThesisDriver } from "@/lib/queries/thesis-board";

const capturedAt = "2026-05-10T20:00:00.000Z";
const cornSeries = KALSHI_COMMODITY_SERIES.find(
  (series) => series.seriesTicker === "KXCORNW",
)!;

function thesisItem(name: string, stanceScore: number): ThesisBoardItem {
  return {
    id: `us-${name.toLowerCase()}`,
    lane: "us",
    name,
    slug: name.toLowerCase(),
    cropYear: null,
    grainWeek: null,
    marketYear: 2026,
    packetGeneratedAt: capturedAt,
    stanceScore,
    stanceLabel: stanceScore > 0 ? "Bull tilt" : stanceScore < 0 ? "Bear tilt" : "Balanced",
    confidence: "medium",
    confidenceScore: 62,
    bullCase: "test bull",
    bearCase: "test bear",
    bullDrivers: [],
    bearDrivers: [],
    freshness: [],
    warnings: [],
    sourceCount: 0,
    strongSourceCount: 0,
    staleSourceCount: 0,
  };
}

function comparisonRow(grain: string, item: ThesisBoardItem): ThesisComparisonRow {
  return {
    grain,
    canada: null,
    us: item,
    status: "mixed",
    statusLabel: "Country split",
    explanation: "test",
    strongestBullPoints: [],
    strongestBearPoints: [],
  };
}

function driver(tone: "bull" | "bear", confidence: ThesisDriver["confidence"]): ThesisDriver {
  return {
    tone,
    title: tone === "bull" ? "Export sales demand" : "Crop condition pressure",
    body: "test driver",
    sourceName: tone === "bull" ? "usda_export_sales" : "usda_crop_progress",
    confidence,
    metricLabel: tone === "bull" ? "620,000 mt" : "76.0% good/excellent",
  };
}

describe("Kalshi commodity calibration contract", () => {
  it("watches only the V1 grain commodities with Kalshi support", () => {
    expect(KALSHI_CALIBRATION_GRAINS).toEqual(["Corn", "Soybeans", "Wheat"]);
    expect(KALSHI_COMMODITY_SERIES.map((series) => series.grain)).not.toContain("Rice");
    expect(KALSHI_COMMODITY_SERIES.map((series) => series.grain)).not.toContain("Cotton");
  });

  it("normalizes Kalshi price fields into implied YES probability and spread", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6000",
        yes_ask_dollars: "0.7000",
        no_bid_dollars: "0.3000",
        no_ask_dollars: "0.4000",
        last_price_dollars: "0.6400",
        volume_fp: "125.00",
        open_interest_fp: "88.00",
        close_time: "2026-05-15T18:20:00Z",
        rules_primary:
          "If the close price of the 1-minute candlestick for corn using the CON6 contract is above 450.99 USd/Bu, then the market resolves to Yes.",
      },
      capturedAt,
    );

    expect(market.grain).toBe("Corn");
    expect(market.yesBidPct).toBe(60);
    expect(market.yesAskPct).toBe(70);
    expect(market.impliedYesPct).toBe(65);
    expect(market.spreadPct).toBe(10);
    expect(market.marketLean).toBe("yes");
    expect(market.strikeLabel).toBe("450.99 USd/Bu");
    expect(market.liquidityStatus).toBe("usable");
  });

  it("compares a bullish thesis to a YES-leaning above-threshold contract", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6000",
        yes_ask_dollars: "0.7000",
        volume_fp: "125.00",
        open_interest_fp: "88.00",
      },
      capturedAt,
    );
    const item = thesisItem("Corn", 31);
    item.bullDrivers = [driver("bull", "medium")];
    const rows = buildKalshiCalibrationRows([comparisonRow("Corn", item)], [market]);

    expect(rows.find((row) => row.grain === "Corn")).toMatchObject({
      grain: "Corn",
      marketLean: "yes",
      thesisDirection: "bullish",
      alignment: "aligned",
    });
  });

  it("flags disagreement without treating Kalshi as a model correction", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6200",
        yes_ask_dollars: "0.6800",
        volume_fp: "125.00",
        open_interest_fp: "88.00",
      },
      capturedAt,
    );
    const item = thesisItem("Corn", -28);
    item.bearDrivers = [driver("bear", "medium")];
    const rows = buildKalshiCalibrationRows([comparisonRow("Corn", item)], [market]);
    const corn = rows.find((row) => row.grain === "Corn");

    expect(corn?.alignment).toBe("divergent");
    expect(corn?.explanation).toContain("not a model correction");
  });

  it("builds a deterministic Bushel Board Implied Line from thesis evidence", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6200",
        yes_ask_dollars: "0.6800",
        volume_fp: "125.00",
        open_interest_fp: "88.00",
      },
      capturedAt,
    );
    const item = thesisItem("Corn", 40);
    item.bullDrivers = [driver("bull", "medium")];

    const line = buildBushelBoardImpliedLine(item, "US", market);

    expect(line).toMatchObject({
      status: "available",
      probabilityPct: 60,
      deltaPct: -5,
      confidence: "medium",
      country: "US",
    });
    expect(line.components).toMatchObject({
      baseProbabilityPct: 50,
      directionAdjustmentPct: 7,
      confidenceMultiplier: 0.62,
      evidenceAdjustmentPct: 3,
    });
    expect(line.topBullReasons[0]?.title).toBe("Export sales demand");
  });

  it("withholds the Bushel Board Implied Line when the Kalshi threshold is not parsed", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Corn weekly market",
        yes_bid_dollars: "0.6200",
        yes_ask_dollars: "0.6800",
        volume_fp: "125.00",
        open_interest_fp: "88.00",
      },
      capturedAt,
    );
    const item = thesisItem("Corn", 40);
    item.bullDrivers = [driver("bull", "high")];

    const line = buildBushelBoardImpliedLine(item, "US", market);

    expect(market.strikeLabel).toBeNull();
    expect(line.status).toBe("unparsed_contract");
    expect(line.probabilityPct).toBeNull();
    expect(line.deltaPct).toBeNull();
  });

  it("withholds the Bushel Board Implied Line when the thesis has no evidence drivers", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6200",
        yes_ask_dollars: "0.6800",
      },
      capturedAt,
    );

    const line = buildBushelBoardImpliedLine(thesisItem("Corn", 40), "US", market);

    expect(line.status).toBe("insufficient_evidence");
    expect(line.probabilityPct).toBeNull();
  });

  it("does not use Canada thesis rows to price US Kalshi contracts", () => {
    const market = normalizeKalshiCommodityMarket(
      cornSeries,
      {
        ticker: "KXCORNW-26MAY1514-T450.99",
        event_ticker: "KXCORNW-26MAY1514",
        status: "open",
        title: "Will the corn close price be above 450.99 USd/Bu on May 15, 2026?",
        yes_bid_dollars: "0.6200",
        yes_ask_dollars: "0.6800",
      },
      capturedAt,
    );
    const canadaItem = thesisItem("Corn", 40);
    canadaItem.id = "ca-corn";
    canadaItem.lane = "canada";
    canadaItem.bullDrivers = [driver("bull", "high")];

    const rows = buildKalshiCalibrationRows(
      [
        {
          grain: "Corn",
          canada: canadaItem,
          us: null,
          status: "canada_only",
          statusLabel: "Canada only",
          explanation: "Canada-only row",
          strongestBullPoints: [],
          strongestBearPoints: [],
        },
      ],
      [market],
    );

    const corn = rows.find((row) => row.grain === "Corn");
    expect(corn?.thesisCountry).toBeNull();
    expect(corn?.bushelBoardLine.status).toBe("no_thesis");
    expect(corn?.bushelBoardLine.probabilityPct).toBeNull();
  });

  it("returns watched grain rows even when no active Kalshi market is available", () => {
    const rows = buildKalshiCalibrationRows([comparisonRow("Corn", thesisItem("Corn", 31))], []);

    expect(rows.map((row) => row.grain)).toEqual(["Corn", "Soybeans", "Wheat"]);
    expect(rows.find((row) => row.grain === "Soybeans")?.alignment).toBe("no_market");
  });

  it("fetches each configured series sequentially with no write side effects", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ markets: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const snapshot = await fetchKalshiCommoditySnapshot({
      fetchImpl,
      series: KALSHI_COMMODITY_SERIES.slice(0, 2),
      delayMs: 0,
      capturedAt,
    });

    expect(snapshot.markets).toHaveLength(0);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("series_ticker=KXCORNW");
    expect(requestedUrls[0]).toContain("status=open");
  });
});
