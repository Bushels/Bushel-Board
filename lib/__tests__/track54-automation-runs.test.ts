import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CodexAutomationCheck,
  Track54ReadinessReport,
  WriteAutomationCheck,
} from "@/scripts/build-track54-readiness-report";
import {
  summarizeTrack54AutomationMemory,
  summarizeTrack54AutomationRuns,
} from "@/scripts/summarize-track54-automation-runs";

let tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

function tempAutomationRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "track54-automation-runs-"));
  tempRoots.push(root);
  return root;
}

function writeMemory(root: string, id: string, content: string): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "memory.md"), content);
}

function writeAutomationManifest(
  root: string,
  id: string,
  updatedAtIso: string,
): string {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, "automation.toml");
  writeFileSync(manifestPath, [
    `id = "${id}"`,
    'status = "ACTIVE"',
    `updated_at = ${new Date(updatedAtIso).getTime()}`,
  ].join("\n"));
  return manifestPath;
}

function setMemoryMtime(root: string, id: string, updatedAtIso: string): void {
  const date = new Date(updatedAtIso);
  utimesSync(join(root, id, "memory.md"), date, date);
}

function minimalReport(): Track54ReadinessReport {
  return {
    schema_version: "track54_readiness_report_v1",
    generated_at: "2026-06-04T14:20:08.512Z",
    overall_status: "hold_manual_review",
    production_writes_enabled: false,
    human_approval_required_before_writes: true,
    mode_gates: [
      {
        mode: "daily_pulse",
        readiness_status: "hold_manual_review",
        review_verdict: "hold_manual_review",
        promotion_status: "not_ready",
        review_window: {
          from_date: "2026-05-28",
          to_date: "2026-06-03",
          artifact_days_found: 2,
          required_artifact_days: 5,
        },
        artifact_gate_projection: {
          clean_artifact_days_found: 2,
          missing_clean_artifact_days: 3,
          next_eligible_run_dates: ["2026-06-04", "2026-06-05", "2026-06-08"],
          earliest_candidate_date: "2026-06-08",
          schedule_note: "daily_pulse artifacts count on weekday run dates.",
        },
        evidence: {
          raw_signal_count: 4,
          accepted_signal_count: 4,
          rejected_signal_count: 0,
          parse_failures: 1,
          stale_or_missing_price_days: 0,
          accepted_unlisted_count: 0,
          official_verification_count: 1,
          write_mode_artifact_days: 0,
          missing_no_write_evidence_days: 0,
          summary_count_mismatch_days: 0,
          artifact_identity_mismatch_days: 0,
          mode_schedule_mismatch_days: 0,
          accepted_decision_grade_count: 3,
        },
        selected_artifacts: [],
        parse_failure_details: [],
        quality_warnings: [],
        promotion_blockers: ["Keep Grok in manual/dry-run mode: 1 artifact parse failure(s)."],
        write_mode_routines: [],
        write_mode_codex_automation_proposals: [],
        post_approval_automation_transition: {
          disable_before_registering_write_mode: ["grok-x-scout-artifact-week-review"],
          register_after_disable: ["grok-x-scout-daily", "daily-thesis-review"],
          keep_active: ["canola-price-and-fx-freshness-import"],
          operator_note: "Disable the daily dry-run collector before registering write mode.",
        },
      },
      {
        mode: "friday_deep",
        readiness_status: "blocked_by_artifact_gates",
        review_verdict: "insufficient_artifacts",
        promotion_status: "not_ready",
        review_window: {
          from_date: "2026-05-23",
          to_date: "2026-05-29",
          artifact_days_found: 0,
          required_artifact_days: 1,
        },
        artifact_gate_projection: {
          clean_artifact_days_found: 0,
          missing_clean_artifact_days: 1,
          next_eligible_run_dates: ["2026-06-05"],
          earliest_candidate_date: "2026-06-05",
          schedule_note: "friday_deep artifacts count only on Friday run dates.",
        },
        evidence: {
          raw_signal_count: 0,
          accepted_signal_count: 0,
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
          accepted_decision_grade_count: 0,
        },
        selected_artifacts: [],
        parse_failure_details: [],
        quality_warnings: [],
        promotion_blockers: ["Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0."],
        write_mode_routines: [],
        write_mode_codex_automation_proposals: [],
        post_approval_automation_transition: {
          disable_before_registering_write_mode: ["grok-x-scout-friday-deep-artifact-review"],
          register_after_disable: ["grok-x-scout-friday-deep"],
          keep_active: ["canola-price-and-fx-freshness-import"],
          operator_note: "Disable Friday dry-run collector before registering write mode.",
        },
      },
    ],
    codex_automation_checks: [],
    write_automation_checks: [],
    artifact_automation_coverage: [],
    acceptance_audit: {
      overall_status: "hold_manual_review",
      grok_runner_proof: {
        command: "grok --version + Track54 credential preflight",
        checked: true,
        ok: false,
        credential_source: "none",
        credential_issue: "missing_credential",
        xai_api_key_present: false,
        cli_auth_file_present: false,
        cli_auth_expires_at: null,
        cli_auth_expired: null,
        output: ["Grok CLI auth is expired."],
      },
      focused_test_proof: {
        command: "npx vitest run <Track 54 acceptance slice>",
        checked: true,
        ok: true,
        output: ["Tests passed"],
      },
      browser_smoke_proof: {
        schema_version: "track54_browser_smoke_proof_v1",
        generated_at: "2026-06-04T14:20:06.525Z",
        command: "Browser smoke",
        checked: true,
        ok: true,
        output: ["clean"],
      },
      items: [],
      completion_blockers: [
        "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
      ],
    },
    browser_smoke_clean: true,
    completion_blockers: [
      "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
      "Keep Grok in manual/dry-run mode: 1 artifact parse failure(s).",
    ],
    next_actions: [],
    hard_boundaries: [],
    source_reviews: {
      daily_pulse: "scripts/review-grok-x-scout-artifact-week.ts",
      friday_deep: "scripts/review-grok-x-scout-artifact-week.ts",
      promotion_brief: "scripts/build-grok-x-scout-promotion-brief.ts",
    },
  };
}

