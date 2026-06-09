import { describe, expect, it } from "vitest";
import { normalizeXPulseSignalRow, normalizeXScoutRunRow } from "@/lib/queries/x-scout-runs";

describe("x scout run normalization", () => {
  it("normalizes run counters and artifact metadata", () => {
    const run = normalizeXScoutRunRow({
      id: "run-1",
      run_date: "2026-06-01",
      run_started_at: "2026-06-01T22:05:00Z",
      run_finished_at: "2026-06-01T22:06:00Z",
      mode: "daily_pulse",
      runner: "grok_cli",
      status: "success",
      prompt_version: "grok_x_scout_v1",
      artifact_path: "data/X Scout Runs/2026-06-01/raw.json",
      artifact_sha256: "sha256:abc",
      raw_signal_count: "12",
      accepted_signal_count: 4,
      rejected_signal_count: 8,
      price_snapshot_required: true,
      price_snapshot_status: "fresh",
      error_message: null,
      metadata: {
        schema_version: "x_scout_run_v1",
        rejection_reasons: ["unsupported_grain:Rye", "missing_or_invalid_source_url", "unsupported_grain:Rye"],
      },
    });

    expect(run).toMatchObject({
      id: "run-1",
      mode: "daily_pulse",
      runner: "grok_cli",
      status: "success",
      rawSignalCount: 12,
      acceptedSignalCount: 4,
      rejectedSignalCount: 8,
      priceSnapshotStatus: "fresh",
      artifactSha256: "sha256:abc",
      rejectionReasons: ["missing_or_invalid_source_url", "unsupported_grain:Rye"],
    });
  });

  it("normalizes X Pulse signal metadata for display", () => {
    const signal = normalizeXPulseSignalRow({
      id: "signal-1",
      grain: "Wheat",
      post_summary: "Northern Plains dryness chatter.",
      post_url: "https://x.com/example/status/123",
      post_author: "example",
      post_date: "2026-06-01T20:00:00Z",
      sentiment: "bullish",
      category: "weather",
      relevance_score: 82,
      confidence_score: 71,
      source_cred_tier: "tier2",
      primary_impact_grain: "Wheat",
      affected_grains: ["Wheat", "Durum", 12],
      affected_regions: ["Saskatchewan"],
      affected_decisions: [],
      seasonal_phase: "planting",
      signal_metadata: {
        staleness_class: "same_day",
        needs_official_verification: true,
        corroboration: {
          same_claim_count: 2,
          independent_sources: ["SaskWheat", "LeftFieldCR"],
          official_source_match: true,
        },
      },
    });

    expect(signal).toMatchObject({
      grain: "Wheat",
      postUrl: "https://x.com/example/status/123",
      sourceCredTier: "tier2",
      stalenessClass: "same_day",
      needsOfficialVerification: true,
      corroboration: {
        sameClaimCount: 2,
        independentSources: ["SaskWheat", "LeftFieldCR"],
        officialSourceMatch: true,
      },
      affectedGrains: ["Wheat", "Durum"],
      affectedDecisions: [
        "watch_directional_risk",
        "watch_seeding_progress",
        "watch_yield_risk",
      ],
    });
  });
});
