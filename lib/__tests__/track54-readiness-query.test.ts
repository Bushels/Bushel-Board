import { describe, expect, it } from "vitest";

import { normalizeTrack54ReadinessReport } from "@/lib/queries/track54-readiness";

describe("normalizeTrack54ReadinessReport", () => {
  it("returns an operator snapshot without raw artifact identity fields", () => {
    const snapshot = normalizeTrack54ReadinessReport({
      schema_version: "track54_readiness_report_v1",
      generated_at: "2026-06-02T20:39:00.884Z",
      overall_status: "blocked_by_artifact_gates",
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      browser_smoke_clean: true,
      acceptance_audit: {
        browser_smoke_proof: {
          checked: true,
          ok: true,
          generated_at: "2026-06-02T20:30:00.000Z",
          command: "npm run track54:browser-smoke",
          output: ["desktop /thesis: screenshot=C:/Users/kyle/Agriculture/bushel-board-app/scratch/proof.png"],
        },
        grok_runner_proof: {
          command: "npm run track54:grok-preflight",
          checked: true,
          ok: false,
          credential_source: "none",
          credential_issue: "missing_credential",
          xai_api_key_present: false,
          cli_auth_file_present: false,
          cli_auth_expires_at: null,
          cli_auth_expired: null,
          output: ["Run `grok login` or add XAI_API_KEY before relying on scheduled Track 54 scout jobs."],
        },
      },
      completion_blockers: ["daily_pulse has 1/5 clean artifact days"],
      next_actions: ["Wait for scheduled dry-run evidence"],
      mode_gates: [
        {
          mode: "daily_pulse",
          readiness_status: "blocked_by_artifact_gates",
          review_verdict: "hold",
          promotion_status: "incomplete",
          artifact_path: "data/X Scout Runs/2026-06-01/daily_pulse-raw.json",
          artifact_sha256: "abc123",
          review_window: {
            artifact_days_found: 1,
            required_artifact_days: 5,
          },
          evidence: {
            accepted_signal_count: 3,
            accepted_decision_grade_count: 2,
          },
          artifact_gate_projection: {
            next_eligible_run_dates: ["2026-06-02", "2026-06-03"],
          },
          promotion_blockers: ["need 5 clean artifact days"],
        },
      ],
    }, new Date("2026-06-02T21:39:00.884Z"));

    expect(snapshot).toEqual({
      generatedAt: "2026-06-02T20:39:00.884Z",
      reportAgeHours: 1,
      reportFreshEnough: true,
      overallStatus: "blocked_by_artifact_gates",
      productionWritesEnabled: false,
      humanApprovalRequiredBeforeWrites: true,
      browserSmokeClean: true,
      browserSmokeProof: {
        checked: true,
        ok: true,
        generatedAt: "2026-06-02T20:30:00.000Z",
        ageHours: 1.15,
        freshEnough: true,
      },
      grokRunner: {
        ok: false,
        credentialSource: "none",
        credentialIssue: "missing_credential",
        xaiApiKeyPresent: false,
        cliAuthFilePresent: false,
        cliAuthExpiresAt: null,
        cliAuthExpired: null,
      },
      completionBlockers: ["daily_pulse has 1/5 clean artifact days"],
      nextActions: ["Wait for scheduled dry-run evidence"],
      modeGates: [
        {
          mode: "daily_pulse",
          readinessStatus: "blocked_by_artifact_gates",
          reviewVerdict: "hold",
          promotionStatus: "incomplete",
          artifactDaysFound: 1,
          requiredArtifactDays: 5,
          acceptedSignalCount: 3,
          acceptedDecisionGradeCount: 2,
          nextEligibleRunDates: ["2026-06-02", "2026-06-03"],
          promotionBlockers: ["need 5 clean artifact days"],
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("artifact_path");
    expect(JSON.stringify(snapshot)).not.toContain("artifact_sha256");
    expect(JSON.stringify(snapshot)).not.toContain("data/X Scout Runs");
    expect(JSON.stringify(snapshot)).not.toContain("grok-preflight");
    expect(JSON.stringify(snapshot)).not.toContain("grok login");
    expect(JSON.stringify(snapshot)).not.toContain("scratch/proof.png");
  });

  it("marks aged-out browser smoke proof as stale without exposing proof output", () => {
    const snapshot = normalizeTrack54ReadinessReport({
      schema_version: "track54_readiness_report_v1",
      generated_at: "2026-06-02T20:39:00.884Z",
      overall_status: "hold_manual_review",
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      browser_smoke_clean: true,
      acceptance_audit: {
        browser_smoke_proof: {
          checked: true,
          ok: true,
          generated_at: "2026-06-02T20:30:00.000Z",
          command: "npm run track54:browser-smoke",
          output: ["mobile /overview: screenshot=C:/Users/kyle/Agriculture/bushel-board-app/scratch/mobile-overview.png"],
        },
      },
      completion_blockers: [],
      next_actions: [],
      mode_gates: [],
    }, new Date("2026-06-03T03:00:00.000Z"));

    expect(snapshot?.browserSmokeProof).toEqual({
      checked: true,
      ok: true,
      generatedAt: "2026-06-02T20:30:00.000Z",
      ageHours: 6.5,
      freshEnough: false,
    });
    expect(JSON.stringify(snapshot)).not.toContain("track54:browser-smoke");
    expect(JSON.stringify(snapshot)).not.toContain("scratch/mobile-overview.png");
  });

  it("marks aged-out readiness reports as stale", () => {
    const snapshot = normalizeTrack54ReadinessReport({
      schema_version: "track54_readiness_report_v1",
      generated_at: "2026-06-02T20:39:00.000Z",
      overall_status: "hold_manual_review",
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      browser_smoke_clean: true,
      acceptance_audit: {
        browser_smoke_proof: {
          checked: true,
          ok: true,
          generated_at: "2026-06-03T04:00:00.000Z",
        },
      },
      completion_blockers: [],
      next_actions: [],
      mode_gates: [],
    }, new Date("2026-06-03T05:00:00.000Z"));

    expect(snapshot?.reportAgeHours).toBe(8.35);
    expect(snapshot?.reportFreshEnough).toBe(false);
    expect(snapshot?.browserSmokeProof?.freshEnough).toBe(true);
  });

  it("marks future-dated readiness and browser proof as not fresh enough", () => {
    const snapshot = normalizeTrack54ReadinessReport({
      schema_version: "track54_readiness_report_v1",
      generated_at: "2026-06-03T06:00:00.000Z",
      overall_status: "ready_for_human_approval",
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      browser_smoke_clean: true,
      acceptance_audit: {
        browser_smoke_proof: {
          checked: true,
          ok: true,
          generated_at: "2026-06-03T05:30:00.000Z",
        },
      },
      completion_blockers: [],
      next_actions: [],
      mode_gates: [],
    }, new Date("2026-06-03T05:00:00.000Z"));

    expect(snapshot?.reportAgeHours).toBe(-1);
    expect(snapshot?.reportFreshEnough).toBe(false);
    expect(snapshot?.browserSmokeProof).toEqual({
      checked: true,
      ok: true,
      generatedAt: "2026-06-03T05:30:00.000Z",
      ageHours: -0.5,
      freshEnough: false,
    });
  });

  it("keeps absent browser smoke proof as missing instead of fabricating stale proof", () => {
    const snapshot = normalizeTrack54ReadinessReport({
      schema_version: "track54_readiness_report_v1",
      generated_at: "2026-06-03T04:00:00.000Z",
      overall_status: "hold_manual_review",
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      browser_smoke_clean: true,
      acceptance_audit: {},
      completion_blockers: [],
      next_actions: [],
      mode_gates: [],
    }, new Date("2026-06-03T05:00:00.000Z"));

    expect(snapshot?.browserSmokeProof).toBeNull();
    expect(snapshot?.reportFreshEnough).toBe(true);
  });

  it("rejects unknown readiness report versions", () => {
    expect(normalizeTrack54ReadinessReport({ schema_version: "old" })).toBeNull();
  });
});
