import { describe, it, expect } from "vitest";
import { generateLogisticsHeadline } from "@/lib/queries/logistics";

describe("generateLogisticsHeadline", () => {
  it("returns vessel congestion headline when vessels exceed average", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 26,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 12,
      ytd_shipments_yoy_pct: 3,
      grain_week: 30,
    });
    expect(result.headline).toContain("26");
    expect(result.headline).toContain("Ship");
  });

  it("returns rail bottleneck headline when OCT is high", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 18,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 25,
      ytd_shipments_yoy_pct: 2,
      grain_week: 30,
    });
    expect(result.headline).toContain("Rail");
  });

  it("returns export pace headline when YoY shipments are strong", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 18,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 8,
      ytd_shipments_yoy_pct: 8,
      grain_week: 30,
    });
    expect(result.headline).toContain("Export");
  });

  it("returns fallback headline when no thresholds triggered", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 19,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 12,
      ytd_shipments_yoy_pct: 1,
      grain_week: 30,
    });
    expect(result.headline).toContain("Week 30");
  });

  it("prioritizes vessel congestion over other signals", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 30,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 25,
      ytd_shipments_yoy_pct: 10,
      grain_week: 30,
    });
    expect(result.headline).toContain("Ship");
  });
});
