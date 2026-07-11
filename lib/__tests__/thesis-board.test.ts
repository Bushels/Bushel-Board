import { describe, expect, it } from "vitest";
import {
  THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES,
  THESIS_BOARD_MAJOR_US_MARKET_NAMES,
  THESIS_BOARD_ACTIVE_FARMER_CANADA_GRAIN_NAMES,
  THESIS_BOARD_ACTIVE_FARMER_GRAIN_LANES,
  THESIS_BOARD_ACTIVE_FARMER_US_MARKET_NAMES,
  THESIS_BOARD_V1_GRAIN_LANES,
  buildCanadaThesisBoardItem,
  buildFarmerReadSummary,
  buildMajorThesisComparisonRows,
  buildSourceHealthRead,
  buildSourceHealthSummary,
  filterThesisBoardDataForActiveFarmerDisplay,
  cacheStatusForSourceState,
  buildUsThesisBoardItem,
  selectCanadaCropProgressRunContext,
  type ThesisBoardData,
} from "@/lib/queries/thesis-board";

const canola = { name: "Canola", slug: "canola", defaultBushelWeightLbs: 50 };
const corn = {
  name: "Corn",
  slug: "corn",
  futuresGrain: "Corn",
  exportCommodity: "CORN",
  cotCommodity: "CORN",
  cropProgressMarkets: ["Corn"],
  includeInOverview: true,
};

const wheat = { name: "Wheat", slug: "wheat", defaultBushelWeightLbs: 60 };
const usWheat = {
  name: "Wheat",
  slug: "wheat",
  futuresGrain: "Wheat",
  exportCommodity: "ALL WHEAT",
  cotCommodity: "WHEAT",
  cropProgressMarkets: ["Wheat"],
  includeInOverview: true,
};

