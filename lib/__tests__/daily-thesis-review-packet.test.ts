import { describe, expect, it } from "vitest";
import {
  buildDailyReviewDecisions,
  filterNewDailyReviewDecisions,
} from "@/scripts/run-daily-thesis-review";
import {
  buildDailyThesisXSignalInputAudit,
  dailyThesisAcceptedXSignalSealRejectionReasons,
  hasDailyThesisAcceptedXSignalSeal,
} from "@/scripts/build-daily-thesis-review-packet";
import type { DailyThesisReviewPacket } from "@/scripts/build-daily-thesis-review-packet";

type JsonRecord = Record<string, unknown>;

function packet(overrides: Partial<DailyThesisReviewPacket> = {}): DailyThesisReviewPacket {
  return {
    schema_version: "daily_thesis_review_packet_v1",
    built_at: "2026-06-01T22:00:00Z",
    source_freshness: [],
    price_rows: [],
    x_signal_input_audit: {
      scanned_rows: 0,
      sealed_accepted_rows: 0,
      rejected_rows: 0,
      rejection_reason_counts: {},
    },
    accepted_x_signals: [],
    thesis_cache: [],
    current_anchors: { canada: [], us: [] },
    trajectory: { canada: [], us: [] },
    guardrails: {
      stance_delta_min: -3,
      stance_delta_max: 3,
      confidence_delta_min: -5,
      confidence_delta_max: 5,
      x_signals_are_watch_only: true,
      friday_thesis_tables_are_read_only: true,
    },
    ...overrides,
  };
}

function sealedSignal(overrides: JsonRecord = {}): JsonRecord {
  const metadataOverrides = typeof overrides.signal_metadata === "object" && overrides.signal_metadata !== null && !Array.isArray(overrides.signal_metadata)
    ? (overrides.signal_metadata as JsonRecord)
    : {};
  const sourceTier = typeof overrides.source_cred_tier === "string" ? overrides.source_cred_tier : "tier1";
  return {
    grain: "Canola",
    primary_impact_grain: "Canola",
    affected_regions: ["Saskatchewan"],
    post_summary: "Accepted X Pulse signal.",
    sentiment: "bullish",
    relevance_score: 90,
    search_mode: "pulse",
    scout_run_id: "daily-run-1",
    source_cred_tier: sourceTier,
    signal_hash: "sealed-signal-hash",
    post_url: "https://x.com/example/status/1",
    ...overrides,
    signal_metadata: {
      schema_version: "x_signal_metadata_v1",
      source_tier: sourceTier,
      allowed_claims: ["Source URL present."],
      blocked_claims: [],
      needs_official_verification: false,
      corroboration: {
        same_claim_count: 0,
        independent_sources: [],
        official_source_match: false,
      },
      ...metadataOverrides,
    },
  };
}

