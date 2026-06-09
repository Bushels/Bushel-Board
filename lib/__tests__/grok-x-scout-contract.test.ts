import { describe, expect, it } from "vitest";
import { extractGrokXScoutJsonPayload, parseGrokXScoutJson } from "@/lib/x-api/x-scout-contract";

describe("grok x scout contract", () => {
  it("parses strict JSON scout output", () => {
    const parsed = parseGrokXScoutJson(JSON.stringify({
      schema_version: "grok_x_scout_v1",
      run_date: "2026-06-01",
      mode: "daily_pulse",
      search_windows: [
        { label: "last_24h", from_date: "2026-05-31", to_date: "2026-06-01" },
      ],
      signals: [
        {
          source_url: "https://x.com/LeftFieldCR/status/123",
          post_id: "123",
          handle: "LeftFieldCR",
          posted_at: "2026-06-01T15:00:00Z",
          raw_quote: "Planting progress is lagging.",
          summary: "Prairie wheat planting progress is lagging.",
          primary_grain: "Wheat",
          affected_grains: ["Wheat"],
          affected_regions: ["Saskatchewan"],
          category: "weather",
          direction: "bullish",
          time_sensitivity: "same_day",
          seasonal_phase: "planting",
          why_it_matters: "Delayed planting can tighten yield expectations.",
          confidence: 0.72,
          needs_official_verification: true,
          claimed_numbers: [],
        },
      ],
      no_signal_notes: [],
    }));

    expect(parsed.schema_version).toBe("grok_x_scout_v1");
    expect(parsed.signals[0]?.handle).toBe("LeftFieldCR");
  });

  it("unwraps Grok CLI json output before contract validation", () => {
    const inner = JSON.stringify({
      schema_version: "grok_x_scout_v1",
      run_date: "2026-06-01",
      mode: "manual_test",
      search_windows: [
        { label: "manual", from_date: "2026-05-31", to_date: "2026-06-01" },
      ],
      signals: [],
      no_signal_notes: ["No source-linked X signal found."],
    });
    const cliOutput = JSON.stringify({
      text: inner,
      stopReason: "EndTurn",
      sessionId: "019e818d-e0c6-7443-992a-b4dcabaab8f4",
    });

    expect(extractGrokXScoutJsonPayload(cliOutput)).toBe(inner);
    expect(parseGrokXScoutJson(cliOutput).mode).toBe("manual_test");
  });

  it("normalizes common Grok category drift and trims overlong raw quotes", () => {
    const parsed = parseGrokXScoutJson(JSON.stringify({
      schema_version: "grok_x_scout_v1",
      run_date: "2026-06-01",
      mode: "daily_pulse",
      search_windows: [
        { label: "daily", from_date: "2026-05-31", to_date: "2026-06-01" },
      ],
      signals: [
        {
          source_url: "https://x.com/saskfarmguy/status/2060962174974251415",
          post_id: "2060962174974251415",
          handle: "saskfarmguy",
          posted_at: "2026-05-31T05:50:47Z",
          raw_quote: "x".repeat(340),
          summary: "Northeast Saskatchewan producer reports seeding progress.",
          primary_grain: "Wheat",
          affected_grains: ["Wheat", "Canola"],
          affected_regions: ["Saskatchewan"],
          category: "planting_progress",
          direction: "neutral",
          time_sensitivity: "near_term",
          seasonal_phase: "planting",
          why_it_matters: "Specific local progress from an active Saskatchewan operation.",
          confidence: 0.79,
          needs_official_verification: true,
          claimed_numbers: [],
        },
      ],
      no_signal_notes: [],
    }));

    expect(parsed.signals[0]!.category).toBe("farmer_report");
    expect(parsed.signals[0]!.raw_quote).toHaveLength(280);
  });

  it("rejects prose or unknown schema versions", () => {
    expect(() => parseGrokXScoutJson("not json")).toThrow(/not valid JSON/);
    expect(() => parseGrokXScoutJson(JSON.stringify({
      schema_version: "old",
      run_date: "2026-06-01",
      mode: "daily_pulse",
      search_windows: [],
      signals: [],
      no_signal_notes: [],
    }))).toThrow(/schema validation/);
  });
});
