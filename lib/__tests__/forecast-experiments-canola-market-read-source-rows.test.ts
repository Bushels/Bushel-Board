import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { buildCanolaMarketReadSourceRows } from "../forecast-experiments/canola-market-read-source-rows";
import { buildSnapshotSourceRecords } from "../forecast-experiments/source-records";

const asOfDate = "2026-05-10";
const sourceCutoffAt = "2026-05-10T09:00:00-06:00";

describe("Canola market-read source-row export", () => {
  it("exports admitted market-read lanes and omits forbidden lanes", () => {
    const output = buildCanolaMarketReadSourceRows({
      market_read: sampleMarketRead(),
      as_of_date: asOfDate,
      source_cutoff_at: sourceCutoffAt,
      cutoff_proof: "frozen_forward_artifact",
    });

    expect(output.snapshot_mode).toBe("strict_artifact_mode");
    expect(output.disclaimer).toContain("Do not use as model training data");
    expect(output.rows.length).toBeGreaterThan(1);
    expect(output.rows.every((row) => row.source_key === "canola_market_read")).toBe(
      true,
    );
    expect(output.rows.every((row) => row.source_cutoff_supported === true)).toBe(
      true,
    );
    expect(output.omitted_sources.map((source) => source.source_name).sort()).toEqual([
      "redacted_unadmitted_or_forbidden_source",
      "weather_cache",
    ]);
    expect(
      output.omitted_sources.find(
        (source) =>
          source.source_name === "redacted_unadmitted_or_forbidden_source",
      )?.count,
    ).toBe(2);

    const serializedRows = JSON.stringify(output.rows);
    expect(serializedRows).toContain("Producer deliveries, current week");
    expect(serializedRows).not.toContain("Private seeded acres");
    expect(serializedRows).not.toContain("Local posted bid");
  });

  it("feeds strict frozen-forward rows into the existing snapshot builder", () => {
    const output = buildCanolaMarketReadSourceRows({
      market_read: sampleMarketRead(),
      as_of_date: asOfDate,
      source_cutoff_at: sourceCutoffAt,
      cutoff_proof: "frozen_forward_artifact",
    });
    const records = buildSnapshotSourceRecords(output.rows, {
      as_of_date: output.as_of_date,
      source_cutoff_at: output.source_cutoff_at,
      snapshot_mode: output.snapshot_mode,
    });

    expect(records.length).toBe(output.rows.length);
    expect(records.some((record) => record.payload.code === "current_state_without_cutoff")).toBe(
      false,
    );
  });

  it("keeps current-table replay exports revision-tainted downstream", () => {
    const output = buildCanolaMarketReadSourceRows({
      market_read: {
        ...sampleMarketRead(),
        generated_at: "2026-05-10T09:01:00-06:00",
        packet_generated_at: "2026-05-10T09:01:00-06:00",
      },
      as_of_date: asOfDate,
      source_cutoff_at: sourceCutoffAt,
      cutoff_proof: "current_table_replay",
    });
    const records = buildSnapshotSourceRecords(output.rows, {
      as_of_date: output.as_of_date,
      source_cutoff_at: output.source_cutoff_at,
      snapshot_mode: output.snapshot_mode,
    });

    expect(output.snapshot_mode).toBe("current_table_replay_mode");
    expect(output.rows.every((row) => row.source_cutoff_supported === false)).toBe(
      true,
    );
    expect(records.every((record) => record.record_type === "warning")).toBe(true);
    expect(records[0]?.payload.code).toBe("current_state_without_cutoff");
    expect(records[0]?.payload.original_payload_omitted).toBe(true);
  });

  it("rejects market reads generated after the forecast cutoff", () => {
    expect(() =>
      buildCanolaMarketReadSourceRows({
        market_read: {
          ...sampleMarketRead(),
          generated_at: "2026-05-10T09:01:00-06:00",
        },
        as_of_date: asOfDate,
        source_cutoff_at: sourceCutoffAt,
        cutoff_proof: "frozen_forward_artifact",
      }),
    ).toThrow(/generated_at.*after source_cutoff_at/i);
  });
});

describe("Canola market-read source-row export CLI", () => {
  it("prints help without touching external systems", () => {
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "scripts/export-canola-market-read-source-rows.ts",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("export-canola-market-read-source-rows");
    expect(result.stdout).toContain("--cutoff-proof");
  });
});

function sampleMarketRead() {
  return {
    version: "canola-market-read-v1",
    status: "available",
    reason: null,
    grain: "Canola",
    crop_year: "2025-2026",
    grain_week: 38,
    generated_at: "2026-05-10T08:52:22-06:00",
    packet_generated_at: "2026-05-10T08:52:18-06:00",
    headline: "Canola market read wk 38",
    bottom_line: "Physical movement is visible; private lanes stay excluded.",
    what_changed: [
      {
        label: "Producer deliveries",
        current_value: 433.3,
        previous_value: 406.6,
        change_value: 26.7,
        change_pct: 6.6,
        unit: "Ktonnes",
        current_period: "grain_week_38",
        previous_period: "grain_week_37",
        source_name: "cgc_observations",
        source_table: "v_country_producer_deliveries",
      },
    ],
    facts: [
      {
        label: "Producer deliveries, current week",
        value: 433.3,
        unit: "Ktonnes",
        period: "crop_year 2025-2026, grain_week 38",
        source_name: "cgc_observations",
        source_table: "v_country_producer_deliveries",
        source_row_key: "2025-2026:wk38:Canola:Current Week",
        scope: "Canada",
        confidence: "high",
        quality_flags: [],
      },
      {
        label: "Private seeded acres",
        value: 100,
        unit: "acres",
        period: "private farm plan",
        source_name: "crop_plans",
        source_table: "crop_plans",
        source_row_key: "private",
        scope: "private",
        confidence: "low",
        quality_flags: ["private"],
      },
    ],
    interpretation: [
      {
        title: "Flow support",
        body: "Deliveries and exports support a firm physical read.",
        source_names: ["cgc_observations", "supply_disposition"],
        confidence: "medium",
      },
    ],
    speculation: [],
    farmer_watch_items: [
      {
        label: "Rail flow",
        watch_for: "Grain Monitor lag widening.",
        why_it_matters: "Rail delay can mute export movement.",
        source_names: ["grain_monitor_snapshots"],
      },
    ],
    freshness: [
      {
        source_name: "grain_prices",
        source_lane: "market",
        expected_cadence: "daily",
        latest_period: "2026-05-09",
        latest_period_end: "2026-05-09",
        rows_available: 1,
        freshness_status: "watch",
        thesis_use: "context",
        action_hint: null,
        quality_flags: [],
      },
    ],
    quality_warnings: [
      {
        source_name: "cftc_cot_positions",
        status: "watch",
        message: "COT positioning is stale until Friday update lands.",
        action_hint: null,
        severity: "watch",
      },
      {
        source_name: "posted_prices",
        status: "empty",
        message: "Local posted bid unavailable.",
        action_hint: null,
        severity: "watch",
      },
      {
        source_name: "weather_cache",
        status: "excluded",
        message: "Weather is not admitted for Canola V1.",
        action_hint: null,
        severity: "info",
      },
    ],
    source_links: [],
  };
}
