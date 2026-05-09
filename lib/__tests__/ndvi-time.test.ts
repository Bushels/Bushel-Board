import { describe, it, expect } from "vitest";
import { snapToModis8Day, buildGibsTileUrl } from "@/lib/utils/ndvi-time";

describe("snapToModis8Day", () => {
  it("snaps an April week to the matching 8-day composite (with lag)", () => {
    // Target 2026-04-26 (a typical USDA week-ending Sunday).
    // After 16-day lag back-step → 2026-04-10, snapped to nearest 8-day
    // boundary → 2026-04-07 (which is composite index 12 of the year).
    expect(snapToModis8Day("2026-04-26")).toBe("2026-04-07");
  });

  it("snaps to Jan 1 for very early dates in a new year", () => {
    // Target 2026-01-05 → 16 days back → 2025-12-20 → Dec composite of 2025.
    // Result should be a 2025 composite, not a 2026 one.
    const result = snapToModis8Day("2026-01-05");
    expect(result.startsWith("2025-")).toBe(true);
  });

  it("returns a valid YYYY-MM-DD format", () => {
    const result = snapToModis8Day("2026-06-15");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("composite indices are exactly 8 days apart", () => {
    // Same calendar year, 8 days apart inputs → composite outputs differ by 8d.
    const a = snapToModis8Day("2026-05-15");
    const b = snapToModis8Day("2026-05-23");
    const aDate = new Date(a);
    const bDate = new Date(b);
    const diffDays =
      (bDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(8);
  });

  it("throws on invalid input", () => {
    expect(() => snapToModis8Day("not-a-date")).toThrow();
  });
});

describe("buildGibsTileUrl", () => {
  it("includes the composite date in the path", () => {
    const url = buildGibsTileUrl("2026-04-07");
    expect(url).toContain("/2026-04-07/");
  });

  it("uses the MODIS_Terra_NDVI_8Day layer", () => {
    expect(buildGibsTileUrl("2026-04-07")).toContain("MODIS_Terra_NDVI_8Day");
  });

  it("ends with the {z}/{y}/{x}.png template placeholders", () => {
    expect(buildGibsTileUrl("2026-04-07")).toMatch(/\{z\}\/\{y\}\/\{x\}\.png$/);
  });
});
