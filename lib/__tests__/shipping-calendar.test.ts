import { describe, expect, it } from "vitest";
import {
  buildShippingCalendar,
  getSeasonalContext,
  type ShippingCalendar,
} from "../shipping-calendar";

describe("getSeasonalContext", () => {
  it("returns harvest context for weeks 1-8", () => {
    const ctx = getSeasonalContext(5);
    expect(ctx).toContain("harvest");
  });

  it("returns peak shipping for weeks 9-17", () => {
    const ctx = getSeasonalContext(12);
    expect(ctx).toContain("shipping");
  });

  it("returns mid-shipping for weeks 18-26", () => {
    const ctx = getSeasonalContext(22);
    expect(ctx).toContain("export");
  });

  it("returns late shipping for weeks 27-35", () => {
    const ctx = getSeasonalContext(30);
    expect(ctx).toContain("seeding");
  });

  it("returns growing season for weeks 36-44", () => {
    const ctx = getSeasonalContext(40);
    expect(ctx).toContain("Weather");
  });

  it("returns pre-harvest for weeks 45-52", () => {
    const ctx = getSeasonalContext(48);
    expect(ctx).toContain("New-crop");
  });
});

describe("buildShippingCalendar", () => {
  it("computes data lag correctly", () => {
    const cal = buildShippingCalendar(33, 31, "2025-2026");
    expect(cal.currentCalendarWeek).toBe(33);
    expect(cal.latestDataWeek).toBe(31);
    expect(cal.dataLag).toBe(2);
  });

  it("formats prompt text with all fields", () => {
    const cal = buildShippingCalendar(33, 31, "2025-2026");
    expect(cal.promptText).toContain("week: 33");
    expect(cal.promptText).toContain("Week 31");
    expect(cal.promptText).toContain("2 weeks");
    expect(cal.promptText).toContain("Thursday");
  });
});
