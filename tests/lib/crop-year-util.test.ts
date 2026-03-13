import { describe, it, expect } from "vitest";
import { getCurrentCropYear, cropYearLabel, cropYearStartDate, toShortFormat } from "@/lib/utils/crop-year";

describe("getCurrentCropYear", () => {
  it("returns long format 2025-2026 for dates in Aug-Dec 2025", () => {
    expect(getCurrentCropYear(new Date(2025, 7, 1))).toBe("2025-2026");   // Aug 1
    expect(getCurrentCropYear(new Date(2025, 9, 15))).toBe("2025-2026");  // Oct 15
    expect(getCurrentCropYear(new Date(2025, 11, 31))).toBe("2025-2026"); // Dec 31
  });

  it("returns 2025-2026 for dates in Jan-Jul 2026", () => {
    expect(getCurrentCropYear(new Date(2026, 0, 1))).toBe("2025-2026");   // Jan 1
    expect(getCurrentCropYear(new Date(2026, 2, 5))).toBe("2025-2026");   // Mar 5
    expect(getCurrentCropYear(new Date(2026, 6, 31))).toBe("2025-2026");  // Jul 31
  });

  it("rolls over to 2026-2027 on Aug 1 2026", () => {
    expect(getCurrentCropYear(new Date(2026, 7, 1))).toBe("2026-2027");
  });

  it("handles century boundary correctly", () => {
    expect(getCurrentCropYear(new Date(2099, 8, 1))).toBe("2099-2100");
  });
});

describe("toShortFormat", () => {
  it("converts long format to short", () => {
    expect(toShortFormat("2025-2026")).toBe("2025-26");
    expect(toShortFormat("2099-2100")).toBe("2099-00");
  });

  it("passes through short format unchanged", () => {
    expect(toShortFormat("2025-26")).toBe("2025-26");
  });
});

describe("cropYearLabel", () => {
  it("defaults to current crop year with 'Crop Year' suffix in short display format", () => {
    const label = cropYearLabel();
    expect(label).toMatch(/^\d{4}-\d{2} Crop Year$/);
  });

  it("uses provided crop year (converts long to short) and suffix", () => {
    expect(cropYearLabel("2024-2025", "Season")).toBe("2024-25 Season");
  });

  it("handles short format input gracefully", () => {
    expect(cropYearLabel("2024-25", "Season")).toBe("2024-25 Season");
  });
});

describe("cropYearStartDate", () => {
  it("returns Aug 1 of the start year from long format", () => {
    const date = cropYearStartDate("2025-2026");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(7); // Aug = 7
    expect(date.getDate()).toBe(1);
  });

  it("also works with short format", () => {
    const date = cropYearStartDate("2025-26");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(7);
  });
});
