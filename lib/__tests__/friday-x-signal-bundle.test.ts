import { describe, expect, it } from "vitest";
import {
  buildFridayXSignalBundleFromRows,
  latestScoutRunForMode,
  resolveLatestCgcWeekFromRows,
} from "@/scripts/build-friday-x-signal-bundle";

function deskReadySignal(overrides: Record<string, unknown> = {}) {
  const metadataOverride =
    typeof overrides.signal_metadata === "object" &&
    overrides.signal_metadata !== null &&
    !Array.isArray(overrides.signal_metadata)
      ? (overrides.signal_metadata as Record<string, unknown>)
      : {};
  const rowOverrides = { ...overrides };
  delete rowOverrides.signal_metadata;

  return {
    id: "signal-1",
    grain: "Canola",
    crop_year: "2025-2026",
    grain_week: 42,
    scout_run_id: "run-1",
    primary_impact_grain: "Canola",
    affected_grains: ["Canola"],
    affected_regions: ["Saskatchewan"],
    affected_decisions: ["watch_basis"],
    sentiment: "bearish",
    category: "price",
    relevance_score: 96,
    confidence_score: 84,
    source_cred_tier: "tier1",
    search_mode: "deep",
    post_author: "trusted",
    post_url: "https://x.com/trusted/status/1",
    post_date: "2026-06-01T20:00:00Z",
    post_summary: "Canola futures softened after fresh settlement.",
    signal_metadata: {
      schema_version: "x_signal_metadata_v1",
      staleness_class: "same_day",
      allowed_claims: ["Source URL present."],
      blocked_claims: [],
      needs_official_verification: false,
      corroboration: {
        same_claim_count: 1,
        independent_sources: ["SaskWheat"],
        official_source_match: false,
      },
      ...metadataOverride,
    },
    ...rowOverrides,
  };
}

