import { describe, it, expect } from "vitest";
import { cadRowSchema, usRowSchema, writeEnvelope } from "../../scripts/desk/schemas";

describe("cadRowSchema", () => {
  it("applies NOT-NULL defaults", () => {
    const r = cadRowSchema.parse({
      grain: "Wheat",
      stance_score: 0,
      initial_thesis: "t",
      bull_case: "b",
      bear_case: "x",
      data_freshness: {},
    });
    expect(r.key_signals).toEqual([]);
    expect(r.historical_context).toEqual({});
    expect(r.bull_reasoning).toEqual([]);
    expect(r.data_confidence).toBe("medium");
    expect(r.confidence_score).toBeNull();
    expect(r.evidence).toBe("");
  });

  it("rejects a non-canonical grain name", () => {
    expect(() =>
      cadRowSchema.parse({
        grain: "Sunflower Seed", // wrong variant — should be "Sunflower"
        stance_score: 0,
        initial_thesis: "t",
        bull_case: "b",
        bear_case: "x",
        data_freshness: {},
      }),
    ).toThrow();
  });

  it("rejects out-of-range stance_score", () => {
    expect(() =>
      cadRowSchema.parse({
        grain: "Wheat",
        stance_score: 200,
        initial_thesis: "t",
        bull_case: "b",
        bear_case: "x",
        data_freshness: {},
      }),
    ).toThrow();
  });

  it("requires data_freshness (score_trajectory.data_freshness is NOT NULL)", () => {
    expect(() =>
      cadRowSchema.parse({
        grain: "Wheat",
        stance_score: 0,
        initial_thesis: "t",
        bull_case: "b",
        bear_case: "x",
      }),
    ).toThrow();
  });
});

describe("usRowSchema", () => {
  it("requires recommendation (us_market_analysis.recommendation is NOT NULL)", () => {
    expect(() =>
      usRowSchema.parse({
        market_name: "Corn",
        stance_score: 0,
        initial_thesis: "t",
        bull_case: "b",
        bear_case: "x",
      }),
    ).toThrow();
  });

  it("parses a valid US row with defaults", () => {
    const r = usRowSchema.parse({
      market_name: "Corn",
      stance_score: 0,
      initial_thesis: "t",
      bull_case: "b",
      bear_case: "x",
      recommendation: "HOLD",
    });
    expect(r.market_name).toBe("Corn");
    expect(r.key_signals).toEqual([]);
    expect(r.data_freshness).toEqual({});
  });
});

describe("writeEnvelope discriminated union", () => {
  it("parses a CAD envelope", () => {
    const e = writeEnvelope.parse({
      side: "cad",
      crop_year: "2025-2026",
      grain_week: 35,
      rows: [
        {
          grain: "Canola",
          stance_score: 10,
          initial_thesis: "t",
          bull_case: "b",
          bear_case: "x",
          data_freshness: {},
        },
      ],
    });
    expect(e.side).toBe("cad");
    if (e.side === "cad") expect(e.grain_week).toBe(35);
  });

  it("parses a US envelope", () => {
    const e = writeEnvelope.parse({
      side: "us",
      crop_year: "2025-2026",
      market_year: 2025,
      week_ending: "2026-06-12",
      rows: [
        {
          market_name: "Corn",
          stance_score: 10,
          initial_thesis: "t",
          bull_case: "b",
          bear_case: "x",
          recommendation: "HOLD",
        },
      ],
    });
    expect(e.side).toBe("us");
    if (e.side === "us") expect(e.market_year).toBe(2025);
  });
});
