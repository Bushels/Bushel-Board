import { describe, expect, it } from "vitest";

import { assessDeskThesisStaleness } from "@/lib/utils/thesis-staleness";

describe("assessDeskThesisStaleness", () => {
  it("treats the same week and the normal one-week publish lag as fresh", () => {
    expect(assessDeskThesisStaleness(44, 44)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: 44 });
    expect(assessDeskThesisStaleness(43, 44)).toEqual({ isStale: false, ageWeeks: 1, thesisWeek: 43 });
  });

  it("flags a thesis two or more weeks behind the display week as stale", () => {
    expect(assessDeskThesisStaleness(42, 44)).toEqual({ isStale: true, ageWeeks: 2, thesisWeek: 42 });
    // The April 2026 desk outage: week 36 thesis against a week 44 data week.
    expect(assessDeskThesisStaleness(36, 44)).toEqual({ isStale: true, ageWeeks: 8, thesisWeek: 36 });
  });

  it("never reports a future-dated thesis as stale", () => {
    expect(assessDeskThesisStaleness(45, 44)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: 45 });
  });

  it("treats missing weeks as not stale rather than guessing", () => {
    expect(assessDeskThesisStaleness(null, 44)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: null });
    expect(assessDeskThesisStaleness(undefined, 44)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: null });
    expect(assessDeskThesisStaleness(36, null)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: null });
    expect(assessDeskThesisStaleness(Number.NaN, 44)).toEqual({ isStale: false, ageWeeks: 0, thesisWeek: null });
  });
});
