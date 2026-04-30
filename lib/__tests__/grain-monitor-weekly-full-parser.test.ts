import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  parseCountryDeliveriesAndPortPerformance,
  parsePageMetadata,
  parseShipments,
  parseStocks,
  parseVesselsAndWeather,
  parseWeeklyReportFromPages,
} from "../../scripts/grain-monitor/parsers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "fixtures", "grain-monitor");

function fixture(week: 36 | 37, page: 1 | 2 | 3 | 5): string {
  return readFileSync(join(fixtureDir, `week${week}-page${page}.txt`), "utf8");
}

const week36 = {
  page1: fixture(36, 1),
  page2: fixture(36, 2),
  page3: fixture(36, 3),
  page5: fixture(36, 5),
};

const week37 = {
  page1: fixture(37, 1),
  page2: fixture(37, 2),
  page3: fixture(37, 3),
  page5: fixture(37, 5),
};

describe("parsePageMetadata", () => {
  it("parses Week 36 and Week 37 report metadata", () => {
    expect(parsePageMetadata(week36.page1)).toMatchObject({
      canonicalCropYear: "2025-2026",
      reportCropYear: "2025-26",
      grainWeek: 36,
      reportDate: "2026-04-21",
      coveredPeriod: "April 06, 2026 to April 12, 2026",
      coveredPeriodStart: "2026-04-06",
      coveredPeriodEnd: "2026-04-12",
      vesselAsOfDate: "2026-04-19",
      vesselWeek: 37,
      inboundPeriod: "Apr 20, 2026 to Apr 26, 2026",
      inboundWeek: 38,
    });
    expect(parsePageMetadata(week37.page1)).toMatchObject({
      canonicalCropYear: "2025-2026",
      reportCropYear: "2025-26",
      grainWeek: 37,
      reportDate: "2026-04-28",
      coveredPeriod: "April 13, 2026 to April 19, 2026",
      coveredPeriodStart: "2026-04-13",
      coveredPeriodEnd: "2026-04-19",
      vesselAsOfDate: "2026-04-26",
      vesselWeek: 38,
      // Week 37 PDF has a pdf-parse split-letter artifact ("M ay" instead of
      // "May"). The metadata regex tolerates it via [A-Za-z]+(?:\s[A-Za-z]+)?
      // — same pattern used by the row-level Vessels Inbound regex. The
      // captured period preserves the literal "M ay" (cosmetic; flows into
      // source_notes only).
      inboundPeriod: "Apr 27, 2026 to M ay 03, 2026",
      inboundWeek: 39,
    });
  });
});

describe("parseStocks", () => {
  it("parses country and terminal stocks for Week 36 and Week 37", () => {
    expect(parseStocks(week36.page2, parsePageMetadata(week36.page1))).toEqual({
      country_stocks_mb_kt: 941.4,
      country_stocks_sk_kt: 2045.1,
      country_stocks_ab_kt: 1370.7,
      country_stocks_kt: 4374.7,
      country_capacity_pct: 82,
      terminal_stocks_vancouver_kt: 930.3,
      terminal_stocks_prince_rupert_kt: 91.4,
      terminal_stocks_churchill_kt: 0.7,
      terminal_stocks_thunder_bay_kt: 644.3,
      terminal_stocks_kt: 1666.7,
      terminal_capacity_pct: 87,
    });
    expect(parseStocks(week37.page2, parsePageMetadata(week37.page1))).toEqual({
      country_stocks_mb_kt: 888.6,
      country_stocks_sk_kt: 1827.2,
      country_stocks_ab_kt: 1350.2,
      country_stocks_kt: 4079.9,
      country_capacity_pct: 76,
      terminal_stocks_vancouver_kt: 859.8,
      terminal_stocks_prince_rupert_kt: 134.3,
      terminal_stocks_churchill_kt: 0.7,
      terminal_stocks_thunder_bay_kt: 584.3,
      terminal_stocks_kt: 1579.1,
      terminal_capacity_pct: 82,
    });
  });
});

