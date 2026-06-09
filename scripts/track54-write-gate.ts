import { TRACK54_WRITE_APPROVAL_PHRASE, assertTrack54WriteApproval } from "@/lib/x-api/track54-write-approval";
import {
  defaultRequiredArtifactDaysForMode,
  reviewGrokXScoutArtifactWeek,
  type ArtifactWeekReview,
} from "./review-grok-x-scout-artifact-week";

const REVIEW_OPTION_FLAGS = {
  fromDate: "--approval-review-from",
  toDate: "--approval-review-to",
} as const;

const WRITE_GATE_MINIMUM_ACCEPTED_SIGNALS = 1;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionValue(args: string[], flag: string, env: NodeJS.ProcessEnv): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) {
    const value = args[index + 1];
    return value && !value.startsWith("--") ? value : "";
  }
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const envValue = env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : undefined;
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  return value && value !== "true" ? value : undefined;
}

function checkedApprovalReviewWindow(
  fromDate: string | undefined,
  toDate: string | undefined,
  workflowLabel: string,
): { fromDate: string; toDate: string } {
  if (!fromDate || !toDate) {
    throw new Error(
      `${workflowLabel} is disabled: write-mode approval must include the exact reviewed artifact window ` +
        `from the mode-scoped promotion brief. Pass ${REVIEW_OPTION_FLAGS.fromDate} YYYY-MM-DD and ` +
        `${REVIEW_OPTION_FLAGS.toDate} YYYY-MM-DD after Kyle approval.`,
    );
  }
  if (!DATE_KEY_PATTERN.test(fromDate) || !DATE_KEY_PATTERN.test(toDate)) {
    throw new Error(
      `${workflowLabel} is disabled: approval review window dates must use YYYY-MM-DD format.`,
    );
  }
  if (fromDate > toDate) {
    throw new Error(
      `${workflowLabel} is disabled: approval review window start must be on or before the end date.`,
    );
  }
  return { fromDate, toDate };
}

function reviewOptionsFromArgs(
  args: string[],
  env: NodeJS.ProcessEnv,
  workflowLabel: string,
  overrides: Partial<Parameters<typeof reviewGrokXScoutArtifactWeek>[0]> = {},
): Parameters<typeof reviewGrokXScoutArtifactWeek>[0] {
  const mode = overrides.mode ?? "daily_pulse";
  const fromDate =
    overrides.fromDate ??
    optionValue(args, REVIEW_OPTION_FLAGS.fromDate, env) ??
    envValue(env, "TRACK54_APPROVAL_REVIEW_FROM");
  const toDate =
    overrides.toDate ??
    optionValue(args, REVIEW_OPTION_FLAGS.toDate, env) ??
    envValue(env, "TRACK54_APPROVAL_REVIEW_TO");

  const reviewWindow = checkedApprovalReviewWindow(fromDate, toDate, workflowLabel);

  return {
    artifactRoot: overrides.artifactRoot,
    mode,
    fromDate: reviewWindow.fromDate,
    toDate: reviewWindow.toDate,
    requiredArtifactDays: overrides.requiredArtifactDays ?? defaultRequiredArtifactDaysForMode(mode),
    minimumAcceptedSignals: overrides.minimumAcceptedSignals ?? WRITE_GATE_MINIMUM_ACCEPTED_SIGNALS,
  };
}

function formatGateFailure(review: ArtifactWeekReview, workflowLabel: string): string {
  return (
    `${workflowLabel} is disabled: Track 54 artifact-week review is ` +
    `\`${review.verdict}\`, not \`candidate_for_enablement\`. ` +
    `${review.recommendation} Do not use the approval phrase until the promotion brief is ready.`
  );
}

export function assertTrack54WriteGate(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  workflowLabel = "Track 54 write mode",
  reviewOverrides: Partial<Parameters<typeof reviewGrokXScoutArtifactWeek>[0]> = {},
): ArtifactWeekReview {
  assertTrack54WriteApproval(args, env, workflowLabel);
  const review = reviewGrokXScoutArtifactWeek(reviewOptionsFromArgs(args, env, workflowLabel, reviewOverrides));
  if (review.verdict !== "candidate_for_enablement") {
    throw new Error(formatGateFailure(review, workflowLabel));
  }
  return review;
}

export { TRACK54_WRITE_APPROVAL_PHRASE };
