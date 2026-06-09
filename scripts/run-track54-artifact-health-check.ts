#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  defaultRequiredArtifactDaysForMode,
  reviewGrokXScoutArtifactWeek,
  type ArtifactDayReview,
  type ArtifactWeekReview,
} from "./review-grok-x-scout-artifact-week";
import { track54AutomationDateKey, track54CompletedAutomationDateKey } from "@/lib/x-api/track54-date";
import type { XScoutMode } from "@/lib/x-api/x-scout-contract";

type HealthMode = Extract<XScoutMode, "daily_pulse" | "friday_deep"> | "both";
type RefreshReadinessMode = "never" | "after-retry" | "always";
type RetryFallback = "none" | "hermes_terminal";

interface CommandResult {
  command: string;
  args: string[];
  exit_code: number | null;
  ok: boolean;
  stdout_tail: string;
  stderr_tail: string;
}

export interface ArtifactModeHealth {
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">;
  today: string;
  verdict: ArtifactWeekReview["verdict"];
  artifact_days_found: number;
  required_artifact_days: number;
  raw_signal_count: number;
  accepted_signal_count: number;
  rejected_signal_count: number;
  accepted_decision_grade_count: number;
  today_artifact_path: string | null;
  today_artifact_sha256: string | null;
  today_parse_status: ArtifactDayReview["parse_status"] | "missing_day";
  today_price_snapshot_status: ArtifactDayReview["price_snapshot_status"] | null;
  today_artifact_ok: boolean;
  today_invalid_reasons: string[];
  artifact_due: boolean;
  retry_needed: boolean;
  retry_blocked_until_due: boolean;
}

interface HealthCheckResult {
  schema_version: "track54_artifact_health_check_v1";
  checked_at: string;
  today: string;
  mode: HealthMode;
  dry_run_only: true;
  retry_requested: boolean;
  retry_fallback: RetryFallback;
  grok_preflight_required: boolean;
  grok_preflight_ok: boolean | null;
  retry_blocked_by_grok_preflight: boolean;
  hermes_preflight_required: boolean;
  hermes_preflight_ok: boolean | null;
  hermes_preflight_model_smoke_ok: boolean | null;
  retry_blocked_by_hermes_preflight: boolean;
  retry_used_fallback: boolean;
  refresh_readiness: RefreshReadinessMode;
  retried_modes: Extract<XScoutMode, "daily_pulse" | "friday_deep">[];
  retry_deferred_modes: Extract<XScoutMode, "daily_pulse" | "friday_deep">[];
  modes_before: ArtifactModeHealth[];
  modes_after: ArtifactModeHealth[];
  command_results: CommandResult[];
  readiness_refreshed: boolean;
  readiness_output_path: string | null;
  ok: boolean;
}

const args = process.argv.slice(2);
const POSITIONAL_ARGS = args.filter((arg) => !arg.startsWith("--"));
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
Track 54 Artifact Health Check

Usage:
  npm run track54:artifact-health
  npm run track54:artifact-health:daily
  npm run track54:artifact-health:both
  npm run track54:artifact-health:daily-retry
  npm run track54:artifact-health:both-retry
  npm run track54:recover-after-grok-login

Direct form for one-off diagnostics:
  npx tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse
  npx tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always

Options:
  --mode daily_pulse|friday_deep|both        Defaults to daily_pulse. Positional mode is also accepted.
  --date YYYY-MM-DD                          Defaults to the America/Edmonton automation date.
  --retry-missing                            Retry only no-write scout runs when today's artifact is missing/invalid.
  --refresh-readiness never|after-retry|always
                                               Defaults to never.
  --runner auto|grok_cli|xai_api|manual      Scout retry runner. Defaults to auto.
  --grok-cli-model <model>                    Optional Grok CLI model passed to scout retry.
                                               Also accepted via GROK_CLI_MODEL.
  --fallback none|hermes_terminal             Optional no-write fallback when Grok preflight fails.
                                               Hermes fallback requires model_smoke_ok=true.
  --skip-grok-preflight                       Do not preflight Grok before retrying. For tests/manual diagnostics only.
  --readiness-out <path>                     Defaults to scratch/track54-readiness/latest-readiness-report.json.
  --browser-smoke-proof <path>               Defaults to scratch/track54-browser-smoke/browser-smoke-proof.json.
