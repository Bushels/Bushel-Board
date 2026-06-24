import { describe, expect, it } from "vitest";

import {
  mapCanadaPacketToDomainInputs,
  mapUsPacketToDomainInputs,
} from "@/lib/thesis/rating-domain-mappers";

describe("thesis rating domain packet mappers", () => {
  it("maps strong Canada canola current-week export and process deliveries to bullish demand", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
      demand: {
        producer_deliveries_current_week: {
          total_kt: 1_000,
          process_deliveries_kt: 340,
        },
        exports: { current_week_kt: 470 },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      domain: "demand",
      freshness_status: "strong",
      sources: ["cgc_observations"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(demand?.score).toBeGreaterThan(0);
    expect(demand?.positive_evidence?.join(" ")).toContain("export/delivery ratio");
    expect(demand?.positive_evidence?.join(" ")).toContain("process/delivery ratio");
    expect(demand?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "cgc_observations",
          label: "Current-week export/delivery ratio",
          value: "47.0%",
          numericValue: 47,
          unit: "pct",
        }),
        expect.objectContaining({
          source: "cgc_observations",
          label: "Current-week process/delivery ratio",
          value: "34.0%",
          numericValue: 34,
          unit: "pct",
        }),
      ]),
    );
  });

  it("maps high Canada deliveries with weak disappearance to bearish movement", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
      demand: {
        producer_deliveries_current_week: {
          total_kt: 900,
          process_deliveries_kt: 40,
        },
        exports: { current_week_kt: 100 },
      },
    });

    const movement = domains.find((domain) => domain.domain === "movement");

    expect(movement).toMatchObject({
      domain: "movement",
      freshness_status: "strong",
      sources: ["cgc_observations"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(movement?.score).toBeLessThan(0);
    expect(movement?.negative_evidence?.join(" ")).toContain("deliveries entered the pipeline");
    expect(movement?.negative_evidence?.join(" ")).toContain("disappearance is weak");
  });

  it("maps tight Canada supply-disposition carryout to bullish supply", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "supply_disposition", freshness_status: "strong" }],
      supply: {
        carry_out_kt: 700,
        total_supply_kt: 10_000,
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply).toMatchObject({
      domain: "supply",
      freshness_status: "strong",
      sources: ["supply_disposition"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(supply?.score).toBeGreaterThan(0);
    expect(supply?.positive_evidence?.join(" ")).toContain("carryout is tight");
    expect(supply?.positive_evidence?.join(" ")).toContain("7.0% of total supply");
    expect(supply?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "supply_disposition",
          label: "Carryout/total supply",
          value: "7.0%",
          numericValue: 7,
          unit: "pct",
        }),
      ]),
    );
  });

  it("maps heavy Canada supply-disposition carryout to bearish supply", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "supply_disposition", freshness_status: "strong" }],
      supply: {
        carry_out_kt: 2_000,
        total_supply_kt: 10_000,
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply?.score).toBeLessThan(0);
    expect(supply?.negative_evidence?.join(" ")).toContain("carryout is heavy");
    expect(supply?.negative_evidence?.join(" ")).toContain("20.0% of total supply");
  });

  it("maps delayed Canada seeding progress to bullish weather risk", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "AB",
            value_pct: 20,
            report_date: "2026-05-26",
          },
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 24,
            report_date: "2026-05-26",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      freshness_status: "strong",
      sources: ["canada_crop_progress"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(weather?.score).toBeGreaterThan(0);
    expect(weather?.positive_evidence?.join(" ")).toContain("22.0%");
    expect(weather?.positive_evidence?.join(" ")).toContain("seasonal delay risk");
  });

  it("maps comfortable Canada seeding progress to bearish weather cushion", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "AB",
            value_pct: 82,
            report_date: "2026-05-26",
          },
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 78,
            report_date: "2026-05-26",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather?.score).toBeLessThan(0);
    expect(weather?.negative_evidence?.join(" ")).toContain("80.0%");
    expect(weather?.negative_evidence?.join(" ")).toContain("reducing seasonal seeding risk");
  });

  it("maps poor Canada crop condition to bullish weather risk", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-07-15T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "AB",
            value_pct: 62,
            report_date: "2026-07-14",
          },
          {
            metric: "condition_good_excellent_pct",
            region_scope: "province",
            province_code: "AB",
            value_pct: 48,
            value_vs_five_year_avg_pct: -9,
            report_date: "2026-07-14",
          },
          {
            metric: "condition_good_excellent_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 50,
            value_vs_five_year_avg_pct: -7,
            report_date: "2026-07-14",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      freshness_status: "strong",
      sources: ["canada_crop_progress"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(weather?.score).toBeGreaterThan(0);
    expect(weather?.positive_evidence?.join(" ")).toContain("Canada crop condition is stressed");
    expect(weather?.positive_evidence?.join(" ")).toContain("49.0%");
    expect(weather?.positive_evidence?.join(" ")).toContain("-8.0% versus five-year average");
  });

  it("maps strong Canada crop condition to bearish weather cushion", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-07-15T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "condition_good_excellent_pct",
            region_scope: "province",
            province_code: "AB",
            value_pct: 78,
            value_vs_five_year_avg_pct: 9,
            report_date: "2026-07-14",
          },
          {
            metric: "condition_good_excellent_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 76,
            value_vs_five_year_avg_pct: 11,
            report_date: "2026-07-14",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather?.score).toBeLessThan(0);
    expect(weather?.negative_evidence?.join(" ")).toContain("Canada crop condition adds supply cushion");
    expect(weather?.negative_evidence?.join(" ")).toContain("77.0%");
    expect(weather?.negative_evidence?.join(" ")).toContain("+10.0% versus five-year average");
  });

  it("maps delayed Saskatchewan crop-development timing as low-confidence proxy weather risk", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-06-03T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "development_behind_pct",
            region_scope: "province",
            province_code: "SK",
            crop_name: "Oilseeds",
            value_pct: 73,
            report_date: "2026-05-25",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      score: 12,
      confidence: "low",
      freshness_status: "strong",
      sources: ["canada_crop_progress"],
      isRequired: false,
      isPrimaryDirectSource: false,
      isProxy: true,
    });
    expect(weather?.positive_evidence?.join(" ")).toContain("crop-development timing proxy is delayed");
    expect(weather?.positive_evidence?.join(" ")).toContain("73.0% behind normal development");
    expect(weather?.positive_evidence?.join(" ")).toContain("SK Oilseeds 73.0% behind");
  });

  it("maps dry Canada cropland moisture as low-confidence proxy weather risk", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-06-03T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "soil_moisture_adequate_surplus_pct",
            region_scope: "province",
            province_code: "AB",
            crop_name: "All Crops",
            value_pct: 48,
            value_vs_previous_year_pct: -10,
            report_date: "2026-05-26",
          },
          {
            metric: "soil_moisture_adequate_surplus_pct",
            region_scope: "province",
            province_code: "SK",
            crop_name: "Cropland",
            value_pct: 52,
            value_vs_previous_year_pct: -6,
            report_date: "2026-05-25",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      score: 10,
      confidence: "low",
      freshness_status: "strong",
      sources: ["canada_crop_progress"],
      isRequired: false,
      isPrimaryDirectSource: false,
      isProxy: true,
    });
    expect(weather?.positive_evidence?.join(" ")).toContain("cropland moisture proxy is dry");
    expect(weather?.positive_evidence?.join(" ")).toContain("50.0%");
    expect(weather?.positive_evidence?.join(" ")).toContain("AB All Crops 48.0% adequate/surplus");
    expect(weather?.positive_evidence?.join(" ")).toContain("SK Cropland 52.0% adequate/surplus");
    expect(weather?.positive_evidence?.join(" ")).toContain("-8.0% versus last year");
  });

  it("maps supportive Canada cropland moisture as low-confidence bearish weather cushion", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-06-03T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "soil_moisture_adequate_surplus_pct",
            region_scope: "province",
            province_code: "AB",
            crop_name: "All Crops",
            value_pct: 80,
            value_vs_five_year_avg_pct: 5,
            report_date: "2026-05-26",
          },
          {
            metric: "soil_moisture_adequate_surplus_pct",
            region_scope: "province",
            province_code: "SK",
            crop_name: "Cropland",
            value_pct: 88,
            value_vs_five_year_avg_pct: 11,
            report_date: "2026-05-25",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      score: -6,
      confidence: "low",
      isRequired: false,
      isPrimaryDirectSource: false,
      isProxy: true,
    });
    expect(weather?.negative_evidence?.join(" ")).toContain("cropland moisture proxy is supportive");
    expect(weather?.negative_evidence?.join(" ")).toContain("84.0%");
    expect(weather?.negative_evidence?.join(" ")).toContain("+8.0% versus five-year average");
  });

  it("caps Canada crop-progress confidence when direct seeding and proxy development are combined", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-06-03T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 24,
            report_date: "2026-05-25",
          },
          {
            metric: "development_behind_pct",
            region_scope: "province",
            province_code: "SK",
            crop_name: "Spring Cereals",
            value_pct: 63,
            report_date: "2026-05-25",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      score: 42,
      confidence: "low",
      isRequired: true,
      isPrimaryDirectSource: true,
      isProxy: true,
    });
    expect(weather?.positive_evidence?.join(" ")).toContain("seasonal delay risk");
    expect(weather?.positive_evidence?.join(" ")).toContain("crop-development timing proxy");
  });

  it("caps Canada crop-progress confidence when direct seeding and proxy moisture are combined", () => {
    const domains = mapCanadaPacketToDomainInputs({
      packet_generated_at: "2026-06-03T12:00:00Z",
      freshness: [{ source_name: "canada_crop_progress", freshness_status: "strong" }],
      supply: {
        canada_crop_progress: [
          {
            metric: "seeded_pct",
            region_scope: "province",
            province_code: "SK",
            value_pct: 24,
            report_date: "2026-05-25",
          },
          {
            metric: "soil_moisture_adequate_surplus_pct",
            region_scope: "province",
            province_code: "SK",
            crop_name: "Cropland",
            value_pct: 49,
            report_date: "2026-05-25",
          },
        ],
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      score: 40,
      confidence: "low",
      isRequired: true,
      isPrimaryDirectSource: true,
      isProxy: true,
    });
    expect(weather?.positive_evidence?.join(" ")).toContain("seasonal delay risk");
    expect(weather?.positive_evidence?.join(" ")).toContain("cropland moisture proxy is dry");
  });

  it("maps Canada unload strength and producer cars to bullish logistics context", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [
        { source_name: "grain_monitor_snapshots", freshness_status: "strong" },
        { source_name: "producer_car_allocations", freshness_status: "strong" },
      ],
      logistics: {
        grain_monitor: {
          var_to_four_week_avg_pct: 18,
          terminal_capacity_pct: 72,
          vessels_vancouver: 8,
        },
        producer_cars: [
          {
            week_cars: 32,
            dest_united_states: 12,
          },
        ],
      },
    });

    const logistics = domains.find((domain) => domain.domain === "logistics");

    expect(logistics).toMatchObject({
      domain: "logistics",
      freshness_status: "strong",
      sources: ["grain_monitor_snapshots", "producer_car_allocations"],
      confidence: "high",
      isRequired: false,
      isPrimaryDirectSource: true,
    });
    expect(logistics?.score).toBeGreaterThan(0);
    expect(logistics?.positive_evidence?.join(" ")).toContain("+18.0% versus the four-week average");
    expect(logistics?.positive_evidence?.join(" ")).toContain("32 cars");
    expect(logistics?.positive_evidence?.join(" ")).toContain("12 cars to US destinations");
  });

  it("maps terminal congestion and vessel lineup to bearish logistics context", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "grain_monitor_snapshots", freshness_status: "strong" }],
      logistics: {
        grain_monitor: {
          var_to_four_week_avg_pct: -18,
          terminal_capacity_pct: 93,
          vessels_vancouver: 24,
        },
      },
    });

    const logistics = domains.find((domain) => domain.domain === "logistics");

    expect(logistics).toMatchObject({
      domain: "logistics",
      freshness_status: "strong",
      sources: ["grain_monitor_snapshots"],
      isRequired: false,
      isPrimaryDirectSource: true,
    });
    expect(logistics?.score).toBeLessThan(0);
    expect(logistics?.negative_evidence?.join(" ")).toContain("-18.0% versus the four-week average");
    expect(logistics?.negative_evidence?.join(" ")).toContain("93.0% of reported terminal capacity");
    expect(logistics?.negative_evidence?.join(" ")).toContain("24 vessels");
  });

  it("maps fresh Canada grain-price follow-through to bullish price context", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
      prices: [
        {
          change_pct: 0.8,
          settlement_price: 655,
          currency: "CAD",
          unit: "tonne",
          price_date: "2026-06-02",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price).toMatchObject({
      domain: "price",
      freshness_status: "strong",
      sources: ["grain_prices"],
      confidence: "high",
      isRequired: false,
      isPrimaryDirectSource: true,
    });
    expect(price?.score).toBeGreaterThan(0);
    expect(price?.positive_evidence?.join(" ")).toContain("futures follow-through");
    expect(price?.positive_evidence?.join(" ")).toContain("0.8%");
    expect(price?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "grain_prices",
          label: "Futures change",
          value: "0.8%",
          numericValue: 0.8,
          unit: "pct",
        }),
      ]),
    );
  });

  it("maps Wheat futures as a three-contract basket instead of latest row only", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Wheat",
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
      prices: [
        {
          grain: "Spring Wheat",
          contract: "MWK26",
          exchange: "MGEX",
          source: "barchart",
          change_pct: -0.594,
          settlement_price: 7.11,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-24",
        },
        {
          grain: "Wheat",
          contract: "ZW",
          exchange: "CBOT",
          source: "yahoo-finance",
          change_pct: 1.4,
          settlement_price: 6.09,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-19",
        },
        {
          grain: "Wheat",
          contract: "ZW",
          exchange: "CBOT",
          source: "yahoo-finance",
          change_pct: -1.362,
          settlement_price: 5.975,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-22",
        },
        {
          grain: "HRW Wheat",
          contract: "KE",
          exchange: "KCBT",
          source: "yahoo-finance",
          change_pct: -1.63,
          settlement_price: 6.335,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-22",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price).toMatchObject({
      domain: "price",
      score: -17,
      confidence: "medium",
      freshness_status: "strong",
      sources: ["grain_prices"],
    });
    expect(price?.negative_evidence?.join(" ")).toContain("Fresh Wheat price basket shows futures pressure");
    expect(price?.negative_evidence?.join(" ")).toContain("Spring Wheat -0.6%");
    expect(price?.negative_evidence?.join(" ")).toContain("HRW Wheat -1.6%");
    expect(price?.negative_evidence?.join(" ")).toContain("SRW Wheat -1.4%");
    expect(price?.negative_evidence?.join(" ")).toContain("Spring Wheat uses a Barchart latest-only scrape");
    expect(price?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Spring Wheat futures change",
          numericValue: -0.594,
          unit: "pct",
          period: "2026-06-24",
        }),
        expect.objectContaining({
          label: "HRW Wheat futures change",
          numericValue: -1.63,
          unit: "pct",
          period: "2026-06-22",
        }),
        expect.objectContaining({
          label: "SRW Wheat futures change",
          numericValue: -1.362,
          unit: "pct",
          period: "2026-06-22",
        }),
      ]),
    );
  });

  it("lowers Wheat price confidence when the futures basket is split", () => {
    const domains = mapUsPacketToDomainInputs({
      grain: "Wheat",
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
      prices: [
        {
          grain: "Wheat",
          contract: "ZW",
          exchange: "CBOT",
          source: "yahoo-finance",
          change_pct: 0.8,
          settlement_price: 5.9,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-22",
        },
        {
          grain: "HRW Wheat",
          contract: "KE",
          exchange: "KCBT",
          source: "yahoo-finance",
          change_pct: -1.2,
          settlement_price: 6.3,
          currency: "USD",
          unit: "$/bu",
          price_date: "2026-06-22",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price?.score).toBe(0);
    expect(price?.confidence).toBe("medium");
    expect(price?.positive_evidence?.join(" ")).toContain("basket has bullish legs");
    expect(price?.negative_evidence?.join(" ")).toContain("basket has bearish legs");
    expect(price?.positive_evidence?.join(" ")).toContain("basket is split");
  });

  it("maps admitted US wheat export-sales projection pace over 100% to bullish demand", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
      demand: {
        export_sales: {
          export_pace_pct: 101,
          net_sales_mt: -100,
          total_commitments_mt: 1,
          usda_projection_mt: 10,
        },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      domain: "demand",
      freshness_status: "strong",
      sources: ["usda_export_sales"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(demand?.score).toBeGreaterThan(0);
    expect(demand?.positive_evidence?.join(" ")).toContain("101.0% export projection pace");
    expect(demand?.positive_evidence?.join(" ")).not.toContain("net sales");
    expect(demand?.metrics).toEqual([
      expect.objectContaining({
        source: "usda_export_sales",
        label: "Export projection pace",
        value: "101.0%",
        numericValue: 101,
        unit: "pct",
      }),
    ]);
  });

  it("blocks US barley/oats projection demand scoring when export projection pace is unavailable", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_export_sales", freshness_status: "strong" }],
      demand: {
        export_sales: {
          export_pace_pct: null,
          net_sales_mt: 500_000,
          total_commitments_mt: 10_000_000,
          usda_projection_mt: 1_000_000,
        },
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score ?? 0).toBe(0);
    expect(demand?.positive_evidence ?? []).toHaveLength(0);
    expect(demand?.blocked_claims).toContain("export_projection_pace_unavailable");
  });

  it("maps poor US crop condition to bullish weather risk during the active crop-progress window", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-06-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 49,
            ge_pct_yoy_change: -4,
          },
        },
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      freshness_status: "strong",
      sources: ["usda_crop_progress"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(weather?.score).toBeGreaterThan(0);
    expect(weather?.positive_evidence?.join(" ")).toContain("US crop stress supports price");
  });

  it("maps strong US crop condition to bearish weather cushion during the active crop-progress window", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-06-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 72,
            ge_pct_yoy_change: 9,
          },
        },
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather).toMatchObject({
      domain: "weather",
      freshness_status: "strong",
      sources: ["usda_crop_progress"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(weather?.score).toBeLessThan(0);
    expect(weather?.negative_evidence?.join(" ")).toContain("supply cushion");
  });

  it("maps slow US planting progress to bullish weather risk", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-05-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            planted_pct_vs_avg: -6,
          },
        },
      },
    });

    const weather = domains.find((domain) => domain.domain === "weather");

    expect(weather?.score).toBeGreaterThan(0);
    expect(weather?.positive_evidence?.join(" ")).toContain("planting pace is behind normal");
    expect(weather?.positive_evidence?.join(" ")).toContain("6.0%");
  });

  it("maps a US WASDE ending-stocks cut to bullish supply", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_wasde_mapped", freshness_status: "strong" }],
      supply: {
        wasde: {
          ending_stocks_change_kt: -750,
          ending_stocks_direction: "down",
          stocks_to_use_pct: 9,
        },
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply).toMatchObject({
      domain: "supply",
      freshness_status: "strong",
      sources: ["usda_wasde_mapped"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(supply?.score).toBeGreaterThan(0);
    expect(supply?.positive_evidence?.join(" ")).toContain("lowered ending stocks");
    expect(supply?.positive_evidence?.join(" ")).toContain("750 kt");
  });

  it("maps loose US WASDE stocks-to-use to bearish supply", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_wasde_mapped", freshness_status: "strong" }],
      supply: {
        wasde: {
          ending_stocks_direction: "up",
          ending_stocks_mmt: 14.2,
          stocks_to_use_pct: 22,
        },
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply?.score).toBeLessThan(0);
    expect(supply?.negative_evidence?.join(" ")).toContain("WASDE balance is loosening");
    expect(supply?.negative_evidence?.join(" ")).toContain("22.0%");
  });

  it("maps fresh US futures pressure to bearish price context", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
      prices: [
        {
          change_pct: -0.9,
          settlement_price: 452.25,
          currency: "USD",
          unit: "bu",
          price_date: "2026-06-02",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price).toMatchObject({
      domain: "price",
      freshness_status: "strong",
      sources: ["grain_prices"],
      confidence: "high",
      isRequired: false,
      isPrimaryDirectSource: true,
    });
    expect(price?.score).toBeLessThan(0);
    expect(price?.negative_evidence?.join(" ")).toContain("futures pressure");
    expect(price?.negative_evidence?.join(" ")).toContain("-0.9%");
  });

  it("blocks stale grain-price context without zeroing required source confidence", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "grain_prices", freshness_status: "stale" }],
      prices: [
        {
          change_pct: 1.1,
          settlement_price: 460,
          currency: "USD",
          unit: "bu",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price).toMatchObject({
      domain: "price",
      freshness_status: "stale",
      sources: ["grain_prices"],
      isRequired: false,
      isPrimaryDirectSource: true,
    });
    expect(price?.score).toBe(0);
    expect(price?.blocked_claims).toContain("price_context_requires_fresh_grain_prices");
  });

  it("marks Barchart latest-only price context as provisional low-confidence momentum", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "grain_prices", freshness_status: "strong" }],
      prices: [
        {
          source: "barchart",
          change_pct: 0.7,
          settlement_price: 10.35,
          currency: "USD",
          unit: "bu",
        },
      ],
    });

    const price = domains.find((domain) => domain.domain === "price");

    expect(price?.score).toBe(10);
    expect(price?.confidence).toBe("low");
    expect(price?.positive_evidence?.join(" ")).toContain("provisional price momentum only");
  });

  it("maps tighter US quarterly stocks to bullish supply", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_quarterly_stocks", freshness_status: "strong" }],
      supply: {
        quarterly_stocks: {
          total_stocks_kt: 24_000,
          vs_wasde_estimate_kt: -1_200,
          change_vs_year_ago_pct: -3,
          report_date: "2026-03-01",
        },
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply).toMatchObject({
      domain: "supply",
      freshness_status: "strong",
      sources: ["usda_quarterly_stocks"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(supply?.score).toBeGreaterThan(0);
    expect(supply?.positive_evidence?.join(" ")).toContain("quarterly stocks are tighter");
    expect(supply?.positive_evidence?.join(" ")).toContain("1,200 kt below WASDE context");
  });

  it("maps heavier US quarterly stocks to bearish supply", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "usda_quarterly_stocks", freshness_status: "strong" }],
      supply: {
        quarterly_stocks: {
          total_stocks_kt: 31_000,
          vs_wasde_estimate_kt: 1_500,
          change_vs_year_ago_pct: 7,
          report_date: "2026-03-01",
        },
      },
    });

    const supply = domains.find((domain) => domain.domain === "supply");

    expect(supply?.score).toBeLessThan(0);
    expect(supply?.negative_evidence?.join(" ")).toContain("quarterly stocks are heavier");
    expect(supply?.negative_evidence?.join(" ")).toContain("1,500 kt above WASDE context");
    expect(supply?.negative_evidence?.join(" ")).toContain("7.0% above last year");
  });

  it("combines US WASDE and quarterly stocks into one supply domain", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [
        { source_name: "usda_wasde_mapped", freshness_status: "strong" },
        { source_name: "usda_quarterly_stocks", freshness_status: "strong" },
      ],
      supply: {
        wasde: {
          ending_stocks_change_kt: 600,
          ending_stocks_direction: "up",
          stocks_to_use_pct: 18,
        },
        quarterly_stocks: {
          total_stocks_kt: 21_500,
          vs_wasde_estimate_kt: -1_500,
          change_vs_year_ago_pct: -6,
        },
      },
    });

    const supplyDomains = domains.filter((domain) => domain.domain === "supply");
    const supply = supplyDomains[0];

    expect(supplyDomains).toHaveLength(1);
    expect(supply?.sources).toEqual(["usda_wasde_mapped", "usda_quarterly_stocks"]);
    expect(supply?.score).toBe(-5);
    expect(supply?.negative_evidence?.join(" ")).toContain("WASDE raised ending stocks");
    expect(supply?.positive_evidence?.join(" ")).toContain("quarterly stocks are tighter");
  });

  it("does not score US crop-condition weather risk outside the old-crop/new-crop relevance window", () => {
    const domains = mapUsPacketToDomainInputs({
      packet_generated_at: "2026-01-15T12:00:00Z",
      freshness: [{ source_name: "usda_crop_progress", freshness_status: "strong" }],
      supply: {
        crop_progress: {
          us_total: {
            good_excellent_pct: 45,
            ge_pct_yoy_change: -12,
          },
        },
      },
    });

    expect(domains.find((domain) => domain.domain === "weather")).toBeUndefined();
  });

  it("maps primary Canada CFTC net-long positioning to bullish positioning", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cftc_cot_positions", freshness_status: "strong" }],
      positioning: [
        {
          mapping_type: "primary",
          managed_money_long: 95_000,
          managed_money_short: 22_000,
          change_managed_money_long: 1_200,
          change_managed_money_short: 100,
        },
      ],
    });

    const positioning = domains.find((domain) => domain.domain === "positioning");

    expect(positioning).toMatchObject({
      domain: "positioning",
      freshness_status: "strong",
      sources: ["cftc_cot_positions"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(positioning?.score).toBeGreaterThan(0);
    expect(positioning?.positive_evidence?.join(" ")).toContain("net long");
    expect(positioning?.positive_evidence?.join(" ")).toContain("+1,100 contracts");
  });

  it("maps primary CFTC net-long liquidation to bearish positioning pressure", () => {
    const domains = mapCanadaPacketToDomainInputs({
      freshness: [{ source_name: "cftc_cot_positions", freshness_status: "strong" }],
      positioning: [
        {
          mapping_type: "primary",
          managed_money_long: 80_000,
          managed_money_short: 50_000,
          change_managed_money_long: -1_500,
          change_managed_money_short: 250,
        },
      ],
    });

    const positioning = domains.find((domain) => domain.domain === "positioning");

    expect(positioning?.score).toBeLessThan(0);
    expect(positioning?.negative_evidence?.join(" ")).toContain("net long");
    expect(positioning?.negative_evidence?.join(" ")).toContain("-1,750 contracts");
  });

  it("maps primary US CFTC net-short positioning to bearish positioning", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "cftc_cot_positions", freshness_status: "strong" }],
      positioning: [
        {
          mapping_type: "primary",
          managed_money_long: 18_000,
          managed_money_short: 44_000,
        },
      ],
    });

    const positioning = domains.find((domain) => domain.domain === "positioning");

    expect(positioning).toMatchObject({
      domain: "positioning",
      freshness_status: "strong",
      sources: ["cftc_cot_positions"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(positioning?.score).toBeLessThan(0);
    expect(positioning?.negative_evidence?.join(" ")).toContain("net short");
  });

  it("does not score proxy-only CFTC positioning rows", () => {
    const domains = mapUsPacketToDomainInputs({
      freshness: [{ source_name: "cftc_cot_positions", freshness_status: "strong" }],
      positioning: [
        {
          mapping_type: "proxy",
          managed_money_long: 95_000,
          managed_money_short: 22_000,
        },
      ],
    });

    expect(domains.find((domain) => domain.domain === "positioning")).toBeUndefined();
  });

  it("tolerates malformed packets without throwing", () => {
    expect(mapCanadaPacketToDomainInputs(null)).toEqual([]);
    expect(mapUsPacketToDomainInputs(undefined)).toEqual([]);
  });
});

