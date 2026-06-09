import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260603211000_include_canada_soil_moisture_in_thesis_packet.sql"),
  "utf8",
);

describe("Canada crop-moisture thesis packet migration", () => {
  it("admits bounded cropland and surface-soil moisture into the Canada packet", () => {
    expect(migrationSql).toContain("cp.metric = 'soil_moisture_adequate_surplus_pct'");
    expect(migrationSql).toContain("lower(cp.crop_name) IN ('cropland', 'all crops')");
    expect(migrationSql).toContain("lower(p_grain) IN ('canola', 'wheat', 'durum', 'amber durum', 'barley', 'oats')");
  });

  it("does not map broad moisture rows onto Corn or Soybeans", () => {
    const soilMoistureBlock = migrationSql.slice(
      migrationSql.indexOf("cp.metric = 'soil_moisture_adequate_surplus_pct'"),
      migrationSql.indexOf("ORDER BY cp.report_date DESC, cp.metric, cp.province_code"),
    );

    expect(soilMoistureBlock).not.toContain("'corn'");
    expect(soilMoistureBlock).not.toContain("'soybeans'");
  });
});
