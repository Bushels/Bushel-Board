import { describe, expect, it } from "vitest";
import { normalizeUsKeySignals } from "@/lib/queries/us-market-stance";

describe("normalizeUsKeySignals", () => {
  it("splits bullish and bearish signals into separate bullet arrays", () => {
    const input = [
      { signal: "bullish", title: "Futures Rally", body: "Up 2.2% today.", source: "Yahoo" },
      { signal: "bearish", title: "Weak Exports", body: "Net sales 757 MT.", source: "USDA" },
      { signal: "watch", title: "Weather watch", body: "Rain expected.", source: "NOAA" },
    ];

    const result = normalizeUsKeySignals(input);

    expect(result.bullPoints).toEqual([
      { fact: "Futures Rally", reasoning: "Up 2.2% today." },
    ]);
    expect(result.bearPoints).toEqual([
      { fact: "Weak Exports", reasoning: "Net sales 757 MT." },
    ]);
  });

  it("returns empty arrays when input is null or empty", () => {
    expect(normalizeUsKeySignals(null)).toEqual({ bullPoints: [], bearPoints: [] });
    expect(normalizeUsKeySignals([])).toEqual({ bullPoints: [], bearPoints: [] });
  });

  it("ignores malformed entries missing title or body", () => {
    const input = [
      { signal: "bullish", title: "", body: "no title" },
      { signal: "bullish", title: "No body", body: "" },
      { signal: "bullish", title: "Good", body: "Good reason." },
    ];
    const result = normalizeUsKeySignals(input);
    expect(result.bullPoints).toEqual([{ fact: "Good", reasoning: "Good reason." }]);
    expect(result.bearPoints).toEqual([]);
  });
});
