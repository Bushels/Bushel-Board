import { describe, expect, it } from "vitest";
import {
  buildGrokXScoutPromotionBrief,
  type GrokXScoutPromotionBrief,
} from "@/scripts/build-grok-x-scout-promotion-brief";
import type { ArtifactWeekReview } from "@/scripts/review-grok-x-scout-artifact-week";

function review(overrides: Partial<ArtifactWeekReview> = {}): ArtifactWeekReview {
  return {
    schema_version: "grok_x_scout_artifact_week_review_v1",
    mode: "daily_pulse",
    from_date: "2026-06-01",
    to_date: "2026-06-05",
    required_artifact_days: 5,
    minimum_accepted_signals: 1,
    artifact_days_found: 5,
    totals: {
      raw_signal_count: 5,
      accepted_signal_count: 5,
      rejected_signal_count: 0,
      parse_failures: 0,
      stale_or_missing_price_days: 0,
      accepted_unlisted_count: 0,
      official_verification_count: 0,
      write_mode_artifact_days: 0,
      missing_no_write_evidence_days: 0,
      summary_count_mismatch_days: 0,
      artifact_identity_mismatch_days: 0,
      mode_schedule_mismatch_days: 0,
      accepted_decision_grade_count: 5,
    },
    days: [],
    parse_failure_details: [],
    verdict: "candidate_for_enablement",
    quality_warnings: [],
    recommendation: "Clean enough to ask for human approval to register write-mode Grok routines; do not auto-enable them from this script.",
    guardrails: {
      no_supabase_writes: true,
      grok_is_scout_only: true,
      human_review_required_before_write_automation: true,
    },
    ...overrides,
  };
}

function routineNames(brief: GrokXScoutPromotionBrief): string[] {
  return brief.write_mode_routines.map((routine) => routine.name);
}