function activeAutomationCheck(id = "track-54-daily-artifact-health-check"): CodexAutomationCheck {
  return {
    id,
    role: "daily_pulse artifact health monitor and no-write retry guard",
    expected_schedule: "Mon-Thu 4:45 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0",
    expected_cwd: "C:\\Users\\kyle\\Agriculture\\bushel-board-app",
    observed_cwds: ["C:\\Users\\kyle\\Agriculture\\bushel-board-app"],
    boundary: "dry-run monitor only",
    manifest_path: `C:\\fake\\${id}\\automation.toml`,
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  };
}

function safeWriteAutomationCheck(): WriteAutomationCheck {
  return {
    id: "daily-thesis-review",
    role: "weekday bounded trajectory writer",
    boundary: "must remain missing or inactive until human approval",
    manifest_path: null,
    observed_status: "missing",
    prompt_contains_write_command: null,
    safe_until_human_approval: true,
  };
}

describe("Track 54 automation run summary", () => {
  it("extracts dated run memory and redacts obvious secret assignments", () => {
    const root = tempAutomationRoot();
    writeMemory(root, "track-54-daily-artifact-health-check", [
      "2026-06-03 run summary:",
      "- Artifact health check succeeded.",
      "",
      "## 2026-06-04",
      "- Grok CLI auth is expired; run `grok login`.",
      "- XAI_API_KEY = should-not-leak",
    ].join("\n"));

    const memory = summarizeTrack54AutomationMemory(root, "track-54-daily-artifact-health-check", 5);

    expect(memory.memory_found).toBe(true);
    expect(memory.run_dates).toEqual(["2026-06-03", "2026-06-04"]);
    expect(memory.latest_run_date).toBe("2026-06-04");
    expect(memory.latest_run_outcome).toBe("blocked");
    expect(memory.latest_run_excerpt.join("\n")).toContain("XAI_API_KEY = [redacted]");
  });

  it("combines automation memory, manifest safety, and readiness blockers", () => {
    const root = tempAutomationRoot();
    writeMemory(root, "track-54-daily-artifact-health-check", [
      "2026-06-03 run summary:",
      "- Retry failed with exit code `1` before writing a raw artifact.",
      "- Readiness did not refresh.",
    ].join("\n"));

    const summary = summarizeTrack54AutomationRuns({
      automationRoot: root,
      report: minimalReport(),
      reportPath: "scratch/track54-readiness/latest-readiness-report.json",
      automationChecks: [activeAutomationCheck()],
      writeAutomationChecks: [safeWriteAutomationCheck()],
      now: new Date("2026-06-04T14:20:31.141Z"),
    });

    expect(summary.schema_version).toBe("track54_automation_run_summary_v1");
    expect(summary.production_writes_enabled).toBe(false);
    expect(summary.no_write_manifests_ready).toBe(true);
    expect(summary.write_automations_safe).toBe(true);
    expect(summary.automations_with_run_memory).toBe(1);
    expect(summary.automations_with_failed_or_blocked_latest_run).toEqual([
      "track-54-daily-artifact-health-check",
    ]);
    expect(summary.automation_run_checks[0]!.run_memory.latest_run_outcome).toBe("failed");
    expect(summary.mode_gate_snapshot[0]).toEqual(expect.objectContaining({
      mode: "daily_pulse",
      artifact_days_found: 2,
      required_artifact_days: 5,
      clean_artifact_days_found: 2,
      missing_clean_artifact_days: 3,
      earliest_candidate_date: "2026-06-08",
      accepted_signal_count: 4,
      accepted_decision_grade_count: 3,
      next_eligible_run_dates: ["2026-06-04", "2026-06-05", "2026-06-08"],
    }));
    expect(summary.next_safe_operator_action).toBe(
      "Refresh Grok credentials with `grok login` or add `XAI_API_KEY` to `.env.local`, then run `npm run track54:recover-after-grok-login`. Do not run the scout or any write command directly.",
    );
  });

  it("does not treat a failed latest run as current after the automation manifest was updated", () => {
    const root = tempAutomationRoot();
    const id = "grok-x-scout-artifact-week-review";
    writeMemory(root, id, [
      "2026-06-08 run summary:",
      "- Preflight returned credential_ok: false.",
      "- retry_blocked_by_grok_preflight=true.",
      "- Stop rule applied before the fallback prompt existed.",
    ].join("\n"));
    setMemoryMtime(root, id, "2026-06-08T16:12:00.000Z");
    const manifestPath = writeAutomationManifest(root, id, "2026-06-09T03:12:00.000Z");

    const summary = summarizeTrack54AutomationRuns({
      automationRoot: root,
      report: minimalReport(),
      reportPath: "scratch/track54-readiness/latest-readiness-report.json",
      automationChecks: [{
        ...activeAutomationCheck(id),
        manifest_path: manifestPath,
      }],
      writeAutomationChecks: [safeWriteAutomationCheck()],
      now: new Date("2026-06-09T03:20:00.000Z"),
    });

    expect(summary.automation_run_checks[0]).toEqual(expect.objectContaining({
      id,
      manifest_updated_at: "2026-06-09T03:12:00.000Z",
      latest_run_superseded_by_manifest_update: true,
    }));
    expect(summary.automation_run_checks[0]!.run_memory.latest_run_outcome).toBe("blocked");
    expect(summary.automations_with_failed_or_blocked_latest_run).toEqual([]);
  });

  it("classifies prose-only preflight retry blocks as blocked and superseded after manifest updates", () => {
    const root = tempAutomationRoot();
    const id = "track-54-daily-artifact-health-check";
    writeMemory(root, id, [
      "2026-06-08 run (~3m)",
      "- Ran the daily artifact health check; it stayed no-write and blocked retry at preflight.",
      "- retried_modes=[], readiness_refreshed=false, readiness_output_path=null, ok=false.",
    ].join("\n"));
    setMemoryMtime(root, id, "2026-06-08T22:48:51.000Z");
    const manifestPath = writeAutomationManifest(root, id, "2026-06-09T04:08:07.000Z");

    const summary = summarizeTrack54AutomationRuns({
      automationRoot: root,
      report: minimalReport(),
      reportPath: "scratch/track54-readiness/latest-readiness-report.json",
      automationChecks: [{
        ...activeAutomationCheck(id),
        manifest_path: manifestPath,
      }],
      writeAutomationChecks: [safeWriteAutomationCheck()],
      now: new Date("2026-06-09T05:50:00.000Z"),
    });

    expect(summary.automation_run_checks[0]!.run_memory.latest_run_outcome).toBe("blocked");
    expect(summary.automation_run_checks[0]).toEqual(expect.objectContaining({
      latest_run_superseded_by_manifest_update: true,
    }));
    expect(summary.automations_with_failed_or_blocked_latest_run).toEqual([]);
  });
});
