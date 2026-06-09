import { describe, expect, it } from "vitest";

import {
  buildCanolaMarketRead,
  renderCanolaMarketReadMarkdown,
} from "../canola-market-read";

function packet(overrides: Record<string, unknown> = {}) {
  return {
    lane: "canada",
    grain: "Canola",
    crop_year: "2025-2026",
    grain_week: 38,
    packet_generated_at: "2026-05-03T12:00:00Z",
    demand: {
      producer_deliveries_current_week: {
        grain: "Canola",
        period: "Current Week",
        crop_year: "2025-2026",
        grain_week: 38,
        week_ending_date: "2026-04-26",
        total_kt: 433.3,
        primary_deliveries_kt: 252.5,
        process_deliveries_kt: 180.8,
        producer_cars_kt: 0,
      },
      producer_deliveries_crop_year: {
        grain: "Canola",
        period: "Crop Year",
        crop_year: "2025-2026",
        grain_week: 38,
        week_ending_date: "2026-04-26",
        total_kt: 15218,
        primary_deliveries_kt: 8409.4,
        process_deliveries_kt: 6792.9,
        producer_cars_kt: 15.7,
      },
      exports: {
        current_week_kt: 379.2,
        crop_year_kt: 12142.7,
      },
    },
    supply: {
      crop_year: "2024-2025",
      source: "AAFC_2026-02-18",
      production_kt: 19239,
      total_supply_kt: 22595,
      carry_in_kt: 3225,
      carry_out_kt: 1597,
    },
    logistics: {
      grain_monitor: {
        crop_year: "2025-2026",
        grain_week: 37,
        report_date: "2026-04-28",
        country_deliveries_kt: 1025.5,
        country_stocks_kt: 4079.9,
        terminal_stocks_kt: 1579.1,
        terminal_capacity_pct: 82,
        total_unloads_cars: 11230,
        vessels_vancouver: 23,
      },
      producer_cars: [
        {
          grain: "Canola",
          crop_year: "2025-2026",
          grain_week: 39,
          week_cars: 176,
        },
      ],
    },
    prices: [
      {
        grain: "Canola",
        contract: "RSK26",
        currency: "CAD",
        unit: "$/tonne",
        settlement_price: 728.7,
        price_date: "2026-04-26",
      },
    ],
    positioning: [
      {
        commodity: "CANOLA",
        mapping_type: "primary",
        report_date: "2026-04-21",
        managed_money_long: 95532,
        managed_money_short: 23202,
      },
      {
        commodity: "SOYBEAN OIL",
        mapping_type: "secondary",
        report_date: "2026-04-21",
        managed_money_long: 185399,
        managed_money_short: 19955,
      },
    ],
    farmer_behavior: {
      crop_plan_count: 2,
      user_count: 2,
    },
    weather: {
      status: "empty",
      source_table: "weather_cache",
    },
    freshness: [
      {
        source_name: "posted_prices",
        source_lane: "farmer_local",
        latest_period: null,
        rows_available: 0,
        freshness_status: "empty",
        action_hint: "Build or seed this source before thesis use.",
      },
      {
        source_name: "weather_cache",
        source_lane: "farmer_local",
        latest_period: null,
        rows_available: 0,
        freshness_status: "empty",
        action_hint: "Build or seed this source before thesis use.",
      },
      {
        source_name: "grain_prices",
        source_lane: "cross_border",
        latest_period: "2026-04-26 / Canola / RSK26",
        rows_available: 331,
        freshness_status: "usable but stale-risk",
        action_hint: "Refresh or explicitly accept stale-risk before thesis generation.",
      },
      {
        source_name: "cftc_cot_positions",
        source_lane: "cross_border",
        latest_period: "2025-2026 wk 38 / 2026-04-21",
        rows_available: 548,
        freshness_status: "usable but stale-risk",
        action_hint: "Refresh or explicitly accept stale-risk before thesis generation.",
      },
      {
        source_name: "cgc_observations",
        source_lane: "canada",
        latest_period: "2025-2026 wk 38",
        rows_available: 1133610,
        freshness_status: "strong",
        action_hint: "No immediate action.",
      },
      {
        source_name: "grain_monitor_snapshots",
        source_lane: "canada",
        latest_period: "2025-2026 wk 37",
        rows_available: 27,
        freshness_status: "strong",
        action_hint: "No immediate action.",
      },
      {
        source_name: "producer_car_allocations",
        source_lane: "canada",
        latest_period: "2025-2026 wk 39",
        rows_available: 342,
        freshness_status: "strong",
        action_hint: "No immediate action.",
      },
      {
        source_name: "supply_disposition",
        source_lane: "canada",
        latest_period: "2025-2026 / AAFC_2026-02-18",
        rows_available: 80,
        freshness_status: "strong",
        action_hint: "No immediate action.",
      },
      {
        source_name: "crop_plans",
        source_lane: "farmer_local",
        latest_period: "2025-2026 / Canola",
        rows_available: 2,
        freshness_status: "strong",
        action_hint: "No immediate action.",
      },
    ],
    quality_warnings: [
      {
        source_name: "posted_prices",
        status: "empty",
        action_hint: "Build or seed this source before thesis use.",
      },
      {
        source_name: "grain_prices",
        status: "usable but stale-risk",
        action_hint: "Refresh or explicitly accept stale-risk before thesis generation.",
      },
    ],
    ...overrides,
  };
}

