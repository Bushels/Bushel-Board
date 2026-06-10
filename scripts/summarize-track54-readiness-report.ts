#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRACK54_AUTOMATION_TIME_ZONE,
  track54AutomationDateKey,
  track54CompletedAutomationDateKey,
} from "@/lib/x-api/track54-date";
import type { GrokRunnerProof, HermesTerminalProof, Track54ModeGate, Track54ReadinessReport } from "./build-track54-readiness-report";

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

const DEFAULT_REPORT_PATH = "scratch/track54-readiness/latest-readiness-report.json";
const DEFAULT_MAX_AGE_HOURS = 8;
const DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS = 6;

type SummaryStatus = "ready_for_review" | "hold_manual_review";
type HeartbeatReviewKind = "weekday_daily_pulse_review" | "friday_promotion_review" | "weekend_no_scheduled_review";
type ProofFreshnessStatus = "fresh" | "stale" | "future_dated" | "timestamp_missing";
type BrowserProofFreshnessStatus = ProofFreshnessStatus | "missing";
type HeartbeatPostApprovalTransition = Pick<
  Track54ModeGate["post_approval_automation_transition"],
  "disable_before_registering_write_mode" | "register_after_disable" | "keep_active"
>;
type HeartbeatWriteModeProposalSummary = Pick<
  Track54ModeGate["write_mode_codex_automation_proposals"][number],
  "id" | "approval_review_window"
>;
type NextEligibleRunDueStatus = "not_yet_due" | "due_now" | "future_scheduled" | "missed_or_pending";

export interface Track54HeartbeatNextEligibleRunStatus {
  date: string;
  status: NextEligibleRunDueStatus;
  artifact_due: boolean;
  cutoff_local_time: "16:10 MT" | "16:50 MT";
}

export interface Track54HeartbeatModeSummary {
  mode: Track54ModeGate["mode"];
  review_verdict: Track54ModeGate["review_verdict"];
  promotion_status: Track54ModeGate["promotion_status"];
  artifact_days_found: number;
  required_artifact_days: number;
  clean_artifact_days_found: number;
  missing_clean_artifact_days: number;
  earliest_candidate_date: string | null;
  accepted_signal_count: number;
  accepted_decision_grade_count: number;
  selected_artifacts: Track54ModeGate["selected_artifacts"];
  write_mode_proposal_ids: string[];
  write_mode_proposals: HeartbeatWriteModeProposalSummary[];
  post_approval_transition: HeartbeatPostApprovalTransition;
  next_eligible_run_dates: string[];
  next_eligible_run_statuses: Track54HeartbeatNextEligibleRunStatus[];
}

export interface Track54HeartbeatGrokRunnerSummary {
  checked: boolean;
  ok: boolean;
  credential_source: GrokRunnerProof["credential_source"] | null;
  credential_issue: GrokRunnerProof["credential_issue"] | null;
  xai_api_key_present: boolean | null;
  cli_auth_file_present: boolean | null;
  cli_auth_expires_at: string | null;
  cli_auth_expired: boolean | null;
}

export interface Track54HeartbeatHermesTerminalSummary {
  checked: boolean;
  ok: boolean;
  hermes_version_ok: boolean | null;
  xai_oauth_logged_in: boolean | null;
  model_smoke_ok: boolean | null;
  x_search_tool_listed: boolean | null;
  x_search_globally_enabled: boolean | null;
  toolset_override_required: boolean | null;
  provider: HermesTerminalProof["provider"] | null;
  model: HermesTerminalProof["model"] | null;
}

