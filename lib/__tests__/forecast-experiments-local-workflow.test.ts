import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import {
  CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
  runCanolaForecastLocalWorkflow,
} from "../forecast-experiments/local-workflow";

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

const workflowInput = () => ({
  source_rows: sourceRows(),
  forecast: forecast(),
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  snapshot_mode: "strict_artifact_mode" as const,
  horizon_days: 28 as const,
  price_contract: {
    exchange: "ICE",
    commodity: "Canola" as const,
    contract_code: "RSX26",
    contract_month: "2026-11",
    roll_policy: "fixed_contract_no_roll" as const,
  },
  model_training_cutoff: "2026-04-30",
  provider: "manual",
  model: "gemini-3.1-pro-preview",
  runner_mode: "manual_model_output" as const,
  prompt_version: "canola-forecast-prompt-v1",
  created_at: "2026-08-07T14:36:00-06:00",
});

describe("Canola forecast local workflow", () => {
  it("runs the local source-records to run-artifact workflow deterministically", () => {
    const first = runCanolaForecastLocalWorkflow(workflowInput());
    const second = runCanolaForecastLocalWorkflow(workflowInput());

    expect(first.schema_version).toBe(
      CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
    );
    expect(first.workflow_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.workflow_hash).toBe(first.workflow_hash);
    expect(first.source_records.records).toHaveLength(1);
    expect(first.snapshot.snapshot_hash).toBe(first.prompt_pack.snapshot_hash);
    expect(first.run_artifact.snapshot_hash).toBe(first.snapshot.snapshot_hash);
  });

  it("rejects forecast JSON that no longer matches the generated snapshot", () => {
    expect(() =>
      runCanolaForecastLocalWorkflow({
        ...workflowInput(),
        forecast: {
          ...forecast(),
          grain_week: 2,
        },
      }),
    ).toThrow(/grain_week.*snapshot/i);
  });
});

describe("Canola forecast local workflow CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runWorkflowCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("run-canola-forecast-local-workflow");
    expect(result.stdout).toContain("--source-rows");
  });

  it("emits machine-readable workflow JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-workflow-cli-"));

    try {
      const sourceRowsPath = join(tempDir, "source-rows.json");
      const forecastPath = join(tempDir, "forecast.json");
      writeFileSync(sourceRowsPath, JSON.stringify({ rows: sourceRows() }));
      writeFileSync(forecastPath, JSON.stringify(forecast()));

      const result = runWorkflowCli([
        "--source-rows",
        sourceRowsPath,
        "--forecast",
        forecastPath,
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("local workflow built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_FORECAST_LOCAL_WORKFLOW_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output directory files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-workflow-dry-"));

    try {
      const sourceRowsPath = join(tempDir, "source-rows.json");
      const forecastPath = join(tempDir, "forecast.json");
      const outputDir = join(tempDir, "workflow-output");
      writeFileSync(sourceRowsPath, JSON.stringify({ rows: sourceRows() }));
      writeFileSync(forecastPath, JSON.stringify(forecast()));

      const result = runWorkflowCli([
        "--source-rows",
        sourceRowsPath,
        "--forecast",
        forecastPath,
        "--output-dir",
        outputDir,
        "--dry-run",
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output directory not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        output_dir: outputDir,
      });
      expect(existsSync(outputDir)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function baseCliArgs(): string[] {
  return [
    "--crop-year",
    "2026-2027",
    "--grain-week",
    "1",
    "--as-of",
    "2026-08-07",
    "--source-cutoff-at",
    "2026-08-07T14:30:00-06:00",
    "--snapshot-mode",
    "strict_artifact_mode",
    "--horizon-days",
    "28",
    "--exchange",
    "ICE",
    "--contract-code",
    "RSX26",
    "--contract-month",
    "2026-11",
    "--roll-policy",
    "fixed_contract_no_roll",
    "--model-training-cutoff",
    "2026-04-30",
    "--provider",
    "manual",
    "--model",
    "gemini-3.1-pro-preview",
    "--runner-mode",
    "manual_model_output",
    "--prompt-version",
    "canola-forecast-prompt-v1",
    "--created-at",
    "2026-08-07T14:36:00-06:00",
  ];
}

function runWorkflowCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/run-canola-forecast-local-workflow.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
