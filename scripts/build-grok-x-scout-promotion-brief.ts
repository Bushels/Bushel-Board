#!/usr/bin/env npx tsx
import { reviewGrokXScoutArtifactWeek, type ArtifactWeekReview } from "./review-grok-x-scout-artifact-week";
import { TRACK54_WRITE_APPROVAL_PHRASE } from "@/lib/x-api/track54-write-approval";
import type { XScoutMode } from "@/lib/x-api/x-scout-contract";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PromotionStatus = "not_ready" | "ready_for_human_approval";

export interface WriteModeRoutine {
  name: string;
  schedule: string;
  command: string;
  status: "disabled_until_human_approval";
}

export interface WriteModeApprovalReviewWindow {
  mode: XScoutMode;
  from_date: string;
  to_date: string;
  artifact_days_found: number;
  required_artifact_days: number;
  accepted_signal_count: number;
  accepted_decision_grade_count: number;
}

export interface WriteModeCodexAutomationProposal {
  id: string;
  kind: "cron";
  name: string;
  schedule: string;
  rrule: string;
  execution_environment: "local";
  cwds: string[];
  model: "gpt-5.4";
  reasoning_effort: "medium";
  status_after_human_approval: "ACTIVE";
  command: string;
  approval_review_window: WriteModeApprovalReviewWindow;
  prompt: string;
  create_only_after: string[];
}

export interface PostApprovalAutomationTransition {
  disable_before_registering_write_mode: string[];
  register_after_disable: string[];
  keep_active: string[];
  operator_note: string;
}

export interface SelectedArtifactEvidence {
  date: string;
  artifact_path: string;
  artifact_sha256: string | null;
  summary_path: string;
  parse_status: "ok" | "missing" | "failed";
  no_write_evidence: boolean;
  raw_signal_count: number;
  accepted_signal_count: number;
  rejected_signal_count: number;
  accepted_decision_grade_count: number;
  price_snapshot_status: string;
}

export interface GrokXScoutPromotionBrief {
  schema_version: "grok_x_scout_promotion_brief_v1";
  generated_at: string;
  promotion_status: PromotionStatus;
  review_verdict: ArtifactWeekReview["verdict"];
  mode: XScoutMode;
  review_window: {
    from_date: string;
    to_date: string;
    artifact_days_found: number;
    required_artifact_days: number;
  };
  evidence: ArtifactWeekReview["totals"];
  selected_artifacts: SelectedArtifactEvidence[];
  parse_failure_details: ArtifactWeekReview["parse_failure_details"];
  quality_warnings: string[];
  promotion_blockers: string[];
  human_approval_required: true;
  approval_phrase: string;
  write_mode_routines: WriteModeRoutine[];
  write_mode_codex_automation_proposals: WriteModeCodexAutomationProposal[];
  post_approval_automation_transition: PostApprovalAutomationTransition;
  hard_boundaries: string[];
  source_review: {
    reviewer_script: "scripts/review-grok-x-scout-artifact-week.ts";
    no_auto_enablement: true;
    raw_artifacts_remain_local: true;
  };
}

const args = process.argv.slice(2);
const POSITIONAL_ARGS = args.filter((arg) => !arg.startsWith("--"));
const MODES = ["daily_pulse", "friday_deep", "manual_test"] as const;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
const BUSHEL_BOARD_CWD = "C:\\Users\\kyle\\Agriculture\\bushel-board-app";

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
Grok X Scout Promotion Brief

Usage:
  npm run grok:x-scout:promotion-brief
  npm run grok:x-scout:promotion-brief -- friday_deep
  npm run grok:x-scout:promotion-brief -- 2026-06-01 2026-06-05 5 1
  npm run grok:x-scout:promotion-brief -- --from 2026-06-01 --to 2026-06-05

Options:
  --mode daily_pulse|friday_deep|manual_test   Defaults to daily_pulse. Positional mode is also accepted.
  --from YYYY-MM-DD                            Passed to artifact-week review.
  --to YYYY-MM-DD                              Passed to artifact-week review.
  --required-days <number>                     Defaults to artifact-week review default.
  --min-accepted-signals <number>              Defaults to artifact-week review default.
  --artifact-root <path>                       Defaults to data/X Scout Runs.
