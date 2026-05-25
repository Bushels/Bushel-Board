import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANOLA_FORECAST_SCHEMA_VERSION } from "../forecast-experiments/schema";
import { buildCanolaForecastSnapshot } from "../forecast-experiments/snapshot";
import {
  CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
  buildCanolaForecastRunArtifact,
} from "../forecast-experiments/run-artifact";

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

const metadata = () => ({
  provider: "manual",
  model: "gemini-3.1-pro-preview",
  runner_mode: "manual_model_output" as const,
  prompt_version: "canola-forecast-prompt-v1",
  prompt_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  model_training_cutoff: "2026-04-30",
  created_at: "2026-08-07T14:35:00-06:00",
});

describe("Canola forecast run artifact", () => {
  it("builds a deterministic local run artifact from a snapshot and forecast JSON", () => {
    const first = buildCanolaForecastRunArtifact({
      snapshot: snapshot(),
      forecast: forecast(),
      metadata: metadata(),
    });
    const second = buildCanolaForecastRunArtifact({
      forecast: forecast(),
      metadata: metadata(),
      snapshot: snapshot(),
    });

    expect(first.schema_version).toBe(
      CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
    );
    expect(first.snapshot_hash).toBe(snapshot().snapshot_hash);
    expect(first.run_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.run_hash).toBe(first.run_hash);
  });

  it("rejects forecasts whose grain week or cutoff do not match the snapshot", () => {
    expect(() =>
      buildCanolaForecastRunArtifact({
        snapshot: snapshot(),
        forecast: {
          ...forecast(),
          grain_week: 2,
        },
        metadata: metadata(),
      }),
    ).toThrow(/grain_week.*snapshot/i);

    expect(() =>
      buildCanolaForecastRunArtifact({
        snapshot: snapshot(),
        forecast: {
          ...forecast(),
          source_cutoff_at: "2026-08-07T15:00:00-06:00",
        },
        metadata: metadata(),
      }),
    ).toThrow(/source_cutoff_at.*snapshot/i);
  });

  it("rejects forecast evidence clocks after the source cutoff", () => {
    expect(() =>
      buildCanolaForecastRunArtifact({
        snapshot: snapshot(),
        forecast: {
          ...forecast(),
          top_drivers: [
            {
              ...forecast().top_drivers[0],
              evidence_clock: "2026-08-07T14:31:00-06:00",
            },
          ],
        },
        metadata: metadata(),
      }),
    ).toThrow(/evidence_clock.*after source_cutoff_at/i);
  });

  it("rejects model training cutoff mismatches between metadata and forecast", () => {
    expect(() =>
      buildCanolaForecastRunArtifact({
        snapshot: snapshot(),
        forecast: forecast(),
        metadata: {
          ...metadata(),
          model_training_cutoff: "2026-05-01",
        },
      }),
    ).toThrow(/model_training_cutoff.*metadata/i);
  });

  it("rejects model training cutoffs after the forecast source cutoff", () => {
    expect(() =>
      buildCanolaForecastRunArtifact({
        snapshot: snapshot(),
        forecast: {
          ...forecast(),
          model_training_cutoff: "2026-08-08",
          pretraining_taint_status: "tainted",
        },
        metadata: {
          ...metadata(),
          model_training_cutoff: "2026-08-08",
        },
      }),
    ).toThrow(/model_training_cutoff.*after source_cutoff_at/i);
  });
});

describe("Canola forecast run artifact CLI", () => {
  it("prints help without reading external systems", () => {
    const result = runArtifactCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-forecast-run-artifact");
    expect(result.stdout).toContain("--snapshot");
  });

  it("emits machine-readable artifact JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-run-artifact-cli-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      const forecastPath = join(tempDir, "forecast.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));
      writeFileSync(forecastPath, JSON.stringify(forecast()));

      const result = runArtifactCli([
        "--snapshot",
        snapshotPath,
        "--forecast",
        forecastPath,
        "--provider",
        "manual",
        "--model",
        "gemini-3.1-pro-preview",
        "--runner-mode",
        "manual_model_output",
        "--prompt-version",
        "canola-forecast-prompt-v1",
        "--prompt-hash",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "--model-training-cutoff",
        "2026-04-30",
        "--created-at",
        "2026-08-07T14:35:00-06:00",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("run artifact built");

      const parsed = JSON.parse(result.stdout);
      expect(parsed.schema_version).toBe(
        CANOLA_FORECAST_RUN_ARTIFACT_SCHEMA_VERSION,
      );
      expect(parsed.run_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-run-artifact-dry-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      const forecastPath = join(tempDir, "forecast.json");
      const outputPath = join(tempDir, "run-artifact.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));
      writeFileSync(forecastPath, JSON.stringify(forecast()));

      const result = runArtifactCli([
        "--snapshot",
        snapshotPath,
        "--forecast",
        forecastPath,
        "--output",
        outputPath,
        "--provider",
        "manual",
        "--model",
        "gemini-3.1-pro-preview",
        "--runner-mode",
        "manual_model_output",
        "--created-at",
        "2026-08-07T14:35:00-06:00",
        "--dry-run",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        output_path: outputPath,
      });
      expect(() => readFileSync(outputPath, "utf8")).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runArtifactCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-forecast-run-artifact.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
