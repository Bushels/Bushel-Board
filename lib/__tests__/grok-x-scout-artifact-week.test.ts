import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewGrokXScoutArtifactWeek } from "@/scripts/review-grok-x-scout-artifact-week";
import type { XScoutMode, XScoutOutput } from "@/lib/x-api/x-scout-contract";

function artifact(runDate: string, overrides: Partial<XScoutOutput> = {}): XScoutOutput {
  return {
    schema_version: "grok_x_scout_v1",
    run_date: runDate,
    mode: "daily_pulse",
    search_windows: [
      { label: "daily", from_date: runDate, to_date: runDate },
    ],
    signals: [
      {
        source_url: `https://x.com/realagriculture/status/${runDate.replaceAll("-", "")}`,
        post_id: runDate.replaceAll("-", ""),
        handle: "realagriculture",
        posted_at: `${runDate}T17:00:00Z`,
        raw_quote: "Policy pressure matters for prairie grain movement.",
        summary: "RealAgriculture flags prairie policy pressure tied to grain movement.",
        primary_grain: "Wheat",
        affected_grains: ["Wheat", "Canola"],
        affected_regions: ["Saskatchewan", "Alberta"],
        category: "policy",
        direction: "bearish",
        time_sensitivity: "same_day",
        seasonal_phase: "growing",
        why_it_matters: "Policy pressure can affect basis, movement timing, and confidence.",
        confidence: 0.71,
        needs_official_verification: false,
        claimed_numbers: [],
      },
    ],
    no_signal_notes: [],
    ...overrides,
  };
}

function tier4Artifact(runDate: string): XScoutOutput {
  return artifact(runDate, {
    signals: [
      {
        source_url: `https://x.com/gaurav_kochar/status/${runDate.replaceAll("-", "")}`,
        post_id: runDate.replaceAll("-", ""),
        handle: "gaurav_kochar",
        posted_at: `${runDate}T17:00:00Z`,
        raw_quote: "June weather volatility risk is rising.",
        summary: "Weather analyst flags June crop-stress volatility risk.",
        primary_grain: "Wheat",
        affected_grains: ["Wheat"],
        affected_regions: ["Saskatchewan"],
        category: "weather",
        direction: "bullish",
        time_sensitivity: "same_day",
        seasonal_phase: "growing",
        why_it_matters: "Weather volatility can affect yield risk.",
        confidence: 0.71,
        needs_official_verification: true,
        claimed_numbers: [{ label: "June risk", value: "1", source_text: "June weather volatility risk is rising." }],
      },
    ],
  });
}

function writeArtifact(
  root: string,
  runDate: string,
  output: XScoutOutput | string,
  priceStatus = "fresh",
  summaryOverrides: Record<string, unknown> = {},
  mode: XScoutMode = typeof output === "string" ? "daily_pulse" : output.mode,
  fileStem: string = mode,
) {
  const dir = resolve(root, runDate);
  const rawPath = resolve(dir, `${fileStem}-raw.json`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    rawPath,
    typeof output === "string" ? output : JSON.stringify(output, null, 2),
    "utf-8",
  );
  writeFileSync(
    resolve(dir, `${fileStem}-summary.json`),
    JSON.stringify({
      artifact_path: rawPath,
      dry_run: true,
      write: false,
      scout_run_id: null,
      price_snapshot_status: priceStatus,
      raw_signal_count: typeof output === "string" ? 0 : output.signals.length,
      accepted_signal_count: typeof output === "string" ? 0 : output.signals.length,
      rejected_signal_count: 0,
      ...summaryOverrides,
    }, null, 2),
    "utf-8",
  );
}

function writeFailureSummary(root: string, runDate: string, mode: XScoutMode = "daily_pulse") {
  const dir = resolve(root, runDate);
  const rawPath = resolve(dir, `${mode}-raw.json`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `${mode}-summary.json`),
    JSON.stringify({
      artifact_path: rawPath,
      dry_run: true,
      write: false,
      scout_run_id: null,
      status: "failed",
      parse_status: "failed",
      error_message: "grok timed out after 210s",
      price_snapshot_status: "not_checked",
      raw_signal_count: 0,
      accepted_signal_count: 0,
      rejected_signal_count: 0,
    }, null, 2),
    "utf-8",
  );
}