describe("bounded Canola world veg-oil demand context", () => {
  const strongFreshness = [
    { source_name: "cgc_observations", freshness_status: "strong" },
    { source_name: "usda_wasde_raw", freshness_status: "strong" },
  ];
  // CGC demand primary fires bullish at +35: export/delivery 47%, process/delivery 34%.
  const bullishCgcDemand = {
    producer_deliveries_current_week: {
      total_kt: 1_000,
      process_deliveries_kt: 340,
    },
    exports: { current_week_kt: 470 },
  };
  // Average stocks/use shift of -0.6 pp YoY across the four world commodities.
  const tighteningVegOil = [
    { market_name: "Palm Oil", stocks_to_use_pct: 12.0, prior_stocks_to_use_pct: 12.6 },
    { market_name: "Rapeseed", stocks_to_use_pct: 10.2, prior_stocks_to_use_pct: 11.0 },
    { market_name: "Rapeseed Oil", stocks_to_use_pct: 7.1, prior_stocks_to_use_pct: 7.5 },
    { market_name: "Soybean Oil", stocks_to_use_pct: 7.0, prior_stocks_to_use_pct: 7.6 },
  ];
  const looseningVegOil = tighteningVegOil.map((row) => ({
    ...row,
    stocks_to_use_pct: row.prior_stocks_to_use_pct,
    prior_stocks_to_use_pct: row.stocks_to_use_pct,
  }));

  it("adds a bounded +6 tilt to an active CGC demand domain when world veg-oil balances tighten", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: strongFreshness,
      demand: { ...bullishCgcDemand, global_veg_oil: tighteningVegOil },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      domain: "demand",
      score: 41,
      freshness_status: "strong",
      sources: ["cgc_observations", "usda_wasde_raw"],
      confidence: "high",
      isRequired: true,
      isPrimaryDirectSource: true,
    });
    expect(demand?.positive_evidence?.join(" ")).toContain("Bounded low-confidence world veg-oil context");
    expect(demand?.positive_evidence?.join(" ")).toContain("tightening global vegetable-oil balance");
    expect(demand?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "usda_wasde_raw",
          label: "World veg-oil stocks/use YoY",
          value: "-0.6%",
          unit: "pct",
        }),
      ]),
    );
  });

  it("subtracts the bounded tilt when world veg-oil balances loosen", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: strongFreshness,
      demand: { ...bullishCgcDemand, global_veg_oil: looseningVegOil },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score).toBe(29);
    expect(demand?.sources).toEqual(["cgc_observations", "usda_wasde_raw"]);
    expect(demand?.negative_evidence?.join(" ")).toContain("loosening global vegetable-oil balance");
  });

  it("never creates a demand domain from veg-oil context alone", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: strongFreshness,
      demand: {
        // Mid-range CGC ratios: export/delivery 30%, process/delivery 20% — no primary signal.
        producer_deliveries_current_week: {
          total_kt: 1_000,
          process_deliveries_kt: 200,
        },
        exports: { current_week_kt: 300 },
        global_veg_oil: tighteningVegOil,
      },
    });

    expect(domains.find((domain) => domain.domain === "demand")).toBeUndefined();
  });

  it("drops the lane instead of degrading the CGC primary when WASDE freshness is not strong", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: [
        { source_name: "cgc_observations", freshness_status: "strong" },
        { source_name: "usda_wasde_raw", freshness_status: "usable but stale-risk" },
      ],
      demand: { ...bullishCgcDemand, global_veg_oil: tighteningVegOil },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand).toMatchObject({
      score: 35,
      freshness_status: "strong",
      sources: ["cgc_observations"],
      confidence: "high",
    });
    expect(demand?.positive_evidence?.join(" ")).not.toContain("veg-oil");
  });

  it("skips the lane when the usda_wasde_raw freshness row is missing entirely", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: [{ source_name: "cgc_observations", freshness_status: "strong" }],
      demand: { ...bullishCgcDemand, global_veg_oil: tighteningVegOil },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score).toBe(35);
    expect(demand?.sources).toEqual(["cgc_observations"]);
  });

  it("applies the lane to Canola only", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Wheat",
      freshness: strongFreshness,
      demand: { ...bullishCgcDemand, global_veg_oil: tighteningVegOil },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score).toBe(35);
    expect(demand?.sources).toEqual(["cgc_observations"]);
  });

  it("requires at least two commodities with prior-year stocks/use", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: strongFreshness,
      demand: {
        ...bullishCgcDemand,
        global_veg_oil: [
          { market_name: "Palm Oil", stocks_to_use_pct: 11.0, prior_stocks_to_use_pct: 12.6 },
          { market_name: "Rapeseed", stocks_to_use_pct: 10.2, prior_stocks_to_use_pct: null },
        ],
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score).toBe(35);
    expect(demand?.sources).toEqual(["cgc_observations"]);
  });

  it("stays neutral when the average YoY stocks/use shift is inside the dead zone", () => {
    const domains = mapCanadaPacketToDomainInputs({
      grain: "Canola",
      freshness: strongFreshness,
      demand: {
        ...bullishCgcDemand,
        global_veg_oil: [
          { market_name: "Palm Oil", stocks_to_use_pct: 12.4, prior_stocks_to_use_pct: 12.6 },
          { market_name: "Rapeseed", stocks_to_use_pct: 10.8, prior_stocks_to_use_pct: 11.0 },
          { market_name: "Rapeseed Oil", stocks_to_use_pct: 7.6, prior_stocks_to_use_pct: 7.5 },
          { market_name: "Soybean Oil", stocks_to_use_pct: 7.7, prior_stocks_to_use_pct: 7.6 },
        ],
      },
    });

    const demand = domains.find((domain) => domain.domain === "demand");

    expect(demand?.score).toBe(35);
    expect(demand?.sources).toEqual(["cgc_observations"]);
  });
});
