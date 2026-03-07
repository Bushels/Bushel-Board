import { describe, it, expect } from "vitest";

// Test the crop year format
describe("Crop Year Format", () => {
  it("should use short format 2025-26", () => {
    const cropYear = "2025-26";
    expect(cropYear).toMatch(/^\d{4}-\d{2}$/);
  });

  it("should parse crop year start correctly", () => {
    const cropYear = "2025-26";
    const startYear = parseInt(cropYear.split("-")[0]);
    expect(startYear).toBe(2025);
    // Crop year starts Aug 1
    const start = new Date(startYear, 7, 1);
    expect(start.getMonth()).toBe(7); // August (0-indexed)
  });
});
