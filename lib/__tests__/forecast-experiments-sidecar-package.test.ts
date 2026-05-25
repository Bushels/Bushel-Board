import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import {
  CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION,
  buildCanolaForecastSidecarPackage,
} from "../forecast-experiments/sidecar-package";
import { runCanolaForecastLocalWorkflow } from "../forecast-experiments/local-workflow";

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
    low: 1.25,
    high: 4.5,
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

const workflow = () =>
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
  });

describe("Canola forecast sidecar package", () => {
  it("builds deterministic sidecar review rows without executing writes", () => {
    const first = buildCanolaForecastSidecarPackage({
      workflow: workflow(),
      experiment_slug: "canola-v1-walk-forward",
      repo_commit: "7aed1f3",
      raw_model_output: "{\"ok\":true}",
    });
    const second = buildCanolaForecastSidecarPackage({
      workflow: workflow(),
      experiment_slug: "canola-v1-walk-forward",
      repo_commit: "7aed1f3",
      raw_model_output: "{\"ok\":true}",
    });

    expect(first.schema_version).toBe(
      CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION,
    );
    expect(first.package_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.package_hash).toBe(first.package_hash);
    expect(first.guardrails).toMatchObject({
      executes_writes: false,
      review_required_before_write: true,
      allowed_schema: "experimental",
      production_tables: [],
    });
    expect(first.run_insert).toMatchObject({
      experiment_slug: "canola-v1-walk-forward",
      grain: "Canola",
      crop_year: "2026-2027",
      grain_week: 1,
      as_of_date: "2026-08-07",
      source_cutoff_at: "2026-08-07T14:30:00-06:00",
      snapshot_hash: workflow().snapshot.snapshot_hash,
      llm_provider: "manual",
      llm_model: "gemini-3.1-pro-preview",
      repo_commit: "7aed1f3",
      run_status: "parsed",
    });
    expect(first.prediction_inserts).toHaveLength(1);
    expect(first.prediction_inserts[0].run_lookup).toEqual(first.run_lookup);
    expect(first.prediction_inserts[0].row).toMatchObject({
      horizon_days: 28,
      price_exchange: "ICE",
      price_commodity: "Canola",
      price_contract_code: "RSX26",
      price_contract_month: "2026-11",
      price_roll_policy: "fixed_contract_no_roll",
      direction: "bullish",
      stance_score: 35,
      confidence_pct: 62,
      expected_move_pct_low: 1.25,
      expected_move_pct_high: 4.5,
      recommendation: "SCALE_IN",
      raw_model_output: "{\"ok\":true}",
      parse_status: "parsed",
      validation_errors: [],
    });
    expect(first.score_inserts).toEqual([]);
  });

  it("rejects tampered workflow hashes before packaging sidecar rows", () => {
    const tampered = workflow();
    tampered.snapshot.grain_week = 2;

    expect(() =>
      buildCanolaForecastSidecarPackage({
        workflow: tampered,
        experiment_slug: "canola-v1-walk-forward",
      }),
    ).toThrow(/snapshot_hash.*contents|workflow_hash.*contents/i);
  });
});

describe("Canola forecast sidecar package CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runSidecarPackageCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-forecast-sidecar-package");
    expect(result.stdout).toContain("--workflow");
  });

  it("emits machine-readable sidecar package JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-sidecar-package-cli-"));

    try {
      const workflowPath = join(tempDir, "workflow.json");
      writeFileSync(workflowPath, JSON.stringify(workflow()));

      const result = runSidecarPackageCli([
        "--workflow",
        workflowPath,
        "--experiment-slug",
        "canola-v1-walk-forward",
        "--repo-commit",
        "7aed1f3",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("sidecar package built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_FORECAST_SIDECAR_PACKAGE_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-sidecar-package-dry-"));

    try {
      const workflowPath = join(tempDir, "workflow.json");
      const outputPath = join(tempDir, "sidecar-package.json");
      writeFileSync(workflowPath, JSON.stringify(workflow()));

      const result = runSidecarPackageCli([
        "--workflow",
        workflowPath,
        "--experiment-slug",
        "canola-v1-walk-forward",
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

function runSidecarPackageCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-forecast-sidecar-package.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
