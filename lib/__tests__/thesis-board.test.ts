import { describe, expect, it } from "vitest";
import {
  THESIS_BOARD_MAJOR_CANADA_GRAIN_NAMES,
  THESIS_BOARD_MAJOR_US_MARKET_NAMES,
  THESIS_BOARD_V1_GRAIN_LANES,
  buildCanadaThesisBoardItem,
  buildMajorThesisComparisonRows,
  buildSourceHealthSummary,
  cacheStatusForSourceState,
  buildUsThesisBoardItem,
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
    expect(item.bearDrivers.map((driver) => driver.title)).toContain("Futures pressure");
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
    expect(item.bearDrivers.map((driver) => driver.title)).toContain(
      "US crop condition adds supply pressure",
    );
    expect(item.stanceScore).toBe(0);
    expect(item.stanceLabel).toBe("Balanced");
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
    expect(item.stanceLabel).toBe("Balanced");
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
      "Spring Wheat",
      "Winter Wheat",
      "Durum",
      "Canola",
      "Barley",
      "Oats",
    ]);
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
    expect(wheatRow?.explanation).toContain("US -30 Bear tilt");
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

  it("builds comparison rows in exact V1 lane order with wheat-class placeholders", () => {
    const rows = buildMajorThesisComparisonRows([], []);

    expect(rows.map((row) => row.grain)).toEqual(THESIS_BOARD_V1_GRAIN_LANES);
    const springWheatRow = rows.find((row) => row.grain === "Spring Wheat");
    const winterWheatRow = rows.find((row) => row.grain === "Winter Wheat");

    expect(springWheatRow?.status).toBe("mapping_needed");
    expect(springWheatRow?.statusLabel).toBe("Mapping needed");
    expect(springWheatRow?.readinessLabel).toBe("Mapping pending");
    expect(springWheatRow?.readinessDetail).toContain("class-safe Spring Wheat source mapping");
    expect(springWheatRow?.explanation).toContain("class-specific source mapping is still pending");
    expect(springWheatRow?.explanation).toContain("Generic Wheat is not used as a proxy");
    expect(winterWheatRow?.status).toBe("mapping_needed");
    expect(winterWheatRow?.statusLabel).toBe("Mapping needed");
    expect(winterWheatRow?.readinessLabel).toBe("Mapping pending");
    expect(winterWheatRow?.readinessDetail).toContain("class-safe Winter Wheat source mapping");
    expect(winterWheatRow?.explanation).toContain("class-specific source mapping is still pending");
    expect(winterWheatRow?.explanation).toContain("Generic Wheat is not used as a proxy");
    expect(rows.find((row) => row.grain === "Amber Durum")).toBeUndefined();
  });

  it("does not alias generic Wheat packets into Spring or Winter Wheat rows", () => {
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
    expect(springWheatRow?.canada).toBeNull();
    expect(springWheatRow?.us).toBeNull();
    expect(springWheatRow?.strongestBullPoints).toEqual([]);
    expect(springWheatRow?.strongestBearPoints).toEqual([]);
    expect(winterWheatRow?.canada).toBeNull();
    expect(winterWheatRow?.us).toBeNull();
    expect(winterWheatRow?.strongestBullPoints).toEqual([]);
    expect(winterWheatRow?.strongestBearPoints).toEqual([]);
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
});
