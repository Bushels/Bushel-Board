// lib/queries/seeding-progress.ts
// Server-only Supabase RPC wrapper. Re-exports utils for convenient single-import.

import { createClient } from "@/lib/supabase/server";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

export type { SeismographRow, SeismographByState } from "@/lib/queries/seeding-progress-utils";
export { groupByState, conditionStrokeColor } from "@/lib/queries/seeding-progress-utils";

/** Coerce nullable PostgREST numeric (string) to JS number | null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch the full per-state, per-week seismograph dataset for one commodity.
 * Returns ~480 rows (15 grain-belt states x ~32 weeks). PostgREST safe.
 *
 * PostgREST returns Postgres `numeric` columns as strings. Coerce to numbers
 * here so callers (Mapbox Marker props, glyph SVG math) get the types they
 * expect, per the project pattern documented in MEMORY.md.
 */
export async function getSeedingSeismograph(
  commodity: string,
  marketYear: number,
): Promise<SeismographRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_seeding_seismograph", {
    p_commodity: commodity.toUpperCase(),
    p_market_year: marketYear,
  });
  if (error) {
    console.error("getSeedingSeismograph RPC error:", error);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    state_code: String(r.state_code),
    state_name: String(r.state_name),
    centroid_lng: Number(r.centroid_lng),
    centroid_lat: Number(r.centroid_lat),
    week_ending: String(r.week_ending),
    planted_pct: num(r.planted_pct),
    emerged_pct: num(r.emerged_pct),
    harvested_pct: num(r.harvested_pct),
    planted_pct_vs_avg: num(r.planted_pct_vs_avg),
    good_excellent_pct: num(r.good_excellent_pct),
    condition_index: num(r.condition_index),
    ge_pct_yoy_change: num(r.ge_pct_yoy_change),
  }));
}