describe("parseCountryDeliveriesAndPortPerformance", () => {
  it("parses deliveries, unloads, and OCT for Week 36 and Week 37", () => {
    expect(parseCountryDeliveriesAndPortPerformance(week36.page1, week36.page3)).toEqual({
      country_deliveries_kt: 1092.5,
      country_deliveries_yoy_pct: 11,
      vancouver_unloads_cars: 8322,
      prince_rupert_unloads_cars: 1024,
      thunder_bay_unloads_cars: 2134,
      churchill_unloads_cars: 0,
      total_unloads_cars: 11480,
      four_week_avg_unloads: 9614,
      var_to_four_week_avg_pct: 19,
      ytd_unloads_cars: 331778,
      out_of_car_time_pct: 10.7,
      out_of_car_time_vancouver_pct: 6.3,
      out_of_car_time_prince_rupert_pct: 40.2,
    });
    expect(parseCountryDeliveriesAndPortPerformance(week37.page1, week37.page3)).toEqual({
      country_deliveries_kt: 1025.5,
      country_deliveries_yoy_pct: 8,
      vancouver_unloads_cars: 7584,
      prince_rupert_unloads_cars: 1489,
      thunder_bay_unloads_cars: 2157,
      churchill_unloads_cars: 0,
      total_unloads_cars: 11230,
      four_week_avg_unloads: 10413,
      var_to_four_week_avg_pct: 8,
      ytd_unloads_cars: 343008,
      out_of_car_time_pct: 8.9,
      out_of_car_time_vancouver_pct: 10.7,
      out_of_car_time_prince_rupert_pct: 10.7,
    });
  });
});

describe("parseShipments", () => {
  it("parses YTD shipment metrics for Week 36 and Week 37", () => {
    expect(parseShipments(week36.page5)).toEqual({
      ytd_shipments_vancouver_kt: 23123,
      ytd_shipments_prince_rupert_kt: 3664.3,
      ytd_shipments_thunder_bay_kt: 4398.7,
      ytd_shipments_total_kt: 31186,
      ytd_shipments_yoy_pct: 6,
      ytd_shipments_vs_3yr_avg_pct: 8,
    });
    expect(parseShipments(week37.page5)).toEqual({
      ytd_shipments_vancouver_kt: 23838.5,
      ytd_shipments_prince_rupert_kt: 3761.6,
      ytd_shipments_thunder_bay_kt: 4641.6,
      ytd_shipments_total_kt: 32241.7,
      ytd_shipments_yoy_pct: 6,
      ytd_shipments_vs_3yr_avg_pct: 8,
    });
  });
});

describe("parseVesselsAndWeather", () => {
  it("parses vessel and weather metrics for Week 36 and Week 37", () => {
    expect(parseVesselsAndWeather(week36.page1, week36.page5)).toMatchObject({
      vessels_vancouver: 37,
      vessels_prince_rupert: 4,
      vessels_cleared_vancouver: 13,
      vessels_cleared_prince_rupert: 1,
      vessels_inbound_next_week: 10,
      vessel_avg_one_year_vancouver: 20,
      vessel_avg_one_year_prince_rupert: 3,
      weather_notes: null,
    });
    expect(parseVesselsAndWeather(week37.page1, week37.page5)).toMatchObject({
      vessels_vancouver: 23,
      vessels_prince_rupert: 1,
      vessels_cleared_vancouver: 19,
      vessels_cleared_prince_rupert: 5,
      vessels_inbound_next_week: 14,
      vessel_avg_one_year_vancouver: 20,
      vessel_avg_one_year_prince_rupert: 2,
      weather_notes: null,
    });
  });
});

