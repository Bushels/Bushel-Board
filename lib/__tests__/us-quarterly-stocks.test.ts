import { describe, expect, it } from "vitest";

import {
  normalizeQuickStatsQuarterlyStocksRows,
  parseQuarterlyStocksReportDate,
  parseUSDAQuarterlyStocksCSV,
} from "../../scripts/import-usda-quarterly-stocks";
import {
  classifyQuarterlyStocksFreshness,
  getLatestQuarterlyStocksFromClient,
} from "../queries/us-quarterly-stocks";

const cornRows = [
  {
    year: "2025",
    reference_period_desc: "FIRST OF MAR",
    commodity_desc: "CORN",
    statisticcat_desc: "STOCKS",
    unit_desc: "BU",
    agg_level_desc: "NATIONAL",
    domaincat_desc: "NOT SPECIFIED",
    Value: "90,000,000",
  },
  {
    year: "2026",
    reference_period_desc: "FIRST OF MAR",
    commodity_desc: "CORN",
    statisticcat_desc: "STOCKS",
    unit_desc: "BU",
    agg_level_desc: "NATIONAL",
    domaincat_desc: "ON FARM",
    Value: "40,000,000",
  },
  {
    year: "2026",
    reference_period_desc: "FIRST OF MAR",
    commodity_desc: "CORN",
    statisticcat_desc: "STOCKS",
    unit_desc: "BU",
    agg_level_desc: "NATIONAL",
    domaincat_desc: "OFF FARM",
    Value: "60,000,000",
  },
  {
    year: "2026",
    reference_period_desc: "FIRST OF MAR",
    commodity_desc: "CORN",
    statisticcat_desc: "STOCKS",
    unit_desc: "BU",
    agg_level_desc: "NATIONAL",
    domaincat_desc: "NOT SPECIFIED",
    Value: "100,000,000",
  },
];

describe("USDA quarterly stocks normalization", () => {
  it("maps NASS reference periods to report dates", () => {
    expect(parseQuarterlyStocksReportDate("MAR 1", 2026)).toBe("2026-03-01");
    expect(parseQuarterlyStocksReportDate("SEP 1", 2026)).toBe("2026-09-01");
    expect(parseQuarterlyStocksReportDate("FIRST OF MAR", 2026)).toBe("2026-03-01");
    expect(parseQuarterlyStocksReportDate("FIRST OF SEP", 2026)).toBe("2026-09-01");
    expect(() => parseQuarterlyStocksReportDate("APR 1", 2026)).toThrow(/Unsupported quarterly stocks reference period/);
  });

  it("groups QuickStats stock rows and converts bushels to kilotonnes", () => {
    const rows = normalizeQuickStatsQuarterlyStocksRows(cornRows);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      report_date: "2026-03-01",
      quarter: "Q1",
      commodity: "CORN",
      cgc_grain: "Corn",
      on_farm_kt: 1016,
      off_farm_kt: 1524,
      total_stocks_kt: 2540,
      year_ago_total_kt: 2286,
      change_vs_year_ago_pct: 11.11,
    });
  });

  it("ignores wheat subclass rows so all-wheat stocks are not overwritten by durum rows", () => {
    const rows = normalizeQuickStatsQuarterlyStocksRows([
      {
        year: "2026",
        reference_period_desc: "FIRST OF MAR",
        commodity_desc: "WHEAT",
        class_desc: "ALL CLASSES",
        statisticcat_desc: "STOCKS",
        unit_desc: "BU",
        agg_level_desc: "NATIONAL",
        domaincat_desc: "NOT SPECIFIED",
        short_desc: "WHEAT - STOCKS, MEASURED IN BU",
        Value: "1,300,197,000",
      },
      {
        year: "2026",
        reference_period_desc: "FIRST OF MAR",
        commodity_desc: "WHEAT",
        class_desc: "SPRING, DURUM",
        statisticcat_desc: "STOCKS",
        unit_desc: "BU",
        agg_level_desc: "NATIONAL",
        domaincat_desc: "NOT SPECIFIED",
        short_desc: "WHEAT, SPRING, DURUM - STOCKS, MEASURED IN BU",
        Value: "46,450,000",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      commodity: "WHEAT",
      total_stocks_kt: 35386,
    });
  });

  it("converts canola pounds to kilotonnes for NASS pound-denominated stock rows", () => {
    const rows = normalizeQuickStatsQuarterlyStocksRows([
      {
        year: "2026",
        reference_period_desc: "FIRST OF JUN",
        commodity_desc: "CANOLA",
        statisticcat_desc: "STOCKS",
        unit_desc: "LB",
        agg_level_desc: "NATIONAL",
        domaincat_desc: "NOT SPECIFIED",
        short_desc: "CANOLA - STOCKS, MEASURED IN LB",
        Value: "100,000,000",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      report_date: "2026-06-01",
      commodity: "CANOLA",
      cgc_grain: "Canola",
      total_stocks_kt: 45,
    });
  });

  it("rejects CSV files that do not contain parseable quarterly stock rows", () => {
    const csv = "year,commodity_desc,Value\n2026,CORN,100\n";
    expect(() => parseUSDAQuarterlyStocksCSV(csv)).toThrow(/No USDA quarterly stock rows/i);
  });

  it("accepts both --file path and --file=path CLI argument styles", async () => {
    const { parseQuarterlyStocksCliArgs } = await import("../../scripts/import-usda-quarterly-stocks");

    expect(parseQuarterlyStocksCliArgs(["--file", "stocks.csv", "--dry-run"])).toEqual({
      file: "stocks.csv",
      dryRun: true,
    });
    expect(parseQuarterlyStocksCliArgs(["--file=stocks.csv"])).toEqual({
      file: "stocks.csv",
      dryRun: false,
    });
  });
});

describe("US quarterly stocks query helper", () => {
  it("treats quarterly stock reports as fresh for the active quarter window", async () => {
    expect(classifyQuarterlyStocksFreshness("2026-03-31", new Date("2026-06-15T00:00:00Z"))).toBe(
      "fresh"
    );
    expect(classifyQuarterlyStocksFreshness("2026-03-31", new Date("2026-07-15T00:00:00Z"))).toBe(
      "aging"
    );
    expect(classifyQuarterlyStocksFreshness("2026-03-31", new Date("2026-08-15T00:00:00Z"))).toBe(
      "stale"
    );
  });

  it("reads latest commodity context from an injected Supabase client", async () => {
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
                report_date: "2026-03-31",
                commodity: "CORN",
                total_stocks_kt: 2540,
                vs_wasde_estimate_kt: 125,
                change_vs_year_ago_pct: 11.11,
              },
              error: null,
            });
          },
        };
      },
    };

    await expect(
      getLatestQuarterlyStocksFromClient(client, "corn", new Date("2026-06-15T00:00:00Z"))
    ).resolves.toEqual({
      latest_report_date: "2026-03-31",
      commodity: "CORN",
      total_stocks_kt: 2540,
      vs_wasde_estimate_kt: 125,
      change_vs_year_ago_pct: 11.11,
      freshness: "fresh",
    });

    expect(calls).toContainEqual({ method: "from", args: ["usda_quarterly_stocks"] });
    expect(calls).toContainEqual({ method: "ilike", args: ["commodity", "CORN"] });
  });
});