`);
  process.exit(0);
}

function tail(value: string, maxLength = 4_000): string {
  return value.length > maxLength ? value.slice(-maxLength) : value;
}

export function sanitizeNpmConfigEnv(inputEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...inputEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("npm_config_")) {
      delete env[key];
    }
  }
  return env;
}

export function buildReadinessRefreshCommandArgs(
  readinessOut: string,
  browserSmokeProof: string,
): string[] {
  return [
    "run",
    "track54:readiness",
    "--",
    "--out",
    readinessOut,
    "--browser-smoke-proof-out",
    browserSmokeProof,
  ];
}

export function buildGrokPreflightCommandArgs(): string[] {
  return ["run", "track54:grok-preflight"];
}

export function buildHermesPreflightCommandArgs(): string[] {
  return ["run", "track54:hermes-preflight"];
}

export function parseHermesPreflightModelSmokeOk(stdout: string): boolean | null {
  try {
    const parsed = JSON.parse(stdout) as { model_smoke_ok?: unknown };
    return typeof parsed.model_smoke_ok === "boolean" ? parsed.model_smoke_ok : null;
  } catch {
    return null;
  }
}

export function hermesPreflightReadyForTerminalRetry(
  commandOk: boolean,
  modelSmokeOk: boolean | null,
): boolean {
  return commandOk && modelSmokeOk === true;
}

export function buildGrokScoutRetryCommandArgs(
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">,
  runner: string,
  grokCliModel: string | null | undefined,
): string[] {
  const retryArgs = [
    "tsx",
    "scripts/run-grok-x-scout.ts",
    "--mode",
    mode,
    "--runner",
    runner,
  ];

  if (grokCliModel?.trim()) {
    retryArgs.push("--grok-cli-model", grokCliModel.trim());
  }

  retryArgs.push("--dry-run");
  return retryArgs;
}

export function buildHermesScoutRetryCommandArgs(
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">,
  runDate: string,
): string[] {
  return [
    "run",
    "track54:hermes-x-scout:terminal",
    "--",
    "--mode",
    mode,
    "--date",
    runDate,
  ];
}

function runCommand(command: "npm" | "npx", commandArgs: string[]): CommandResult {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: sanitizeNpmConfigEnv(),
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  const stderr = [
    result.stderr ?? "",
    result.error?.message ?? "",
  ].filter(Boolean).join("\n");
  return {
    command,
    args: commandArgs,
    exit_code: result.status,
    ok: result.status === 0,
    stdout_tail: tail(result.stdout ?? ""),
    stderr_tail: tail(stderr),
  };
}

function refreshReadinessNow(
  commandResults: CommandResult[],
  readinessOut: string,
  browserSmokeProof: string,
): { readiness_refreshed: boolean; readiness_output_path: string | null } {
  const readinessResult = runCommand("npm", buildReadinessRefreshCommandArgs(readinessOut, browserSmokeProof));
  commandResults.push(readinessResult);
  return {
    readiness_refreshed: readinessResult.ok,
    readiness_output_path: readinessResult.ok ? resolve(readinessOut) : null,
  };
}

export function shouldRefreshReadinessAfterRetryFailure(refreshReadiness: RefreshReadinessMode): boolean {
  return refreshReadiness === "always";
}

export function todayArtifactInvalidReasons(day: ArtifactDayReview | undefined): string[] {
  if (!day) return ["today's review day is missing from the artifact window"];
  const reasons: string[] = [];
  if (!day.artifact_found) reasons.push("artifact file is missing");
  if (!day.summary_found) reasons.push("summary file is missing");
  if (day.parse_status !== "ok") reasons.push(`parse status is ${day.parse_status}`);
  if (!day.no_write_evidence) reasons.push("dry-run/no-write proof is missing");
  if (day.write === true || Boolean(day.scout_run_id)) reasons.push("write-mode evidence is present");
  if (day.price_snapshot_status !== "fresh") reasons.push(`price snapshot status is ${day.price_snapshot_status}`);
  if (day.artifact_identity_mismatch) reasons.push("artifact run_date or mode does not match the reviewed day");
  if (day.mode_schedule_mismatch) reasons.push("mode schedule mismatch");
  if (day.summary_count_mismatch) reasons.push("summary counts do not match parsed artifact validation");
  return reasons;
}

function modeList(mode: HealthMode): Extract<XScoutMode, "daily_pulse" | "friday_deep">[] {
  return mode === "both" ? ["daily_pulse", "friday_deep"] : [mode];
}

export function artifactDueForMode(
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">,
  date = new Date(),
  today = track54AutomationDateKey(date),
): boolean {
  const completedDate = track54CompletedAutomationDateKey(date, {
    activeWeekdays: mode === "friday_deep" ? [5] : [1, 2, 3, 4, 5],
    cutoffHour: 16,
    cutoffMinute: mode === "friday_deep" ? 50 : 10,
  });
  return completedDate === today;
}

export function artifactDueForReviewDate(
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">,
  date: Date,
  reviewDate: string,
): boolean {
  return artifactDueForMode(mode, date, reviewDate);
}

function summarizeModeHealth(
  review: ArtifactWeekReview,
  today: string,
  artifactDue: boolean,
): ArtifactModeHealth {
  const todayDay = review.days.find((day) => day.date === today);
  const invalidReasons = todayArtifactInvalidReasons(todayDay);
  const artifactInvalid = invalidReasons.length > 0;
  return {
    mode: review.mode as Extract<XScoutMode, "daily_pulse" | "friday_deep">,
    today,
    verdict: review.verdict,
    artifact_days_found: review.artifact_days_found,
    required_artifact_days: review.required_artifact_days,
    raw_signal_count: review.totals.raw_signal_count,
    accepted_signal_count: review.totals.accepted_signal_count,
    rejected_signal_count: review.totals.rejected_signal_count,
    accepted_decision_grade_count: review.totals.accepted_decision_grade_count,
    today_artifact_path: todayDay?.artifact_path ?? null,
    today_artifact_sha256: todayDay?.artifact_sha256 ?? null,
    today_parse_status: todayDay?.parse_status ?? "missing_day",
    today_price_snapshot_status: todayDay?.price_snapshot_status ?? null,
    today_artifact_ok: !artifactInvalid,
    today_invalid_reasons: invalidReasons,
    artifact_due: artifactDue,
    retry_needed: artifactDue && artifactInvalid,
    retry_blocked_until_due: !artifactDue && artifactInvalid,
  };
}

function reviewMode(
  mode: Extract<XScoutMode, "daily_pulse" | "friday_deep">,
  today: string,
  artifactDue: boolean,
): ArtifactModeHealth {
  const review = reviewGrokXScoutArtifactWeek({
    mode,
    toDate: today,
    requiredArtifactDays: defaultRequiredArtifactDaysForMode(mode),
    minimumAcceptedSignals: 1,
  });
  return summarizeModeHealth(review, today, artifactDue);
}

function parseMode(): HealthMode {
  const positionalMode = POSITIONAL_ARGS.find((arg): arg is HealthMode =>
    ["daily_pulse", "friday_deep", "both"].includes(arg),
  );
  const mode = optionValue("--mode") ?? positionalMode ?? "daily_pulse";
  if (!["daily_pulse", "friday_deep", "both"].includes(mode)) {
    throw new Error(`Unsupported --mode ${mode}`);
  }
  return mode as HealthMode;
}

function parseRefreshReadiness(): RefreshReadinessMode {
  const raw = optionValue("--refresh-readiness") ?? (hasFlag("--refresh-readiness") ? "after-retry" : "never");
  if (!["never", "after-retry", "always"].includes(raw)) {
    throw new Error(`Unsupported --refresh-readiness ${raw}`);
  }
  return raw as RefreshReadinessMode;
}

function parseRetryFallback(): RetryFallback {
  const raw = optionValue("--fallback") ?? "none";
  if (!["none", "hermes_terminal"].includes(raw)) {
    throw new Error(`Unsupported --fallback ${raw}`);
  }
  return raw as RetryFallback;
}

function main(): HealthCheckResult {
  const mode = parseMode();
  const now = new Date();
  const explicitDate = optionValue("--date");
  const today = explicitDate ?? track54AutomationDateKey(now);
  const retryRequested = hasFlag("--retry-missing");
  const skipGrokPreflight = hasFlag("--skip-grok-preflight");
  const refreshReadiness = parseRefreshReadiness();
  const retryFallback = parseRetryFallback();
  const runner = optionValue("--runner") ?? "auto";
  const grokCliModel = optionValue("--grok-cli-model") ?? process.env.GROK_CLI_MODEL ?? null;
  const readinessOut = optionValue("--readiness-out") ?? "scratch/track54-readiness/latest-readiness-report.json";
  const browserSmokeProof = optionValue("--browser-smoke-proof") ?? "scratch/track54-browser-smoke/browser-smoke-proof.json";
  const modes = modeList(mode);
  const artifactDueByMode = new Map(modes.map((candidateMode) => [
    candidateMode,
    artifactDueForReviewDate(candidateMode, now, today),
  ]));
  const commandResults: CommandResult[] = [];
  const modesBefore = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
  const retryDeferredModes = modesBefore
    .filter((modeHealth) => modeHealth.retry_blocked_until_due)
    .map((modeHealth) => modeHealth.mode);
  const retriedModes: Extract<XScoutMode, "daily_pulse" | "friday_deep">[] = [];
  const retryCandidateModes = modesBefore.filter((modeHealth) => retryRequested && modeHealth.retry_needed);
  const grokPreflightRequired = retryCandidateModes.length > 0 && !skipGrokPreflight;
  let grokPreflightOk: boolean | null = null;
  let hermesPreflightRequired = false;
  let hermesPreflightOk: boolean | null = null;
  let hermesPreflightModelSmokeOk: boolean | null = null;
  let retryUsedFallback = false;
  let retryBlockedByHermesPreflight = false;

  if (grokPreflightRequired) {
    const preflightResult = runCommand("npm", buildGrokPreflightCommandArgs());
    commandResults.push(preflightResult);
    grokPreflightOk = preflightResult.ok;
    if (!preflightResult.ok) {
      if (retryFallback === "hermes_terminal") {
        hermesPreflightRequired = true;
        const hermesPreflightResult = runCommand("npm", buildHermesPreflightCommandArgs());
        commandResults.push(hermesPreflightResult);
        hermesPreflightOk = hermesPreflightResult.ok;
        hermesPreflightModelSmokeOk = parseHermesPreflightModelSmokeOk(hermesPreflightResult.stdout_tail);
        if (hermesPreflightReadyForTerminalRetry(hermesPreflightResult.ok, hermesPreflightModelSmokeOk)) {
          retryUsedFallback = true;
          for (const modeHealth of retryCandidateModes) {
            const retryResult = runCommand("npm", buildHermesScoutRetryCommandArgs(modeHealth.mode, today));
            commandResults.push(retryResult);
            if (!retryResult.ok) {
              const modesAfterFailure = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
              let readinessRefreshed = false;
              let readinessOutputPath: string | null = null;
              if (shouldRefreshReadinessAfterRetryFailure(refreshReadiness)) {
                const refreshResult = refreshReadinessNow(commandResults, readinessOut, browserSmokeProof);
                readinessRefreshed = refreshResult.readiness_refreshed;
                readinessOutputPath = refreshResult.readiness_output_path;
              }
              return {
                schema_version: "track54_artifact_health_check_v1",
                checked_at: new Date().toISOString(),
                today,
                mode,
                dry_run_only: true,
                retry_requested: retryRequested,
                retry_fallback: retryFallback,
                grok_preflight_required: grokPreflightRequired,
                grok_preflight_ok: grokPreflightOk,
                retry_blocked_by_grok_preflight: false,
                hermes_preflight_required: hermesPreflightRequired,
                hermes_preflight_ok: hermesPreflightOk,
                hermes_preflight_model_smoke_ok: hermesPreflightModelSmokeOk,
                retry_blocked_by_hermes_preflight: false,
                retry_used_fallback: retryUsedFallback,
                refresh_readiness: refreshReadiness,
                retried_modes: retriedModes,
                retry_deferred_modes: retryDeferredModes,
                modes_before: modesBefore,
                modes_after: modesAfterFailure,
                command_results: commandResults,
                readiness_refreshed: readinessRefreshed,
                readiness_output_path: readinessOutputPath,
                ok: false,
              };
            }
            retriedModes.push(modeHealth.mode);
          }

          const modesAfterFallback = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
          const shouldRefreshReadiness = refreshReadiness === "always" || (refreshReadiness === "after-retry" && retriedModes.length > 0);
          let readinessRefreshed = false;
          let readinessOutputPath: string | null = null;
          let ok = modesAfterFallback.every((modeHealth) => !modeHealth.retry_needed);
          if (shouldRefreshReadiness) {
            const refreshResult = refreshReadinessNow(commandResults, readinessOut, browserSmokeProof);
            readinessRefreshed = refreshResult.readiness_refreshed;
            readinessOutputPath = refreshResult.readiness_output_path;
            ok = ok && readinessRefreshed;
          }
          return {
            schema_version: "track54_artifact_health_check_v1",
            checked_at: new Date().toISOString(),
            today,
            mode,
            dry_run_only: true,
            retry_requested: retryRequested,
            retry_fallback: retryFallback,
            grok_preflight_required: grokPreflightRequired,
            grok_preflight_ok: grokPreflightOk,
            retry_blocked_by_grok_preflight: false,
            hermes_preflight_required: hermesPreflightRequired,
            hermes_preflight_ok: hermesPreflightOk,
            hermes_preflight_model_smoke_ok: hermesPreflightModelSmokeOk,
            retry_blocked_by_hermes_preflight: false,
            retry_used_fallback: retryUsedFallback,
            refresh_readiness: refreshReadiness,
            retried_modes: retriedModes,
            retry_deferred_modes: retryDeferredModes,
            modes_before: modesBefore,
            modes_after: modesAfterFallback,
            command_results: commandResults,
            readiness_refreshed: readinessRefreshed,
            readiness_output_path: readinessOutputPath,
            ok,
          };
        }
        retryBlockedByHermesPreflight = true;
      }
      const modesAfterPreflightFailure = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
      let readinessRefreshed = false;
      let readinessOutputPath: string | null = null;
      if (refreshReadiness === "always") {
        const refreshResult = refreshReadinessNow(commandResults, readinessOut, browserSmokeProof);
        readinessRefreshed = refreshResult.readiness_refreshed;
        readinessOutputPath = refreshResult.readiness_output_path;
      }
      return {
        schema_version: "track54_artifact_health_check_v1",
        checked_at: new Date().toISOString(),
        today,
        mode,
        dry_run_only: true,
        retry_requested: retryRequested,
        retry_fallback: retryFallback,
        grok_preflight_required: grokPreflightRequired,
        grok_preflight_ok: grokPreflightOk,
        retry_blocked_by_grok_preflight: true,
        hermes_preflight_required: hermesPreflightRequired,
        hermes_preflight_ok: hermesPreflightOk,
        hermes_preflight_model_smoke_ok: hermesPreflightModelSmokeOk,
        retry_blocked_by_hermes_preflight: retryBlockedByHermesPreflight,
        retry_used_fallback: retryUsedFallback,
        refresh_readiness: refreshReadiness,
        retried_modes: retriedModes,
        retry_deferred_modes: retryDeferredModes,
        modes_before: modesBefore,
        modes_after: modesAfterPreflightFailure,
        command_results: commandResults,
        readiness_refreshed: readinessRefreshed,
        readiness_output_path: readinessOutputPath,
        ok: false,
      };
    }
  }

  for (const modeHealth of modesBefore) {
    if (!retryRequested || !modeHealth.retry_needed) continue;
    const retryResult = runCommand("npx", buildGrokScoutRetryCommandArgs(modeHealth.mode, runner, grokCliModel));
    commandResults.push(retryResult);
    if (!retryResult.ok) {
      const modesAfterFailure = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
      let readinessRefreshed = false;
      let readinessOutputPath: string | null = null;
      if (shouldRefreshReadinessAfterRetryFailure(refreshReadiness)) {
        const refreshResult = refreshReadinessNow(commandResults, readinessOut, browserSmokeProof);
        readinessRefreshed = refreshResult.readiness_refreshed;
        readinessOutputPath = refreshResult.readiness_output_path;
      }
      return {
        schema_version: "track54_artifact_health_check_v1",
        checked_at: new Date().toISOString(),
        today,
        mode,
        dry_run_only: true,
        retry_requested: retryRequested,
        retry_fallback: retryFallback,
        grok_preflight_required: grokPreflightRequired,
        grok_preflight_ok: grokPreflightOk,
        retry_blocked_by_grok_preflight: false,
        hermes_preflight_required: hermesPreflightRequired,
        hermes_preflight_ok: hermesPreflightOk,
        hermes_preflight_model_smoke_ok: hermesPreflightModelSmokeOk,
        retry_blocked_by_hermes_preflight: retryBlockedByHermesPreflight,
        retry_used_fallback: retryUsedFallback,
        refresh_readiness: refreshReadiness,
        retried_modes: retriedModes,
        retry_deferred_modes: retryDeferredModes,
        modes_before: modesBefore,
        modes_after: modesAfterFailure,
        command_results: commandResults,
        readiness_refreshed: readinessRefreshed,
        readiness_output_path: readinessOutputPath,
        ok: false,
      };
    }
    retriedModes.push(modeHealth.mode);
  }

  const modesAfter = modes.map((candidateMode) => reviewMode(candidateMode, today, artifactDueByMode.get(candidateMode) ?? false));
  const shouldRefreshReadiness = refreshReadiness === "always" || (refreshReadiness === "after-retry" && retriedModes.length > 0);
  let readinessRefreshed = false;
  let ok = modesAfter.every((modeHealth) => !modeHealth.retry_needed);

  if (shouldRefreshReadiness) {
    const readinessResult = runCommand("npm", buildReadinessRefreshCommandArgs(readinessOut, browserSmokeProof));
    commandResults.push(readinessResult);
    readinessRefreshed = readinessResult.ok;
    ok = ok && readinessResult.ok;
  }

  return {
    schema_version: "track54_artifact_health_check_v1",
    checked_at: new Date().toISOString(),
    today,
    mode,
    dry_run_only: true,
    retry_requested: retryRequested,
    retry_fallback: retryFallback,
    grok_preflight_required: grokPreflightRequired,
    grok_preflight_ok: grokPreflightOk,
    retry_blocked_by_grok_preflight: false,
    hermes_preflight_required: hermesPreflightRequired,
    hermes_preflight_ok: hermesPreflightOk,
    hermes_preflight_model_smoke_ok: hermesPreflightModelSmokeOk,
    retry_blocked_by_hermes_preflight: retryBlockedByHermesPreflight,
    retry_used_fallback: retryUsedFallback,
    refresh_readiness: refreshReadiness,
    retried_modes: retriedModes,
    retry_deferred_modes: retryDeferredModes,
    modes_before: modesBefore,
    modes_after: modesAfter,
    command_results: commandResults,
    readiness_refreshed: readinessRefreshed,
    readiness_output_path: readinessRefreshed ? resolve(readinessOut) : null,
    ok,
  };
}

if (IS_CLI) {
  try {
    const result = main();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.log(JSON.stringify({
      schema_version: "track54_artifact_health_check_v1",
      checked_at: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}
