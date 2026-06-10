import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  artifactDueForReviewDate,
  artifactDueForMode,
  buildGrokPreflightCommandArgs,
  buildGrokScoutRetryCommandArgs,
  buildHermesPreflightCommandArgs,
  buildHermesScoutRetryCommandArgs,
  buildReadinessRefreshCommandArgs,
  hermesPreflightReadyForTerminalRetry,
  parseHermesPreflightModelSmokeOk,
  sanitizeNpmConfigEnv,
  shouldRefreshReadinessAfterRetryFailure,
  todayArtifactInvalidReasons,
} from "@/scripts/run-track54-artifact-health-check";
import type { ArtifactDayReview } from "@/scripts/review-grok-x-scout-artifact-week";

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

function day(overrides: Partial<ArtifactDayReview> = {}): ArtifactDayReview {
  return {
    date: "2026-06-02",
    artifact_path: "C:/tmp/daily_pulse-raw.json",
    artifact_sha256: "abc123",
    summary_path: "C:/tmp/daily_pulse-summary.json",
    artifact_found: true,
    summary_found: true,
    parse_status: "ok",
    dry_run: true,
    write: false,
    scout_run_id: null,
    no_write_evidence: true,
    summary_raw_signal_count: 0,
    summary_accepted_signal_count: 0,
    summary_rejected_signal_count: 0,
    summary_count_mismatch: false,
    output_run_date: "2026-06-02",
    output_mode: "daily_pulse",
    artifact_identity_mismatch: false,
    mode_schedule_mismatch: false,
    price_snapshot_status: "fresh",
    raw_signal_count: 0,
    accepted_signal_count: 0,
    rejected_signal_count: 0,
    accepted_by_tier: {},
    accepted_decision_grade_count: 0,
    rejected_reasons: [],
    accepted_unlisted_count: 0,
    official_verification_count: 0,
    ...overrides,
  };
}

function packageScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")).scripts;
}