`);
  process.exit(0);
}

function promotionBlockers(review: ArtifactWeekReview): string[] {
  const blockers: string[] = [];
  if (review.mode === "manual_test") {
    blockers.push("manual_test reviews cannot authorize write-mode automation");
  }
  if (review.verdict !== "candidate_for_enablement") {
    blockers.push(review.recommendation);
  }
  if (!review.guardrails.no_supabase_writes) {
    blockers.push("artifact review could not prove dry-run/no-write status");
  }
  if (!review.guardrails.human_review_required_before_write_automation) {
    blockers.push("human approval guardrail is missing");
  }
  if (review.totals.summary_count_mismatch_days > 0) {
    blockers.push("summary counts disagree with parsed artifact validation");
  }
  if (review.totals.artifact_identity_mismatch_days > 0) {
    blockers.push("artifact run dates or modes do not match the reviewed days");
  }
  if (review.totals.mode_schedule_mismatch_days > 0) {
    blockers.push("friday_deep artifacts must come from Friday runs");
  }
  if (
    review.totals.accepted_signal_count >= review.minimum_accepted_signals &&
    review.totals.accepted_decision_grade_count === 0
  ) {
    blockers.push("accepted signals came only from low-grade or unlisted source tiers");
  }
  return blockers;
}

function approvalArgs(review: ArtifactWeekReview): string {
  return `--approval-phrase "${TRACK54_WRITE_APPROVAL_PHRASE}" --approval-review-from ${review.from_date} --approval-review-to ${review.to_date}`;
}

function writeModeRoutinesForMode(review: ArtifactWeekReview): WriteModeRoutine[] {
  const approvalGateArgs = approvalArgs(review);
  if (review.mode === "daily_pulse") {
    return [
      {
        name: "grok-x-scout-daily",
        schedule: "Mon-Fri 4:05 PM MT",
        command: `npm run grok:x-scout -- daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --write ${approvalGateArgs}`,
        status: "disabled_until_human_approval",
      },
      {
        name: "daily-thesis-review",
        schedule: "Mon-Fri 4:25 PM MT",
        command: `npm run daily-thesis-review -- --write ${approvalGateArgs}`,
        status: "disabled_until_human_approval",
      },
    ];
  }
  if (review.mode === "friday_deep") {
    return [
      {
        name: "grok-x-scout-friday-deep",
        schedule: "Friday 4:50 PM MT",
        command: `npm run grok:x-scout -- friday_deep --runner auto --grok-cli-model grok-composer-2.5-fast --write ${approvalGateArgs}`,
        status: "disabled_until_human_approval",
      },
    ];
  }
  return [];
}

function proposalForRoutine(
  routine: WriteModeRoutine,
  review: ArtifactWeekReview,
  transition: Pick<PostApprovalAutomationTransition, "disable_before_registering_write_mode">,
): WriteModeCodexAutomationProposal {
  const disabledDryRunList = transition.disable_before_registering_write_mode.join(", ");
  const approvalReviewWindow: WriteModeApprovalReviewWindow = {
    mode: review.mode,
    from_date: review.from_date,
    to_date: review.to_date,
    artifact_days_found: review.artifact_days_found,
    required_artifact_days: review.required_artifact_days,
    accepted_signal_count: review.totals.accepted_signal_count,
    accepted_decision_grade_count: review.totals.accepted_decision_grade_count,
  };
  const approvalWindowPrompt =
    `Approved artifact review window: ${review.mode} ${review.from_date} through ${review.to_date}.`;
  const commonGuard = [
    "Confirm the matching dry-run artifact collector is disabled or inactive before running.",
    "Confirm this routine was explicitly approved by Kyle from the mode-scoped Track 54 promotion brief.",
    approvalWindowPrompt,
    "Do not call `/api/pipeline/run` or retired Grok Edge Functions.",
  ];

  if (routine.name === "grok-x-scout-daily") {
    return {
      id: "grok-x-scout-daily",
      kind: "cron",
      name: "Track 54 Grok X scout daily write",
      schedule: routine.schedule,
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=5;BYSECOND=0",
      execution_environment: "local",
      cwds: [BUSHEL_BOARD_CWD],
      model: "gpt-5.4",
      reasoning_effort: "medium",
      status_after_human_approval: "ACTIVE",
      command: routine.command,
      approval_review_window: approvalReviewWindow,
      prompt: `${commonGuard.join(" ")} The dry-run collector(s) that must already be disabled: ${disabledDryRunList}. In the workspace, run \`${routine.command}\`. Report run id, artifact path, artifact SHA-256, raw/accepted/rejected counts, price snapshot status, accepted counts by source tier, decision-grade accepted count, and validation warnings. Do not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, or thesis_packet_cache from this Grok scout routine.`,
      create_only_after: [
        "daily_pulse promotion_status is ready_for_human_approval",
        "Kyle explicitly approves the mode-scoped promotion brief",
        "grok-x-scout-artifact-week-review is disabled or inactive",
      ],
    };
  }

  if (routine.name === "daily-thesis-review") {
    return {
      id: "daily-thesis-review",
      kind: "cron",
      name: "Track 54 bounded daily thesis review write",
      schedule: routine.schedule,
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=25;BYSECOND=0",
      execution_environment: "local",
      cwds: [BUSHEL_BOARD_CWD],
      model: "gpt-5.4",
      reasoning_effort: "medium",
      status_after_human_approval: "ACTIVE",
      command: routine.command,
      approval_review_window: approvalReviewWindow,
      prompt: `${commonGuard.join(" ")} The dry-run collector(s) that must already be disabled: ${disabledDryRunList}. In the workspace, run \`${routine.command}\`. Report packet.x_signal_input_audit, accepted_x_signals count, decisions count, write_decisions count, writes attempted, writes applied, writes skipped, affected side/grain/market rows, stance/confidence deltas, price freshness status, and any review blockers. This routine may write only bounded daily trajectory updates; it must not write market_analysis, us_market_analysis, or thesis_packet_cache.`,
      create_only_after: [
        "daily_pulse promotion_status is ready_for_human_approval",
        "Kyle explicitly approves the mode-scoped promotion brief",
        "grok-x-scout-artifact-week-review is disabled or inactive",
      ],
    };
  }

  if (routine.name === "grok-x-scout-friday-deep") {
    return {
      id: "grok-x-scout-friday-deep",
      kind: "cron",
      name: "Track 54 Grok X scout Friday-deep write",
      schedule: routine.schedule,
      rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=50;BYSECOND=0",
      execution_environment: "local",
      cwds: [BUSHEL_BOARD_CWD],
      model: "gpt-5.4",
      reasoning_effort: "medium",
      status_after_human_approval: "ACTIVE",
      command: routine.command,
      approval_review_window: approvalReviewWindow,
      prompt: `${commonGuard.join(" ")} The dry-run collector(s) that must already be disabled: ${disabledDryRunList}. In the workspace, run \`${routine.command}\`. Report run id, artifact path, artifact SHA-256, raw/accepted/rejected counts, price snapshot status, accepted counts by source tier, decision-grade accepted count, and validation warnings. Do not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, or thesis_packet_cache from this Grok scout routine; Friday desk swarms remain the thesis-of-record writers.`,
      create_only_after: [
        "friday_deep promotion_status is ready_for_human_approval",
        "Kyle explicitly approves the mode-scoped promotion brief",
        "grok-x-scout-friday-deep-artifact-review is disabled or inactive",
      ],
    };
  }

  throw new Error(`No Codex automation proposal is defined for routine ${routine.name}`);
}

