import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCanolaForecastSnapshot } from "../forecast-experiments/snapshot";
import {
  buildCanolaForecastSourceRecords,
  createLocalSourceRowsReadBoundary,
  type CanolaSourceRecordReadBoundary,
} from "../forecast-experiments/read-adapter";
import type { ApprovedForecastSourceRow } from "../forecast-experiments/source-records";

const options = {
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  snapshot_mode: "strict_artifact_mode" as const,
};

const cgcRow = (): ApprovedForecastSourceRow => ({
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
    grade: "",
    unit: "Ktonnes",
    value: 123.4,
  },
});

describe("forecast experiment read adapter", () => {
  it("builds source records through a mocked read boundary without live Supabase", async () => {
    const boundary: CanolaSourceRecordReadBoundary = {
      async readSourceRows(readOptions) {
        expect(readOptions).toEqual(options);
        return [cgcRow()];
      },
    };

    const records = await buildCanolaForecastSourceRecords(boundary, options);

    expect(records).toHaveLength(1);
    expect(records[0]?.source_key).toBe("cgc_weekly");
  });

  it("blocks forbidden forecast, score, prose, and private source families", async () => {
    const boundary = createLocalSourceRowsReadBoundary([
      {
        ...cgcRow(),
        source_key: "prediction_scorecard",
      },
    ]);

    await expect(
      buildCanolaForecastSourceRecords(boundary, options),
    ).rejects.toThrow(/Forbidden forecast input source/);
  });

  it("emits records that can be passed into the snapshot compiler", async () => {
    const records = await buildCanolaForecastSourceRecords(
      createLocalSourceRowsReadBoundary([cgcRow()]),
      options,
    );

    const snapshot = buildCanolaForecastSnapshot({
      grain: "Canola",
      crop_year: options.crop_year,
      grain_week: options.grain_week,
      as_of_date: options.as_of_date,
      source_cutoff_at: options.source_cutoff_at,
      snapshot_mode: options.snapshot_mode,
      records,
    });

    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.snapshot_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("Canola forecast source-record CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runSourceRecordsCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-forecast-source-records");
    expect(result.stdout).toContain("--source-cutoff-at");
  });

  it("emits machine-readable snapshot input JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-source-records-cli-"));

    try {
      const inputPath = join(tempDir, "source-rows.json");
      writeFileSync(inputPath, JSON.stringify({ rows: [cgcRow()] }));

      const result = runSourceRecordsCli([
        "--input",
        inputPath,
        "--crop-year",
        "2026-2027",
        "--grain-week",
        "1",
        "--as-of",
        "2026-08-07",
        "--source-cutoff-at",
        "2026-08-07T14:30:00-06:00",
      ]);

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("source records built");

      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        grain: "Canola",
        crop_year: "2026-2027",
        grain_week: 1,
        as_of_date: "2026-08-07",
        source_cutoff_at: "2026-08-07T14:30:00-06:00",
        snapshot_mode: "strict_artifact_mode",
      });
      expect(parsed.records).toHaveLength(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-source-records-dry-"));

    try {
      const inputPath = join(tempDir, "source-rows.json");
      const outputPath = join(tempDir, "records.json");
      writeFileSync(inputPath, JSON.stringify({ rows: [cgcRow()] }));

      const result = runSourceRecordsCli([
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--crop-year",
        "2026-2027",
        "--grain-week",
        "1",
        "--as-of",
        "2026-08-07",
        "--source-cutoff-at",
        "2026-08-07T14:30:00-06:00",
        "--dry-run",
      ]);

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toEqual({
        dry_run: true,
        output_path: outputPath,
        records: 1,
      });
      expect(() => readFileSync(outputPath, "utf8")).toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses snapshot_mode from the input file when no CLI snapshot-mode flag is supplied", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-source-records-mode-"));

    try {
      const inputPath = join(tempDir, "source-rows.json");
      writeFileSync(
        inputPath,
        JSON.stringify({
          crop_year: "2026-2027",
          grain_week: 1,
          as_of_date: "2026-08-07",
          source_cutoff_at: "2026-08-07T14:30:00-06:00",
          snapshot_mode: "current_table_replay_mode",
          rows: [cgcRow()],
        }),
      );

      const result = runSourceRecordsCli(["--input", inputPath]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).snapshot_mode).toBe(
        "current_table_replay_mode",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runSourceRecordsCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-forecast-source-records.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