describe("Track 54 artifact health check", () => {
  it("does not consider the daily artifact due before the local scout cutoff", () => {
    expect(artifactDueForMode("daily_pulse", new Date("2026-06-02T06:01:00.000Z"), "2026-06-02")).toBe(false);
    expect(artifactDueForMode("daily_pulse", new Date("2026-06-02T22:10:00.000Z"), "2026-06-02")).toBe(true);
  });

  it("does not treat an explicit current-day review date as due before the local scout cutoff", () => {
    expect(artifactDueForReviewDate("daily_pulse", new Date("2026-06-02T17:02:00.000Z"), "2026-06-02")).toBe(false);
    expect(artifactDueForReviewDate("daily_pulse", new Date("2026-06-02T17:02:00.000Z"), "2026-06-01")).toBe(true);
  });

  it("does not consider the Friday-deep artifact due before the Friday cutoff", () => {
    expect(artifactDueForMode("friday_deep", new Date("2026-06-05T22:49:00.000Z"), "2026-06-05")).toBe(false);
    expect(artifactDueForMode("friday_deep", new Date("2026-06-05T22:50:00.000Z"), "2026-06-05")).toBe(true);
  });

  it("does not retry a clean no-write artifact just because it has no accepted signal", () => {
    expect(todayArtifactInvalidReasons(day())).toEqual([]);
  });

  it("retries only structural or safety failures for today's artifact", () => {
    expect(todayArtifactInvalidReasons(day({
      price_snapshot_status: "stale",
      summary_count_mismatch: true,
      no_write_evidence: false,
      write: true,
    }))).toEqual([
      "dry-run/no-write proof is missing",
      "write-mode evidence is present",
      "price snapshot status is stale",
      "summary counts do not match parsed artifact validation",
    ]);
  });

  it("refreshes readiness through the top-level wrapper command", () => {
    expect(buildReadinessRefreshCommandArgs(
      "scratch/track54-readiness/latest-readiness-report.json",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
    )).toEqual([
      "run",
      "track54:readiness",
      "--",
      "--out",
      "scratch/track54-readiness/latest-readiness-report.json",
      "--browser-smoke-proof-out",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
    ]);
  });

  it("preflights Grok before retrying a missing artifact", () => {
    expect(buildGrokPreflightCommandArgs()).toEqual(["run", "track54:grok-preflight"]);
  });

  it("can preflight Hermes before a terminal shadow retry", () => {
    expect(buildHermesPreflightCommandArgs()).toEqual(["run", "track54:hermes-preflight"]);
  });

  it("extracts Hermes model smoke proof from preflight JSON", () => {
    expect(parseHermesPreflightModelSmokeOk(JSON.stringify({ model_smoke_ok: true }))).toBe(true);
    expect(parseHermesPreflightModelSmokeOk(JSON.stringify({ model_smoke_ok: false }))).toBe(false);
    expect(parseHermesPreflightModelSmokeOk(JSON.stringify({ ok: true }))).toBeNull();
    expect(parseHermesPreflightModelSmokeOk("not json")).toBeNull();
  });

  it("requires Hermes model smoke proof before terminal retry", () => {
    expect(hermesPreflightReadyForTerminalRetry(true, true)).toBe(true);
    expect(hermesPreflightReadyForTerminalRetry(true, false)).toBe(false);
    expect(hermesPreflightReadyForTerminalRetry(true, null)).toBe(false);
    expect(hermesPreflightReadyForTerminalRetry(false, true)).toBe(false);
  });

  it("passes the selected Grok CLI model to no-write scout retries", () => {
    expect(buildGrokScoutRetryCommandArgs("daily_pulse", "auto", "grok-composer-2.5-fast")).toEqual([
      "tsx",
      "scripts/run-grok-x-scout.ts",
      "--mode",
      "daily_pulse",
      "--runner",
      "auto",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--dry-run",
    ]);
  });

  it("builds the no-write Hermes terminal retry command with the reviewed date", () => {
    expect(buildHermesScoutRetryCommandArgs("daily_pulse", "2026-06-09")).toEqual([
      "run",
      "track54:hermes-x-scout:terminal",
      "--",
      "--mode",
      "daily_pulse",
      "--date",
      "2026-06-09",
    ]);
  });

  it("does not leak npm option config into nested commands", () => {
    expect(sanitizeNpmConfigEnv(testEnv({
      PATH: "C:/bin",
      npm_config_mode: "daily_pulse",
      npm_config_refresh_readiness: "always",
      TRACK54_WRITE_APPROVAL: "kept",
    }))).toEqual({
      NODE_ENV: "test",
      PATH: "C:/bin",
      TRACK54_WRITE_APPROVAL: "kept",
    });
  });

  it("refreshes readiness after a failed retry only when always requested", () => {
    expect(shouldRefreshReadinessAfterRetryFailure("always")).toBe(true);
    expect(shouldRefreshReadinessAfterRetryFailure("after-retry")).toBe(false);
    expect(shouldRefreshReadinessAfterRetryFailure("never")).toBe(false);
  });

  it("keeps npm-safe health aliases on the deterministic no-write script", () => {
    const scripts = packageScripts();
    expect(scripts["track54:artifact-health:daily"]).toBe(
      "tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse",
    );
    expect(scripts["track54:artifact-health:both"]).toBe(
      "tsx scripts/run-track54-artifact-health-check.ts --mode both",
    );
    expect(scripts["track54:artifact-health:daily-retry"]).toBe(
      "tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse --retry-missing --refresh-readiness=after-retry --grok-cli-model grok-composer-2.5-fast --fallback hermes_terminal",
    );
    expect(scripts["track54:artifact-health:both-retry"]).toBe(
      "tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always --grok-cli-model grok-composer-2.5-fast --fallback hermes_terminal",
    );
    expect(scripts["track54:recover-after-grok-login"]).toBe("npm run track54:artifact-health:both-retry");
  });
});
