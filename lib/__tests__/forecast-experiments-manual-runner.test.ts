import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import { buildCanolaForecastSnapshot } from "../forecast-experiments/snapshot";
import { buildCanolaForecastPromptPack } from "../forecast-experiments/prompt-pack";
import {
  CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION,
  buildCanolaForecastManualRunResult,
} from "../forecast-experiments/manual-runner";

const snapshot = () =>
  buildCanolaForecastSnapshot({
    grain: "Canola",
    crop_year: "2026-2027",
    grain_week: 1,
    as_of_date: "2026-08-07",
    source_cutoff_at: "2026-08-07T14:30:00-06:00",
    snapshot_mode: "strict_artifact_mode",
    records: [
      {
        source_key: "cgc_weekly",
        record_type: "fact",
        observed_period: "2026-2027 week 1 ending 2026-08-02",
        published_at: "2026-08-06T13:00:00-06:00",
        available_at: "2026-08-06T13:05:00-06:00",
        payload: {
          worksheet: "Primary",
          metric: "Deliveries",
          grain: "Canola",
          region: "Saskatchewan",
          unit: "Ktonnes",
          value: 123.4,
        },
      },
    ],
  });

const priceContract = () => ({
  exchange: "ICE",
  commodity: "Canola" as const,
  contract_code: "RSX26",
  contract_month: "2026-11",
  roll_policy: "fixed_contract_no_roll" as const,
});

const promptPack = () =>
  buildCanolaForecastPromptPack({
    snapshot: snapshot(),
    horizon_days: 28,
    price_contract: priceContract(),
    model_training_cutoff: "2026-04-30",
    created_at: "2026-08-07T14:35:00-06:00",
    prompt_version: "canola-forecast-prompt-v1",
  });

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
  price_contract: priceContract(),
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

describe("Canola forecast manual runner", () => {
  it("parses a strict raw model JSON object into a deterministic run artifact", () => {
    const first = buildCanolaForecastManualRunResult({
      snapshot: snapshot(),
      prompt_pack: promptPack(),
      raw_model_output: JSON.stringify(forecast()),
      provider: "manual",
      model: "gemini-3.1-pro-preview",
      runner_mode: "manual_model_output",
      created_at: "2026-08-07T14:36:00-06:00",
    });
    const second = buildCanolaForecastManualRunResult({
      snapshot: snapshot(),
      prompt_pack: promptPack(),
      raw_model_output: JSON.stringify(forecast()),
      provider: "manual",
      model: "gemini-3.1-pro-preview",
      runner_mode: "manual_model_output",
      created_at: "2026-08-07T14:36:00-06:00",
    });

    expect(first.schema_version).toBe(
      CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION,
    );
    expect(first.parse_status).toBe("parsed");
    expect(first.raw_output_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.run_artifact.metadata.prompt_hash).toBe(promptPack().prompt_hash);
    expect(first.run_artifact.forecast.horizon_days).toBe(28);
    expect(second.result_hash).toBe(first.result_hash);
  });

  it("parses a single fenced JSON block without accepting commentary", () => {
    const result = buildCanolaForecastManualRunResult({
      snapshot: snapshot(),
      prompt_pack: promptPack(),
      raw_model_output: `\`\`\`json\n${JSON.stringify(forecast())}\n\`\`\``,
      provider: "manual",
      model: "gemini-3.1-pro-preview",
      runner_mode: "manual_model_output",
      created_at: "2026-08-07T14:36:00-06:00",
    });

    expect(result.parse_status).toBe("parsed");
    expect(result.run_artifact.forecast.schema_version).toBe(
      CANOLA_FORECAST_SCHEMA_VERSION,
    );
  });

  it("rejects model output with commentary outside the JSON payload", () => {
    expect(() =>
      buildCanolaForecastManualRunResult({
        snapshot: snapshot(),
        prompt_pack: promptPack(),
        raw_model_output: `Here is the forecast:\n${JSON.stringify(forecast())}`,
        provider: "manual",
        model: "gemini-3.1-pro-preview",
        runner_mode: "manual_model_output",
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/single JSON object or a single fenced JSON block/i);
  });

  it("rejects model output whose horizon does not match the prompt pack", () => {
    expect(() =>
      buildCanolaForecastManualRunResult({
        snapshot: snapshot(),
        prompt_pack: promptPack(),
        raw_model_output: JSON.stringify({
          ...forecast(),
          horizon_days: 7,
        }),
        provider: "manual",
        model: "gemini-3.1-pro-preview",
        runner_mode: "manual_model_output",
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/horizon_days.*prompt_pack/i);
  });
});

describe("Canola forecast manual runner CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runManualRunnerCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("run-canola-forecast-manual-output");
    expect(result.stdout).toContain("--raw-output");
  });

  it("emits machine-readable manual-run result JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-manual-runner-cli-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      const promptPackPath = join(tempDir, "prompt-pack.json");
      const rawOutputPath = join(tempDir, "raw-output.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));
      writeFileSync(promptPackPath, JSON.stringify(promptPack()));
      writeFileSync(rawOutputPath, JSON.stringify(forecast()));

      const result = runManualRunnerCli([
        "--snapshot",
        snapshotPath,
        "--prompt-pack",
        promptPackPath,
        "--raw-output",
        rawOutputPath,
        ...baseCliArgs(),
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("manual run artifact built");
      expect(JSON.parse(result.stdout).schema_version).toBe(
        CANOLA_FORECAST_MANUAL_RUNNER_SCHEMA_VERSION,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-manual-runner-dry-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      const promptPackPath = join(tempDir, "prompt-pack.json");
      const rawOutputPath = join(tempDir, "raw-output.json");
      const outputPath = join(tempDir, "manual-run-result.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));
      writeFileSync(promptPackPath, JSON.stringify(promptPack()));
      writeFileSync(rawOutputPath, JSON.stringify(forecast()));

      const result = runManualRunnerCli([
        "--snapshot",
        snapshotPath,
        "--prompt-pack",
        promptPackPath,
        "--raw-output",
        rawOutputPath,
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
    "--provider",
    "manual",
    "--model",
    "gemini-3.1-pro-preview",
    "--runner-mode",
    "manual_model_output",
    "--created-at",
    "2026-08-07T14:36:00-06:00",
  ];
}

function runManualRunnerCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/run-canola-forecast-manual-output.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