describe("Grok X scout promotion brief", () => {
  it("marks a clean candidate review as ready for human approval without enabling routines", () => {
    const brief = buildGrokXScoutPromotionBrief(review(), "2026-06-06T00:00:00.000Z");

    expect(brief.schema_version).toBe("grok_x_scout_promotion_brief_v1");
    expect(brief.generated_at).toBe("2026-06-06T00:00:00.000Z");
    expect(brief.promotion_status).toBe("ready_for_human_approval");
    expect(brief.human_approval_required).toBe(true);
    expect(brief.promotion_blockers).toEqual([]);
    expect(routineNames(brief)).toEqual([
      "grok-x-scout-daily",
      "daily-thesis-review",
    ]);
    expect(brief.write_mode_codex_automation_proposals.map((proposal) => proposal.id)).toEqual([
      "grok-x-scout-daily",
      "daily-thesis-review",
    ]);
    expect(brief.write_mode_codex_automation_proposals[0]).toEqual(expect.objectContaining({
      kind: "cron",
      name: "Track 54 Grok X scout daily write",
      schedule: "Mon-Fri 4:05 PM MT",
      status_after_human_approval: "ACTIVE",
      command: brief.write_mode_routines[0]!.command,
    }));
    expect(brief.write_mode_codex_automation_proposals[0]!.cwds).toEqual([
      "C:\\Users\\kyle\\Agriculture\\bushel-board-app",
    ]);
    expect(brief.write_mode_codex_automation_proposals[0]!.prompt).toContain("Confirm the matching dry-run artifact collector is disabled or inactive before running.");
    expect(brief.write_mode_codex_automation_proposals[0]!.prompt).toContain("Approved artifact review window: daily_pulse 2026-06-01 through 2026-06-05.");
    expect(brief.write_mode_codex_automation_proposals[0]!.prompt).toContain("Do not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, or thesis_packet_cache");
    expect(brief.write_mode_codex_automation_proposals[0]!.approval_review_window).toEqual({
      mode: "daily_pulse",
      from_date: "2026-06-01",
      to_date: "2026-06-05",
      artifact_days_found: 5,
      required_artifact_days: 5,
      accepted_signal_count: 5,
      accepted_decision_grade_count: 5,
    });
    expect(brief.write_mode_codex_automation_proposals[0]!.create_only_after).toContain("grok-x-scout-artifact-week-review is disabled or inactive");
    expect(brief.write_mode_codex_automation_proposals[1]).toEqual(expect.objectContaining({
      kind: "cron",
      name: "Track 54 bounded daily thesis review write",
      schedule: "Mon-Fri 4:25 PM MT",
      status_after_human_approval: "ACTIVE",
      command: brief.write_mode_routines[1]!.command,
    }));
    expect(brief.write_mode_codex_automation_proposals[1]!.prompt).toContain("This routine may write only bounded daily trajectory updates");
    expect(brief.write_mode_codex_automation_proposals[1]!.prompt).toContain("packet.x_signal_input_audit");
    expect(brief.write_mode_codex_automation_proposals[1]!.prompt).toContain("accepted_x_signals count");
    expect(brief.write_mode_codex_automation_proposals[1]!.prompt).toContain("write_decisions count");
    expect(routineNames(brief)).not.toContain("grok-x-scout-friday-deep");
    expect(brief.write_mode_routines[0]!.command).toContain("--approval-review-from 2026-06-01");
    expect(brief.write_mode_routines[0]!.command).toContain("--approval-review-to 2026-06-05");
    expect(brief.write_mode_routines[0]!.command).toContain("--approval-phrase");
    expect(brief.write_mode_routines[0]!.command).toContain("--runner auto");
    expect(brief.write_mode_routines[0]!.command).toContain("--grok-cli-model grok-composer-2.5-fast");
    expect(brief.write_mode_routines[1]!.command).not.toContain("--runner auto");
    expect(brief.write_mode_routines.every((routine) => routine.status === "disabled_until_human_approval")).toBe(true);
    expect(brief.post_approval_automation_transition).toEqual({
      disable_before_registering_write_mode: ["grok-x-scout-artifact-week-review"],
      register_after_disable: ["grok-x-scout-daily", "daily-thesis-review"],
      keep_active: ["canola-price-and-fx-freshness-import"],
      operator_note: "After human approval, disable the daily dry-run artifact collector before registering daily write-mode Grok and daily thesis-review routines.",
    });
    expect(brief.source_review.no_auto_enablement).toBe(true);
  });

  it("carries selected artifact identity into the approval packet", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      days: [
        {
          date: "2026-06-01",
          artifact_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-01\\daily_pulse-20260601T191936Z-raw.json",
          artifact_sha256: "e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9",
          summary_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-01\\daily_pulse-20260601T191936Z-summary.json",
          artifact_found: true,
          summary_found: true,
          parse_status: "ok",
          dry_run: true,
          write: false,
          scout_run_id: null,
          no_write_evidence: true,
          summary_raw_signal_count: 3,
          summary_accepted_signal_count: 3,
          summary_rejected_signal_count: 0,
          summary_count_mismatch: false,
          output_run_date: "2026-06-01",
          output_mode: "daily_pulse",
          artifact_identity_mismatch: false,
          mode_schedule_mismatch: false,
          price_snapshot_status: "fresh",
          raw_signal_count: 3,
          accepted_signal_count: 3,
          rejected_signal_count: 0,
          accepted_by_tier: { tier1: 1, tier3: 2 },
          accepted_decision_grade_count: 3,
          rejected_reasons: [],
          accepted_unlisted_count: 0,
          official_verification_count: 1,
        },
      ],
    }));

    expect(brief.selected_artifacts).toEqual([
      expect.objectContaining({
        date: "2026-06-01",
        artifact_sha256: "e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9",
        accepted_signal_count: 3,
        accepted_decision_grade_count: 3,
        no_write_evidence: true,
      }),
    ]);
  });

  it("carries parse failure details into the approval packet", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      verdict: "hold_manual_review",
      recommendation:
        "Keep Grok in manual/dry-run mode: 1 artifact parse failure(s): 2026-06-03 (grok auth expired).",
      totals: {
        ...review().totals,
        parse_failures: 1,
      },
      parse_failure_details: [
        {
          date: "2026-06-03",
          artifact_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-03\\daily_pulse-raw.json",
          summary_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-03\\daily_pulse-summary.json",
          artifact_found: false,
          summary_found: true,
          error_message: "grok auth expired",
          no_write_evidence: true,
          price_snapshot_status: "not_checked",
        },
      ],
    }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.parse_failure_details).toEqual([
      expect.objectContaining({
        date: "2026-06-03",
        error_message: "grok auth expired",
        no_write_evidence: true,
      }),
    ]);
    expect(brief.promotion_blockers[0]).toContain("2026-06-03");
  });

  it("emits only the Friday-deep writer after a Friday-deep artifact review", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      mode: "friday_deep",
      from_date: "2026-06-05",
      to_date: "2026-06-05",
      required_artifact_days: 1,
      artifact_days_found: 1,
    }));

    expect(brief.promotion_status).toBe("ready_for_human_approval");
    expect(routineNames(brief)).toEqual(["grok-x-scout-friday-deep"]);
    expect(brief.write_mode_codex_automation_proposals).toHaveLength(1);
    expect(brief.write_mode_codex_automation_proposals[0]).toEqual(expect.objectContaining({
      id: "grok-x-scout-friday-deep",
      kind: "cron",
      name: "Track 54 Grok X scout Friday-deep write",
      schedule: "Friday 4:50 PM MT",
      status_after_human_approval: "ACTIVE",
      command: brief.write_mode_routines[0]!.command,
    }));
    expect(brief.write_mode_codex_automation_proposals[0]!.prompt).toContain("Friday desk swarms remain the thesis-of-record writers.");
    expect(brief.write_mode_codex_automation_proposals[0]!.prompt).toContain("Approved artifact review window: friday_deep 2026-06-05 through 2026-06-05.");
    expect(brief.write_mode_codex_automation_proposals[0]!.approval_review_window).toEqual({
      mode: "friday_deep",
      from_date: "2026-06-05",
      to_date: "2026-06-05",
      artifact_days_found: 1,
      required_artifact_days: 1,
      accepted_signal_count: 5,
      accepted_decision_grade_count: 5,
    });
    expect(brief.write_mode_codex_automation_proposals[0]!.create_only_after).toContain("grok-x-scout-friday-deep-artifact-review is disabled or inactive");
    expect(brief.write_mode_routines[0]!.command).toContain("grok:x-scout -- friday_deep --runner auto --grok-cli-model grok-composer-2.5-fast --write");
    expect(brief.write_mode_routines[0]!.command).toContain("--approval-review-from 2026-06-05");
    expect(brief.write_mode_routines[0]!.command).toContain("--approval-review-to 2026-06-05");
    expect(brief.post_approval_automation_transition).toEqual({
      disable_before_registering_write_mode: ["grok-x-scout-friday-deep-artifact-review"],
      register_after_disable: ["grok-x-scout-friday-deep"],
      keep_active: ["canola-price-and-fx-freshness-import"],
      operator_note: "After human approval, replace the Friday-deep dry-run artifact collector with the Friday-deep write-mode Grok routine.",
    });
  });

  it("does not promote manual-test artifact reviews into write automation", () => {
    const brief = buildGrokXScoutPromotionBrief(review({ mode: "manual_test" }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.write_mode_routines).toEqual([]);
    expect(brief.write_mode_codex_automation_proposals).toEqual([]);
    expect(brief.post_approval_automation_transition.register_after_disable).toEqual([]);
    expect(brief.promotion_blockers).toContain("manual_test reviews cannot authorize write-mode automation");
  });

  it("stays not ready when the artifact-week review is still insufficient", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      artifact_days_found: 1,
      verdict: "insufficient_artifacts",
      recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
    }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.review_window.artifact_days_found).toBe(1);
    expect(brief.promotion_blockers).toContain("Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.");
  });

  it("stays not ready when summary counts disagree with parsed validation", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      verdict: "hold_manual_review",
      recommendation: "Keep Grok in manual/dry-run mode: 1 artifact day(s) had summary/artifact count mismatches.",
      totals: {
        ...review().totals,
        summary_count_mismatch_days: 1,
      },
    }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.promotion_blockers).toContain("summary counts disagree with parsed artifact validation");
  });

  it("stays not ready when raw artifact dates or modes do not match the reviewed window", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      verdict: "hold_manual_review",
      recommendation: "Keep Grok in manual/dry-run mode: 1 artifact day(s) had run date or mode mismatches.",
      totals: {
        ...review().totals,
        artifact_identity_mismatch_days: 1,
      },
    }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.promotion_blockers).toContain("artifact run dates or modes do not match the reviewed days");
  });

  it("stays not ready when accepted signals are only low-grade tiers", () => {
    const brief = buildGrokXScoutPromotionBrief(review({
      verdict: "hold_manual_review",
      recommendation: "Keep Grok in manual/dry-run mode: accepted signals came only from low-grade or unlisted source tiers.",
      totals: {
        ...review().totals,
        accepted_decision_grade_count: 0,
      },
    }));

    expect(brief.promotion_status).toBe("not_ready");
    expect(brief.promotion_blockers).toContain("accepted signals came only from low-grade or unlisted source tiers");
  });

  it("keeps retired Grok writer boundaries explicit in the approval packet", () => {
    const brief = buildGrokXScoutPromotionBrief(review());

    expect(brief.hard_boundaries).toContain("Grok must not write market_analysis or us_market_analysis.");
    expect(brief.hard_boundaries).toContain("Approval is mode-scoped; daily_pulse review evidence cannot authorize friday_deep write routines.");
    expect(brief.hard_boundaries).toContain("The retired Grok/xAI thesis-writing chain remains tombstoned.");
  });
});
