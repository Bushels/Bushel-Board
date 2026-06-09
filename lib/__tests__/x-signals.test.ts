import { describe, expect, it } from "vitest";
import { normalizeXMarketSignalRow } from "@/lib/queries/x-signals";

describe("x signal normalization", () => {
  it("reads canonical post_url and scout metadata from database rows", () => {
    const signal = normalizeXMarketSignalRow({
      id: "signal-1",
      grain: "Canola",
      post_summary: "Crusher bid talk firmed in western Saskatchewan.",
      post_url: "https://x.com/source/status/987",
      post_author: "source",
      post_date: "2026-06-01T15:00:00Z",
      relevance_score: 74,
      sentiment: "bullish",
      category: "elevator_bid",
      confidence_score: 66,
      search_query: "canola basis Saskatchewan",
      searched_at: "2026-06-01T22:05:00Z",
      source: "x",
      search_mode: "pulse",
      scout_run_id: "run-1",
      source_cred_tier: "tier2",
      primary_impact_grain: "Canola",
      affected_grains: ["Canola"],
      affected_regions: ["Saskatchewan"],
      affected_decisions: [],
      seasonal_phase: "marketing",
      signal_metadata: {
        schema_version: "x_signal_metadata_v1",
        staleness_class: "same_day",
        allowed_claims: ["basis chatter firmed"],
        blocked_claims: ["unverified price target"],
      },
      signal_hash: "hash-1",
    });

    expect(signal.post_url).toBe("https://x.com/source/status/987");
    expect(signal.scout_run_id).toBe("run-1");
    expect(signal.affected_grains).toEqual(["Canola"]);
    expect(signal.affected_decisions).toEqual([
      "watch_basis",
      "watch_cash_marketing",
      "watch_directional_risk",
    ]);
    expect(signal.signal_metadata?.blocked_claims).toEqual(["unverified price target"]);
  });

  it("keeps legacy rows usable when metadata columns are absent", () => {
    const signal = normalizeXMarketSignalRow({
      id: "signal-2",
      grain: "Corn",
      post_summary: "Export chatter.",
      relevance_score: 61,
      sentiment: "neutral",
      category: "export_news",
      confidence_score: 58,
      search_query: "corn exports",
    });

    expect(signal.post_url).toBeNull();
    expect(signal.affected_grains).toEqual([]);
    expect(signal.signal_metadata).toEqual({});
  });
});