export interface Track54HeartbeatSummary {
  schema_version: "track54_heartbeat_summary_v1";
  checked_at: string;
  local_review_date: string;
  local_review_weekday: string;
  local_review_kind: HeartbeatReviewKind;
  review_modes_to_inspect: Track54ModeGate["mode"][];
  report_path: string;
  persisted_report_path: string | null;
  persisted_path_matches_report_path: boolean;
  report_generated_at: string;
  report_age_hours: number | null;
  max_report_age_hours: number;
  report_freshness_status: ProofFreshnessStatus;
  report_fresh_enough: boolean;
  browser_smoke_proof_generated_at: string | null;
  browser_smoke_proof_age_hours: number | null;
  max_browser_smoke_proof_age_hours: number;
  browser_smoke_proof_ok: boolean | null;
  browser_smoke_proof_freshness_status: BrowserProofFreshnessStatus;
  browser_smoke_proof_fresh_enough: boolean;
  overall_status: Track54ReadinessReport["overall_status"];
  acceptance_audit_status: Track54ReadinessReport["acceptance_audit"]["overall_status"];
  grok_runner: Track54HeartbeatGrokRunnerSummary;
  hermes_terminal: Track54HeartbeatHermesTerminalSummary;
  production_writes_enabled: Track54ReadinessReport["production_writes_enabled"];
  human_approval_required_before_writes: Track54ReadinessReport["human_approval_required_before_writes"];
  codex_automation_prompts_clean: boolean;
  codex_automation_missing_prompt_fragment_count: number;
  write_automations_safe: boolean;
  mode_gates: Track54HeartbeatModeSummary[];
  completion_blockers: string[];
  heartbeat_blockers: string[];
  next_actions: string[];
  next_safe_operator_action: string;
  status: SummaryStatus;
  safe_to_promote_without_human_approval: false;
}

function optionValue(flag: string, inputArgs: string[] = args): string | undefined {
  const index = inputArgs.indexOf(flag);
  if (index !== -1) return inputArgs[index + 1];
  const inline = inputArgs.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hoursBetween(later: Date, earlierIso: string): number | null {
  const earlier = new Date(earlierIso);
  const diffMs = later.getTime() - earlier.getTime();
  if (!Number.isFinite(diffMs)) return null;
  return diffMs / (60 * 60 * 1000);
}

function roundHours(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function proofFreshnessStatus(ageHours: number | null, maxAgeHours: number): ProofFreshnessStatus {
  if (ageHours === null) return "timestamp_missing";
  if (ageHours < 0) return "future_dated";
  return ageHours <= maxAgeHours ? "fresh" : "stale";
}

function browserProofFreshnessStatus(
  proof: Track54ReadinessReport["acceptance_audit"]["browser_smoke_proof"],
  ageHours: number | null,
  maxAgeHours: number,
): BrowserProofFreshnessStatus {
  if (!proof.checked) return "missing";
  return proofFreshnessStatus(ageHours, maxAgeHours);
}

function proofFreshnessBlocker(label: string, status: ProofFreshnessStatus, maxAgeHours: number): string | null {
  if (status === "fresh") return null;
  if (status === "timestamp_missing") return `${label} is missing generated_at.`;
  if (status === "future_dated") return `${label} is future-dated.`;
  return `${label} is older than ${maxAgeHours} hours.`;
}

function browserProofFreshnessBlocker(status: BrowserProofFreshnessStatus, maxAgeHours: number): string | null {
  if (status === "missing") return "Browser-smoke proof is missing.";
  return proofFreshnessBlocker("Browser-smoke proof", status, maxAgeHours);
}

function localWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TRACK54_AUTOMATION_TIME_ZONE,
    weekday: "long",
  }).format(date);
}

function heartbeatReviewKind(weekday: string): {
  kind: HeartbeatReviewKind;
  modes: Track54ModeGate["mode"][];
} {
  if (weekday === "Friday") {
    return { kind: "friday_promotion_review", modes: ["daily_pulse", "friday_deep"] };
  }
  if (["Monday", "Tuesday", "Wednesday", "Thursday"].includes(weekday)) {
    return { kind: "weekday_daily_pulse_review", modes: ["daily_pulse"] };
  }
  return { kind: "weekend_no_scheduled_review", modes: [] };
}

function modeCutoff(gate: Track54ModeGate): {
  activeWeekdays: number[];
  cutoffHour: number;
  cutoffMinute: number;
  label: Track54HeartbeatNextEligibleRunStatus["cutoff_local_time"];
} {
  if (gate.mode === "friday_deep") {
    return {
      activeWeekdays: [5],
      cutoffHour: 16,
      cutoffMinute: 50,
      label: "16:50 MT",
    };
  }
  return {
    activeWeekdays: [1, 2, 3, 4, 5],
    cutoffHour: 16,
    cutoffMinute: 10,
    label: "16:10 MT",
  };
}

