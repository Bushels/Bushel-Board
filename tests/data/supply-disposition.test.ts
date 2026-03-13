import { describe, it, expect } from "vitest";

// Test the AAFC data integrity (hardcoded values should sum correctly)
describe("AAFC Supply Disposition Data", () => {
  const wheatData = {
    carry_in: 4112,
    production: 36624,
    imports: 105,
    total_supply: 40841,
    exports: 27700,
    food_industrial: 3500,
    feed_waste: 3481,
    seed: 1060,
    total_domestic: 8041,
    carry_out: 5100,
  };

  it("total_supply = carry_in + production + imports", () => {
    expect(wheatData.carry_in + wheatData.production + wheatData.imports).toBe(
      wheatData.total_supply
    );
  });

  it("total_domestic = food_industrial + feed_waste + seed", () => {
    expect(
      wheatData.food_industrial + wheatData.feed_waste + wheatData.seed
    ).toBe(wheatData.total_domestic);
  });

  it("total_supply = exports + total_domestic + carry_out", () => {
    expect(
      wheatData.exports + wheatData.total_domestic + wheatData.carry_out
    ).toBe(wheatData.total_supply);
  });
});
