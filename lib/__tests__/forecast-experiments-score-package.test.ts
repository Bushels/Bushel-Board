import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import { runCanolaForecastLocalWorkflow } from "../forecast-experiments/local-workflow";
import { buildCanolaForecastSidecarPackage } from "../forecast-experiments/sidecar-package";
import {
  CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION,
  buildCanolaForecastScorePackage,
} from "../forecast-experiments/score-package";

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
  invalidating_triggers: ["Next settlement closes below the prior weekly low."],
  known_blind_spots: ["No live intraday order-flow data in this experiment."],
  source_warnings: [
    {
      source: "llm",
      warning: "Do not trust commodity history from model memory.",
    },
  ],
});

const sidecarPackage = () =>
  buildCanolaForecastSidecarPackage({
    workflow: runCanolaForecastLocalWorkflow({
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
    }),
    experiment_slug: "canola-v1-walk-forward",
  });

const outcomeInput = () => ({
  sidecar_package: sidecarPackage(),
  eval_window_days: 28 as const,
  start_price: 720,
  end_price: 748.8,
  start_price_at: "2026-08-07T13:15:00-06:00",
  end_price_at: "2026-09-04T13:15:00-06:00",
  market_close_at: "2026-08-07T13:15:00-06:00",
  evaluated_at: "2026-09-04T14:00:00-06:00",
  baseline_results: {
    hold_cash: {
      price_change_pct: 0,
    },
  },
  score_notes: "Local scoring fixture.",
});

describe("Canola forecast score package", () => {
  it("builds a deterministic no-write sidecar score row from outcome prices", () => {
    const first = buildCanolaForecastScorePackage(outcomeInput());
    const second = buildCanolaForecastScorePackage(outcomeInput());

    expect(first.schema_version).toBe(CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION);
    expect(first.score_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.score_hash).toBe(first.score_hash);
    expect(first.guardrails).toMatchObject({
      executes_writes: false,
      review_required_before_write: true,
      allowed_schema: "experimental",
      production_tables: [],
    });
    expect(first.score_insert).toMatchObject({
      eval_window_days: 28,
      price_contract_code: "RSX26",
      price_roll_policy: "fixed_contract_no_roll",
      start_price: 720,
      end_price: 748.8,
      price_change_pct: 4,
      direction_result: "correct",
      magnitude_error_pct: 1,
      brier_score: 0.1444,
      confidence_bucket: "61-70",
      source_snapshot_hash: sidecarPackage().run_insert.snapshot_hash,
      score_notes: "Local scoring fixture.",
    });
  });

  it("rejects score windows that are not present in the sidecar package", () => {
    expect(() =>
      buildCanolaForecastScorePackage({
        ...outcomeInput(),
        eval_window_days: 7,
      }),
    ).toThrow(/No prediction row.*eval_window_days/i);
  });

  it("rejects invalid start-price timing before building a score row", () => {
    expect(() =>
      buildCanolaForecastScorePackage({
        ...outcomeInput(),
        start_price_at: "2026-08-07T14:31:00-06:00",
      }),
    ).toThrow(/start price timestamp/i);
  });
});

describe("Canola forecast score package CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runScorePackageCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("score-canola-forecast-outcome");
    expect(result.stdout).toContain("--sidecar-package");
  });

  it("emits machine-readable score package JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-score-package-cli-"));

    try {
      const sidecarPath = join(tempDir, "sidecar-package.json");
      writeFileSync(sidecarPath, JSON.stringify(sidecarPackage()));

      const result = runScorePackageCli([
        "--sidecar-package",
        sidecarPath,
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("score package built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_FORECAST_SCORE_PACKAGE_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-score-package-dry-"));

    try {
      const sidecarPath = join(tempDir, "sidecar-package.json");
      const outputPath = join(tempDir, "score-package.json");
      writeFileSync(sidecarPath, JSON.stringify(sidecarPackage()));

      const result = runScorePackageCli([
        "--sidecar-package",
        sidecarPath,
        "--output",
        outputPath,
        "--dry-run",
        ...baseCliArgs(),
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

function baseCliArgs(): string[] {
  return [
    "--eval-window-days",
    "28",
    "--start-price",
    "720",
    "--end-price",
    "748.8",
    "--start-price-at",
    "2026-08-07T13:15:00-06:00",
    "--end-price-at",
    "2026-09-04T13:15:00-06:00",
    "--market-close-at",
    "2026-08-07T13:15:00-06:00",
    "--evaluated-at",
    "2026-09-04T14:00:00-06:00",
    "--score-notes",
    "CLI fixture.",
  ];
}

function runScorePackageCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/score-canola-forecast-outcome.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
