import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION,
  buildCanolaHistoricalReplayPackage,
} from "../forecast-experiments/historical-replay";
import type { ApprovedForecastSourceRow } from "../forecast-experiments/source-records";
import type { ThesisReviewEvidenceRecord } from "../forecast-experiments/thesis-review";

const sourceRows = (): ApprovedForecastSourceRow[] => [
  {
    source_key: "cgc_weekly",
    record_type: "fact",
    observed_period: "2026-2027 week 1 ending 2026-08-02",
    published_at: "2026-08-06T13:00:00-06:00",
    available_at: "2026-08-06T13:05:00-06:00",
    imported_at: "2026-08-06T13:10:00-06:00",
    payload: {
      worksheet: "Primary",
      metric: "Deliveries",
      grain: "Canola",
      region: "Saskatchewan",
      unit: "Ktonnes",
      value: 123.4,
      week_ending_date: "2026-08-02",
    },
  },
];

const nextWeekEvidence = (): ThesisReviewEvidenceRecord => ({
  evidence_key: "cgc-week-2",
  source_key: "cgc_weekly",
  evidence_type: "official_data",
  observed_period: "2026-2027 week 2 ending 2026-08-09",
  published_at: "2026-08-13T13:00:00-06:00",
  available_at: "2026-08-13T13:10:00-06:00",
  summary: "Next CGC release kept Canola deliveries ahead of the prior pace.",
  directional_effect: "bullish",
  materiality: "high",
  payload: {
    worksheet: "Primary",
    metric: "Deliveries",
    grain: "Canola",
    week_ending_date: "2026-08-09",
    direction_vs_input: "supportive",
  },
});

const replayInput = () => ({
  replay_set_name: "canola-weekly-history-v1",
  review_window_days: 7 as const,
  created_at: "2026-08-14T16:45:00-06:00",
  weeks: [
    {
      period_id: "2026-2027-week-1",
      crop_year: "2026-2027",
      grain_week: 1,
      as_of_date: "2026-08-07",
      source_cutoff_at: "2026-08-07T14:30:00-06:00",
      snapshot_mode: "strict_artifact_mode" as const,
      source_rows: sourceRows(),
      review_as_of_date: "2026-08-14",
      review_cutoff_at: "2026-08-14T14:30:00-06:00",
      labeler: {
        kind: "human_review" as const,
        name: "codex",
      },
      outcome_label: {
        directional_outcome: "bullish" as const,
        thesis_verdict: "held" as const,
        outcome_summary:
          "The historical next-week evidence supported a bullish Canola read.",
        supporting_evidence_keys: ["cgc-week-2"],
        contradicting_evidence_keys: [],
        missed_signals: [],
        adjustments_for_next_week: [
          "Keep weekly export/delivery acceleration as a candidate driver.",
        ],
      },
      next_week_evidence: [nextWeekEvidence()],
    },
  ],
});