describe("Grok X scout artifact week review", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults the review window to the Mountain-time automation date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T04:17:00.000Z"));
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-01", artifact("2026-06-01"));

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      requiredArtifactDays: 1,
    });

    expect(review.to_date).toBe("2026-06-01");
    expect(review.artifact_days_found).toBe(1);
  });

  it("does not skip today's local dry-run before the artifact cutoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T06:01:00.000Z"));
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-01", artifact("2026-06-01"));

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      requiredArtifactDays: 1,
    });

    expect(review.to_date).toBe("2026-06-01");
    expect(review.artifact_days_found).toBe(1);
  });

  it("rejects inverted review windows instead of returning an empty review", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));

    expect(() =>
      reviewGrokXScoutArtifactWeek({
        artifactRoot: root,
        fromDate: "2026-06-09",
        toDate: "2026-06-08",
      })
    ).toThrow("fromDate 2026-06-09 is after toDate 2026-06-08");
  });

  it("requires a full manual artifact week before enablement", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-01", artifact("2026-06-01"));

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("insufficient_artifacts");
    expect(review.artifact_days_found).toBe(1);
    expect(review.guardrails.no_supabase_writes).toBe(true);
    expect(review.days[0]!.no_write_evidence).toBe(true);
  });

  it("marks a clean five-day dry-run artifact set as a candidate for human approval", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact(day));
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("candidate_for_enablement");
    expect(review.totals.accepted_signal_count).toBe(5);
    expect(review.totals.accepted_decision_grade_count).toBe(5);
    expect(review.totals.parse_failures).toBe(0);
    expect(review.totals.write_mode_artifact_days).toBe(0);
    expect(review.totals.missing_no_write_evidence_days).toBe(0);
    expect(review.guardrails.no_supabase_writes).toBe(true);
    expect(review.recommendation).toContain("human approval");
  });

  it("holds the gate when an artifact cannot be parsed", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-01", "{not-json");

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-01",
      requiredArtifactDays: 1,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.parse_failures).toBe(1);
    expect(review.parse_failure_details).toMatchObject([
      {
        date: "2026-06-01",
        artifact_found: true,
        summary_found: true,
        no_write_evidence: true,
        price_snapshot_status: "fresh",
      },
    ]);
    expect(review.parse_failure_details[0]?.error_message).toContain("JSON");
    expect(review.recommendation).toContain("2026-06-01");
  });

  it("keeps failed scout attempts auditable without counting them as clean artifacts", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeFailureSummary(root, "2026-06-01");

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-01",
      requiredArtifactDays: 1,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.artifact_days_found).toBe(0);
    expect(review.totals.parse_failures).toBe(1);
    expect(review.days[0]!.summary_found).toBe(true);
    expect(review.days[0]!.artifact_found).toBe(false);
    expect(review.days[0]!.parse_status).toBe("failed");
    expect(review.days[0]!.error_message).toContain("timed out");
    expect(review.days[0]!.no_write_evidence).toBe(true);
    expect(review.parse_failure_details).toMatchObject([
      {
        date: "2026-06-01",
        artifact_found: false,
        summary_found: true,
        error_message: "grok timed out after 210s",
        no_write_evidence: true,
        price_snapshot_status: "not_checked",
      },
    ]);
    expect(review.recommendation).toContain("grok timed out after 210s");
    expect(review.guardrails.no_supabase_writes).toBe(true);
  });

  it("holds the gate when a full artifact week proves plumbing but no accepted X signal quality", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact(day, { signals: [] }));
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.artifact_days_found).toBe(5);
    expect(review.totals.accepted_signal_count).toBe(0);
    expect(review.verdict).toBe("hold_manual_review");
    expect(review.quality_warnings).toContain("need at least 1 accepted signal(s); found 0");
    expect(review.recommendation).toContain("accepted signal");
  });

  it("holds the gate when an artifact summary shows write-mode evidence", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact(day));
    }
    writeArtifact(root, "2026-06-03", artifact("2026-06-03"), "fresh", {
      dry_run: false,
      write: true,
      scout_run_id: "scout-run-123",
    });

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.write_mode_artifact_days).toBe(1);
    expect(review.guardrails.no_supabase_writes).toBe(false);
    expect(review.recommendation).toContain("write-mode evidence");
  });

  it("holds the gate when a full artifact week lacks dry-run/no-write proof", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact(day), "fresh", {
        dry_run: undefined,
        write: undefined,
        scout_run_id: undefined,
      });
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.missing_no_write_evidence_days).toBe(5);
    expect(review.guardrails.no_supabase_writes).toBe(false);
    expect(review.recommendation).toContain("dry-run/no-write proof");
  });

  it("holds the gate when summaries point at artifacts for the wrong run date", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact("2026-06-01"));
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.artifact_identity_mismatch_days).toBe(4);
    expect(review.quality_warnings).toContain("4 artifact day(s) had run date or mode mismatches");
  });

  it("holds the gate when accepted signals are only low-grade tiers", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, tier4Artifact(day));
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.accepted_signal_count).toBe(5);
    expect(review.totals.accepted_decision_grade_count).toBe(0);
    expect(review.quality_warnings).toContain("accepted signals came only from low-grade or unlisted source tiers");
  });

  it("uses one clean Friday-deep Friday artifact as the default weekly proof unit", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-05", artifact("2026-06-05", { mode: "friday_deep" }));

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      mode: "friday_deep",
      fromDate: "2026-06-05",
      toDate: "2026-06-05",
    });

    expect(review.required_artifact_days).toBe(1);
    expect(review.artifact_days_found).toBe(1);
    expect(review.totals.mode_schedule_mismatch_days).toBe(0);
    expect(review.verdict).toBe("candidate_for_enablement");
  });

  it("holds Friday-deep approval when the artifact did not come from a Friday run", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    writeArtifact(root, "2026-06-01", artifact("2026-06-01", { mode: "friday_deep" }));

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      mode: "friday_deep",
      fromDate: "2026-06-01",
      toDate: "2026-06-01",
    });

    expect(review.required_artifact_days).toBe(1);
    expect(review.artifact_days_found).toBe(1);
    expect(review.totals.mode_schedule_mismatch_days).toBe(1);
    expect(review.verdict).toBe("hold_manual_review");
    expect(review.quality_warnings).toContain("1 friday_deep artifact day(s) were not Friday runs");
  });

  it("uses parsed artifact validation counts instead of inflated summary counts", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, artifact(day, { signals: [] }), "fresh", {
        raw_signal_count: 2,
        accepted_signal_count: 2,
        rejected_signal_count: 0,
      });
    }

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: "2026-06-01",
      toDate: "2026-06-05",
      requiredArtifactDays: 5,
    });

    expect(review.totals.raw_signal_count).toBe(0);
    expect(review.totals.accepted_signal_count).toBe(0);
    expect(review.totals.summary_count_mismatch_days).toBe(5);
    expect(review.verdict).toBe("hold_manual_review");
    expect(review.recommendation).toContain("accepted signal");
    expect(review.quality_warnings).toContain(
      "5 artifact day(s) had summary counts that disagreed with parsed artifact validation",
    );
  });

  it("uses the best same-day no-write artifact when a later quiet rerun updates the latest summary", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    const day = "2026-06-01";
    writeArtifact(root, day, artifact(day), "fresh", {}, "daily_pulse", "daily_pulse-20260601T191936Z");
    writeArtifact(root, day, artifact(day, { signals: [] }), "fresh", {}, "daily_pulse", "daily_pulse");

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: day,
      toDate: day,
      requiredArtifactDays: 1,
    });

    expect(review.verdict).toBe("candidate_for_enablement");
    expect(review.totals.raw_signal_count).toBe(1);
    expect(review.totals.accepted_signal_count).toBe(1);
    expect(review.totals.accepted_decision_grade_count).toBe(1);
    expect(review.days[0]!.artifact_path).toContain("daily_pulse-20260601T191936Z-raw.json");
    expect(review.days[0]!.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(review.days[0]!.summary_path).toContain("daily_pulse-20260601T191936Z-summary.json");
  });

  it("does not hide same-day write-mode evidence behind a clean dry-run candidate", () => {
    const root = mkdtempSync(resolve(tmpdir(), "grok-artifacts-"));
    const day = "2026-06-01";
    writeArtifact(root, day, artifact(day), "fresh", {}, "daily_pulse", "daily_pulse-20260601T191936Z");
    writeArtifact(root, day, artifact(day), "fresh", {
      dry_run: false,
      write: true,
      scout_run_id: "scout-run-123",
    }, "daily_pulse", "daily_pulse");

    const review = reviewGrokXScoutArtifactWeek({
      artifactRoot: root,
      fromDate: day,
      toDate: day,
      requiredArtifactDays: 1,
    });

    expect(review.verdict).toBe("hold_manual_review");
    expect(review.totals.write_mode_artifact_days).toBe(1);
    expect(review.guardrails.no_supabase_writes).toBe(false);
    expect(review.recommendation).toContain("write-mode evidence");
  });
});
