import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertTrack54WriteGate, TRACK54_WRITE_APPROVAL_PHRASE } from "@/scripts/track54-write-gate";
import type { XScoutMode, XScoutOutput } from "@/lib/x-api/x-scout-contract";

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

function artifact(runDate: string, mode: XScoutMode = "daily_pulse"): XScoutOutput {
  return {
    schema_version: "grok_x_scout_v1",
    run_date: runDate,
    mode,
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
  };
}

function writeArtifact(
  root: string,
  runDate: string,
  mode: XScoutMode = "daily_pulse",
  priceSnapshotStatus = "fresh",
) {
  const dir = resolve(root, runDate);
  mkdirSync(dir, { recursive: true });
  const output = artifact(runDate, mode);
  writeFileSync(resolve(dir, `${mode}-raw.json`), JSON.stringify(output, null, 2), "utf-8");
  writeFileSync(
    resolve(dir, `${mode}-summary.json`),
    JSON.stringify({
      artifact_path: resolve(dir, `${mode}-raw.json`),
      dry_run: true,
      write: false,
      scout_run_id: null,
      price_snapshot_status: priceSnapshotStatus,
      raw_signal_count: 1,
      accepted_signal_count: 1,
      rejected_signal_count: 0,
    }, null, 2),
    "utf-8",
  );
}

describe("Track 54 write gate", () => {
  it("rejects write approval that is not tied to an explicit artifact review window", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day);
    }

    expect(() => assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "test write mode",
      {
        artifactRoot: root,
        requiredArtifactDays: 5,
      },
    )).toThrow(/must include the exact reviewed artifact window/);
  });

  it("rejects an exact approval phrase when the artifact-week review is not a candidate", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    writeArtifact(root, "2026-06-01");

    expect(() => assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "test write mode",
      {
        artifactRoot: root,
        fromDate: "2026-06-01",
        toDate: "2026-06-05",
        requiredArtifactDays: 5,
      },
    )).toThrow(/insufficient_artifacts/);
  });

  it("does not let runtime environment lower the five-day write gate", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    writeArtifact(root, "2026-06-01");

    expect(() => assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv({ TRACK54_APPROVAL_REQUIRED_DAYS: "1" }),
      "test write mode",
      {
        artifactRoot: root,
        fromDate: "2026-06-01",
        toDate: "2026-06-01",
      },
    )).toThrow(/need 5 clean artifact days; found 1/);
  });

  it("rejects approval when the review window includes a stale or unchecked price day", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day);
    }
    writeArtifact(root, "2026-06-03", "daily_pulse", "not_checked");

    expect(() => assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "test write mode",
      {
        artifactRoot: root,
        fromDate: "2026-06-01",
        toDate: "2026-06-05",
        requiredArtifactDays: 5,
      },
    )).toThrow(/lacked fresh price status/);
  });

  it("does not let a daily-pulse artifact week approve a Friday-deep writer", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day, "daily_pulse");
    }

    expect(() => assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "Friday deep scout write mode",
      {
        artifactRoot: root,
        mode: "friday_deep",
        fromDate: "2026-06-01",
        toDate: "2026-06-05",
      },
    )).toThrow(/need 1 clean artifact days; found 0/);
  });

  it("uses one clean Friday artifact as the write gate default for Friday-deep", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    writeArtifact(root, "2026-06-05", "friday_deep");

    const review = assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "Friday deep scout write mode",
      {
        artifactRoot: root,
        mode: "friday_deep",
        fromDate: "2026-06-05",
        toDate: "2026-06-05",
      },
    );

    expect(review.verdict).toBe("candidate_for_enablement");
    expect(review.required_artifact_days).toBe(1);
    expect(review.artifact_days_found).toBe(1);
  });

  it("allows write mode only when approval phrase and candidate artifact review both pass", () => {
    const root = mkdtempSync(resolve(tmpdir(), "track54-write-gate-"));
    for (const day of ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]) {
      writeArtifact(root, day);
    }

    const review = assertTrack54WriteGate(
      ["--write", "--approval-phrase", TRACK54_WRITE_APPROVAL_PHRASE],
      testEnv(),
      "test write mode",
      {
        artifactRoot: root,
        fromDate: "2026-06-01",
        toDate: "2026-06-05",
        requiredArtifactDays: 5,
      },
    );

    expect(review.verdict).toBe("candidate_for_enablement");
    expect(review.artifact_days_found).toBe(5);
  });
});
