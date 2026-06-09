import { describe, expect, it } from "vitest";
import { track54AutomationDateKey, track54CompletedAutomationDateKey } from "@/lib/x-api/track54-date";

describe("Track 54 automation date", () => {
  it("uses the Mountain-time automation calendar instead of UTC", () => {
    expect(track54AutomationDateKey(new Date("2026-06-02T04:17:00.000Z"))).toBe("2026-06-01");
    expect(track54AutomationDateKey(new Date("2026-06-02T22:10:00.000Z"))).toBe("2026-06-02");
  });

  it("keeps the current local weekday eligible before the daily artifact cutoff", () => {
    expect(track54CompletedAutomationDateKey(new Date("2026-06-02T06:01:00.000Z"))).toBe("2026-06-01");
    expect(track54CompletedAutomationDateKey(new Date("2026-06-02T22:10:00.000Z"))).toBe("2026-06-02");
  });

  it("rolls back over weekends and Friday-deep cutoffs", () => {
    expect(track54CompletedAutomationDateKey(new Date("2026-06-08T15:00:00.000Z"))).toBe("2026-06-05");
    expect(track54CompletedAutomationDateKey(new Date("2026-06-05T22:49:00.000Z"), {
      activeWeekdays: [5],
      cutoffHour: 16,
      cutoffMinute: 50,
    })).toBe("2026-05-29");
    expect(track54CompletedAutomationDateKey(new Date("2026-06-05T22:50:00.000Z"), {
      activeWeekdays: [5],
      cutoffHour: 16,
      cutoffMinute: 50,
    })).toBe("2026-06-05");
  });
});