describe("buildCanolaMarketRead", () => {
  it("keeps source facts separate from interpretation and speculation", () => {
    const read = buildCanolaMarketRead(packet());

    expect(read.status).toBe("available");
    expect(read.facts.length).toBeGreaterThan(8);
    expect(read.interpretation.length).toBeGreaterThan(0);
    expect(read.speculation.length).toBeGreaterThan(0);
    expect(read.facts.every((fact) => fact.source_name && fact.source_table)).toBe(true);
    expect(read.facts.map((fact) => fact.label)).toContain("Producer deliveries, current week");
    expect(read.interpretation.map((entry) => entry.body).join(" ")).toContain("export/delivery ratio");
    expect(read.interpretation.map((entry) => entry.body).join(" ")).not.toContain("share of weekly deliveries");
    expect(read.speculation.map((entry) => entry.label)).toContain("Export/delivery watch");
    expect(read.speculation.map((entry) => entry.statement).join(" ")).not.toContain("pricing call");
    expect(read.bottom_line).toContain("Source read only");
    expect(read.bottom_line).not.toContain("pricing recommendation");
  });

  it("shows stale, empty, lagged, proxy, and source-year warnings explicitly", () => {
    const read = buildCanolaMarketRead(packet());
    const warningText = read.quality_warnings.map((warning) => `${warning.source_name}:${warning.status}`);
    const grainMonitorFact = read.facts.find(
      (fact) => fact.source_name === "grain_monitor_snapshots",
    );
    const supplyFact = read.facts.find((fact) => fact.source_name === "supply_disposition");

    expect(warningText).toContain("posted_prices:empty");
    expect(warningText).toContain("grain_prices:usable but stale-risk");
    expect(warningText).toContain("cftc_cot_positions:proxy_mapping");
    expect(warningText).toContain("supply_disposition:lagged_context");
    expect(warningText).toContain("source_runs:empty");
    expect(grainMonitorFact?.quality_flags).toContain("source_lag_expected");
    expect(supplyFact?.quality_flags).toContain("source_crop_year_differs_from_packet");
  });

  it("derives week-over-week changes only from packet deltas", () => {
    const previous = packet({
      grain_week: 37,
      demand: {
        producer_deliveries_current_week: {
          total_kt: 390,
        },
        producer_deliveries_crop_year: {
          total_kt: 14784.7,
        },
        exports: {
          current_week_kt: 300,
          crop_year_kt: 11763.5,
        },
      },
    });
    const read = buildCanolaMarketRead(packet(), previous);

    expect(read.what_changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Producer deliveries",
          current_value: 433.3,
          previous_value: 390,
          change_value: 43.3,
        }),
        expect.objectContaining({
          label: "Exports",
          current_value: 379.2,
          previous_value: 300,
          change_value: 79.2,
        }),
      ]),
    );
  });

  it("renders the required markdown sections", () => {
    const markdown = renderCanolaMarketReadMarkdown(buildCanolaMarketRead(packet()));

    expect(markdown).toContain("## Bottom Line");
    expect(markdown).toContain("## What Changed");
    expect(markdown).toContain("## Facts");
    expect(markdown).toContain("## Interpretation");
    expect(markdown).toContain("## Speculation");
    expect(markdown).toContain("## Farmer Watch Items");
    expect(markdown).toContain("## Freshness");
    expect(markdown).toContain("## Quality Warnings");
    expect(markdown).toContain("## Source Links");
  });
});
