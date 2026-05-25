import type { SnapshotMode, SnapshotSourceRecord } from "./snapshot";
import {
  assertAllowedSourceKey,
  buildSnapshotSourceRecords,
  type ApprovedForecastSourceRow,
} from "./source-records";
import type { ForecastGrain } from "./grain-profiles";

export interface CanolaSourceRecordReadOptions {
  crop_year: string;
  grain_week: number;
  as_of_date: string;
  source_cutoff_at: string;
  snapshot_mode: SnapshotMode;
}

export interface GrainSourceRecordReadOptions extends CanolaSourceRecordReadOptions {
  grain: ForecastGrain;
}

export interface CanolaSourceRecordReadBoundary {
  readSourceRows(
    options: CanolaSourceRecordReadOptions,
  ): Promise<ApprovedForecastSourceRow[]>;
}

export interface GrainSourceRecordReadBoundary {
  readSourceRows(
    options: GrainSourceRecordReadOptions,
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

export async function buildGrainForecastSourceRecords(
  boundary: GrainSourceRecordReadBoundary,
  options: GrainSourceRecordReadOptions,
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

export function createLocalGrainSourceRowsReadBoundary(
  rows: ApprovedForecastSourceRow[],
): GrainSourceRecordReadBoundary {
  return {
    async readSourceRows() {
      return rows;
    },
  };
}
