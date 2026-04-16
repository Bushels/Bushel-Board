import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, getCurrentGrainWeek } from "@/lib/utils/crop-year";

/**
 * Fetch the latest grain week that has actually been imported into the database.
 * Falls back to getCurrentGrainWeek() if the query fails.
 *
 * This prevents UI components from requesting data for future weeks
 * (e.g., calendar says week 33 but latest CGC import is week 31).
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
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return getCurrentGrainWeek();
    return Number(data.grain_week);
  } catch {
    return getCurrentGrainWeek();
  }
}

/**
 * Get the best week number to display — MAX across market_analysis and cgc_imports.
 * Prevents showing stale week when analysis is current but CGC import lagged.
 * Falls back to getCurrentGrainWeek() if both queries fail.
 */
export async function getDisplayWeek(): Promise<number> {
  try {
    const supabase = await createClient();
    const [importResult, analysisResult] = await Promise.all([
      supabase
        .from("cgc_imports")
        .select("grain_week")
        .eq("crop_year", CURRENT_CROP_YEAR)
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

    return best > 0 ? best : getCurrentGrainWeek();
  } catch {
    return getCurrentGrainWeek();
  }
}
