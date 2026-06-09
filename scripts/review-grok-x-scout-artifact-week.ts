#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGrokXScoutJson, type XScoutMode } from "@/lib/x-api/x-scout-contract";
import { validateXScoutSignal } from "@/lib/x-api/x-signal-validation";
import type { PriceSnapshotStatus } from "@/lib/x-api/x-signal-valuation";
import { track54CompletedAutomationDateKey } from "@/lib/x-api/track54-date";

type Verdict = "insufficient_artifacts" | "hold_manual_review" | "candidate_for_enablement";

interface ScoutSummary {
  artifact_path?: string;
  status?: string;
  parse_status?: string;
  error_message?: string;
  dry_run?: boolean;
  write?: boolean;
  scout_run_id?: string | null;
  price_snapshot_status?: PriceSnapshotStatus;
  raw_signal_count?: number;
  accepted_signal_count?: number;
  rejected_signal_count?: number;
}

export interface ArtifactDayReview {
  date: string;
  artifact_path: string;
  artifact_sha256: string | null;
  summary_path: string;
  artifact_found: boolean;
  summary_found: boolean;
  parse_status: "ok" | "missing" | "failed";
  error_message?: string;
  dry_run: boolean | null;
  write: boolean | null;
  scout_run_id: string | null;
  no_write_evidence: boolean;
  summary_raw_signal_count: number | null;
  summary_accepted_signal_count: number | null;
  summary_rejected_signal_count: number | null;
  summary_count_mismatch: boolean;
  output_run_date: string | null;
  output_mode: XScoutMode | null;
  artifact_identity_mismatch: boolean;
  mode_schedule_mismatch: boolean;
  price_snapshot_status: PriceSnapshotStatus;
  raw_signal_count: number;
  accepted_signal_count: number;
  rejected_signal_count: number;
  accepted_by_tier: Record<string, number>;
  accepted_decision_grade_count: number;
  rejected_reasons: string[];
  accepted_unlisted_count: number;
  official_verification_count: number;
}

export interface ParseFailureEvidence {
  date: string;
  artifact_path: string;
  summary_path: string;
  artifact_found: boolean;
  summary_found: boolean;
  error_message?: string;
  no_write_evidence: boolean;
  price_snapshot_status: PriceSnapshotStatus;
}

export interface ArtifactWeekReview {
  schema_version: "grok_x_scout_artifact_week_review_v1";
  mode: XScoutMode;
  from_date: string;
  to_date: string;
  required_artifact_days: number;
  minimum_accepted_signals: number;
  artifact_days_found: number;
  totals: {
    raw_signal_count: number;
    accepted_signal_count: number;
    rejected_signal_count: number;
    parse_failures: number;
    stale_or_missing_price_days: number;
    accepted_unlisted_count: number;
    official_verification_count: number;
    write_mode_artifact_days: number;
    missing_no_write_evidence_days: number;
    summary_count_mismatch_days: number;
    artifact_identity_mismatch_days: number;
    mode_schedule_mismatch_days: number;
    accepted_decision_grade_count: number;
  };
  days: ArtifactDayReview[];
  parse_failure_details: ParseFailureEvidence[];
  verdict: Verdict;
  quality_warnings: string[];
  recommendation: string;
  guardrails: {
    no_supabase_writes: boolean;
    grok_is_scout_only: true;
    human_review_required_before_write_automation: true;
  };
}

const args = process.argv.slice(2);
const POSITIONAL_ARGS = args.filter((arg) => !arg.startsWith("--"));
const MODES = ["daily_pulse", "friday_deep", "manual_test"] as const;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

function optionValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const envValue = process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag) || process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`] === "true";
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Grok X Scout Artifact Week Review

Usage:
  npm run grok:x-scout:review-week
  npm run grok:x-scout:review-week -- friday_deep
  npm run grok:x-scout:review-week -- --from 2026-06-01 --to 2026-06-05

Options:
  --mode daily_pulse|friday_deep|manual_test   Defaults to daily_pulse. Positional mode is also accepted.
  --from YYYY-MM-DD                            Defaults to 6 days before --to.
  --to YYYY-MM-DD                              Defaults to today.
  --required-days <number>                     Defaults to 5 for daily_pulse and 1 for friday_deep.
  --min-accepted-signals <number>              Defaults to 1.
  --artifact-root <path>                       Defaults to data/X Scout Runs.
`);
  process.exit(0);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKeyValue: string, days: number): string {
  const date = new Date(`${dateKeyValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function dateRange(fromDate: string, toDate: string): string[] {
  if (fromDate > toDate) {
    throw new Error(`Invalid Track 54 artifact review window: fromDate ${fromDate} is after toDate ${toDate}. Use --to for the last completed artifact date, or use track54:artifact-health -- --date <local-run-date> for same-day due checks.`);
  }
  const dates: string[] = [];
  for (let current = fromDate; current <= toDate; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function readSummary(path: string): ScoutSummary {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ScoutSummary;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pushReason(target: string[], reasons: string[]) {
  for (const reason of reasons) {
    if (!target.includes(reason)) target.push(reason);
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasCountMismatch(summaryCounts: {
  raw: number | null;
  accepted: number | null;
  rejected: number | null;
}, computedCounts: {
  raw: number;
  accepted: number;
  rejected: number;
}): boolean {
  return (
    (summaryCounts.raw !== null && summaryCounts.raw !== computedCounts.raw) ||
    (summaryCounts.accepted !== null && summaryCounts.accepted !== computedCounts.accepted) ||
    (summaryCounts.rejected !== null && summaryCounts.rejected !== computedCounts.rejected)
  );
}

function isDecisionGradeTier(tier: string): boolean {
  return tier === "tier1" || tier === "tier2" || tier === "tier3";
}

export function defaultRequiredArtifactDaysForMode(mode: XScoutMode): number {
  return mode === "friday_deep" ? 1 : 5;
}

function isFriday(dateKeyValue: string): boolean {
  return new Date(`${dateKeyValue}T00:00:00Z`).getUTCDay() === 5;
}

function hasModeScheduleMismatch(date: string, mode: XScoutMode): boolean {
  return mode === "friday_deep" && !isFriday(date);
}

function summaryPathsForDate(artifactRoot: string, date: string, mode: XScoutMode): string[] {
  const dayRoot = resolve(artifactRoot, date);
  const canonicalSummaryPath = resolve(dayRoot, `${mode}-summary.json`);
  const paths = new Set<string>();

  if (existsSync(canonicalSummaryPath)) paths.add(canonicalSummaryPath);

  try {
    for (const entry of readdirSync(dayRoot)) {
      if (entry.startsWith(`${mode}-`) && entry.endsWith("-summary.json")) {
        paths.add(resolve(dayRoot, entry));
      }
    }
  } catch {
    // A missing day directory is represented by the canonical missing summary below.
  }

  if (paths.size === 0) paths.add(canonicalSummaryPath);
  return [...paths].sort();
}

function reviewArtifactDayCandidate(params: {
  artifactRoot: string;
  date: string;
  mode: XScoutMode;
  summaryPath: string;
}): ArtifactDayReview {
  const { artifactRoot, date, mode, summaryPath } = params;
  const summary = readSummary(summaryPath);
  const summaryFound = existsSync(summaryPath);
  const summaryRawCount = numberOrNull(summary.raw_signal_count);
  const summaryAcceptedCount = numberOrNull(summary.accepted_signal_count);
  const summaryRejectedCount = numberOrNull(summary.rejected_signal_count);
  const artifactPath = summary.artifact_path ?? resolve(artifactRoot, date, `${mode}-raw.json`);
  const scoutRunId = typeof summary.scout_run_id === "string" ? summary.scout_run_id : null;
  const noWriteEvidence = summaryFound && summary.dry_run === true && summary.write === false && !scoutRunId;
  const modeScheduleMismatch = hasModeScheduleMismatch(date, mode);
  const summaryReportsFailure = summary.status === "failed" || summary.parse_status === "failed";
  const summaryErrorMessage = typeof summary.error_message === "string" ? summary.error_message : undefined;

  if (!existsSync(artifactPath)) {
    return {
      date,
      artifact_path: artifactPath,
      artifact_sha256: null,
      summary_path: summaryPath,
      artifact_found: false,
      summary_found: summaryFound,
      parse_status: summaryReportsFailure ? "failed" : "missing",
      error_message: summaryErrorMessage,
      dry_run: typeof summary.dry_run === "boolean" ? summary.dry_run : null,
      write: typeof summary.write === "boolean" ? summary.write : null,
      scout_run_id: scoutRunId,
      no_write_evidence: noWriteEvidence,
      summary_raw_signal_count: summaryRawCount,
      summary_accepted_signal_count: summaryAcceptedCount,
      summary_rejected_signal_count: summaryRejectedCount,
      summary_count_mismatch: false,
      output_run_date: null,
      output_mode: null,
      artifact_identity_mismatch: false,
      mode_schedule_mismatch: false,
      price_snapshot_status: summary.price_snapshot_status ?? "not_checked",
      raw_signal_count: 0,
      accepted_signal_count: 0,
      rejected_signal_count: 0,
      accepted_by_tier: {},
      accepted_decision_grade_count: 0,
      rejected_reasons: summaryReportsFailure ? ["artifact_generation_failed"] : [],
      accepted_unlisted_count: 0,
      official_verification_count: 0,
    };
  }

  let rawArtifact: string | null = null;
  try {
    rawArtifact = readFileSync(artifactPath, "utf-8");
    const output = parseGrokXScoutJson(rawArtifact);
    const priceSnapshotStatus = summary.price_snapshot_status ?? "not_checked";
    const acceptedByTier: Record<string, number> = {};
    const rejectedReasons: string[] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;
    let acceptedUnlistedCount = 0;
    let acceptedDecisionGradeCount = 0;
    let officialVerificationCount = 0;

    for (const signal of output.signals) {
      const validation = validateXScoutSignal(signal, {
        runDate: output.run_date,
        mode: output.mode,
        priceSnapshotStatus,
      });
      if (validation.accepted) {
        acceptedCount += 1;
        const tier = validation.metadata.source_tier;
        acceptedByTier[tier] = (acceptedByTier[tier] ?? 0) + 1;
        if (tier === "unlisted") acceptedUnlistedCount += 1;
        if (isDecisionGradeTier(tier)) acceptedDecisionGradeCount += 1;
        if (validation.metadata.needs_official_verification) officialVerificationCount += 1;
      } else {
        rejectedCount += 1;
        pushReason(rejectedReasons, validation.reasons);
      }
    }
    const summaryCountMismatch = hasCountMismatch(
      {
        raw: summaryRawCount,
        accepted: summaryAcceptedCount,
        rejected: summaryRejectedCount,
      },
      {
        raw: output.signals.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
      },
    );
    const artifactIdentityMismatch = output.run_date !== date || output.mode !== mode;

    return {
      date,
      artifact_path: artifactPath,
      artifact_sha256: sha256(rawArtifact),
      summary_path: summaryPath,
      artifact_found: true,
      summary_found: summaryFound,
      parse_status: "ok",
      dry_run: typeof summary.dry_run === "boolean" ? summary.dry_run : null,
      write: typeof summary.write === "boolean" ? summary.write : null,
      scout_run_id: scoutRunId,
      no_write_evidence: noWriteEvidence,
      summary_raw_signal_count: summaryRawCount,
      summary_accepted_signal_count: summaryAcceptedCount,
      summary_rejected_signal_count: summaryRejectedCount,
      summary_count_mismatch: summaryCountMismatch,
      output_run_date: output.run_date,
      output_mode: output.mode,
      artifact_identity_mismatch: artifactIdentityMismatch,
      mode_schedule_mismatch: modeScheduleMismatch,
      price_snapshot_status: priceSnapshotStatus,
      raw_signal_count: output.signals.length,
      accepted_signal_count: acceptedCount,
      rejected_signal_count: rejectedCount,
      accepted_by_tier: acceptedByTier,
      accepted_decision_grade_count: acceptedDecisionGradeCount,
      rejected_reasons: rejectedReasons.sort(),
      accepted_unlisted_count: acceptedUnlistedCount,
      official_verification_count: officialVerificationCount,
    };
  } catch (error) {
    return {
      date,
      artifact_path: artifactPath,
      artifact_sha256: rawArtifact ? sha256(rawArtifact) : null,
      summary_path: summaryPath,
      artifact_found: true,
      summary_found: summaryFound,
      parse_status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
      dry_run: typeof summary.dry_run === "boolean" ? summary.dry_run : null,
      write: typeof summary.write === "boolean" ? summary.write : null,
      scout_run_id: scoutRunId,
      no_write_evidence: noWriteEvidence,
      summary_raw_signal_count: summaryRawCount,
      summary_accepted_signal_count: summaryAcceptedCount,
      summary_rejected_signal_count: summaryRejectedCount,
      summary_count_mismatch: false,
      output_run_date: null,
      output_mode: null,
      artifact_identity_mismatch: false,
      mode_schedule_mismatch: false,
      price_snapshot_status: summary.price_snapshot_status ?? "not_checked",
      raw_signal_count: 0,
      accepted_signal_count: 0,
      rejected_signal_count: 0,
      accepted_by_tier: {},
      accepted_decision_grade_count: 0,
      rejected_reasons: ["artifact_parse_failed"],
      accepted_unlisted_count: 0,
      official_verification_count: 0,
    };
  }
}

function hasWriteModeEvidence(day: ArtifactDayReview): boolean {
  return day.artifact_found && (day.write === true || Boolean(day.scout_run_id));
}

function artifactCandidateScore(day: ArtifactDayReview): number[] {
  return [
    day.parse_status === "ok" ? 1 : 0,
    day.no_write_evidence ? 1 : 0,
    day.artifact_identity_mismatch ? 0 : 1,
    day.mode_schedule_mismatch ? 0 : 1,
    day.price_snapshot_status === "fresh" ? 1 : 0,
    day.accepted_decision_grade_count,
    day.accepted_signal_count,
    day.raw_signal_count,
    day.summary_found ? 1 : 0,
    day.artifact_found ? 1 : 0,
  ];
}

function compareArtifactCandidates(left: ArtifactDayReview, right: ArtifactDayReview): number {
  const leftScore = artifactCandidateScore(left);
  const rightScore = artifactCandidateScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    const delta = leftScore[index]! - rightScore[index]!;
    if (delta !== 0) return delta;
  }
  return left.summary_path.localeCompare(right.summary_path);
}

function selectArtifactDayReview(candidates: ArtifactDayReview[]): ArtifactDayReview {
  const writeModeCandidates = candidates.filter(hasWriteModeEvidence);
  if (writeModeCandidates.length > 0) {
    return [...writeModeCandidates].sort(compareArtifactCandidates).at(-1)!;
  }
  return [...candidates].sort(compareArtifactCandidates).at(-1)!;
}

export function reviewGrokXScoutArtifactWeek(options: {
  artifactRoot?: string;
  mode?: XScoutMode;
  fromDate?: string;
  toDate?: string;
  requiredArtifactDays?: number;
  minimumAcceptedSignals?: number;
} = {}): ArtifactWeekReview {
  const mode = options.mode ?? "daily_pulse";
  const toDate = options.toDate ?? track54CompletedAutomationDateKey(new Date(), {
    activeWeekdays: mode === "friday_deep" ? [5] : [1, 2, 3, 4, 5],
    cutoffHour: 16,
    cutoffMinute: mode === "friday_deep" ? 50 : 10,
  });
  const requiredArtifactDays = options.requiredArtifactDays ?? defaultRequiredArtifactDaysForMode(mode);
  const minimumAcceptedSignals = options.minimumAcceptedSignals ?? 1;
  const fromDate = options.fromDate ?? addDays(toDate, -(Math.max(requiredArtifactDays, 7) - 1));
  const artifactRoot = options.artifactRoot ?? resolve(process.cwd(), "data", "X Scout Runs");

  const days = dateRange(fromDate, toDate).map((date): ArtifactDayReview => {
    const candidates = summaryPathsForDate(artifactRoot, date, mode).map((summaryPath) =>
      reviewArtifactDayCandidate({ artifactRoot, date, mode, summaryPath }),
    );
    return selectArtifactDayReview(candidates);
  });

  const totals = days.reduce<ArtifactWeekReview["totals"]>(
    (acc, day) => {
      acc.raw_signal_count += day.raw_signal_count;
      acc.accepted_signal_count += day.accepted_signal_count;
      acc.rejected_signal_count += day.rejected_signal_count;
      if (day.parse_status === "failed") acc.parse_failures += 1;
      if (day.artifact_found && ["not_checked", "missing", "stale", "partial"].includes(day.price_snapshot_status)) {
        acc.stale_or_missing_price_days += 1;
      }
      acc.accepted_unlisted_count += day.accepted_unlisted_count;
      acc.official_verification_count += day.official_verification_count;
      acc.accepted_decision_grade_count += day.accepted_decision_grade_count;
      if (day.artifact_found && (day.write === true || Boolean(day.scout_run_id))) {
        acc.write_mode_artifact_days += 1;
      }
      if (day.artifact_found && !day.no_write_evidence) {
        acc.missing_no_write_evidence_days += 1;
      }
      if (day.summary_count_mismatch) {
        acc.summary_count_mismatch_days += 1;
      }
      if (day.artifact_identity_mismatch) {
        acc.artifact_identity_mismatch_days += 1;
      }
      if (day.mode_schedule_mismatch) {
        acc.mode_schedule_mismatch_days += 1;
      }
      return acc;
    },
    {
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
  );

  const artifactDaysFound = days.filter((day) => day.artifact_found && day.parse_status === "ok").length;
  const parseFailureDetails: ParseFailureEvidence[] = days
    .filter((day) => day.parse_status === "failed")
    .map((day) => ({
      date: day.date,
      artifact_path: day.artifact_path,
      summary_path: day.summary_path,
      artifact_found: day.artifact_found,
      summary_found: day.summary_found,
      error_message: day.error_message,
      no_write_evidence: day.no_write_evidence,
      price_snapshot_status: day.price_snapshot_status,
    }));
  const qualityWarnings: string[] = [];
  if (totals.stale_or_missing_price_days > 0) {
    qualityWarnings.push(`${totals.stale_or_missing_price_days} artifact day(s) lacked fresh price status`);
  }
  if (totals.accepted_unlisted_count > 0) {
    qualityWarnings.push(`${totals.accepted_unlisted_count} accepted signal(s) came from unlisted handles`);
  }
  if (totals.accepted_signal_count < minimumAcceptedSignals) {
    qualityWarnings.push(`need at least ${minimumAcceptedSignals} accepted signal(s); found ${totals.accepted_signal_count}`);
  }
  if (totals.accepted_signal_count >= minimumAcceptedSignals && totals.accepted_decision_grade_count === 0) {
    qualityWarnings.push("accepted signals came only from low-grade or unlisted source tiers");
  }
  if (totals.write_mode_artifact_days > 0) {
    qualityWarnings.push(`${totals.write_mode_artifact_days} artifact day(s) show write-mode evidence`);
  }
  if (totals.missing_no_write_evidence_days > 0) {
    qualityWarnings.push(`${totals.missing_no_write_evidence_days} artifact day(s) lack dry-run/no-write proof`);
  }
  if (totals.summary_count_mismatch_days > 0) {
    qualityWarnings.push(`${totals.summary_count_mismatch_days} artifact day(s) had summary counts that disagreed with parsed artifact validation`);
  }
  if (totals.artifact_identity_mismatch_days > 0) {
    qualityWarnings.push(`${totals.artifact_identity_mismatch_days} artifact day(s) had run date or mode mismatches`);
  }
  if (totals.mode_schedule_mismatch_days > 0) {
    qualityWarnings.push(`${totals.mode_schedule_mismatch_days} friday_deep artifact day(s) were not Friday runs`);
  }

  let verdict: Verdict = "candidate_for_enablement";
  const blockers: string[] = [];
  if (totals.parse_failures > 0) {
    verdict = "hold_manual_review";
    const details = parseFailureDetails
      .map((failure) => `${failure.date}${failure.error_message ? ` (${failure.error_message})` : ""}`)
      .join("; ");
    blockers.push(`${totals.parse_failures} artifact parse failure(s)${details ? `: ${details}` : ""}`);
  }
  if (artifactDaysFound < requiredArtifactDays && verdict !== "hold_manual_review") {
    verdict = "insufficient_artifacts";
    blockers.push(`need ${requiredArtifactDays} clean artifact days; found ${artifactDaysFound}`);
  }
  if (totals.accepted_signal_count < minimumAcceptedSignals && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`need at least ${minimumAcceptedSignals} accepted signal(s); found ${totals.accepted_signal_count}`);
  }
  if (totals.stale_or_missing_price_days > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.stale_or_missing_price_days} artifact day(s) lacked fresh price status`);
  }
  if (totals.accepted_unlisted_count > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.accepted_unlisted_count} accepted signal(s) came from unlisted handles`);
  }
  if (totals.write_mode_artifact_days > 0) {
    verdict = "hold_manual_review";
    blockers.push(`${totals.write_mode_artifact_days} artifact day(s) show write-mode evidence`);
  }
  if (totals.missing_no_write_evidence_days > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.missing_no_write_evidence_days} artifact day(s) lack dry-run/no-write proof`);
  }
  if (totals.summary_count_mismatch_days > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.summary_count_mismatch_days} artifact day(s) had summary/artifact count mismatches`);
  }
  if (totals.artifact_identity_mismatch_days > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.artifact_identity_mismatch_days} artifact day(s) had run date or mode mismatches`);
  }
  if (totals.mode_schedule_mismatch_days > 0 && verdict !== "insufficient_artifacts") {
    verdict = "hold_manual_review";
    blockers.push(`${totals.mode_schedule_mismatch_days} friday_deep artifact day(s) were not Friday runs`);
  }
  if (
    totals.accepted_signal_count >= minimumAcceptedSignals &&
    totals.accepted_decision_grade_count === 0 &&
    verdict !== "insufficient_artifacts"
  ) {
    verdict = "hold_manual_review";
    blockers.push("accepted signals came only from low-grade or unlisted source tiers");
  }

  const recommendation =
    verdict === "candidate_for_enablement"
      ? "Clean enough to ask for human approval to register write-mode Grok routines; do not auto-enable them from this script."
      : `Keep Grok in manual/dry-run mode: ${blockers.join("; ")}.`;

  return {
    schema_version: "grok_x_scout_artifact_week_review_v1",
    mode,
    from_date: fromDate,
    to_date: toDate,
    required_artifact_days: requiredArtifactDays,
    minimum_accepted_signals: minimumAcceptedSignals,
    artifact_days_found: artifactDaysFound,
    totals,
    days,
    parse_failure_details: parseFailureDetails,
    verdict,
    quality_warnings: qualityWarnings,
    recommendation,
    guardrails: {
      no_supabase_writes: totals.write_mode_artifact_days === 0 && totals.missing_no_write_evidence_days === 0,
      grok_is_scout_only: true,
      human_review_required_before_write_automation: true,
    },
  };
}

