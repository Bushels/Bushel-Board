import type { CgcRow } from "./parser";

function buildConflictKey(row: CgcRow): string {
  return [
    row.crop_year,
    row.grain_week,
    row.worksheet,
    row.metric,
    row.period,
    row.grain,
    row.grade,
    row.region,
  ].join("|");
}

export function dedupeCgcRowsForUpsert(rows: CgcRow[]): CgcRow[] {
  const latest = new Map<string, CgcRow>();
  for (const row of rows) {
    latest.set(buildConflictKey(row), row);
  }
  return [...latest.values()];
}
