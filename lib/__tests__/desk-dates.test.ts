import { describe, it, expect } from "vitest";
import { mostRecentFriday, isoWeekNumber, ageInDays } from "../../scripts/desk/dates";

describe("mostRecentFriday", () => {
  it("returns the same date when input is a Friday", () => {
    // 2026-06-19 is a Friday
    expect(mostRecentFriday(new Date("2026-06-19T20:00:00Z"))).toBe("2026-06-19");
  });
  it("walks back to the prior Friday on other weekdays", () => {
    // 2026-06-16 is a Tuesday -> prior Friday 2026-06-12
    expect(mostRecentFriday(new Date("2026-06-16T12:00:00Z"))).toBe("2026-06-12");
  });
  it("always yields a Friday no later than the input", () => {
    const input = new Date("2026-03-04T00:00:00Z");
    const result = mostRecentFriday(input);
    expect(new Date(`${result}T00:00:00Z`).getUTCDay()).toBe(5);
    expect(new Date(`${result}T00:00:00Z`).getTime()).toBeLessThanOrEqual(input.getTime());
  });
});

describe("isoWeekNumber", () => {
  it("computes ISO-8601 week numbers", () => {
    expect(isoWeekNumber(new Date("2026-01-01T00:00:00Z"))).toBe(1); // Thursday -> week 1
    expect(isoWeekNumber(new Date("2026-01-08T00:00:00Z"))).toBe(2);
    expect(isoWeekNumber(new Date("2026-06-19T00:00:00Z"))).toBe(25);
  });
});

describe("ageInDays", () => {
  it("returns whole-day age", () => {
    expect(ageInDays("2026-06-12T00:00:00Z", new Date("2026-06-16T12:00:00Z"))).toBe(4);
  });
  it("treats null/invalid as null (missing source)", () => {
    expect(ageInDays(null, new Date())).toBeNull();
    expect(ageInDays("not-a-date", new Date())).toBeNull();
  });
});
