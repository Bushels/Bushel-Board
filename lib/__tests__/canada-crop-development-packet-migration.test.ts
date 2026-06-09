import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260603202000_include_canada_development_timing_in_thesis_packet.sql"),
  "utf8",
);

describe("Canada crop-development thesis packet migration", () => {
  it("admits Saskatchewan development timing metrics into the Canada packet", () => {
    expect(migrationSql).toContain("'development_normal_pct'");
    expect(migrationSql).toContain("'development_ahead_pct'");
    expect(migrationSql).toContain("'development_behind_pct'");
    expect(migrationSql).toContain("lower(p_grain) = 'canola' AND lower(cp.crop_name) = 'oilseeds'");
    expect(migrationSql).toContain(
      "lower(p_grain) IN ('wheat', 'durum', 'amber durum', 'barley', 'oats') AND lower(cp.crop_name) = 'spring cereals'",
    );
  });

  it("does not map Saskatchewan development groups onto Corn or Soybeans", () => {
    expect(migrationSql).not.toContain("lower(p_grain) = 'corn' AND lower(cp.crop_name)");
    expect(migrationSql).not.toContain("lower(p_grain) = 'soybeans' AND lower(cp.crop_name)");
  });
});