describe("parseWeeklyReportFromPages", () => {
  it("parses the full Week 36 fixture row", () => {
    const { row, missingFields } = parseWeeklyReportFromPages({
      1: week36.page1,
      2: week36.page2,
      3: week36.page3,
      5: week36.page5,
    });

    expect(row.grain_week).toBe(36);
    expect(row.report_date).toBe("2026-04-21");
    expect(row.country_stocks_kt).toBe(4374.7);
    expect(row.country_capacity_pct).toBe(82);
    expect(row.terminal_stocks_kt).toBe(1666.7);
    expect(row.terminal_capacity_pct).toBe(87);
    expect(row.country_stocks_mb_kt).toBe(941.4);
    expect(row.country_stocks_sk_kt).toBe(2045.1);
    expect(row.country_stocks_ab_kt).toBe(1370.7);
    expect(row.terminal_stocks_vancouver_kt).toBe(930.3);
    expect(row.terminal_stocks_prince_rupert_kt).toBe(91.4);
    expect(row.terminal_stocks_thunder_bay_kt).toBe(644.3);
    expect(row.terminal_stocks_churchill_kt).toBe(0.7);
    expect(row.country_deliveries_kt).toBe(1092.5);
    expect(row.country_deliveries_yoy_pct).toBe(11);
    expect(row.total_unloads_cars).toBe(11480);
    expect(row.vancouver_unloads_cars).toBe(8322);
    expect(row.prince_rupert_unloads_cars).toBe(1024);
    expect(row.thunder_bay_unloads_cars).toBe(2134);
    expect(row.churchill_unloads_cars).toBe(0);
    expect(row.four_week_avg_unloads).toBe(9614);
    expect(row.var_to_four_week_avg_pct).toBe(19);
    expect(row.out_of_car_time_pct).toBe(10.7);
    expect(row.out_of_car_time_vancouver_pct).toBe(6.3);
    expect(row.out_of_car_time_prince_rupert_pct).toBe(40.2);
    expect(row.ytd_unloads_cars).toBe(331778);
    expect(row.ytd_shipments_vancouver_kt).toBe(23123);
    expect(row.ytd_shipments_prince_rupert_kt).toBe(3664.3);
    expect(row.ytd_shipments_thunder_bay_kt).toBe(4398.7);
    expect(row.ytd_shipments_total_kt).toBe(31186);
    expect(row.ytd_shipments_yoy_pct).toBe(6);
    expect(row.ytd_shipments_vs_3yr_avg_pct).toBe(8);
    expect(row.vessels_vancouver).toBe(37);
    expect(row.vessels_prince_rupert).toBe(4);
    expect(row.vessels_cleared_vancouver).toBe(13);
    expect(row.vessels_cleared_prince_rupert).toBe(1);
    expect(row.vessels_inbound_next_week).toBe(10);
    expect(row.vessel_avg_one_year_vancouver).toBe(20);
    expect(row.vessel_avg_one_year_prince_rupert).toBe(3);
    expect(row.weather_notes).toBeNull();
    expect(missingFields).toEqual(["weather_notes"]);
  });

  it("parses the full Week 37 fixture row", () => {
    const { row, missingFields } = parseWeeklyReportFromPages({
      1: week37.page1,
      2: week37.page2,
      3: week37.page3,
      5: week37.page5,
    });

    expect(row.grain_week).toBe(37);
    expect(row.report_date).toBe("2026-04-28");
    expect(row.country_stocks_kt).toBe(4079.9);
    expect(row.country_capacity_pct).toBe(76);
    expect(row.terminal_stocks_kt).toBe(1579.1);
    expect(row.terminal_capacity_pct).toBe(82);
    expect(row.country_stocks_mb_kt).toBe(888.6);
    expect(row.country_stocks_sk_kt).toBe(1827.2);
    expect(row.country_stocks_ab_kt).toBe(1350.2);
    expect(row.terminal_stocks_vancouver_kt).toBe(859.8);
    expect(row.terminal_stocks_prince_rupert_kt).toBe(134.3);
    expect(row.terminal_stocks_thunder_bay_kt).toBe(584.3);
    expect(row.terminal_stocks_churchill_kt).toBe(0.7);
    expect(row.country_deliveries_kt).toBe(1025.5);
    expect(row.country_deliveries_yoy_pct).toBe(8);
    expect(row.total_unloads_cars).toBe(11230);
    expect(row.vancouver_unloads_cars).toBe(7584);
    expect(row.prince_rupert_unloads_cars).toBe(1489);
    expect(row.thunder_bay_unloads_cars).toBe(2157);
    expect(row.churchill_unloads_cars).toBe(0);
    expect(row.four_week_avg_unloads).toBe(10413);
    expect(row.var_to_four_week_avg_pct).toBe(8);
    expect(row.out_of_car_time_pct).toBe(8.9);
    expect(row.out_of_car_time_vancouver_pct).toBe(10.7);
    expect(row.out_of_car_time_prince_rupert_pct).toBe(10.7);
    expect(row.ytd_unloads_cars).toBe(343008);
    expect(row.ytd_shipments_vancouver_kt).toBe(23838.5);
    expect(row.ytd_shipments_prince_rupert_kt).toBe(3761.6);
    expect(row.ytd_shipments_thunder_bay_kt).toBe(4641.6);
    expect(row.ytd_shipments_total_kt).toBe(32241.7);
    expect(row.ytd_shipments_yoy_pct).toBe(6);
    expect(row.ytd_shipments_vs_3yr_avg_pct).toBe(8);
    expect(row.vessels_vancouver).toBe(23);
    expect(row.vessels_prince_rupert).toBe(1);
    expect(row.vessels_cleared_vancouver).toBe(19);
    expect(row.vessels_cleared_prince_rupert).toBe(5);
    expect(row.vessels_inbound_next_week).toBe(14);
    expect(row.vessel_avg_one_year_vancouver).toBe(20);
    expect(row.vessel_avg_one_year_prince_rupert).toBe(2);
    expect(row.weather_notes).toBeNull();
    expect(missingFields).toEqual(["weather_notes"]);
  });
});
