import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCanolaForecastSnapshot } from "../forecast-experiments/snapshot";
import {
  CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
  buildCanolaForecastPromptPack,
} from "../forecast-experiments/prompt-pack";

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

describe("Canola forecast prompt pack", () => {
  it("builds a deterministic local prompt pack from a snapshot", () => {
    const first = buildCanolaForecastPromptPack({
      snapshot: snapshot(),
      horizon_days: 28,
      price_contract: priceContract(),
      model_training_cutoff: "2026-04-30",
      created_at: "2026-08-07T14:36:00-06:00",
      prompt_version: "canola-forecast-prompt-v1",
    });
    const second = buildCanolaForecastPromptPack({
      prompt_version: "canola-forecast-prompt-v1",
      created_at: "2026-08-07T14:36:00-06:00",
      model_training_cutoff: "2026-04-30",
      price_contract: priceContract(),
      horizon_days: 28,
      snapshot: snapshot(),
    });

    expect(first.schema_version).toBe(
      CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
    );
    expect(first.snapshot_hash).toBe(snapshot().snapshot_hash);
    expect(first.prompt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.prompt_hash).toBe(first.prompt_hash);
  });

  it("includes the source cutoff, snapshot hash, and forecast JSON contract in the prompt text", () => {
    const promptPack = buildCanolaForecastPromptPack({
      snapshot: snapshot(),
      horizon_days: 28,
      price_contract: priceContract(),
      model_training_cutoff: "2026-04-30",
      created_at: "2026-08-07T14:36:00-06:00",
      prompt_version: "canola-forecast-prompt-v1",
    });

    expect(promptPack.system_prompt).toContain("Use only the supplied snapshot");
    expect(promptPack.user_prompt).toContain(snapshot().snapshot_hash);
    expect(promptPack.user_prompt).toContain("2026-08-07T14:30:00-06:00");
    expect(promptPack.response_contract.schema_version).toBe("canola-forecast-v1");
  });

  it("rejects tampered snapshots whose hash no longer matches the contents", () => {
    expect(() =>
      buildCanolaForecastPromptPack({
        snapshot: {
          ...snapshot(),
          grain_week: 2,
        },
        horizon_days: 28,
        price_contract: priceContract(),
        model_training_cutoff: "2026-04-30",
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/snapshot_hash.*contents/i);
  });

  it("rejects malformed snapshots before building prompt text", () => {
    expect(() =>
      buildCanolaForecastPromptPack({
        snapshot: {
          schema_version: "canola-forecast-snapshot-v1",
          snapshot_hash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          grain: "Canola",
          crop_year: "2026-2027",
          grain_week: 1,
          as_of_date: "2026-08-07",
          snapshot_mode: "strict_artifact_mode",
          revision_taint_status: "untainted",
        },
        horizon_days: 28,
        price_contract: priceContract(),
        model_training_cutoff: "2026-04-30",
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/snapshot.*source_cutoff_at/i);
  });

  it("rejects a 28-day prompt pack without a fixed price contract", () => {
    expect(() =>
      buildCanolaForecastPromptPack({
        snapshot: snapshot(),
        horizon_days: 28,
        price_contract: {
          ...priceContract(),
          contract_code: "",
        },
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/price_contract.*contract_code/i);
  });

  it("rejects model training cutoffs after the source cutoff", () => {
    expect(() =>
      buildCanolaForecastPromptPack({
        snapshot: snapshot(),
        horizon_days: 28,
        price_contract: priceContract(),
        model_training_cutoff: "2026-08-08",
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/model_training_cutoff.*after source_cutoff_at/i);
  });

  it("requires an explicit model training cutoff before prompt generation", () => {
    expect(() =>
      buildCanolaForecastPromptPack({
        snapshot: snapshot(),
        horizon_days: 28,
        price_contract: priceContract(),
        model_training_cutoff: null,
        created_at: "2026-08-07T14:36:00-06:00",
      }),
    ).toThrow(/model_training_cutoff.*required/i);
  });
});

describe("Canola forecast prompt-pack CLI", () => {
  it("prints help without reading external systems", () => {
    const result = runPromptPackCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-forecast-prompt-pack");
    expect(result.stdout).toContain("--snapshot");
  });

  it("emits machine-readable prompt-pack JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-prompt-pack-cli-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));

      const result = runPromptPackCli([
        "--snapshot",
        snapshotPath,
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
        "--prompt-version",
        "canola-forecast-prompt-v1",
        "--created-at",
        "2026-08-07T14:36:00-06:00",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("prompt pack built");

      const parsed = JSON.parse(result.stdout);
      expect(parsed.schema_version).toBe(
        CANOLA_FORECAST_PROMPT_PACK_SCHEMA_VERSION,
      );
      expect(parsed.prompt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-prompt-pack-dry-"));

    try {
      const snapshotPath = join(tempDir, "snapshot.json");
      const outputPath = join(tempDir, "prompt-pack.json");
      writeFileSync(snapshotPath, JSON.stringify(snapshot()));

      const result = runPromptPackCli([
        "--snapshot",
        snapshotPath,
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
        "--created-at",
        "2026-08-07T14:36:00-06:00",
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
      expect(() => readFileSync(outputPath, "utf8")).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runPromptPackCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-forecast-prompt-pack.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
