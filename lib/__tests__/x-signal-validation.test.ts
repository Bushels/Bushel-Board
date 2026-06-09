import { describe, expect, it } from "vitest";
import { validateXScoutSignal } from "@/lib/x-api/x-signal-validation";
import type { XScoutSignal } from "@/lib/x-api/x-scout-contract";

function baseSignal(overrides: Partial<XScoutSignal> = {}): XScoutSignal {
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

describe("x signal validation", () => {
  it("accepts source-linked V1 grain evidence", () => {
    const result = validateXScoutSignal(baseSignal(), {
      runDate: "2026-06-01",
      mode: "daily_pulse",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.signalHash).toHaveLength(64);
    expect(result.metadata.source_tier).toBe("tier1");
    expect(result.metadata.corroboration).toEqual({
      same_claim_count: 0,
      independent_sources: [],
      official_source_match: false,
    });
    expect(result.metadata.affected_decisions).toEqual([
      "watch_directional_risk",
      "watch_seeding_progress",
      "watch_yield_risk",
    ]);
  });

  it("rejects unsupported grains and advice language", () => {
    const result = validateXScoutSignal(
      baseSignal({
        primary_grain: "Flaxseed",
        affected_grains: ["Flaxseed"],
        summary: "Buy flax now because the trade is obvious.",
      }),
      {
        runDate: "2026-06-01",
        mode: "daily_pulse",
        priceSnapshotStatus: "fresh",
      },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("forbidden_advice_language");
    expect(result.reasons.some((reason) => reason.startsWith("unsupported_grain"))).toBe(true);
  });

  it("rejects pricing and hedging advice phrasing before X evidence can reach the board", () => {
    for (const summary of [
      "This is a pricing recommendation for canola.",
      "That basis move is a pricing call.",
      "Treat this as trading advice.",
      "This is hedging advice.",
      "Fresh market recommendation for wheat.",
    ]) {
      const result = validateXScoutSignal(
        baseSignal({
          summary,
          primary_grain: "Canola",
          affected_grains: ["Canola"],
          category: "basis",
        }),
        {
          runDate: "2026-06-01",
          mode: "daily_pulse",
          priceSnapshotStatus: "fresh",
        },
      );

      expect(result.accepted).toBe(false);
      expect(result.reasons).toContain("forbidden_advice_language");
    }
  });

  it("requires fresh prices for price-sensitive signals", () => {
    const result = validateXScoutSignal(
      baseSignal({
        category: "basis",
        summary: "Canola basis bids firmed today.",
        primary_grain: "Canola",
        affected_grains: ["Canola"],
      }),
      {
        runDate: "2026-06-01",
        mode: "daily_pulse",
        priceSnapshotStatus: "stale",
      },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("price_context_not_fresh:stale");
  });

  it("rejects signals without an affected region", () => {
    const result = validateXScoutSignal(baseSignal({ affected_regions: [] }), {
      runDate: "2026-06-01",
      mode: "daily_pulse",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("missing_affected_region");
  });

  it("rejects numeric claims that Grok does not flag for official verification", () => {
    const result = validateXScoutSignal(
      baseSignal({
        needs_official_verification: false,
        claimed_numbers: [
          {
            label: "planting progress",
            value: "14%",
            source_text: "14% seeded",
          },
        ],
      }),
      {
        runDate: "2026-06-01",
        mode: "daily_pulse",
        priceSnapshotStatus: "fresh",
      },
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("numeric_claim_missing_official_verification");
    expect(result.metadata.blocked_claims).toContain("Numeric claim was not flagged for official verification.");
  });

  it("rejects daily pulse posts outside the one-day search window", () => {
    const result = validateXScoutSignal(baseSignal({ posted_at: "2026-05-29T15:00:00Z" }), {
      runDate: "2026-06-01",
      mode: "daily_pulse",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("outside_search_window:daily_pulse");
  });

  it("allows Friday deep posts within seven days", () => {
    const result = validateXScoutSignal(baseSignal({ posted_at: "2026-05-26T15:00:00Z" }), {
      runDate: "2026-06-01",
      mode: "friday_deep",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects Friday deep posts outside the seven-day search window", () => {
    const result = validateXScoutSignal(baseSignal({ posted_at: "2026-05-20T15:00:00Z" }), {
      runDate: "2026-06-01",
      mode: "friday_deep",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("outside_search_window:friday_deep");
  });

  it("rejects future-dated posts", () => {
    const result = validateXScoutSignal(baseSignal({ posted_at: "2026-06-02T01:00:00Z" }), {
      runDate: "2026-06-01",
      mode: "daily_pulse",
      priceSnapshotStatus: "fresh",
    });

    expect(result.accepted).toBe(false);
    expect(result.reasons).toContain("future_post_date");
  });
});