function writeModeCodexAutomationProposals(
  writeModeRoutines: WriteModeRoutine[],
  review: ArtifactWeekReview,
  transition: Pick<PostApprovalAutomationTransition, "disable_before_registering_write_mode">,
): WriteModeCodexAutomationProposal[] {
  return writeModeRoutines.map((routine) => proposalForRoutine(routine, review, transition));
}

function postApprovalAutomationTransitionForMode(
  review: ArtifactWeekReview,
  writeModeRoutines: WriteModeRoutine[],
): PostApprovalAutomationTransition {
  if (review.mode === "daily_pulse") {
    return {
      disable_before_registering_write_mode: ["grok-x-scout-artifact-week-review"],
      register_after_disable: writeModeRoutines.map((routine) => routine.name),
      keep_active: ["canola-price-and-fx-freshness-import"],
      operator_note: "After human approval, disable the daily dry-run artifact collector before registering daily write-mode Grok and daily thesis-review routines.",
    };
  }
  if (review.mode === "friday_deep") {
    return {
      disable_before_registering_write_mode: ["grok-x-scout-friday-deep-artifact-review"],
      register_after_disable: writeModeRoutines.map((routine) => routine.name),
      keep_active: ["canola-price-and-fx-freshness-import"],
      operator_note: "After human approval, replace the Friday-deep dry-run artifact collector with the Friday-deep write-mode Grok routine.",
    };
  }
  return {
    disable_before_registering_write_mode: [],
    register_after_disable: [],
    keep_active: ["canola-price-and-fx-freshness-import"],
    operator_note: "manual_test reviews cannot register write-mode automations.",
  };
}

