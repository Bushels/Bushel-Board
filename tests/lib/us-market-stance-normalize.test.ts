import { describe, expect, it } from "vitest";
import { normalizeUsKeySignals, parseBulletedText } from "@/lib/queries/us-market-stance";

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

  describe("fallback path", () => {
    it("parses bull_case and bear_case text when key_signals is a flat string array", () => {
      const flatSignals = [
        "EPA RFS 26.81B RINs finalized",
        "AFBF 30% affordability",
      ];
      const fallback = {
        bull_case:
          "• EPA RFS 26.81B RINs finalized — locks in ethanol demand through 2026\n• Urea +48% YoY — input-cost shock",
        bear_case:
          "• Export pace 9% of USDA target — structurally catastrophic\n• Brazil safrinha flood — 110.5 MMT",
      };

      const result = normalizeUsKeySignals(flatSignals, fallback);

      expect(result.bullPoints).toEqual([
        {
          fact: "EPA RFS 26.81B RINs finalized",
          reasoning: "locks in ethanol demand through 2026",
        },
        { fact: "Urea +48% YoY", reasoning: "input-cost shock" },
      ]);
      expect(result.bearPoints).toEqual([
        {
          fact: "Export pace 9% of USDA target",
          reasoning: "structurally catastrophic",
        },
        { fact: "Brazil safrinha flood", reasoning: "110.5 MMT" },
      ]);
    });

    it("fallback is ignored when structured key_signals already produced bullets", () => {
      const structured = [
        { signal: "bullish", title: "Struct Bull", body: "Structured body" },
      ];
      const fallback = {
        bull_case: "• Fallback bull — should not appear",
        bear_case: "• Fallback bear — should not appear",
      };

      const result = normalizeUsKeySignals(structured, fallback);

      expect(result.bullPoints).toEqual([
        { fact: "Struct Bull", reasoning: "Structured body" },
      ]);
      expect(result.bearPoints).toEqual([]);
    });

    it("handles missing bull_case or bear_case gracefully", () => {
      const result = normalizeUsKeySignals([], { bull_case: null, bear_case: null });
      expect(result).toEqual({ bullPoints: [], bearPoints: [] });
    });
  });
});

describe("parseBulletedText", () => {
  it("splits em-dash separated bullets into fact and reasoning", () => {
    const text = "• Fact one — Reasoning one\n• Fact two — Reasoning two";
    expect(parseBulletedText(text)).toEqual([
      { fact: "Fact one", reasoning: "Reasoning one" },
      { fact: "Fact two", reasoning: "Reasoning two" },
    ]);
  });

  it("accepts en-dash and ASCII hyphen separators", () => {
    const text = "• Fact A – Reason A\n- Fact B - Reason B";
    expect(parseBulletedText(text)).toEqual([
      { fact: "Fact A", reasoning: "Reason A" },
      { fact: "Fact B", reasoning: "Reason B" },
    ]);
  });

  it("falls back to colon separator", () => {
    const text = "Key takeaway: the market is tight";
    expect(parseBulletedText(text)).toEqual([
      { fact: "Key takeaway", reasoning: "the market is tight" },
    ]);
  });

  it("preserves hyphenated tokens like '4-8 weeks' by requiring surrounding whitespace", () => {
    // Without whitespace around the hyphen, "4-8 weeks" should not be split
    const text = "• Timeline 4-8 weeks — Section 301 hearing Apr 28";
    expect(parseBulletedText(text)).toEqual([
      { fact: "Timeline 4-8 weeks", reasoning: "Section 301 hearing Apr 28" },
    ]);
  });

  it("accepts lines with no separator as fact-only bullets", () => {
    const text = "• Something happened\n• Something else";
    expect(parseBulletedText(text)).toEqual([
      { fact: "Something happened", reasoning: "" },
      { fact: "Something else", reasoning: "" },
    ]);
  });

  it("strips bullet markers and handles mixed prefixes", () => {
    const text = "• First — A\n* Second — B\n- Third — C\n· Fourth — D\nFifth — E";
    expect(parseBulletedText(text)).toEqual([
      { fact: "First", reasoning: "A" },
      { fact: "Second", reasoning: "B" },
      { fact: "Third", reasoning: "C" },
      { fact: "Fourth", reasoning: "D" },
      { fact: "Fifth", reasoning: "E" },
    ]);
  });

  it("returns [] for null, undefined, empty, or non-string input", () => {
    expect(parseBulletedText(null)).toEqual([]);
    expect(parseBulletedText(undefined)).toEqual([]);
    expect(parseBulletedText("")).toEqual([]);
    expect(parseBulletedText("   \n  \n")).toEqual([]);
  });
});
