import type { SnapshotMode, SnapshotSourceRecord } from "./snapshot";
import {
  assertAllowedSourceKey,
  buildSnapshotSourceRecords,
  type ApprovedForecastSourceRow,
} from "./source-records";

export interface CanolaSourceRecordReadOptions {
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
}

export interface CanolaSourceRecordReadBoundary {
  readSourceRows(
    options: CanolaSourceRecordReadOptions,
  ): Promise<ApprovedForecastSourceRow[]>;
}

export async function buildCanolaForecastSourceRecords(
  boundary: CanolaSourceRecordReadBoundary,
  options: CanolaSourceRecordReadOptions,
): Promise<SnapshotSourceRecord[]> {
  const rows = await boundary.readSourceRows(options);

  for (const row of rows) {
    if (row.source_key) {
      assertAllowedSourceKey(row.source_key);
    }
  }

  return buildSnapshotSourceRecords(rows, {
    as_of_date: options.as_of_date,
    source_cutoff_at: options.source_cutoff_at,
    snapshot_mode: options.snapshot_mode,
  });
}

export function createLocalSourceRowsReadBoundary(
  rows: ApprovedForecastSourceRow[],
): CanolaSourceRecordReadBoundary {
  return {
    async readSourceRows() {
      return rows;
    },
  };
}
