import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION,
  buildCanolaForecastSnapshot,
  stableStringify,
} from "../forecast-experiments/snapshot";

const baseRecord = () => ({
  source_key: "cgc_weekly",
  record_type: "fact" as const,
  observed_period: "CGC Week 1",
  published_at: "2026-08-06T13:00:00-06:00",
  available_at: "2026-08-06T13:05:00-06:00",
  payload: {
    metric: "producer_deliveries",
    unit: "Ktonnes",
    value: 123.4,
  },
});

const buildInput = () => ({
  grain: "Canola" as const,
  crop_year: "2026-2027",
  grain_week: 1,
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  snapshot_mode: "strict_artifact_mode" as const,
  records: [
    baseRecord(),
    {
      source_key: "grain_monitor",
      record_type: "interpretation" as const,
      observed_period: "Weekly report before CGC Week 1",
      published_at: "2026-08-07T08:00:00-06:00",
      available_at: "2026-08-07T08:10:00-06:00",
      payload: {
        terminal: "Vancouver",
        status: "fluid",
      },
    },
  ],
});

describe("Canola forecast snapshot compiler", () => {
  it("builds the v1 snapshot shape with deterministic source freshness", () => {
    const snapshot = buildCanolaForecastSnapshot(buildInput());

    expect(snapshot.schema_version).toBe(CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.snapshot_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.revision_taint_status).toBe("untainted");
    expect(snapshot.source_clocks[0]).toEqual({
      source_key: "cgc_weekly",
      observed_period: "CGC Week 1",
      published_at: "2026-08-06T13:00:00-06:00",
      available_at: "2026-08-06T13:05:00-06:00",
      freshness_hours: 25.42,
    });
  });

  it("keeps the same snapshot hash when source record order changes", () => {
    const first = buildCanolaForecastSnapshot(buildInput());
    const second = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [...buildInput().records].reverse(),
    });

    expect(second.snapshot_hash).toBe(first.snapshot_hash);
    expect(second.records.map((record) => record.source_key)).toEqual([
      "cgc_weekly",
      "grain_monitor",
    ]);
  });

  it("keeps the same snapshot hash when payload object property order changes", () => {
    const first = buildCanolaForecastSnapshot(buildInput());
    const second = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [
        {
          ...baseRecord(),
          payload: {
            value: 123.4,
            unit: "Ktonnes",
            metric: "producer_deliveries",
          },
        },
        buildInput().records[1],
      ],
    });

    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(second.snapshot_hash).toBe(first.snapshot_hash);
  });

  it("keeps the same snapshot hash when otherwise-identical records differ only by clock fields", () => {
    const recordA = {
      ...baseRecord(),
      observed_period: "CGC Week 1 A",
      published_at: "2026-08-06T12:00:00-06:00",
    };
    const recordB = {
      ...baseRecord(),
      observed_period: "CGC Week 1 B",
      published_at: "2026-08-06T12:30:00-06:00",
    };

    const first = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [recordA, recordB],
    });
    const second = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [recordB, recordA],
    });

    expect(second.snapshot_hash).toBe(first.snapshot_hash);
  });

  it("does not depend on host localeCompare behavior for canonical sorting", () => {
    const originalLocaleCompare = String.prototype.localeCompare;

    String.prototype.localeCompare = function reverseLocaleCompare(
      this: string,
      compareString: string,
    ) {
      const left = String(this);
      const right = String(compareString);

      if (left < right) return 1;
      if (left > right) return -1;
      return 0;
    } as typeof String.prototype.localeCompare;

    try {
      const snapshot = buildCanolaForecastSnapshot({
        ...buildInput(),
        records: [...buildInput().records].reverse(),
      });

      expect(snapshot.records.map((record) => record.source_key)).toEqual([
        "cgc_weekly",
        "grain_monitor",
      ]);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  });

  it("blocks future-dated records from the forecast snapshot", () => {
    const snapshot = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [
        baseRecord(),
        {
          source_key: "future_news",
          record_type: "warning" as const,
          observed_period: "After cutoff",
          published_at: "2026-08-07T15:00:00-06:00",
          available_at: "2026-08-07T15:01:00-06:00",
          payload: {
            headline: "This should not enter the forecast packet.",
          },
        },
      ],
    });

    expect(snapshot.records.map((record) => record.source_key)).toEqual([
      "cgc_weekly",
    ]);
    expect(snapshot.blocked_sources).toEqual([
      {
        source_key: "future_news",
        observed_period: "After cutoff",
        available_at: "2026-08-07T15:01:00-06:00",
        reason: "available_after_source_cutoff",
      },
    ]);
  });

  it("blocks records with publish timestamps after the cutoff", () => {
    const snapshot = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [
        baseRecord(),
        {
          source_key: "future_report",
          record_type: "fact" as const,
          observed_period: "After cutoff",
          published_at: "2026-08-07T15:00:00-06:00",
          available_at: "2026-08-07T10:00:00-06:00",
          payload: {
            metric: "future_report_value",
          },
        },
      ],
    });

    expect(snapshot.records.map((record) => record.source_key)).toEqual([
      "cgc_weekly",
    ]);
    expect(snapshot.blocked_sources).toEqual([
      {
        source_key: "future_report",
        observed_period: "After cutoff",
        available_at: "2026-08-07T10:00:00-06:00",
        reason: "published_after_source_cutoff",
      },
    ]);
  });

  it("marks current table replays as revision-tainted", () => {
    const snapshot = buildCanolaForecastSnapshot({
      ...buildInput(),
      snapshot_mode: "current_table_replay_mode",
    });

    expect(snapshot.revision_taint_status).toBe("revision_tainted");
    expect(snapshot.warnings).toContainEqual({
      code: "revision_tainted",
      message:
        "current_table_replay_mode uses mutable current rows and cannot support public skill claims.",
    });
  });

  it("blocks forecast and score source keys from entering the snapshot", () => {
    const snapshot = buildCanolaForecastSnapshot({
      ...buildInput(),
      records: [
        baseRecord(),
        {
          source_key: "forecast_experiment_scores",
          record_type: "fact" as const,
          observed_period: "Later score",
          published_at: "2026-08-07T09:00:00-06:00",
          available_at: "2026-08-07T09:00:00-06:00",
          payload: {
            hit_rate: 1,
          },
        },
      ],
    });

    expect(snapshot.records.map((record) => record.source_key)).toEqual([
      "cgc_weekly",
    ]);
    expect(snapshot.blocked_sources[0]?.reason).toBe("blocked_forecast_source");
  });

  it("rejects missing source availability timestamps", () => {
    expect(() =>
      buildCanolaForecastSnapshot({
        ...buildInput(),
        records: [
          {
            ...baseRecord(),
            available_at: undefined,
          },
        ],
      }),
    ).toThrow(/available_at/i);
  });

  it("rejects source cutoffs that do not match the as-of date", () => {
    expect(() =>
      buildCanolaForecastSnapshot({
        ...buildInput(),
        source_cutoff_at: "2026-08-08T00:30:00-06:00",
      }),
    ).toThrow(/source_cutoff_at must use the same calendar date/i);
  });

  it("accepts source cutoffs whose UTC calendar date matches the as-of date", () => {
    const snapshot = buildCanolaForecastSnapshot({
      ...buildInput(),
      as_of_date: "2026-08-07",
      source_cutoff_at: "2026-08-08T02:30:00+08:00",
      records: [
        {
          ...baseRecord(),
          published_at: "2026-08-07T10:00:00Z",
          available_at: "2026-08-07T10:05:00Z",
        },
      ],
    });

    expect(snapshot.records).toHaveLength(1);
  });
});

describe("Canola forecast snapshot CLI", () => {
  it("prints help without reading external systems", () => {
    const result = runSnapshotCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("build-canola-forecast-snapshot");
    expect(result.stdout).toContain("--source-cutoff-at");
  });

  it("emits machine-readable snapshot JSON to stdout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "canola-snapshot-cli-"));

    try {
      const inputPath = join(tempDir, "input.json");
      writeFileSync(
        inputPath,
        JSON.stringify({
          records: buildInput().records,
        }),
      );

      const result = runSnapshotCli([
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
        "--snapshot-mode",
        "strict_artifact_mode",
      ]);

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("snapshot built");

      const snapshot = JSON.parse(result.stdout);
      expect(snapshot.schema_version).toBe(CANOLA_FORECAST_SNAPSHOT_SCHEMA_VERSION);
      expect(snapshot.snapshot_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(snapshot.records).toHaveLength(2);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects non-integer grain week arguments before compilation", () => {
    const result = runSnapshotCli([
      "--input",
      "local-input-does-not-need-to-exist-for-this-check.json",
      "--grain-week",
      "week-one",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--grain-week must be an integer");
  });
});

function runSnapshotCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/build-canola-forecast-snapshot.ts", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}