if (IS_CLI) {
  if (hasFlag("--date")) {
    console.error("`--date` is not supported by the artifact-week reviewer. Use `--to YYYY-MM-DD` for a completed review window, or use `track54:artifact-health -- --date YYYY-MM-DD` for same-day due checks.");
    process.exit(1);
  }

  const modeArg = optionValue("--mode");
  const positionalMode = POSITIONAL_ARGS.find((arg): arg is XScoutMode =>
    (MODES as readonly string[]).includes(arg),
  );
  const mode = (modeArg && (MODES as readonly string[]).includes(modeArg)
    ? modeArg
    : positionalMode ?? "daily_pulse") as XScoutMode;
  const positionalDates = POSITIONAL_ARGS.filter((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  const positionalNumbers = POSITIONAL_ARGS.filter((arg) => /^\d+$/.test(arg));
  const review = reviewGrokXScoutArtifactWeek({
    artifactRoot: optionValue("--artifact-root"),
    mode,
    fromDate: optionValue("--from") ?? positionalDates[0],
    toDate: optionValue("--to") ?? positionalDates[1],
    requiredArtifactDays: optionValue("--required-days")
      ? Number(optionValue("--required-days"))
      : positionalNumbers[0]
        ? Number(positionalNumbers[0])
        : undefined,
    minimumAcceptedSignals: optionValue("--min-accepted-signals")
      ? Number(optionValue("--min-accepted-signals"))
      : positionalNumbers[1]
        ? Number(positionalNumbers[1])
        : undefined,
  });
  console.log(JSON.stringify(review, null, 2));
  if (review.verdict === "hold_manual_review") process.exit(2);
}
