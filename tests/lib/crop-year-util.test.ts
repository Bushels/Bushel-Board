import { describe, it, expect } from "vitest";
import { getCurrentCropYear, cropYearLabel, cropYearStartDate } from "@/lib/utils/crop-year";

describe("getCurrentCropYear", () => {
  it("returns 2025-26 for dates in Aug-Dec 2025", () => {
    expect(getCurrentCropYear(new Date(2025, 7, 1))).toBe("2025-26");   // Aug 1
    expect(getCurrentCropYear(new Date(2025, 9, 15))).toBe("2025-26");  // Oct 15
    expect(getCurrentCropYear(new Date(2025, 11, 31))).toBe("2025-26"); // Dec 31
  });

  it("returns 2025-26 for dates in Jan-Jul 2026", () => {
    expect(getCurrentCropYear(new Date(2026, 0, 1))).toBe("2025-26");   // Jan 1
    expect(getCurrentCropYear(new Date(2026, 2, 5))).toBe("2025-26");   // Mar 5
    expect(getCurrentCropYear(new Date(2026, 6, 31))).toBe("2025-26");  // Jul 31
  });

  it("rolls over to 2026-27 on Aug 1 2026", () => {
    expect(getCurrentCropYear(new Date(2026, 7, 1))).toBe("2026-27");
  });

  it("handles century boundary correctly", () => {
    expect(getCurrentCropYear(new Date(2099, 8, 1))).toBe("2099-00");
  });
});

describe("cropYearLabel", () => {
  it("defaults to current crop year with 'Crop Year' suffix", () => {
    const label = cropYearLabel();
    expect(label).toMatch(/^\d{4}-\d{2} Crop Year$/);
  });

  it("uses provided crop year and suffix", () => {
    expect(cropYearLabel("2024-25", "Season")).toBe("2024-25 Season");
  });
});

describe("cropYearStartDate", () => {
  it("returns Aug 1 of the start year", () => {
    const date = cropYearStartDate("2025-26");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(7); // Aug = 7
    expect(date.getDate()).toBe(1);
  });
});