describe("thesis board packet normalization", () => {
  it("summarizes cadence-lagged sources without calling them blockers", () => {
    const read = buildSourceHealthRead({
      blockerCount: 0,
      uniqueWatchSourceCount: 2,
      watchSourceInstanceCount: 12,
    });

    expect(read.title).toBe("Usable board with cadence-lagged sources");
    expect(read.description).toBe(
      "No source blockers; 2 source groups are cadence-lagged or stale-risk across 12 packet rows.",
    );
    expect(read.tone).toBe("watch");
  });

  it("derives Canada bull and bear drivers from a facts-only packet", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      lane: "canada",
      grain: "Canola",
      crop_year: "2025-2026",
      grain_week: 38,
      packet_generated_at: "2026-05-08T18:00:00Z",
      demand: {
        producer_deliveries_current_week: {
          total_kt: 500,
          process_deliveries_kt: 180,
        },
        exports: {
          current_week_kt: 260,
        },
      },
      supply: {
        total_supply_kt: 22000,
        carry_out_kt: 4800,
        canada_crop_progress: [
          {
            province_code: "AB",
            region_scope: "province",
            metric: "seeded_pct",
            value_pct: 30.5,
            report_date: "2026-05-19",
          },
          {
            province_code: "SK",
            region_scope: "province",
            metric: "seeded_pct",
            value_pct: 14.7,
            report_date: "2026-05-18",
          },
        ],
      },
      logistics: {
        grain_monitor: {
          terminal_capacity_pct: 91,
        },
      },
      prices: [
        {
          settlement_price: 728.7,
          change_pct: -1.2,
          currency: "CAD",
          unit: "tonne",
          price_date: "2026-05-08",
        },
      ],
      positioning: [
        {
          mapping_type: "primary",
          managed_money_long: 95000,
          managed_money_short: 22000,
          change_managed_money_long: 1200,
          change_managed_money_short: 100,
        },
      ],
      freshness: [
        {
          source_name: "cgc_observations",
          freshness_status: "strong",
        },
        {
          source_name: "grain_prices",
          freshness_status: "stale",
        },
        {
          source_name: "canada_crop_progress",
          freshness_status: "strong",
        },
      ],
      quality_warnings: [
        {
          source_name: "grain_prices",
          status: "stale",
          action_hint: "Refresh prices.",
        },
      ],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).toContain("Export pull visible");
    expect(item.bullDrivers.map((driver) => driver.title)).toContain(
      "Canadian seeding delay risk",
    );
    expect(item.bearDrivers.map((driver) => driver.title)).toContain("Heavy carryout context");
    expect(item.bearDrivers.map((driver) => driver.title)).not.toContain("Futures pressure");
    expect(item.freshness).toHaveLength(3);
    expect(item.confidence).toBe("medium");
    expect(item.ratingScorecard).toMatchObject({
      grain: "Canola",
      lane: "canada",
      period_anchor: "2025-2026:week:38",
      source_watermark: "2026-05-08T18:00:00Z",
    });
    expect(item.ratingScorecard.domains.map((domain) => domain.domain)).toContain("demand");
    expect(item.ratingScorecard.overall_score).toBeGreaterThan(0);
    expect(["balanced", "lean_bull", "bull", "strong_bull"]).toContain(item.ratingScorecard.overall_label);
  });

  it("derives US demand and supply drivers from a facts-only packet", () => {
    const item = buildUsThesisBoardItem(corn, {
      lane: "us",
      market_name: "Corn",
      market_year: 2025,
      packet_generated_at: "2026-05-08T18:00:00Z",
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 76,
            ge_pct_yoy_change: 10,
            planted_pct_vs_avg: 7,
          },
        },
        wasde: {
          ending_stocks_direction: "down",
          ending_stocks_mmt: 39.2,
          stocks_to_use_pct: 9.5,
        },
      },
      demand: {
        export_sales: {
          net_sales_mt: 620000,
          export_pace_pct: 104,
        },
      },
      prices: [],
      positioning: [],
      freshness: [
        {
          source_name: "usda_crop_progress",
          freshness_status: "strong",
        },
        {
          source_name: "usda_export_sales",
          freshness_status: "strong",
        },
        {
          source_name: "usda_wasde_mapped",
          freshness_status: "strong",
        },
      ],
      quality_warnings: [],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).toContain("Export sales demand");
    expect(item.bullDrivers.map((driver) => driver.title)).toContain("WASDE balance tightening");
    expect(item.bearDrivers.some((driver) => driver.title.includes("US crop condition adds supply pressure"))).toBe(true);
    expect(item.stanceScore).toBe(6);
    expect(item.stanceLabel).toBe("Lean bull");
    expect(item.confidence).toBe("high");
    expect(item.ratingScorecard).toMatchObject({
      grain: "Corn",
      lane: "us",
      period_anchor: "2025",
      source_watermark: "2026-05-08T18:00:00Z",
    });
    expect(item.ratingScorecard.domains.map((domain) => domain.domain)).toContain("demand");
    expect(item.ratingScorecard.overall_score).toBeGreaterThan(0);
    expect(["balanced", "lean_bull", "bull", "strong_bull"]).toContain(item.ratingScorecard.overall_label);
    expect(item.stanceLabel).toBe("Lean bull");
  });

  it("turns WASDE month-over-month revisions into US thesis drivers", () => {
    const tighterBalance = buildUsThesisBoardItem(corn, {
      supply: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          ending_stocks_kt: 39_200,
          stocks_to_use_pct: 9.5,
          ending_stocks_change_kt: -1_850,
          exports_change_kt: 725,
        },
      },
      demand: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 725,
        },
      },
      freshness: [{ source_name: "usda_wasde_mapped", freshness_status: "strong" }],
      quality_warnings: [],
    });
    const looserBalance = buildUsThesisBoardItem(corn, {
      supply: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          ending_stocks_kt: 52_100,
          stocks_to_use_pct: 21.2,
          ending_stocks_change_kt: 2_250,
          exports_change_kt: -600,
        },
      },
      demand: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: -600,
        },
      },
      freshness: [{ source_name: "usda_wasde_mapped", freshness_status: "strong" }],
      quality_warnings: [],
    });

    expect(tighterBalance.bullDrivers.map((driver) => driver.title)).toContain(
      "WASDE ending stocks cut",
    );
    expect(tighterBalance.bullDrivers.map((driver) => driver.title)).toContain(
      "WASDE export projection raised",
    );
    expect(tighterBalance.bullDrivers.find((driver) => driver.title === "WASDE ending stocks cut")?.body).toContain(
      "2026-04-01 to 2026-05-01",
    );
    expect(tighterBalance.bullDrivers.find((driver) => driver.title === "WASDE ending stocks cut")?.metricLabel).toBe(
      "-1,850 kt ending stocks",
    );
    expect(looserBalance.bearDrivers.map((driver) => driver.title)).toContain(
      "WASDE ending stocks raised",
    );
    expect(looserBalance.bearDrivers.map((driver) => driver.title)).toContain(
      "WASDE export projection cut",
    );
    expect(looserBalance.stanceScore).toBeLessThan(0);
  });

  it("turns USDA export-sales pace versus WASDE projection into guarded drivers", () => {
    const demandConfirmed = buildUsThesisBoardItem(corn, {
      supply: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 725,
        },
      },
      demand: {
        export_sales: {
          net_sales_mt: 620_000,
          total_commitments_mt: 52_500_000,
          export_pace_pct: 105,
          usda_projection_mt: 50_000_000,
        },
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 725,
        },
      },
      freshness: [
        { source_name: "usda_export_sales", freshness_status: "strong" },
        { source_name: "usda_wasde_mapped", freshness_status: "strong" },
      ],
      quality_warnings: [],
    });
    const executionRisk = buildUsThesisBoardItem(corn, {
      supply: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 800,
        },
      },
      demand: {
        export_sales: {
          net_sales_mt: 120_000,
          total_commitments_mt: 39_000_000,
          export_pace_pct: 78,
          usda_projection_mt: 50_000_000,
        },
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 800,
        },
      },
      freshness: [
        { source_name: "usda_export_sales", freshness_status: "strong" },
        { source_name: "usda_wasde_mapped", freshness_status: "strong" },
      ],
      quality_warnings: [],
    });

    expect(demandConfirmed.bullDrivers.map((driver) => driver.title)).toContain(
      "Export sales confirm raised WASDE projection",
    );
    expect(
      demandConfirmed.bullDrivers.find(
        (driver) => driver.title === "Export sales confirm raised WASDE projection",
      )?.metricLabel,
    ).toBe("+105.0% of WASDE export projection");
    expect(executionRisk.bearDrivers.map((driver) => driver.title)).toContain(
      "Export sales execution risk against WASDE raise",
    );
    expect(executionRisk.bearDrivers.find((driver) => driver.title === "Export sales execution risk against WASDE raise")?.body).toContain(
      "39,000,000 mt committed versus 50,000,000 mt projected",
    );
  });

  it("does not infer export-sales projection pace from unadmitted projection fields", () => {
    const item = buildUsThesisBoardItem(corn, {
      supply: {
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 725,
        },
      },
      demand: {
        export_sales: {
          net_sales_mt: 620_000,
          total_commitments_mt: 52_500_000,
          usda_projection_mt: 50_000_000,
        },
        wasde: {
          report_month: "2026-05-01",
          previous_report_month: "2026-04-01",
          exports_change_kt: 725,
        },
      },
      freshness: [
        { source_name: "usda_export_sales", freshness_status: "strong" },
        { source_name: "usda_wasde_mapped", freshness_status: "strong" },
      ],
      quality_warnings: [],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).not.toContain(
      "Export sales confirm raised WASDE projection",
    );
    expect(item.bullDrivers.map((driver) => driver.title)).not.toContain(
      "Export sales outrunning WASDE projection",
    );
  });

  it("does not show empty-source warnings when cached freshness has a latest source period", () => {
    const item = buildUsThesisBoardItem(usWheat, {
      supply: {
        wasde: { stocks_to_use_pct: 46.3 },
      },
      freshness: [
        {
          source_name: "usda_wasde_mapped",
          freshness_status: "empty",
          latest_period_end: "2999-01-01",
          action_hint: "Build or seed this source before thesis use.",
        },
      ],
      quality_warnings: [
        {
          source_name: "usda_wasde_mapped",
          status: "empty",
          action_hint: "Build or seed this source before thesis use.",
        },
      ],
    });

    expect(item.freshness[0]?.freshnessStatus).toBe("strong");
    expect(item.freshness[0]?.actionHint).toBe("No immediate action.");
    expect(item.warnings).toEqual([]);
    expect(item.bearDrivers.find((driver) => driver.sourceName === "usda_wasde_mapped")?.confidence).toBe("medium");
  });

  it("turns USDA quarterly stocks surprises into US thesis drivers", () => {
    const tightStocks = buildUsThesisBoardItem(corn, {
      supply: {
        quarterly_stocks: {
          report_date: "2026-03-01",
          total_stocks_kt: 218_450,
          vs_wasde_estimate_kt: -5_200,
          change_vs_year_ago_pct: -7.4,
        },
      },
      freshness: [{ source_name: "usda_quarterly_stocks", freshness_status: "strong" }],
      quality_warnings: [],
    });
    const heavyStocks = buildUsThesisBoardItem(corn, {
      supply: {
        quarterly_stocks: {
          report_date: "2026-03-01",
          total_stocks_kt: 235_900,
          vs_wasde_estimate_kt: 4_100,
          change_vs_year_ago_pct: 6.2,
        },
      },
      freshness: [{ source_name: "usda_quarterly_stocks", freshness_status: "strong" }],
      quality_warnings: [],
    });

    expect(tightStocks.bullDrivers.map((driver) => driver.title)).toContain(
      "Quarterly stocks tighter than expected",
    );
    expect(tightStocks.bullDrivers[0]?.sourceName).toBe("usda_quarterly_stocks");
    expect(tightStocks.stanceScore).toBeGreaterThan(0);
    expect(heavyStocks.bearDrivers.map((driver) => driver.title)).toContain(
      "Quarterly stocks heavier than expected",
    );
    expect(heavyStocks.stanceScore).toBeLessThan(0);
  });

  it("uses USDA acreage to make planting pace drivers farmer-readable", () => {
    const item = buildUsThesisBoardItem(corn, {
      supply: {
        crop_progress: {
          us_total: {
            planted_pct_vs_avg: 7,
          },
        },
        acreage: [
          {
            region_code: "IA",
            planted_acres: 13_100_000,
            source_release_date: "2026-01-12",
          },
          {
            region_code: "US TOTAL",
            planted_acres: 98_788_000,
            source_program: "SURVEY",
            source_release_date: "2026-01-12",
          },
        ],
      },
      freshness: [
        { source_name: "usda_crop_progress", freshness_status: "strong" },
        { source_name: "crop_acreage_estimates", freshness_status: "strong" },
      ],
      quality_warnings: [],
    });

    const driver = item.bearDrivers.find((candidate) => candidate.title === "Planting pace comfortable");

    expect(driver?.body).toContain("98.8M planted acre base");
    expect(driver?.body).toContain("2026-01-12");
    expect(driver?.metricLabel).toBe("98.8M ac; +7.0% vs avg");
    expect(driver?.sourceName).toBe("usda_crop_progress + crop_acreage_estimates");
  });

  it("returns a safe balanced Canada item for an empty packet", () => {
    const item = buildCanadaThesisBoardItem(canola, {});

    expect(item.bullDrivers).toHaveLength(0);
    expect(item.bearDrivers).toHaveLength(0);
    expect(item.stanceScore).toBe(0);
    expect(item.stanceLabel).toBe("Balanced");
    expect(item.bullCase).toBe("No clear bull driver in the current packet.");
    expect(item.bearCase).toBe("No clear bear driver in the current packet.");
  });

  it("does not create false Canada drivers from zero denominators", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      demand: {
        producer_deliveries_current_week: {
          total_kt: 0,
          process_deliveries_kt: 0,
        },
        exports: {
          current_week_kt: 0,
        },
      },
      supply: {
        total_supply_kt: 0,
        carry_out_kt: 0,
      },
      freshness: [
        {
          source_name: "cgc_observations",
          freshness_status: "strong",
        },
        {
          source_name: "supply_disposition",
          freshness_status: "strong",
        },
      ],
    });

    const titles = [...item.bullDrivers, ...item.bearDrivers].map((driver) => driver.title);
    expect(titles).not.toContain("Export pull light");
    expect(titles).not.toContain("Domestic processing thin");
    expect(titles).not.toContain("Tight carryout context");
  });

  it("labels modest non-zero scores as lean calls instead of hiding them as balanced", () => {
    const leanBull = buildCanadaThesisBoardItem(canola, {
      prices: [
        {
          settlement_price: 728.7,
          change_pct: 1.2,
          currency: "CAD",
          unit: "tonne",
          price_date: "2026-05-08",
        },
      ],
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
    });
    const leanBear = buildCanadaThesisBoardItem(canola, {
      demand: {
        producer_deliveries_current_week: {
          total_kt: 500,
        },
        exports: {
          current_week_kt: 20,
        },
      },
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
    });

    expect(leanBull.stanceScore).toBe(12);
    expect(leanBull.stanceLabel).toBe("Lean bull");
    expect(leanBear.stanceScore).toBe(-18);
    expect(leanBear.stanceLabel).toBe("Lean bear");
  });

  it("does not let stale futures rows create price drivers", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      prices: [
        {
          settlement_price: 728.7,
          change_pct: 1.2,
          currency: "CAD",
          unit: "tonne",
          price_date: "2026-05-08",
          source: "yahoo-finance",
        },
      ],
      freshness: [{ source_name: "grain_prices", freshness_status: "stale" }],
      quality_warnings: [{ source_name: "grain_prices", status: "stale" }],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).not.toContain("Futures follow-through");
    expect(item.stanceScore).toBe(0);
    expect(item.warnings.find((warning) => warning.sourceName === "grain_prices")?.severity).toBe("watch");
  });

  it("labels Barchart latest-only price rows as provisional instead of full-quality futures history", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      prices: [
        {
          settlement_price: 728.7,
          change_pct: 1.2,
          currency: "CAD",
          unit: "$/tonne",
          price_date: "2026-05-08",
          source: "barchart",
          volume: null,
          open_interest: null,
        },
      ],
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
    });

    const driver = item.bullDrivers.find((candidate) => candidate.sourceName === "grain_prices");

    expect(driver?.title).toBe("Provisional futures follow-through");
    expect(driver?.confidence).toBe("low");
    expect(driver?.body).toContain("Barchart latest-only scrape");
    expect(driver?.body).toContain("volume/open interest unavailable");
    expect(driver?.metricLabel).toBe("+1.2% latest-only");
  });

  it("caps driver confidence when the source freshness row is stale", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      demand: {
        producer_deliveries_current_week: {
          total_kt: 500,
        },
        exports: {
          current_week_kt: 260,
        },
      },
      freshness: [
        {
          source_name: "cgc_observations",
          freshness_status: "stale",
        },
      ],
      quality_warnings: [
        {
          source_name: "cgc_observations",
          status: "stale",
        },
      ],
    });

    expect(item.bullDrivers).toHaveLength(1);
    expect(item.bullDrivers[0]?.title).toBe("Export pull visible");
    expect(item.bullDrivers[0]?.confidence).toBe("low");
    expect(item.confidence).toBe("medium");
  });

  it("drops item confidence to low when packet warnings contain blockers", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      freshness: [
        {
          source_name: "cgc_observations",
          freshness_status: "strong",
        },
      ],
      quality_warnings: [
        {
          source_name: "grain_prices",
          status: "broken",
        },
        {
          source_name: "supply_disposition",
          status: "empty",
        },
      ],
    });

    expect(item.warnings.map((warning) => warning.severity)).toEqual(["blocker", "blocker"]);
    expect(item.confidenceScore).toBe(38);
    expect(item.confidence).toBe("low");
  });

  it("requires USDA export pace before calling positive net sales bullish", () => {
    const item = buildUsThesisBoardItem(corn, {
      demand: {
        export_sales: {
          net_sales_mt: 1000,
          export_pace_pct: null,
        },
      },
      freshness: [
        {
          source_name: "usda_export_sales",
          freshness_status: "strong",
        },
      ],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).not.toContain("Export sales demand");
  });

  it("treats a net-long Canada CFTC row with negative weekly change as pressure", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      positioning: [
        {
          mapping_type: "primary",
          managed_money_long: 1000,
          managed_money_short: 100,
          change_managed_money_long: -250,
          change_managed_money_short: 25,
        },
      ],
      freshness: [
        {
          source_name: "cftc_cot_positions",
          freshness_status: "strong",
        },
      ],
    });

    expect(item.bullDrivers.map((driver) => driver.title)).not.toContain("Managed money support");
    expect(item.bearDrivers.map((driver) => driver.title)).toContain("Positioning pressure");
  });

  it("locks the V1 board lane order to Kyle's major-grain scope", () => {
    expect(THESIS_BOARD_V1_GRAIN_LANES).toEqual([
      "Corn",
      "Soybeans",
      "Wheat",
      "Durum",
      "Canola",
      "Barley",
      "Oats",
    ]);
  });

  it("centralizes the active farmer display allowlist to Wheat without shrinking the V1 harness", () => {
    expect(THESIS_BOARD_ACTIVE_FARMER_GRAIN_LANES).toEqual(["Wheat"]);
    expect(THESIS_BOARD_ACTIVE_FARMER_CANADA_GRAIN_NAMES).toEqual(["Wheat"]);
    expect(THESIS_BOARD_ACTIVE_FARMER_US_MARKET_NAMES).toEqual(["Wheat"]);
    expect(THESIS_BOARD_V1_GRAIN_LANES).toContain("Canola");
    expect(THESIS_BOARD_V1_GRAIN_LANES).toContain("Corn");
    expect(THESIS_BOARD_V1_GRAIN_LANES).toContain("Oats");
  });

  it("uses only source-backed Canada packets needed for the V1 board", () => {
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).toEqual([
      "Corn",
      "Soybeans",
      "Wheat",
      "Amber Durum",
      "Canola",
      "Barley",
      "Oats",
    ]);
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Peas");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Lentils");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Flaxseed");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Rye");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Mustard Seed");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Canaryseed");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Chick Peas");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Sunflower");
    expect(THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES).not.toContain("Beans");
  });

  it("keeps the US V1 overview to major grains and excludes rice and cotton", () => {
    expect(THESIS_BOARD_MAJOR_US_MARKET_NAMES).toEqual([
      "Corn",
      "Soybeans",
      "Wheat",
      "Barley",
      "Oats",
    ]);
    expect(THESIS_BOARD_MAJOR_US_MARKET_NAMES).not.toContain("Rice");
    expect(THESIS_BOARD_MAJOR_US_MARKET_NAMES).not.toContain("Cotton");
  });

  it("filters normal farmer display data to active Wheat while keeping source-health counts scoped", () => {
    const canolaItem = buildCanadaThesisBoardItem(canola, {
      lane: "canada",
      grain: "Canola",
      crop_year: "2025-2026",
      grain_week: 38,
      demand: { exports: { current_week_kt: 260 } },
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
    });
    const canadaWheat = buildCanadaThesisBoardItem(wheat, {
      lane: "canada",
      grain: "Wheat",
      crop_year: "2025-2026",
      grain_week: 38,
      demand: { exports: { current_week_kt: 260 } },
      freshness: [
        { source_name: "cgc_observations", freshness_status: "strong" },
        { source_name: "grain_prices", freshness_status: "empty" },
      ],
      quality_warnings: [{ source_name: "grain_prices", status: "empty" }],
    });
    const usWheatItem = buildUsThesisBoardItem(usWheat, {
      lane: "us",
      market_name: "Wheat",
      market_year: 2025,
      demand: { export_sales: { net_sales_mt: 620_000, export_pace_pct: 95 } },
      freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
    });
    const fullRows = buildMajorThesisComparisonRows([canolaItem, canadaWheat], [usWheatItem]);
    const data = {
      generatedAt: "2026-06-16T12:00:00Z",
      packetMode: "cached",
      cacheStatus: "fresh",
      sourceRunWatermark: "2026-06-16T12:00:00Z",
      latestAvailableSourceRunAt: "2026-06-16T12:00:00Z",
      cacheItemCount: 3,
      sourceRunContext: { canadaCropProgress: null },
      canadaItems: [canolaItem, canadaWheat],
      usItems: [usWheatItem],
      comparisonRows: fullRows,
      totals: {
        itemCount: 3,
        strongSourceCount: 3,
        staleSourceCount: 1,
        watchSourceInstanceCount: 1,
        uniqueWatchSourceCount: 1,
        optionalSourceCount: 0,
        blockerCount: 1,
      },
      sourceHealth: buildSourceHealthSummary([canolaItem, canadaWheat, usWheatItem]),
    } satisfies ThesisBoardData;

    const filtered = filterThesisBoardDataForActiveFarmerDisplay(data);

    expect(filtered.comparisonRows.map((row) => row.grain)).toEqual(["Wheat"]);
    expect(filtered.canadaItems.map((item) => item.name)).toEqual(["Wheat"]);
    expect(filtered.usItems.map((item) => item.name)).toEqual(["Wheat"]);
    expect(filtered.comparisonRows[0]?.canada).toBe(canadaWheat);
    expect(filtered.comparisonRows[0]?.us).toBe(usWheatItem);
    expect(filtered.totals.itemCount).toBe(2);
    expect(filtered.totals.uniqueWatchSourceCount).toBe(1);
    expect(filtered.sourceHealth.uniqueWatchSources.map((source) => source.sourceName)).toEqual(["grain_prices"]);
  });

  it("builds country comparison rows with split explanations and strongest points", () => {
    const canadaItem = buildCanadaThesisBoardItem(wheat, {
      lane: "canada",
      grain: "Wheat",
      crop_year: "2025-2026",
      grain_week: 38,
      demand: {
        producer_deliveries_current_week: {
          total_kt: 500,
          process_deliveries_kt: 180,
        },
        exports: {
          current_week_kt: 260,
        },
      },
      freshness: [
        {
          source_name: "cgc_observations",
          freshness_status: "strong",
        },
      ],
    });
    const usItem = buildUsThesisBoardItem(usWheat, {
      lane: "us",
      market_name: "Wheat",
      market_year: 2025,
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 76,
            planted_pct_vs_avg: 8,
          },
        },
      },
      freshness: [
        {
          source_name: "usda_crop_progress",
          freshness_status: "strong",
        },
      ],
    });

    const wheatRow = buildMajorThesisComparisonRows([canadaItem], [usItem]).find(
      (row) => row.grain === "Wheat",
    );

    expect(wheatRow?.status).toBe("mixed");
    expect(wheatRow?.readinessLabel).toBe("Source-backed");
    expect(wheatRow?.readinessDetail).toContain("Canada and US packets are present");
    expect(wheatRow?.explanation).toContain("CA +36 Bull tilt");
    expect(wheatRow?.explanation).toContain("US -24 Bear tilt");
    expect(wheatRow?.strongestBullPoints.map((point) => point.country)).toContain("CA");
    expect(wheatRow?.strongestBearPoints.map((point) => point.country)).toContain("US");
  });

  it("does not let empty optional farmer-local sources reduce public thesis confidence", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      demand: {
        producer_deliveries_current_week: {
          total_kt: 500,
        },
        exports: {
          current_week_kt: 260,
        },
      },
      freshness: [
        { source_name: "cgc_observations", freshness_status: "strong" },
        { source_name: "crop_plan_deliveries", freshness_status: "empty" },
        { source_name: "posted_prices", freshness_status: "empty" },
        { source_name: "weather_cache", freshness_status: "empty" },
      ],
      quality_warnings: [
        { source_name: "crop_plan_deliveries", status: "empty" },
        { source_name: "posted_prices", status: "empty" },
        { source_name: "weather_cache", status: "empty" },
      ],
    });

    expect(item.confidenceScore).toBe(82);
    expect(item.confidence).toBe("high");
    expect(item.staleSourceCount).toBe(0);
    expect(item.optionalSourceCount).toBe(3);
    expect(item.warnings.map((warning) => warning.severity)).toEqual(["info", "info", "info"]);
  });

  it("labels US crop stress as a crop-progress proxy when weather_cache is absent", () => {
    const item = buildUsThesisBoardItem(corn, {
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 45,
            ge_pct_yoy_change: -10,
          },
        },
      },
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
    });

    const driver = item.bullDrivers.find(
      (candidate) => candidate.sourceName === "usda_crop_progress",
    );

    expect(driver?.title).toContain("crop-progress proxy");
    expect(driver?.body).toContain("crop-progress proxy, not direct weather");
    expect(driver?.metricLabel).toBe("45.0% good/excellent crop-progress proxy");
    expect(driver?.confidence).toBe("medium");
  });

  it("keeps stale US crop-progress-only weather proxy confidence low", () => {
    const item = buildUsThesisBoardItem(corn, {
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 76,
            ge_pct_yoy_change: 10,
          },
        },
      },
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "stale" }],
    });

    const driver = item.bearDrivers.find(
      (candidate) => candidate.sourceName === "usda_crop_progress",
    );

    expect(driver?.title).toContain("crop-progress proxy");
    expect(driver?.body).toContain("crop-progress-only");
    expect(driver?.confidence).toBe("low");
  });

  it("does not force US crop-progress proxy labeling when real weather_cache data is strong", () => {
    const item = buildUsThesisBoardItem(corn, {
      weather: {
        station_id: "KDSM",
        observed_at: "2026-05-08T18:00:00Z",
        precipitation_mm_7d: 2,
      },
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 45,
            ge_pct_yoy_change: -10,
          },
        },
      },
      freshness: [
        { source_name: "usda_crop_progress", freshness_status: "strong" },
        { source_name: "weather_cache", freshness_status: "strong" },
      ],
    });

    const driver = item.bullDrivers.find(
      (candidate) => candidate.sourceName === "usda_crop_progress",
    );

    expect(driver?.title).toBe("US crop stress supports price");
    expect(driver?.body).not.toContain("crop-progress proxy");
    expect(driver?.metricLabel).toBe("45.0% good/excellent");
    expect(driver?.confidence).toBe("high");
  });

  it("labels Canadian seeding drivers as a crop progress proxy when weather_cache is empty", () => {
    const item = buildCanadaThesisBoardItem(canola, {
      supply: {
        canada_crop_progress: [
          {
            province_code: "AB",
            region_scope: "province",
            metric: "seeded_pct",
            value_pct: 88,
            report_date: "2026-05-19",
          },
        ],
      },
      freshness: [
        { source_name: "canada_crop_progress", freshness_status: "strong" },
        { source_name: "weather_cache", freshness_status: "empty" },
      ],
    });

    const driver = item.bearDrivers.find(
      (candidate) => candidate.sourceName === "canada_crop_progress",
    );

    expect(driver?.title).toBe("Canadian seeding progress cushions supply");
    expect(driver?.body).toContain("crop-progress proxy, not independent weather");
    expect(driver?.confidence).toBe("medium");
  });

  it("summarizes watch sources uniquely instead of double-counting each grain packet", () => {
    const first = buildCanadaThesisBoardItem(canola, {
      freshness: [
        { source_name: "cgc_observations", freshness_status: "strong" },
        { source_name: "usda_wasde_mapped", freshness_status: "empty" },
        { source_name: "posted_prices", freshness_status: "empty" },
      ],
    });
    const second = buildUsThesisBoardItem(corn, {
      freshness: [
        { source_name: "usda_crop_progress", freshness_status: "strong" },
        { source_name: "usda_wasde_mapped", freshness_status: "empty" },
        { source_name: "posted_prices", freshness_status: "empty" },
      ],
    });

    const summary = buildSourceHealthSummary([first, second]);

    expect(summary.strongSourceCount).toBe(2);
    expect(summary.watchSourceInstanceCount).toBe(2);
    expect(summary.uniqueWatchSourceCount).toBe(1);
    expect(summary.optionalSourceCount).toBe(2);
    expect(summary.uniqueWatchSources.map((source) => source.sourceName)).toEqual(["usda_wasde_mapped"]);
    expect(summary.optionalSources.map((source) => source.sourceName)).toEqual(["posted_prices"]);
  });

  it("marks the cache stale when newer live source runs exist after the packet watermark", () => {
    expect(
      cacheStatusForSourceState({
        cachedMajorPacketCount: 12,
        expectedMajorPacketCount: 12,
        packetGeneratedAt: "2026-05-18T16:41:18.836754Z",
        packetSourceRunWatermark: "2026-05-16T18:17:52.357752Z",
        latestAvailableSourceRunAt: "2026-05-21T12:46:08.789Z",
      }),
    ).toBe("stale");

    expect(
      cacheStatusForSourceState({
        cachedMajorPacketCount: 12,
        expectedMajorPacketCount: 12,
        packetGeneratedAt: "2026-05-21T12:50:00Z",
        packetSourceRunWatermark: "2026-05-21T12:46:08.789Z",
        latestAvailableSourceRunAt: "2026-05-21T12:46:08.789Z",
      }),
    ).toBe("fresh");
  });

  it("uses a same-period complete Prairie crop-progress package over later province-only reruns", () => {
    const context = selectCanadaCropProgressRunContext([
      {
        source_name: "canada_crop_progress",
        status: "success",
        finished_at: "2026-05-30T14:48:56.019201+00:00",
        source_period_end: "2026-05-26",
        latest_source_label: "Alberta Crop Report - 2026-05-26",
        metadata: {
          prairie_week_status: "partial_prairie_week",
          province_summaries: [{ province: "AB" }],
          missing_provinces: [],
        },
      },
      {
        source_name: "canada_crop_progress",
        status: "success",
        finished_at: "2026-05-29T21:30:52.267352+00:00",
        source_period_end: "2026-05-26",
        latest_source_label:
          "Alberta Crop Report - 2026-05-26, Crop Report - 2026-05-26, Crop Report - 2026-05-28",
        metadata: {
          prairie_week_status: "complete_mb_sk_ab",
          province_summaries: [{ province: "MB" }, { province: "SK" }, { province: "AB" }],
          missing_provinces: [],
        },
      },
    ]);

    expect(context).toMatchObject({
      prairieWeekStatus: "complete_mb_sk_ab",
      sourcePeriodEnd: "2026-05-26",
      loadedProvinces: ["MB", "SK", "AB"],
    });
  });

  it("uses a newer partial Prairie crop-progress period over an older complete package", () => {
    const context = selectCanadaCropProgressRunContext([
      {
        source_name: "canada_crop_progress",
        status: "success",
        finished_at: "2026-05-29T21:30:52.267352+00:00",
        source_period_end: "2026-05-26",
        latest_source_label:
          "Alberta Crop Report - 2026-05-26, Crop Report - 2026-05-26, Crop Report - 2026-05-28",
        metadata: {
          prairie_week_status: "complete_mb_sk_ab",
          province_summaries: [{ province: "MB" }, { province: "SK" }, { province: "AB" }],
          missing_provinces: [],
        },
      },
      {
        source_name: "canada_crop_progress",
        status: "partial",
        finished_at: "2026-06-02T18:45:00.000000+00:00",
        source_period_end: "2026-06-02",
        latest_source_label: "Manitoba Crop Report - 2026-06-02",
        metadata: {
          prairie_week_status: "partial_mb_only",
          province_summaries: [{ province: "MB" }],
          missing_provinces: ["SK", "AB"],
        },
      },
    ]);

    expect(context).toMatchObject({
      prairieWeekStatus: "partial_mb_only",
      sourcePeriodEnd: "2026-06-02",
      loadedProvinces: ["MB"],
      missingProvinces: ["SK", "AB"],
      status: "partial",
    });
  });

  it("builds comparison rows in exact V1 lane order without unmapped wheat-class placeholders", () => {
    const rows = buildMajorThesisComparisonRows([], []);

    expect(rows.map((row) => row.grain)).toEqual(THESIS_BOARD_V1_GRAIN_LANES);
    expect(rows.find((row) => row.grain === "Spring Wheat")).toBeUndefined();
    expect(rows.find((row) => row.grain === "Winter Wheat")).toBeUndefined();
    expect(rows.find((row) => row.grain === "Amber Durum")).toBeUndefined();
  });

  it("does not create Spring or Winter Wheat rows from generic Wheat packets", () => {
    const canadaWheat = buildCanadaThesisBoardItem(wheat, {
      lane: "canada",
      grain: "Wheat",
      crop_year: "2025-2026",
      grain_week: 38,
      demand: {
        exports: {
          current_week_kt: 260,
        },
      },
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
    });
    const usWheatItem = buildUsThesisBoardItem(usWheat, {
      lane: "us",
      market_name: "Wheat",
      market_year: 2025,
      supply: {
        crop_progress: {
          us_total: {
            planted_pct_vs_avg: 8,
          },
        },
      },
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
    });

    const rows = buildMajorThesisComparisonRows([canadaWheat], [usWheatItem]);
    const genericWheatRow = rows.find((row) => row.grain === "Wheat");
    const springWheatRow = rows.find((row) => row.grain === "Spring Wheat");
    const winterWheatRow = rows.find((row) => row.grain === "Winter Wheat");

    expect(genericWheatRow?.canada).toBe(canadaWheat);
    expect(genericWheatRow?.us).toBe(usWheatItem);
    expect(springWheatRow).toBeUndefined();
    expect(winterWheatRow).toBeUndefined();
  });

  it("labels Canadian Amber Durum source data as the Durum product lane", () => {
    const durumItem = buildCanadaThesisBoardItem(
      { name: "Amber Durum", slug: "amber-durum", defaultBushelWeightLbs: 60 },
      {
        lane: "canada",
        grain: "Amber Durum",
        crop_year: "2025-2026",
        grain_week: 38,
      },
    );

    const durumRow = buildMajorThesisComparisonRows([durumItem], []).find(
      (row) => row.grain === "Durum",
    );

    expect(durumRow?.status).toBe("canada_only");
    expect(durumRow?.canada).toBe(durumItem);
    expect(durumRow?.us).toBeNull();
    expect(durumRow?.explanation).toContain("no matching US overview market");
  });

  it("builds a farmer-facing summary that makes source gaps feel intentional", () => {
    const canadaItems = [
      "Corn",
      "Soybeans",
      "Wheat",
      "Barley",
      "Oats",
      "Canola",
    ].map((name) =>
      buildCanadaThesisBoardItem(
        { name, slug: name.toLowerCase().replaceAll(" ", "-"), defaultBushelWeightLbs: 56 },
        {
          lane: "canada",
          grain: name,
          crop_year: "2025-2026",
          grain_week: 38,
          demand: { exports: { current_week_kt: 260 } },
          freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
        },
      ),
    );
    canadaItems.push(
      buildCanadaThesisBoardItem(
        { name: "Amber Durum", slug: "amber-durum", defaultBushelWeightLbs: 60 },
        { lane: "canada", grain: "Amber Durum", crop_year: "2025-2026", grain_week: 38 },
      ),
    );
    const usItems = ["Corn", "Soybeans", "Wheat", "Barley", "Oats"].map((name) =>
      buildUsThesisBoardItem(
        {
          name,
          slug: name.toLowerCase().replaceAll(" ", "-"),
          futuresGrain: name,
          exportCommodity: name.toUpperCase(),
          cotCommodity: name.toUpperCase(),
          cropProgressMarkets: [name],
          includeInOverview: true,
        },
        {
          lane: "us",
          market_name: name,
          market_year: 2025,
          demand: { export_sales: { net_sales_mt: 620_000, export_pace_pct: 95 } },
          freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
        },
      ),
    );
    const rows = buildMajorThesisComparisonRows(canadaItems, usItems);

    const summary = buildFarmerReadSummary(rows);

    expect(summary.coverageLine).toBe(
      "7 of 7 V1 rows are source-backed or intentionally Canada-first; parked wheat classes stay off the public board until class-safe mapping exists.",
    );
    expect(summary.mappingLine).toBe(
      "No wheat-class proxy rows are being scored without direct source mapping.",
    );
    expect(summary.actionLine).toBe(
      "Use the board as a scouting sheet: prioritize source-backed split markets, then open row drivers before relying on the read.",
    );
  });
});
