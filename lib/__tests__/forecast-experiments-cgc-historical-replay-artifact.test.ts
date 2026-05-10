import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCanolaCgcHistoricalReplayInput } from "../forecast-experiments/cgc-historical-replay-input";
import { buildCanolaHistoricalReplayPackage } from "../forecast-experiments/historical-replay";

const artifactDir = join(
  process.cwd(),
  "docs",
  "reference",
  "forecast-experiments",
  "canola-historical-replay-cgc-2025-weeks-1-3",
);

describe("Canola CGC historical replay tracked artifact", () => {
  it("rebuilds the tracked replay input and package hash from the CGC CSV", () => {
    const csvPath = join(process.cwd(), "data", "CGC Weekly", "gsw-shg-en.csv");
    const replayInput = buildCanolaCgcHistoricalReplayInput(
      readFileSync(csvPath, "utf8"),
      {
        replay_set_name: "canola-cgc-2025-weeks-1-3",
        crop_year: "2025-2026",
        weeks: [1, 2, 3],
        source_file: "data\\CGC Weekly\\gsw-shg-en.csv",
        created_at: "2026-05-10T11:20:00-06:00",
        publication_lag_days: 4,
        publication_time: "13:00:00",
        source_cutoff_time: "14:30:00",
        timezone_offset: "-06:00",
      },
    );
    const replayPackage = buildCanolaHistoricalReplayPackage(replayInput);
    const trackedInput = readArtifact("historical-replay-input.json");
    const trackedPackage = readArtifact("historical-replay-package.json");

    expect(replayInput).toEqual(trackedInput);
    expect(replayPackage.package_hash).toBe(trackedPackage.package_hash);
    expect(replayPackage.summary).toEqual({
      total_weeks: 3,
      candidate_weeks: 0,
      review_only_weeks: 3,
      accepted_evidence_count: 3,
      blocked_evidence_count: 0,
    });
    expect(
      replayPackage.weeks.map((week) => week.training_candidate.mode),
    ).toEqual([
      "review_only_revision_tainted",
      "review_only_revision_tainted",
      "review_only_revision_tainted",
    ]);
  });
});

function readArtifact(filename: string): unknown {
  return JSON.parse(readFileSync(join(artifactDir, filename), "utf8")) as unknown;
}