describe("friday x signal bundle", () => {
  it("resolves the newest crop year before comparing grain-week numbers", () => {
    expect(resolveLatestCgcWeekFromRows([
      { crop_year: "2024-2025", grain_week: 52 },
      { crop_year: "2025-2026", grain_week: 42 },
      { crop_year: "2025-2026", grain_week: 41 },
    ])).toEqual({ cropYear: "2025-2026", grainWeek: 42 });
  });

  it("selects scout run provenance by requested bundle mode", () => {
    const rows = [
      {
        id: "daily-newer",
        mode: "daily_pulse",
        run_started_at: "2026-06-05T22:00:00Z",
        rejected_signal_count: 7,
      },
      {
        id: "friday-older",
        mode: "friday_deep",
        run_started_at: "2026-06-05T21:00:00Z",
        rejected_signal_count: 2,
      },
    ];

    expect(latestScoutRunForMode(rows, "friday_deep")).toMatchObject({ id: "friday-older" });
    expect(latestScoutRunForMode(rows, "daily_pulse")).toMatchObject({ id: "daily-newer" });
  });

  it("does not attach daily-pulse run context to a friday-deep bundle", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      mode: "friday_deep",
      run: {
        id: "daily-run",
        mode: "daily_pulse",
        rejected_signal_count: 3,
      },
      signalRows: [],
      priceRows: [],
    });

    expect(bundle.mode).toBe("friday_deep");
    expect(bundle.run).toBeNull();
    expect(bundle.counts.rejected_from_latest_run).toBeNull();
  });

  it("keeps only accepted current-week X scout signals with validation metadata", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      builtAt: "2026-06-01T22:00:00Z",
      run: { rejected_signal_count: 3 },
      priceRows: [
        {
          grain: "Canola",
          contract: "RSK26",
          exchange: "ICE",
          price_date: "2026-06-01",
          settlement_price: 726.1,
          change_pct: -1.599,
          currency: "CAD",
          unit: "$/tonne",
          source: "barchart",
        },
      ],
      signalRows: [
        {
          ...deskReadySignal(),
        },
        {
          id: "legacy-signal",
          grain: "Canola",
          crop_year: "2025-2026",
          grain_week: 42,
          scout_run_id: "legacy-run",
          sentiment: "bullish",
          relevance_score: 99,
          signal_metadata: {},
        },
        {
          id: "wrong-week",
          grain: "Canola",
          crop_year: "2025-2026",
          grain_week: 41,
          scout_run_id: "run-1",
          signal_metadata: { schema_version: "x_signal_metadata_v1" },
        },
      ],
    });

    expect(bundle.signals).toHaveLength(1);
    expect(bundle.signals[0]).toMatchObject({
      id: "signal-1",
      primary_impact_grain: "Canola",
      source_cred_tier: "tier1",
      scout_run_id: "run-1",
      search_mode: "deep",
      allowed_claims: ["Source URL present."],
      corroboration: {
        same_claim_count: 1,
        independent_sources: ["SaskWheat"],
        official_source_match: false,
      },
      price_context: {
        grain: "Canola",
        price_date: "2026-06-01",
        settlement_price: 726.1,
      },
    });
    expect(bundle.counts).toEqual({
      accepted: 1,
      rejected_from_latest_run: 3,
      excluded_missing_evidence: 1,
      legacy_missing_corroboration: 0,
    });
    expect(bundle.guardrails.no_grok_llm_in_desk_loop).toBe(true);
  });

  it("drops current-week rows that lack the Friday desk evidence seal", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      signalRows: [
        deskReadySignal({ id: "complete" }),
        deskReadySignal({
          id: "legacy-missing-corroboration",
          signal_metadata: { corroboration: undefined },
        }),
        deskReadySignal({ id: "missing-url", post_url: null }),
        deskReadySignal({ id: "missing-date", post_date: "" }),
        deskReadySignal({ id: "missing-tier", source_cred_tier: "" }),
        deskReadySignal({ id: "missing-region", affected_regions: [] }),
        deskReadySignal({
          id: "malformed-corroboration",
          signal_metadata: { corroboration: { same_claim_count: "unknown" } },
        }),
        deskReadySignal({
          id: "missing-claim-arrays",
          signal_metadata: { allowed_claims: undefined },
        }),
        deskReadySignal({
          id: "missing-verification-flag",
          signal_metadata: { needs_official_verification: undefined },
        }),
      ],
      priceRows: [],
    });

    expect(bundle.signals.map((signal) => signal.id)).toEqual([
      "complete",
      "legacy-missing-corroboration",
    ]);
    expect(bundle.signals.find((signal) => signal.id === "legacy-missing-corroboration")?.corroboration).toEqual({
      same_claim_count: 0,
      independent_sources: [],
      official_source_match: false,
    });
    expect(bundle.counts).toMatchObject({
      accepted: 2,
      excluded_missing_evidence: 7,
      legacy_missing_corroboration: 1,
    });
  });

  it("sanitizes accepted X copy before the Friday desk bundle", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      signalRows: [
        deskReadySignal({
          id: "unsafe-copy",
          post_summary: "buy Canola, pricing-recommendation, and trade / signal chatter.",
          signal_metadata: {
            allowed_claims: ["buy signal copied claim"],
            blocked_claims: [
              "pricing recommendation copied claim",
              "sell signal copied claim",
            ],
          },
        }),
      ],
      priceRows: [],
    });

    expect(bundle.signals[0]?.post_summary).toBe(
      "watch term Canola, watch term, and watch term chatter.",
    );
    expect(bundle.signals[0]?.allowed_claims).toEqual(["watch term copied claim"]);
    expect(bundle.signals[0]?.blocked_claims).toEqual(["watch term copied claim"]);
    expect(JSON.stringify(bundle.signals[0])).not.toMatch(
      /buy Canola|pricing-recommendation|trade \/ signal|sell signal/i,
    );
  });

  it("sorts accepted signals by relevance before post recency", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      signalRows: [
        deskReadySignal({
          id: "lower",
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_grains: ["Wheat"],
          affected_regions: ["Saskatchewan"],
          relevance_score: 80,
          post_date: "2026-06-01T22:00:00Z",
        }),
        deskReadySignal({
          id: "higher",
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_grains: ["Wheat"],
          affected_regions: ["Saskatchewan"],
          relevance_score: 91,
          post_date: "2026-06-01T19:00:00Z",
        }),
      ],
      priceRows: [],
    });

    expect(bundle.signals.map((signal) => signal.id)).toEqual(["higher", "lower"]);
  });

  it("derives affected decision tags for older accepted rows with empty stored arrays", () => {
    const bundle = buildFridayXSignalBundleFromRows({
      cropYear: "2025-2026",
      grainWeek: 42,
      signalRows: [
        deskReadySignal({
          id: "legacy-empty-decisions",
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_grains: ["Wheat"],
          affected_regions: ["Saskatchewan"],
          sentiment: "bullish",
          category: "weather",
          relevance_score: 90,
          affected_decisions: [],
          seasonal_phase: "planting",
        }),
      ],
      priceRows: [],
    });

    expect(bundle.signals[0]?.affected_decisions).toEqual([
      "watch_directional_risk",
      "watch_seeding_progress",
      "watch_yield_risk",
    ]);
  });
});
