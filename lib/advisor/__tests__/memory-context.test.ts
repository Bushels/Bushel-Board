import { describe, expect, it } from "vitest";

import {
  buildDurableMemoryContext,
  type FarmerMemoryRow,
} from "../context-builder";

describe("buildDurableMemoryContext", () => {
  const nowIso = "2026-05-16T00:00:00Z";

  it("keeps stable profile and preference memory while excluding stale recommendation memory", () => {
    const rows: FarmerMemoryRow[] = [
      {
        memory_key: "farm_size_acres",
        memory_value: "2800",
        grain: null,
        updated_at: "2026-05-10T00:00:00Z",
      },
      {
        memory_key: "preferred_elevator",
        memory_value: "Regina Inland",
        grain: "Canola",
        updated_at: "2026-05-14T00:00:00Z",
      },
      {
        memory_key: "last_rec_canola",
        memory_value: '{"stance":"Bullish +20","recommendation":"hold"}',
        grain: "Canola",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = buildDurableMemoryContext(rows, nowIso);

    expect(result.stableProfile).toContain("farm_size_acres: 2800");
    expect(result.lastConfirmedPreferences).toContain("preferred_elevator (Canola): Regina Inland");
    expect(result.excludedCount).toBe(1);
  });

  it("adds open questions when volatile or low-confidence style keys are encountered", () => {
    const rows: FarmerMemoryRow[] = [
      {
        memory_key: "weather_rumor",
        memory_value: "frost maybe",
        grain: "Canola",
        updated_at: "2026-05-15T00:00:00Z",
      },
    ];

    const result = buildDurableMemoryContext(rows, nowIso);

    expect(result.openQuestions.length).toBeGreaterThan(0);
    expect(result.openQuestions[0]).toContain("weather_rumor");
    expect(result.stableProfile).toHaveLength(0);
    expect(result.lastConfirmedPreferences).toHaveLength(0);
  });
});