function nextEligibleRunStatuses(
  gate: Track54ModeGate,
  now: Date,
  localReviewDate: string,
): Track54HeartbeatNextEligibleRunStatus[] {
  const cutoff = modeCutoff(gate);
  const latestCompletedRunDate = track54CompletedAutomationDateKey(now, {
    activeWeekdays: cutoff.activeWeekdays,
    cutoffHour: cutoff.cutoffHour,
    cutoffMinute: cutoff.cutoffMinute,
  });
  return gate.artifact_gate_projection.next_eligible_run_dates.map((date) => {
    let status: NextEligibleRunDueStatus = "future_scheduled";
    if (date < localReviewDate) {
      status = "missed_or_pending";
    } else if (date === localReviewDate) {
      status = date <= latestCompletedRunDate ? "due_now" : "not_yet_due";
    }
    return {
      date,
      status,
      artifact_due: status === "due_now" || status === "missed_or_pending",
      cutoff_local_time: cutoff.label,
    };
  });
}

export function loadTrack54ReadinessReport(reportPath = DEFAULT_REPORT_PATH): Track54ReadinessReport {
  const resolvedPath = resolve(reportPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Track 54 readiness report not found at ${resolvedPath}`);
  }
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf-8")) as Partial<Track54ReadinessReport>;
  if (parsed.schema_version !== "track54_readiness_report_v1") {
    throw new Error(`Unexpected Track 54 readiness report schema at ${resolvedPath}`);
  }
  return parsed as Track54ReadinessReport;
}

function gateCollectionActionSummary(report: Track54ReadinessReport): string {
  const gateSummaries = report.mode_gates
    .filter((gate) => gate.artifact_gate_projection.missing_clean_artifact_days > 0)
    .map((gate) => {
      const nextDate = gate.artifact_gate_projection.earliest_candidate_date;
      const nextDateText = nextDate ? `, earliest candidate ${nextDate}` : "";
      return `${gate.mode} ${gate.artifact_gate_projection.clean_artifact_days_found}/${gate.review_window.required_artifact_days} clean${nextDateText}`;
    });
  if (gateSummaries.length === 0) return "all tracked modes have enough clean artifact days";
  return gateSummaries.join("; ");
}

export function track54NextSafeOperatorAction(report: Track54ReadinessReport): string {
  const grokRunnerProof = report.acceptance_audit.grok_runner_proof;
  const hermesTerminalProof = report.acceptance_audit.hermes_terminal_proof;
  const gateSummary = gateCollectionActionSummary(report);
  const blockerText = [
    ...report.completion_blockers,
    ...report.acceptance_audit.completion_blockers,
  ].join(" ");
  const credentialBlocked = (grokRunnerProof.checked && !grokRunnerProof.ok && Boolean(grokRunnerProof.credential_issue))
    || /grok cli\/auth preflight failed|credential|preflight/i.test(blockerText);

  if (credentialBlocked) {
    if (hermesTerminalProof?.checked && hermesTerminalProof.ok && report.mode_gates.some((gate) => gate.promotion_status !== "ready_for_human_approval")) {
      return `Let scheduled no-write windows collect clean artifacts (${gateSummary}); Hermes may recover missing/invalid same-day artifacts through the deterministic health path. Refresh normal Grok credentials before any write-mode approval. Do not run any write command directly.`;
    }
    return "Refresh Grok credentials with `grok login` or add `XAI_API_KEY` to `.env.local`, then run `npm run track54:recover-after-grok-login`. Do not run the scout or any write command directly.";
  }

  if (report.mode_gates.some((gate) => gate.promotion_status !== "ready_for_human_approval")) {
    return `Keep collecting no-write artifacts until the matching mode gate is ready for human approval (${gateSummary}).`;
  }

  return "Review the mode-scoped promotion brief; only register write-mode automations after explicit Kyle approval and after disabling the matching dry-run collector.";
}

export function summarizeTrack54ReadinessReport(
  report: Track54ReadinessReport,
  options: {
    reportPath?: string;
    now?: Date;
    maxAgeHours?: number;
    maxBrowserSmokeAgeHours?: number;
  } = {},
): Track54HeartbeatSummary {
  const checkedAt = options.now ?? new Date();
  const localReviewDate = track54AutomationDateKey(checkedAt);
  const localReviewWeekday = localWeekday(checkedAt);
  const reviewContext = heartbeatReviewKind(localReviewWeekday);
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const maxBrowserSmokeAgeHours = options.maxBrowserSmokeAgeHours ?? DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS;
  const reportPath = resolve(options.reportPath ?? DEFAULT_REPORT_PATH);
  const persistedPath = report.persisted_report_path ? resolve(report.persisted_report_path) : null;
  const persistedPathMatches = persistedPath === reportPath;
  const reportAgeHours = hoursBetween(checkedAt, report.generated_at);
  const reportFreshness = proofFreshnessStatus(reportAgeHours, maxAgeHours);
  const reportFreshEnough = reportFreshness === "fresh";
  const browserSmokeProof = report.acceptance_audit.browser_smoke_proof;
  const grokRunnerProof = report.acceptance_audit.grok_runner_proof;
  const hermesTerminalProof = report.acceptance_audit.hermes_terminal_proof;
  const browserSmokeGeneratedAt = browserSmokeProof.generated_at ?? null;
  const browserSmokeAgeHours = browserSmokeGeneratedAt ? hoursBetween(checkedAt, browserSmokeGeneratedAt) : null;
  const browserSmokeFreshness = browserProofFreshnessStatus(
    browserSmokeProof,
    browserSmokeAgeHours,
    maxBrowserSmokeAgeHours,
  );
  const browserSmokeFreshEnough = browserSmokeFreshness === "fresh";
  const missingPromptFragmentCount = report.codex_automation_checks
    .reduce((sum, check) => sum + check.missing_prompt_fragments.length, 0);
  const codexPromptsClean = missingPromptFragmentCount === 0
    && report.codex_automation_checks.every((check) => check.prompt_boundary_present !== false && check.forbidden_prompt_boundary_present !== false);
  const writeAutomationsSafe = report.write_automation_checks.every((check) => check.safe_until_human_approval);

  const heartbeatBlockers = [
    ...(persistedPathMatches ? [] : ["Persisted readiness report path does not match the reviewed report path."]),
    ...[proofFreshnessBlocker("Persisted readiness report", reportFreshness, maxAgeHours)].filter((blocker): blocker is string => Boolean(blocker)),
    ...[browserProofFreshnessBlocker(browserSmokeFreshness, maxBrowserSmokeAgeHours)].filter((blocker): blocker is string => Boolean(blocker)),
    ...(codexPromptsClean ? [] : ["Codex automation prompt contract has missing or forbidden fragments."]),
    ...(writeAutomationsSafe ? [] : ["A write-mode Codex automation is active or unsafe before human approval."]),
    ...(report.production_writes_enabled ? ["Readiness report says production writes are enabled before completion."] : []),
  ];

  return {
    schema_version: "track54_heartbeat_summary_v1",
    checked_at: checkedAt.toISOString(),
    local_review_date: localReviewDate,
    local_review_weekday: localReviewWeekday,
    local_review_kind: reviewContext.kind,
    review_modes_to_inspect: reviewContext.modes,
    report_path: reportPath,
    persisted_report_path: persistedPath,
    persisted_path_matches_report_path: persistedPathMatches,
    report_generated_at: report.generated_at,
    report_age_hours: roundHours(reportAgeHours),
    max_report_age_hours: maxAgeHours,
    report_freshness_status: reportFreshness,
    report_fresh_enough: reportFreshEnough,
    browser_smoke_proof_generated_at: browserSmokeGeneratedAt,
    browser_smoke_proof_age_hours: roundHours(browserSmokeAgeHours),
    max_browser_smoke_proof_age_hours: maxBrowserSmokeAgeHours,
    browser_smoke_proof_ok: browserSmokeProof.checked ? browserSmokeProof.ok : null,
    browser_smoke_proof_freshness_status: browserSmokeFreshness,
    browser_smoke_proof_fresh_enough: browserSmokeFreshEnough,
    overall_status: report.overall_status,
    acceptance_audit_status: report.acceptance_audit.overall_status,
    grok_runner: {
      checked: grokRunnerProof.checked,
      ok: grokRunnerProof.ok,
      credential_source: grokRunnerProof.credential_source ?? null,
      credential_issue: grokRunnerProof.credential_issue ?? null,
      xai_api_key_present: grokRunnerProof.xai_api_key_present ?? null,
      cli_auth_file_present: grokRunnerProof.cli_auth_file_present ?? null,
      cli_auth_expires_at: grokRunnerProof.cli_auth_expires_at ?? null,
      cli_auth_expired: grokRunnerProof.cli_auth_expired ?? null,
    },
    hermes_terminal: {
      checked: hermesTerminalProof?.checked ?? false,
      ok: hermesTerminalProof?.ok ?? false,
      hermes_version_ok: hermesTerminalProof?.hermes_version_ok ?? null,
      xai_oauth_logged_in: hermesTerminalProof?.xai_oauth_logged_in ?? null,
      model_smoke_ok: hermesTerminalProof?.model_smoke_ok ?? null,
      x_search_tool_listed: hermesTerminalProof?.x_search_tool_listed ?? null,
      x_search_globally_enabled: hermesTerminalProof?.x_search_globally_enabled ?? null,
      toolset_override_required: hermesTerminalProof?.toolset_override_required ?? null,
      provider: hermesTerminalProof?.provider ?? null,
      model: hermesTerminalProof?.model ?? null,
    },
    production_writes_enabled: report.production_writes_enabled,
    human_approval_required_before_writes: report.human_approval_required_before_writes,
    codex_automation_prompts_clean: codexPromptsClean,
    codex_automation_missing_prompt_fragment_count: missingPromptFragmentCount,
    write_automations_safe: writeAutomationsSafe,
    mode_gates: report.mode_gates.map((gate) => ({
      mode: gate.mode,
      review_verdict: gate.review_verdict,
      promotion_status: gate.promotion_status,
      artifact_days_found: gate.review_window.artifact_days_found,
      required_artifact_days: gate.review_window.required_artifact_days,
      clean_artifact_days_found: gate.artifact_gate_projection.clean_artifact_days_found,
      missing_clean_artifact_days: gate.artifact_gate_projection.missing_clean_artifact_days,
      earliest_candidate_date: gate.artifact_gate_projection.earliest_candidate_date,
      accepted_signal_count: gate.evidence.accepted_signal_count,
      accepted_decision_grade_count: gate.evidence.accepted_decision_grade_count,
      selected_artifacts: gate.selected_artifacts,
      write_mode_proposal_ids: gate.write_mode_codex_automation_proposals.map((proposal) => proposal.id),
      write_mode_proposals: gate.write_mode_codex_automation_proposals.map((proposal) => ({
        id: proposal.id,
        approval_review_window: proposal.approval_review_window,
      })),
      post_approval_transition: {
        disable_before_registering_write_mode: gate.post_approval_automation_transition.disable_before_registering_write_mode,
        register_after_disable: gate.post_approval_automation_transition.register_after_disable,
        keep_active: gate.post_approval_automation_transition.keep_active,
      },
      next_eligible_run_dates: gate.artifact_gate_projection.next_eligible_run_dates,
      next_eligible_run_statuses: nextEligibleRunStatuses(gate, checkedAt, localReviewDate),
    })),
    completion_blockers: report.acceptance_audit.completion_blockers,
    heartbeat_blockers: heartbeatBlockers,
    next_actions: report.next_actions,
    next_safe_operator_action: track54NextSafeOperatorAction(report),
    status: heartbeatBlockers.length === 0 ? "ready_for_review" : "hold_manual_review",
    safe_to_promote_without_human_approval: false,
  };
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Track 54 Heartbeat Summary

Usage:
  npm --silent run track54:heartbeat-summary
  npm --silent run track54:heartbeat-summary -- --report scratch/track54-readiness/latest-readiness-report.json

Options:
  --report <path>          Persisted readiness report JSON path.
  --max-age-hours <hours>  Maximum report age before heartbeat holds review. Default: ${DEFAULT_MAX_AGE_HOURS}.
  --max-browser-smoke-age-hours <hours>
                           Maximum browser-smoke proof age before heartbeat holds review. Default: ${DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS}.
  --now <iso>              Override current time for deterministic tests.
`);
  process.exit(0);
}

if (IS_CLI) {
  try {
    const reportPath = optionValue("--report") ?? DEFAULT_REPORT_PATH;
    const report = loadTrack54ReadinessReport(reportPath);
    const summary = summarizeTrack54ReadinessReport(report, {
      reportPath,
      maxAgeHours: parsePositiveNumber(optionValue("--max-age-hours"), DEFAULT_MAX_AGE_HOURS),
      maxBrowserSmokeAgeHours: parsePositiveNumber(optionValue("--max-browser-smoke-age-hours"), DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS),
      now: optionValue("--now") ? new Date(optionValue("--now")!) : undefined,
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
