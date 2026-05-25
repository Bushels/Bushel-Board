import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCanolaForecastPromptPack } from "../forecast-experiments/prompt-pack";
import { buildCanolaForecastRunArtifact } from "../forecast-experiments/run-artifact";
import { buildCanolaForecastSnapshot } from "../forecast-experiments/snapshot";
import {
  buildSnapshotSourceRecords,
  type ApprovedForecastSourceRow,
} from "../forecast-experiments/source-records";

const artifactDir = join(
  process.cwd(),
  "docs",
  "reference",
  "forecast-experiments",
  "canola-forward-week-38-2026-05-10",
);
const outputDir = join(artifactDir, "output");

describe("Canola forward Week 38 real source artifact", () => {
  it("rebuilds source records, snapshot, prompt pack, and run artifact hashes", () => {
    const sourceRows = readJson<{
      rows: ApprovedForecastSourceRow[];
      crop_year: string;
      grain_week: number;
      as_of_date: string;
      source_cutoff_at: string;
      snapshot_mode: "strict_artifact_mode";
    }>("source-rows.json");
    const sourceRecords = buildSnapshotSourceRecords(sourceRows.rows, {
      as_of_date: sourceRows.as_of_date,
      source_cutoff_at: sourceRows.source_cutoff_at,
      snapshot_mode: sourceRows.snapshot_mode,
    });
    const snapshot = buildCanolaForecastSnapshot({
      grain: "Canola",
      crop_year: sourceRows.crop_year,
      grain_week: sourceRows.grain_week,
      as_of_date: sourceRows.as_of_date,
      source_cutoff_at: sourceRows.source_cutoff_at,
      snapshot_mode: sourceRows.snapshot_mode,
      records: sourceRecords,
    });
    const promptPack = buildCanolaForecastPromptPack({
      snapshot,
      horizon_days: 7,
      price_contract: {
        exchange: "ICE",
        commodity: "Canola",
        contract_code: "RSN26",
        contract_month: "2026-07",
        roll_policy: "fixed_contract_no_roll",
      },
      model_training_cutoff: "2024-06-01",
      prompt_version: "canola-forecast-prompt-v1",
      created_at: "2026-05-10T09:15:00-06:00",
    });
    const runArtifact = buildCanolaForecastRunArtifact({
      snapshot,
      forecast: readJson("forecast.json"),
      metadata: {
        provider: "openai-codex-local",
        model: "gpt-5-codex-2024-06-cutoff",
        runner_mode: "manual_model_output",
        prompt_version: "canola-forecast-prompt-v1",
        prompt_hash: promptPack.prompt_hash,
        model_training_cutoff: "2024-06-01",
        created_at: "2026-05-10T09:25:00-06:00",
      },
    });
    const trackedSourceRecords = readOutput<{ records: unknown[] }>(
      "source-records.json",
    );
    const trackedSnapshot = readOutput<{ snapshot_hash: string }>("snapshot.json");
    const trackedPromptPack = readOutput<{ prompt_hash: string }>("prompt-pack.json");
    const trackedRunArtifact = readOutput<{ run_hash: string }>("run-artifact.json");

    expect(sourceRecords).toEqual(trackedSourceRecords.records);
    expect(snapshot.snapshot_hash).toBe(trackedSnapshot.snapshot_hash);
    expect(promptPack.prompt_hash).toBe(trackedPromptPack.prompt_hash);
    expect(runArtifact.run_hash).toBe(trackedRunArtifact.run_hash);
    expect(runArtifact.forecast.direction).toBe("bullish");
    expect(runArtifact.forecast.pretraining_taint_status).toBe("untainted");
  });

  it("keeps forbidden or private source-family names out of committed rows", () => {
    const sourceRowsText = readText("source-rows.json");

    expect(sourceRowsText).not.toContain("crop_plans");
    expect(sourceRowsText).not.toContain("crop_plan_deliveries");
    expect(sourceRowsText).not.toContain("posted_prices");
    expect(sourceRowsText).toContain("redacted_unadmitted_or_forbidden_source");
    expect(sourceRowsText).toContain("Do not use as model training data");
  });
});

function readJson<T>(filename: string): T {
  return JSON.parse(readText(filename)) as T;
}

function readOutput<T>(filename: string): T {
  return JSON.parse(readFileSync(join(outputDir, filename), "utf8")) as T;
}

function readText(filename: string): string {
  return readFileSync(join(artifactDir, filename), "utf8");
}
