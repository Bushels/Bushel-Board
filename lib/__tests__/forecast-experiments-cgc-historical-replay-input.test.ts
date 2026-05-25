import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCanolaCgcHistoricalReplayInput,
  parseCgcHistoricalReplayCsv,
} from "../forecast-experiments/cgc-historical-replay-input";
import { buildCanolaHistoricalReplayPackage } from "../forecast-experiments/historical-replay";

const csv = `Crop Year,Grain Week,Week Ending Date,worksheet,metric,period,grain,grade,Region,Ktonnes
2025-2026,1,10/08/2025,Primary,Deliveries,Current Week,Canola,,Alberta,10
2025-2026,1,10/08/2025,Primary,Deliveries,Current Week,Canola,,Saskatchewan,20
2025-2026,1,10/08/2025,Primary,Shipments,Current Week,Canola,,Alberta,10
2025-2026,1,10/08/2025,Terminal Exports,Exports,Current Week,Canola,No.1 CANADA,Vancouver,100
2025-2026,1,10/08/2025,Summary,Stocks,Current Week,Canola,,Primary Elevators,200
2025-2026,2,17/08/2025,Primary,Deliveries,Current Week,Canola,,Alberta,20
2025-2026,2,17/08/2025,Primary,Deliveries,Current Week,Canola,,Saskatchewan,40
2025-2026,2,17/08/2025,Primary,Shipments,Current Week,Canola,,Alberta,20
2025-2026,2,17/08/2025,Terminal Exports,Exports,Current Week,Canola,No.1 CANADA,Vancouver,150
2025-2026,2,17/08/2025,Summary,Stocks,Current Week,Canola,,Primary Elevators,180
2025-2026,3,24/08/2025,Primary,Deliveries,Current Week,Canola,,Alberta,5
2025-2026,3,24/08/2025,Primary,Deliveries,Current Week,Canola,,Saskatchewan,10
2025-2026,3,24/08/2025,Primary,Shipments,Current Week,Canola,,Alberta,5
2025-2026,3,24/08/2025,Terminal Exports,Exports,Current Week,Canola,No.1 CANADA,Vancouver,"1,250.5"
2025-2026,3,24/08/2025,Summary,Stocks,Current Week,Canola,,Primary Elevators,150
`;

describe("CGC historical replay input builder", () => {
  it("parses quoted CGC numbers containing commas", () => {
    const rows = parseCgcHistoricalReplayCsv(csv);
    const quoted = rows.find(
      (row) =>
        row.grain_week === 3 &&
        row.worksheet === "Terminal Exports" &&
        row.metric === "Exports",
    );

    expect(quoted?.ktonnes).toBe(1250.5);
  });

  it("builds replay input weeks that can become historical training candidates", () => {
    const input = buildCanolaCgcHistoricalReplayInput(csv, {
      replay_set_name: "test-cgc-replay",
      crop_year: "2025-2026",
      weeks: [1],
      source_file: "fixture.csv",
      created_at: "2026-05-10T11:10:00-06:00",
      publication_lag_days: 4,
      publication_time: "13:00:00",
      source_cutoff_time: "14:30:00",
      timezone_offset: "-06:00",
      point_in_time_certified: true,
    });
    const replayPackage = buildCanolaHistoricalReplayPackage(input);

    expect(input.weeks).toHaveLength(1);
    expect(input.weeks[0]?.source_rows.map((row) => row.source_key)).toContain(
      "cgc_weekly",
    );
    expect(input.weeks[0]?.next_week_evidence).toHaveLength(1);
    expect(input.weeks[0]?.outcome_label.directional_outcome).toBe("bullish");
    expect(input.weeks[0]?.outcome_label).toMatchObject({
      label_task: "directional_outcome_label",
      thesis_verdict: "inconclusive",
    });
    expect(replayPackage.summary).toMatchObject({
      total_weeks: 1,
      candidate_weeks: 1,
      review_only_weeks: 0,
    });
  });

  it("marks mixed historical movement as inconclusive review-only labels", () => {
    const input = buildCanolaCgcHistoricalReplayInput(csv, {
      replay_set_name: "test-cgc-replay",
      crop_year: "2025-2026",
      weeks: [2],
      source_file: "fixture.csv",
      created_at: "2026-05-10T11:10:00-06:00",
      publication_lag_days: 4,
      publication_time: "13:00:00",
      source_cutoff_time: "14:30:00",
      timezone_offset: "-06:00",
      point_in_time_certified: true,
    });
    const replayPackage = buildCanolaHistoricalReplayPackage(input);

    expect(input.weeks[0]?.outcome_label.directional_outcome).toBe("mixed");
    expect(input.weeks[0]?.outcome_label.thesis_verdict).toBe("inconclusive");
    expect(replayPackage.weeks[0]?.training_candidate).toMatchObject({
      allowed: false,
      mode: "review_only_inconclusive",
    });
  });

  it("keeps annual CGC CSV replays review-only unless point-in-time certified", () => {
    const input = buildCanolaCgcHistoricalReplayInput(csv, {
      replay_set_name: "test-cgc-replay",
      crop_year: "2025-2026",
      weeks: [1],
      source_file: "fixture.csv",
      created_at: "2026-05-10T11:10:00-06:00",
      publication_lag_days: 4,
      publication_time: "13:00:00",
      source_cutoff_time: "14:30:00",
      timezone_offset: "-06:00",
    });
    const replayPackage = buildCanolaHistoricalReplayPackage(input);

    expect(input.weeks[0]?.snapshot_mode).toBe("current_table_replay_mode");
    expect(replayPackage.weeks[0]?.training_candidate).toMatchObject({
      allowed: false,
      mode: "review_only_revision_tainted",
    });
  });
});

describe("CGC historical replay input CLI", () => {
  it("prints help without touching external systems", () => {
    const result = runCgcReplayInputCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-cgc-historical-replay-input");
    expect(result.stdout).toContain("--input");
  });

  it("does not write output files during dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-cgc-replay-input-dry-"));

    try {
      const inputPath = join(tempDir, "cgc.csv");
      const outputPath = join(tempDir, "replay-input.json");
      writeFileSync(inputPath, csv);

      const result = runCgcReplayInputCli([
        "--input",
        inputPath,
        "--crop-year",
        "2025-2026",
        "--weeks",
        "1",
        "--replay-set-name",
        "test-cgc-replay",
        "--created-at",
        "2026-05-10T11:10:00-06:00",
        "--publication-lag-days",
        "4",
        "--publication-time",
        "13:00:00",
        "--source-cutoff-time",
        "14:30:00",
        "--timezone-offset",
        "-06:00",
        "--output",
        outputPath,
        "--dry-run",
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("dry-run: output not written");
      expect(JSON.parse(result.stdout)).toMatchObject({
        dry_run: true,
        output_path: outputPath,
        weeks: 1,
      });
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runCgcReplayInputCli(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/build-canola-cgc-historical-replay-input.ts",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