describe("daily thesis review packet", () => {
  it("recognizes only validation-sealed accepted X rows for daily review", () => {
    expect(hasDailyThesisAcceptedXSignalSeal(sealedSignal())).toBe(true);
    const unsealedMetadata = {
      ...sealedSignal(),
      signal_metadata: {},
    };
    expect(hasDailyThesisAcceptedXSignalSeal(unsealedMetadata)).toBe(false);
    expect(dailyThesisAcceptedXSignalSealRejectionReasons(unsealedMetadata)).toEqual(expect.arrayContaining([
      "missing_metadata_schema",
      "missing_allowed_claims",
      "missing_blocked_claims_array",
      "missing_needs_official_verification",
      "missing_corroboration_seal",
    ]));
    expect(hasDailyThesisAcceptedXSignalSeal({
      ...sealedSignal(),
      post_url: "",
    })).toBe(false);
  });

  it("summarizes why X rows are excluded from the daily thesis packet", () => {
    const audit = buildDailyThesisXSignalInputAudit([
      sealedSignal(),
      {
        ...sealedSignal(),
        scout_run_id: "",
        signal_metadata: {},
      },
    ]);

    expect(audit).toEqual({
      scanned_rows: 2,
      sealed_accepted_rows: 1,
      rejected_rows: 1,
      rejection_reason_counts: expect.objectContaining({
        missing_scout_run_id: 1,
        missing_metadata_schema: 1,
        missing_allowed_claims: 1,
        missing_corroboration_seal: 1,
      }),
    });
  });

  it("builds bounded decisions from high-value accepted X Pulse signals", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_regions: ["United States"],
          post_summary: "Planting progress lag is showing up in trusted chatter.",
          sentiment: "bullish",
          relevance_score: 91,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
          affected_decisions: ["watch_directional_risk", "watch_yield_risk"],
          signal_hash: "wheat-planting-progress-hash",
          post_url: "https://x.com/example/status/1",
          signal_metadata: {
            allowed_claims: ["Source URL present."],
            blocked_claims: ["No unverified numeric claim admitted as fact."],
            needs_official_verification: true,
            corroboration: {
              same_claim_count: 0,
              independent_sources: [],
              official_source_match: false,
            },
          },
        }),
      ],
    }));

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      side: "us",
      market: "Wheat",
      stance_delta: 1,
      confidence_delta: 2,
      bull_case_impact: "strengthened",
      affected_decisions: ["watch_directional_risk", "watch_yield_risk"],
      allowed_claims: ["Source URL present."],
      needs_official_verification: true,
      corroboration: {
        same_claim_count: 0,
        independent_sources: [],
        official_source_match: false,
      },
    });
    expect(decisions[0]!.idempotency_key).toMatch(/^daily_pulse:[a-f0-9]{24}$/);
    expect(Math.abs(decisions[0]!.stance_delta)).toBeLessThanOrEqual(3);
    expect(Math.abs(decisions[0]!.confidence_delta)).toBeLessThanOrEqual(5);
  });

  it("routes Canadian prairie Wheat signals to the CAD trajectory", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_regions: ["Saskatchewan", "Alberta"],
          post_summary: "Prairie policy chatter affects Canadian wheat context.",
          sentiment: "bearish",
          relevance_score: 88,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
        }),
      ],
    }));

    expect(decisions[0]).toMatchObject({
      side: "cad",
      market: "Wheat",
      stance_delta: -1,
      bear_case_impact: "strengthened",
    });
  });

  it("sanitizes accepted X summary and claim copy before building daily trajectory decisions", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Saskatchewan"],
          post_summary: "buy Canola, pricing-recommendation, and trade / signal chatter.",
          sentiment: "bullish",
          relevance_score: 97,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
          signal_metadata: {
            allowed_claims: ["buy signal copied claim"],
            blocked_claims: ["pricing recommendation copied claim", "sell signal copied claim"],
          },
        }),
      ],
    }));

    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.signal_note).toBe(
      "X Pulse Watch (tier1): watch term Canola, watch term, and watch term chatter.",
    );
    expect(decisions[0]!.new_bullet_suggested).toBe(
      "Friday regime review candidate: watch term Canola, watch term, and watch term chatter.",
    );
    expect(decisions[0]!.allowed_claims).toEqual(["watch term copied claim"]);
    expect(decisions[0]!.blocked_claims).toEqual(["watch term copied claim"]);
    expect(JSON.stringify(decisions[0])).not.toMatch(/buy Canola|pricing-recommendation|trade \/ signal|sell signal/i);
  });

  it("does not create decisions for low-relevance X chatter", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Canola",
          post_summary: "Low-value chatter.",
          sentiment: "bullish",
          relevance_score: 61,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
        }),
      ],
    }));

    expect(decisions).toEqual([]);
  });

  it("does not create daily trajectory decisions from friday-deep X evidence", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Saskatchewan"],
          post_summary: "Friday deep scan found a high-relevance policy item.",
          sentiment: "bearish",
          relevance_score: 97,
          search_mode: "deep",
          scout_run_id: "friday-run-1",
          source_cred_tier: "tier1",
        }),
      ],
    }));

    expect(decisions).toEqual([]);
  });

  it("requires accepted X evidence to carry scout run provenance before daily trajectory use", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        {
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Alberta"],
          post_summary: "Legacy pulse-looking signal lacks run provenance.",
          sentiment: "bullish",
          relevance_score: 94,
          search_mode: "pulse",
          source_cred_tier: "tier1",
        },
      ],
    }));

    expect(decisions).toEqual([]);
  });

  it("requires accepted X evidence to carry validation metadata before daily trajectory use", () => {
    const decisions = buildDailyReviewDecisions(packet({
      accepted_x_signals: [
        {
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Alberta"],
          post_summary: "Legacy pulse-looking signal has a run id but no validation seal.",
          sentiment: "bullish",
          relevance_score: 94,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
          signal_hash: "legacy-hash",
          post_url: "https://x.com/example/status/legacy",
        },
      ],
    }));

    expect(decisions).toEqual([]);
  });

  it("skips a decision when the daily pulse idempotency key is already in trajectory evidence", () => {
    const basePacket = packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Wheat",
          primary_impact_grain: "Wheat",
          affected_regions: ["Saskatchewan"],
          post_summary: "Policy chatter is weighing on prairie wheat basis.",
          sentiment: "bearish",
          relevance_score: 90,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
          signal_hash: "policy-wheat-basis-hash",
        }),
      ],
    });
    const decisions = buildDailyReviewDecisions(basePacket);

    const filtered = filterNewDailyReviewDecisions(
      packet({
        ...basePacket,
        trajectory: {
          canada: [
            {
              grain: "Wheat",
              scan_type: "opus_review_daily_pulse",
              evidence: JSON.stringify({
                daily_review_idempotency_key: decisions[0]!.idempotency_key,
              }),
            },
          ],
          us: [],
        },
      }),
      decisions,
    );

    expect(filtered).toEqual([]);
  });

  it("skips legacy daily pulse rows by matching the signal note when no idempotency key exists", () => {
    const basePacket = packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Alberta"],
          post_summary: "Crusher margin chatter supports canola bids.",
          sentiment: "bullish",
          relevance_score: 89,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier2",
          post_url: "https://x.com/example/status/2",
        }),
      ],
    });
    const decisions = buildDailyReviewDecisions(basePacket);

    const filtered = filterNewDailyReviewDecisions(
      packet({
        ...basePacket,
        trajectory: {
          canada: [
            {
              grain: "Canola",
              scan_type: "opus_review_daily_pulse",
              evidence: JSON.stringify({
                signal_note: decisions[0]!.signal_note,
              }),
            },
          ],
          us: [],
        },
      }),
      decisions,
    );

    expect(filtered).toEqual([]);
  });

  it("skips legacy raw-advice daily pulse rows after sanitizing the existing signal note", () => {
    const basePacket = packet({
      accepted_x_signals: [
        sealedSignal({
          grain: "Canola",
          primary_impact_grain: "Canola",
          affected_regions: ["Saskatchewan"],
          post_summary: "buy Canola into the pricing recommendation.",
          sentiment: "bullish",
          relevance_score: 90,
          search_mode: "pulse",
          scout_run_id: "daily-run-1",
          source_cred_tier: "tier1",
          post_url: "https://x.com/example/status/3",
        }),
      ],
    });
    const decisions = buildDailyReviewDecisions(basePacket);

    const filtered = filterNewDailyReviewDecisions(
      packet({
        ...basePacket,
        trajectory: {
          canada: [
            {
              grain: "Canola",
              scan_type: "opus_review_daily_pulse",
              evidence: JSON.stringify({
                signal_note: "X Pulse Watch (tier1): buy Canola into the pricing recommendation.",
              }),
            },
          ],
          us: [],
        },
      }),
      decisions,
    );

    expect(decisions[0]!.signal_note).toBe("X Pulse Watch (tier1): watch term Canola into the watch term.");
    expect(filtered).toEqual([]);
  });
});
