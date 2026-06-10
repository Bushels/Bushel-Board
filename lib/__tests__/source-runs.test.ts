import { describe, expect, it } from "vitest";
import { normalizeSourceRunRow } from "@/lib/queries/source-runs";

describe("source run query helpers", () => {
  it("normalizes latest collector run rows for board display", () => {
    const run = normalizeSourceRunRow({
      source_name: "grain_monitor_snapshots",
      collector_name: "import-grain-monitor-weekly",
      status: "success",
      source_period_end: "2026-05-29",
      latest_source_label: "Week 42",
      finished_at: "2026-06-01T20:17:00Z",
      rows_inserted: "7",
      rows_updated: 3,
      rows_skipped: "bad number",
      error_message: "",
    });

    expect(run).toEqual({
      sourceName: "grain_monitor_snapshots",
      collectorName: "import-grain-monitor-weekly",
      status: "success",
      sourcePeriodEnd: "2026-05-29",
      latestSourceLabel: "Week 42",
      finishedAt: "2026-06-01T20:17:00Z",
      rowsInserted: 7,
      rowsUpdated: 3,
      rowsSkipped: 0,
      errorMessage: null,
    });
  });
});
