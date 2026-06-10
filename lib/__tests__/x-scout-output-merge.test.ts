import { describe, expect, it } from "vitest";
import { mergeXScoutOutputs } from "@/lib/x-api/x-scout-output-merge";
import type { XScoutOutput, XScoutSignal } from "@/lib/x-api/x-scout-contract";

function signal(overrides: Partial<XScoutSignal> = {}): XScoutSignal {
  return {
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
    ...overrides,
  };
}

function output(overrides: Partial<XScoutOutput> = {}): XScoutOutput {
  return {
    schema_version: "grok_x_scout_v1",
    run_date: "2026-06-01",
    mode: "daily_pulse",
    search_windows: [
      { label: "last_24h", from_date: "2026-05-31", to_date: "2026-06-01" },
    ],
    signals: [signal()],
    no_signal_notes: [],
    ...overrides,
  };
}

describe("x scout output merge", () => {
  it("dedupes signals while preserving distinct handle-batch results", () => {
    const merged = mergeXScoutOutputs([
      output({ no_signal_notes: ["group 1 searched"] }),
      output({
        signals: [
          signal(),
          signal({
            source_url: "https://x.com/SaskWheat/status/456",
            post_id: "456",
            handle: "SaskWheat",
            summary: "Saskatchewan wheat crop update needs official verification.",
          }),
        ],
        no_signal_notes: ["group 2 searched"],
      }),
    ]);

    expect(merged.signals).toHaveLength(2);
    expect(merged.signals.map((item) => item.handle)).toEqual(["LeftFieldCR", "SaskWheat"]);
    expect(merged.no_signal_notes).toEqual(["group 1 searched", "group 2 searched"]);
  });

  it("rejects merging different run dates or modes", () => {
    expect(() => mergeXScoutOutputs([
      output(),
      output({ mode: "friday_deep" }),
    ])).toThrow(/different run dates or modes/);
  });
});
