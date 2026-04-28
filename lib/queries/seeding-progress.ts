// lib/queries/seeding-progress.ts
// Server-only Supabase RPC wrapper. Re-exports utils for convenient single-import.

import { createClient } from "@/lib/supabase/server";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

export type { SeismographRow, SeismographByState } from "@/lib/queries/seeding-progress-utils";
export { groupByState, conditionStrokeColor, fmtAcres } from "@/lib/queries/seeding-progress-utils";

/** Coerce nullable PostgREST numeric (string) to JS number | null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface UsTotalSummary {
  week_ending: string | null;
  planted_pct: number | null;
  emerged_pct: number | null;
  harvested_pct: number | null;
  planted_pct_vs_avg: number | null;
  good_excellent_pct: number | null;
  ge_pct_yoy_change: number | null;
}

export interface CommodityDashboard {
  commodity: string;
  rows: SeismographRow[];
  usTotal: UsTotalSummary | null;
  /** Latest USDA NASS national planted-acres estimate (Prospective Plantings
   *  or Acreage report, whichever is more recent). Used for card badges. */
  usTotalAcres: number | null;
}

const SMALL_MULTIPLES_COMMODITIES = [
  "CORN",
  "SOYBEANS",
  "WHEAT",
  "BARLEY",
  "OATS",
] as const;

/** Fetch latest US TOTAL row for a commodity (national headline stats). */
async function getUsTotalLatest(
  commodity: string,
  marketYear: number,
): Promise<UsTotalSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usda_crop_progress")
    .select(
      "week_ending,planted_pct,emerged_pct,harvested_pct,planted_pct_vs_avg,good_excellent_pct,ge_pct_yoy_change",
    )
    .eq("commodity", commodity.toUpperCase())
    .eq("state", "US TOTAL")
    .eq("crop_year", marketYear)
    .order("week_ending", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    week_ending:
      typeof data.week_ending === "string" ? data.week_ending : null,
    planted_pct: num(data.planted_pct),
    emerged_pct: num(data.emerged_pct),
    harvested_pct: num(data.harvested_pct),
    planted_pct_vs_avg: num(data.planted_pct_vs_avg),
    good_excellent_pct: num(data.good_excellent_pct),
    ge_pct_yoy_change: num(data.ge_pct_yoy_change),
  };
}

/**
 * Fetch the small-multiples dashboard payload: all 5 grain-belt commodities
 * with their state-level seismograph data + national headline summary.
 *
 * 5 parallel RPC calls + 5 parallel US TOTAL queries = 10 round trips,
 * all fired together. Total payload ~350 state rows + 5 summary rows.
 */
export async function getSeedingDashboard(
  marketYear: number,
): Promise<CommodityDashboard[]> {
  const tasks = SMALL_MULTIPLES_COMMODITIES.map(async (commodity) => {
    const [rows, usTotal, usTotalAcres] = await Promise.all([
      getSeedingSeismograph(commodity, marketYear),
      getUsTotalLatest(commodity, marketYear),
      getUsTotalAcreage(commodity, marketYear),
    ]);
    return { commodity, rows, usTotal, usTotalAcres };
  });
  return Promise.all(tasks);
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
    planted_acres: num(r.planted_acres),
  }));
}

/** Fetch latest US TOTAL planted-acres for a commodity (national headline). */
export async function getUsTotalAcreage(
  commodity: string,
  marketYear: number,
): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_us_total_acreage", {
    p_commodity: commodity.toUpperCase(),
    p_market_year: marketYear,
  });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}