function selectedArtifactsForReview(review: ArtifactWeekReview): SelectedArtifactEvidence[] {
  return review.days
    .filter((day) => day.artifact_found)
    .map((day) => ({
      date: day.date,
      artifact_path: day.artifact_path,
      artifact_sha256: day.artifact_sha256,
      summary_path: day.summary_path,
      parse_status: day.parse_status,
      no_write_evidence: day.no_write_evidence,
      raw_signal_count: day.raw_signal_count,
      accepted_signal_count: day.accepted_signal_count,
      rejected_signal_count: day.rejected_signal_count,
      accepted_decision_grade_count: day.accepted_decision_grade_count,
      price_snapshot_status: day.price_snapshot_status,
    }));
}

export function buildGrokXScoutPromotionBrief(
  review: ArtifactWeekReview,
  generatedAt = new Date().toISOString(),
): GrokXScoutPromotionBrief {
  const blockers = promotionBlockers(review);
  const promotionStatus: PromotionStatus = review.verdict === "candidate_for_enablement" && blockers.length === 0
    ? "ready_for_human_approval"
    : "not_ready";
  const writeModeRoutines = writeModeRoutinesForMode(review);
  const postApprovalAutomationTransition = postApprovalAutomationTransitionForMode(review, writeModeRoutines);

  return {
    schema_version: "grok_x_scout_promotion_brief_v1",
    generated_at: generatedAt,
    promotion_status: promotionStatus,
    review_verdict: review.verdict,
    mode: review.mode,
    review_window: {
      from_date: review.from_date,
      to_date: review.to_date,
      artifact_days_found: review.artifact_days_found,
      required_artifact_days: review.required_artifact_days,
    },
    evidence: review.totals,
    selected_artifacts: selectedArtifactsForReview(review),
    parse_failure_details: review.parse_failure_details,
    quality_warnings: review.quality_warnings,
    promotion_blockers: blockers,
    human_approval_required: true,
    approval_phrase: TRACK54_WRITE_APPROVAL_PHRASE,
    write_mode_routines: writeModeRoutines,
    write_mode_codex_automation_proposals: writeModeCodexAutomationProposals(
      writeModeRoutines,
      review,
      postApprovalAutomationTransition,
    ),
    post_approval_automation_transition: postApprovalAutomationTransition,
    hard_boundaries: [
      "Grok is evidence discovery only.",
      "Grok must not write market_analysis or us_market_analysis.",
      "Grok must not refresh thesis_packet_cache.",
      "Accepted X signals remain subordinate to official source packets and Friday desk review.",
      "Approval is mode-scoped; daily_pulse review evidence cannot authorize friday_deep write routines.",
      "The retired Grok/xAI thesis-writing chain remains tombstoned.",
    ],
    source_review: {
      reviewer_script: "scripts/review-grok-x-scout-artifact-week.ts",
      no_auto_enablement: true,
      raw_artifacts_remain_local: true,
    },
  };
}

if (IS_CLI) {
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

  console.log(JSON.stringify(buildGrokXScoutPromotionBrief(review), null, 2));
}
