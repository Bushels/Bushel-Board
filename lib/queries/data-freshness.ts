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