describe("Canola historical replay package", () => {
  it("builds deterministic no-write historical training candidates from point-in-time rows", () => {
    const first = buildCanolaHistoricalReplayPackage(replayInput());
    const second = buildCanolaHistoricalReplayPackage(replayInput());

    expect(first.schema_version).toBe(
      CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION,
    );
    expect(first.package_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.package_hash).toBe(first.package_hash);
    expect(first.guardrails).toMatchObject({
      executes_writes: false,
      calls_model_api: false,
      reads_supabase: false,
      review_required_before_training: true,
      candidate_mode: "historical_training_candidate",
      not_forward_calibration: true,
    });
    expect(first.summary).toMatchObject({
      total_weeks: 1,
      candidate_weeks: 1,
      review_only_weeks: 0,
      accepted_evidence_count: 1,
      blocked_evidence_count: 0,
    });
    expect(first.weeks[0]?.training_candidate).toEqual({
      allowed: true,
      mode: "historical_training_candidate",
      reasons: [],
    });
    expect(first.weeks[0]?.training_example?.input_snapshot.snapshot_hash).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(first.weeks[0]?.training_example?.target_label.directional_outcome).toBe(
      "bullish",
    );
  });

  it("blocks already-known, future, and forbidden evidence before candidate classification", () => {
    const replayPackage = buildCanolaHistoricalReplayPackage({
      ...replayInput(),
      weeks: [
        {
          ...replayInput().weeks[0],
          next_week_evidence: [
            nextWeekEvidence(),
            {
              ...nextWeekEvidence(),
              evidence_key: "already-known",
              available_at: "2026-08-07T13:00:00-06:00",
            },
            {
              ...nextWeekEvidence(),
              evidence_key: "too-late",
              available_at: "2026-08-14T14:31:00-06:00",
            },
            {
              ...nextWeekEvidence(),
              evidence_key: "production-thesis",
              source_key: "market_analysis",
            },
          ],
        },
      ],
    });

    expect(replayPackage.weeks[0]?.accepted_evidence.map((record) => record.evidence_key)).toEqual([
      "cgc-week-2",
    ]);
    expect(replayPackage.weeks[0]?.blocked_evidence.map((record) => record.reason).sort()).toEqual([
      "already_available_at_forecast_cutoff",
      "available_after_review_cutoff",
      "forbidden_source",
    ]);
  });

  it("rejects historical review windows that can see beyond the declared horizon", () => {
    expect(() =>
      buildCanolaHistoricalReplayPackage({
        ...replayInput(),
        weeks: [
          {
            ...replayInput().weeks[0],
            review_as_of_date: "2026-08-15",
            review_cutoff_at: "2026-08-15T14:30:01-06:00",
          },
        ],
      }),
    ).toThrow(/review_cutoff_at exceeds the declared review window/i);
  });

  it("taints model-assisted labels when the labeler could know outcomes after the review cutoff", () => {
    const replayPackage = buildCanolaHistoricalReplayPackage({
      ...replayInput(),
      weeks: [
        {
          ...replayInput().weeks[0],
          labeler: {
            kind: "model_assisted" as const,
            name: "gemini-3.1-pro-preview",
            model_training_cutoff: "2027-01-01",
          },
        },
      ],
    });

    expect(replayPackage.weeks[0]?.training_candidate).toEqual({
      allowed: false,
      mode: "review_only_labeler_pretraining_tainted",
      reasons: ["labeler model training cutoff is after the review cutoff"],
    });
    expect(replayPackage.weeks[0]?.training_example).toBeNull();
  });

  it("rejects target labels that reference blocked evidence keys", () => {
    expect(() =>
      buildCanolaHistoricalReplayPackage({
        ...replayInput(),
        weeks: [
          {
            ...replayInput().weeks[0],
            outcome_label: {
              ...replayInput().weeks[0].outcome_label,
              supporting_evidence_keys: ["too-late"],
            },
            next_week_evidence: [
              {
                ...nextWeekEvidence(),
                evidence_key: "too-late",
                available_at: "2026-08-14T14:31:00-06:00",
              },
            ],
          },
        ],
      }),
    ).toThrow(/target label references unavailable evidence_key/i);
  });
});

describe("Canola historical replay CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runReplayCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-historical-replay-package");
    expect(result.stdout).toContain("--input");
  });

  it("emits machine-readable replay package JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-historical-replay-cli-"));

    try {
      const inputPath = join(tempDir, "replay-input.json");
      writeFileSync(inputPath, JSON.stringify(replayInput()));

      const result = runReplayCli(["--input", inputPath]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("historical replay package built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_HISTORICAL_REPLAY_PACKAGE_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-historical-replay-dry-"));

    try {
      const inputPath = join(tempDir, "replay-input.json");
      const outputPath = join(tempDir, "replay-package.json");
      writeFileSync(inputPath, JSON.stringify(replayInput()));

      const result = runReplayCli([
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--dry-run",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        output_path: outputPath,
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runReplayCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-historical-replay-package.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
