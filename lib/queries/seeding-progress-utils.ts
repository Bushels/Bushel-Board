// lib/queries/seeding-progress-utils.ts
// Client-safe types and pure helpers. NO Supabase imports.

export interface SeismographRow {
  state_code: string;
  state_name: string;
  centroid_lng: number;
  centroid_lat: number;
  week_ending: string; // ISO date
  planted_pct: number | null;
  emerged_pct: number | null;
  harvested_pct: number | null;
  planted_pct_vs_avg: number | null;
  good_excellent_pct: number | null;
  condition_index: number | null;
  ge_pct_yoy_change: number | null;
  /** Latest USDA NASS planted-acres estimate for this state (annual,
   *  same value across all weeks). Null if not yet ingested. */
  planted_acres: number | null;
}

/** Format planted acres into compact farmer-friendly text.
 *  >= 1M → "13.4M ac" · >= 10k → "850k ac" · else → "5,200 ac" · null → "—"
 */
export function fmtAcres(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ac`;
  if (n >= 10_000)
    return `${Math.round(n / 1_000).toLocaleString()}k ac`;
  return `${Math.round(n).toLocaleString()} ac`;
}

export type SeismographByState = Record<string, SeismographRow[]>;

/**
 * Group seismograph rows by state_code. Each state's rows preserve
 * chronological order by week_ending (RPC returns sorted).
 */
export function groupByState(rows: SeismographRow[]): SeismographByState {
  const out: SeismographByState = {};
  for (const r of rows) {
    if (!out[r.state_code]) out[r.state_code] = [];
    out[r.state_code].push(r);
  }
  return out;
}

/**
 * Condition stroke color encodes YoY good/excellent change.
 * Returns design-token hex values (no CSS variables — SVG can't resolve them).
 */
export function conditionStrokeColor(yoyChange: number | null): string {
  if (yoyChange === null) return "#5a4f36"; // wheat-700 neutral
  if (yoyChange >= 3) return "#437a22"; // prairie green improving
  if (yoyChange > -3) return "#5a4f36"; // wheat-700 stable
  if (yoyChange > -15) return "#d97706"; // amber slipping
  return "#b8350f"; // crimson collapse
}
