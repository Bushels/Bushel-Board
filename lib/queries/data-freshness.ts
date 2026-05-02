import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_CROP_YEAR, getCurrentGrainWeek } from "@/lib/utils/crop-year";

// cgc_imports rows with status='failed' can tag a grain_week that never
// imported (e.g. a week CGC had not yet published). Only these statuses
// represent a week whose data actually reached cgc_observations.
const IMPORTED_STATUSES = ["success", "partial"] as const;

/** Last resort: the highest week that has observations in the DB. */
async function maxObservedWeek(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", CURRENT_CROP_YEAR)
    .order("grain_week", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.grain_week) : 0;
}

/**
 * Fetch the latest grain week that has actually been imported into the database.
 *
 * Resolution order:
 *   1. MAX(grain_week) in cgc_imports WHERE status IN ('success','partial')
 *   2. MAX(grain_week) in cgc_observations (defensive: if audit rows are missing
 *      but real data made it in)
 *   3. Calendar-derived current grain week (only reached on empty DB or full
 *      query failure — NOT on a successful query that just returned no rows,
 *      which would push the UI onto a future, non-imported week)
 *
 * Server-only — must NOT be imported from client components.
 */
export async function getLatestImportedWeek(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cgc_imports")
      .select("grain_week")
      .eq("crop_year", CURRENT_CROP_YEAR)
      .in("status", [...IMPORTED_STATUSES])
      .order("grain_week", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.grain_week) return Number(data.grain_week);

    const observedWeek = await maxObservedWeek(supabase);
    if (observedWeek > 0) return observedWeek;

    return getCurrentGrainWeek();
  } catch {
    return getCurrentGrainWeek();
  }
}

/**
 * Get the best week number to display — MAX across market_analysis and cgc_imports.
 * Prevents showing stale week when analysis is current but CGC import lagged.
 *
 * Same three-tier fallback as getLatestImportedWeek, plus a parallel read of
 * market_analysis in case analysis is current but an audit row is missing.
 */
export async function getDisplayWeek(): Promise<number> {
  try {
    const supabase = await createClient();
    const [importResult, analysisResult] = await Promise.all([
      supabase
        .from("cgc_imports")
        .select("grain_week")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .in("status", [...IMPORTED_STATUSES])
        .order("grain_week", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_analysis")
        .select("grain_week")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .order("grain_week", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const importWeek = importResult.data ? Number(importResult.data.grain_week) : 0;
    const analysisWeek = analysisResult.data ? Number(analysisResult.data.grain_week) : 0;
    const best = Math.max(importWeek, analysisWeek);

    if (best > 0) return best;

    const observedWeek = await maxObservedWeek(supabase);
    if (observedWeek > 0) return observedWeek;

    return getCurrentGrainWeek();
  } catch {
    return getCurrentGrainWeek();
  }
}
