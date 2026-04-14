import { describe, expect, it } from "vitest";

import {
  buildLatestRowFromSnapshot,
  buildRowsForGrain,
  parseBarchartOverview,
  type GrainPriceSpec,
} from "../grain-price-sources";

const CANOLA_SPEC: GrainPriceSpec = {
  grain: "Canola",
  contract: "RSK26",
  exchange: "ICE",
  currency: "CAD",
  unit: "$/tonne",
  centsToBase: false,
  barchartSymbol: "RSK26",
};

const SPRING_WHEAT_SPEC: GrainPriceSpec = {
  grain: "Spring Wheat",
  contract: "MWK26",
  exchange: "MGEX",
  currency: "USD",
  unit: "$/bu",
  centsToBase: false,
  barchartSymbol: "MWK26",
};

describe("parseBarchartOverview", () => {
  it("extracts latest close and daily change from barchart overview html", () => {
    const html = '<html><body>{"dailyLastPrice":720.5,"priceChange":8.25}</body></html>';
    const snapshot = parseBarchartOverview(html);

    expect(snapshot).toEqual({
      settlementPrice: 720.5,
      changeAmount: 8.25,
      changePct: 1.158,
    });
  });

  it("returns null when the overview payload is missing a last price", () => {
    expect(parseBarchartOverview("<html></html>")).toBeNull();
  });
});

describe("buildLatestRowFromSnapshot", () => {
  it("builds a barchart-backed row for canola without cents conversion", () => {
    const row = buildLatestRowFromSnapshot(
      CANOLA_SPEC,
      { settlementPrice: 720.5, changeAmount: 8.25, changePct: 1.158 },
      "2026-04-13",
    );

    expect(row).toMatchObject({
      grain: "Canola",
      contract: "RSK26",
      exchange: "ICE",
      currency: "CAD",
      unit: "$/tonne",
      settlement_price: 720.5,
      source: "barchart",
    });
  });

  it("keeps MGEX spring wheat in dollars per bushel, not cents", () => {
    const row = buildLatestRowFromSnapshot(
      SPRING_WHEAT_SPEC,
      { settlementPrice: 6.4825, changeAmount: 0.11, changePct: 1.726 },
      "2026-04-13",
    );

    expect(row.settlement_price).toBe(6.4825);
    expect(row.change_amount).toBe(0.11);
    expect(row.unit).toBe("$/bu");
  });
});

describe("buildRowsForGrain", () => {
  it("still converts CBOT quotes from cents to dollars", () => {
    const wheatSpec: GrainPriceSpec = {
      grain: "Wheat",
      contract: "ZW=F",
      exchange: "CBOT",
      currency: "USD",
      unit: "$/bu",
      centsToBase: true,
      yahooSymbol: "ZW=F",
    };

    const rows = buildRowsForGrain(wheatSpec, {
      timestamps: [1712966400, 1713052800],
      closes: [550, 562.5],
      volumes: [1000, 1200],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      settlement_price: 5.625,
      change_amount: 0.125,
      change_pct: 2.273,
      source: "yahoo-finance",
    });
  });
});
