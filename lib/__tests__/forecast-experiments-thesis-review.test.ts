import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import { runCanolaForecastLocalWorkflow } from "../forecast-experiments/local-workflow";
import {
  CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION,
  buildCanolaThesisReviewPackage,
} from "../forecast-experiments/thesis-review";

const sourceRows = () => [
  {
    source_key: "cgc_weekly",
    record_type: "fact" as const,
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

const forecast = () => ({
  schema_version: CANOLA_FORECAST_SCHEMA_VERSION,
  grain: "Canola",
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  model_training_cutoff: "2026-04-30",
  pretraining_taint_status: "untainted",
  horizon_days: 28,
  price_contract: {
    exchange: "ICE",
    commodity: "Canola",
    contract_code: "RSX26",
    contract_month: "2026-11",
    roll_policy: "fixed_contract_no_roll",
  },
  direction: "bullish",
  stance_score: 35,
  confidence_pct: 62,
  expected_move_pct_range: {
    low: 1,
    high: 3,
  },
  recommendation: "SCALE_IN",
  top_drivers: [
    {
      driver: "Export demand improved versus the prior weekly snapshot.",
      directional_effect: "bullish",
      evidence_source: "cgc_weekly",
      evidence_clock: "2026-08-07T14:30:00-06:00",
      confidence: "medium",
    },
  ],
  invalidating_triggers: ["Next CGC report shows deliveries and exports fading."],
  known_blind_spots: ["No full price tape is available in this experiment."],
  source_warnings: [
    {
      source: "grain_prices",
      warning: "Price history is incomplete; use thesis evidence first.",
    },
  ],
});

const runArtifact = () =>
  runCanolaForecastLocalWorkflow({
    source_rows: sourceRows(),
    forecast: forecast(),
    crop_year: "2026-2027",
    grain_week: 1,
    as_of_date: "2026-08-07",
    source_cutoff_at: "2026-08-07T14:30:00-06:00",
    snapshot_mode: "strict_artifact_mode",
    horizon_days: 28,
    price_contract: {
      exchange: "ICE",
      commodity: "Canola",
      contract_code: "RSX26",
      contract_month: "2026-11",
      roll_policy: "fixed_contract_no_roll",
    },
    model_training_cutoff: "2026-04-30",
    provider: "manual",
    model: "gemini-3.1-pro-preview",
    runner_mode: "manual_model_output",
    prompt_version: "canola-forecast-prompt-v1",
    created_at: "2026-08-07T14:36:00-06:00",
  }).run_artifact;

const acceptedEvidence = () => ({
  evidence_key: "cgc-week-2",
  source_key: "cgc_weekly",
  evidence_type: "official_data" as const,
  observed_period: "2026-2027 week 2 ending 2026-08-09",
  published_at: "2026-08-13T13:00:00-06:00",
  available_at: "2026-08-13T13:10:00-06:00",
  summary: "Next CGC release kept Canola deliveries ahead of the prior pace.",
  directional_effect: "bullish" as const,
  materiality: "high" as const,
  payload: {
    worksheet: "Primary",
    metric: "Deliveries",
    grain: "Canola",
    week_ending_date: "2026-08-09",
    direction_vs_thesis: "supportive",
  },
});

const reviewInput = () => ({
  run_artifact: runArtifact(),
  review_as_of_date: "2026-08-14",
  review_cutoff_at: "2026-08-14T16:30:00-06:00",
  reviewer: "codex",
  thesis_verdict: "held" as const,
  verdict_notes:
    "The thesis held because the next official data release supported the core demand/delivery driver.",
  next_week_evidence: [acceptedEvidence()],
  driver_reviews: [
    {
      driver_index: 0,
      verdict: "supported" as const,
      evidence_keys: ["cgc-week-2"],
      notes: "The follow-up CGC release supported the original driver.",
    },
  ],
  missed_signals: [],
  adjustments_for_next_week: [
    {
      adjustment: "Keep the driver but lower confidence until price tape improves.",
      reason: "The thesis evidence held, but price history remains incomplete.",
      priority: "medium" as const,
    },
  ],
  created_at: "2026-08-14T16:35:00-06:00",
});

describe("Canola thesis weekly review package", () => {
  it("builds a deterministic no-write thesis review without requiring prices", () => {
    const first = buildCanolaThesisReviewPackage(reviewInput());
    const second = buildCanolaThesisReviewPackage(reviewInput());

    expect(first.schema_version).toBe(CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION);
    expect(first.package_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.package_hash).toBe(first.package_hash);
    expect(first.guardrails).toMatchObject({
      executes_writes: false,
      requires_prices: false,
      calls_model_api: false,
      reads_supabase: false,
    });
    expect(first.learning_candidate).toMatchObject({
      allowed: true,
      mode: "forward_calibration_candidate",
    });
    expect(first.accepted_evidence).toHaveLength(1);
    expect(first.blocked_evidence).toHaveLength(0);
  });

  it("blocks already-known, future, and forbidden evidence while keeping valid next-week evidence", () => {
    const reviewPackage = buildCanolaThesisReviewPackage({
      ...reviewInput(),
      next_week_evidence: [
        acceptedEvidence(),
        {
          ...acceptedEvidence(),
          evidence_key: "already-known",
          available_at: "2026-08-07T13:00:00-06:00",
        },
        {
          ...acceptedEvidence(),
          evidence_key: "too-late",
          available_at: "2026-08-15T13:00:00-06:00",
        },
        {
          ...acceptedEvidence(),
          evidence_key: "production-thesis",
          source_key: "market_analysis",
        },
      ],
    });

    expect(reviewPackage.accepted_evidence.map((record) => record.evidence_key)).toEqual([
      "cgc-week-2",
    ]);
    expect(reviewPackage.blocked_evidence.map((record) => record.reason).sort()).toEqual([
      "already_available_at_forecast_cutoff",
      "available_after_review_cutoff",
      "forbidden_source",
    ]);
  });

  it("rejects driver reviews that reference evidence outside the accepted review window", () => {
    expect(() =>
      buildCanolaThesisReviewPackage({
        ...reviewInput(),
        driver_reviews: [
          {
            driver_index: 0,
            verdict: "supported",
            evidence_keys: ["missing-evidence"],
            notes: "Bad reference.",
          },
        ],
      }),
    ).toThrow(/unavailable evidence_key/i);
  });

  it("requires an adjustment when the thesis missed", () => {
    expect(() =>
      buildCanolaThesisReviewPackage({
        ...reviewInput(),
        thesis_verdict: "missed",
        adjustments_for_next_week: [],
      }),
    ).toThrow(/missed thesis reviews require/i);
  });

  it("keeps unknown pretraining status out of calibration candidates", () => {
    const reviewPackage = buildCanolaThesisReviewPackage({
      ...reviewInput(),
      run_artifact: runArtifactWithForecast({
        ...forecast(),
        pretraining_taint_status: "unknown",
      }),
    });

    expect(reviewPackage.learning_candidate).toEqual({
      allowed: false,
      mode: "review_only_pretraining_unknown",
      reasons: ["forecast pretraining status is not proven untainted"],
    });
  });
});

describe("Canola thesis review CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runReviewCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("review-canola-thesis-week");
    expect(result.stdout).toContain("--run-artifact");
  });

  it("emits machine-readable review package JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-thesis-review-cli-"));

    try {
      const runArtifactPath = join(tempDir, "run-artifact.json");
      const reviewPath = join(tempDir, "review.json");
      writeFileSync(runArtifactPath, JSON.stringify(runArtifact()));
      writeFileSync(reviewPath, JSON.stringify(stripRunArtifact(reviewInput())));

      const result = runReviewCli([
        "--run-artifact",
        runArtifactPath,
        "--review",
        reviewPath,
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("thesis review package built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_THESIS_REVIEW_PACKAGE_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-thesis-review-dry-"));

    try {
      const runArtifactPath = join(tempDir, "run-artifact.json");
      const reviewPath = join(tempDir, "review.json");
      const outputPath = join(tempDir, "review-package.json");
      writeFileSync(runArtifactPath, JSON.stringify(runArtifact()));
      writeFileSync(reviewPath, JSON.stringify(stripRunArtifact(reviewInput())));

      const result = runReviewCli([
        "--run-artifact",
        runArtifactPath,
        "--review",
        reviewPath,
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

function stripRunArtifact(input: ReturnType<typeof reviewInput>) {
  const { run_artifact: runArtifact, ...review } = input;
  void runArtifact;
  return review;
}

function runArtifactWithForecast(nextForecast: ReturnType<typeof forecast>) {
  return runCanolaForecastLocalWorkflow({
    source_rows: sourceRows(),
    forecast: nextForecast,
    crop_year: "2026-2027",
    grain_week: 1,
    as_of_date: "2026-08-07",
    source_cutoff_at: "2026-08-07T14:30:00-06:00",
    snapshot_mode: "strict_artifact_mode",
    horizon_days: 28,
    price_contract: {
      exchange: "ICE",
      commodity: "Canola",
      contract_code: "RSX26",
      contract_month: "2026-11",
      roll_policy: "fixed_contract_no_roll",
    },
    model_training_cutoff: "2026-04-30",
    provider: "manual",
    model: "gemini-3.1-pro-preview",
    runner_mode: "manual_model_output",
    prompt_version: "canola-forecast-prompt-v1",
    created_at: "2026-08-07T14:36:00-06:00",
  }).run_artifact;
}

function runReviewCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/review-canola-thesis-week.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
