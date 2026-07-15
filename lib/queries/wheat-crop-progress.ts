import { createClient } from "@/lib/supabase/server";
import {
  buildWheatUsdaProgressUpdate,
  normalizeWheatCropProgressRows,
  type WheatCropProgressRpcRow,
  type WheatUsdaProgressMetric,
  type WheatUsdaProgressTone,
  type WheatUsdaProgressUpdate,
} from "@/lib/queries/wheat-crop-progress-utils";

export type { WheatUsdaProgressMetric, WheatUsdaProgressTone, WheatUsdaProgressUpdate };

export async function getWheatUsdaProgressUpdate(): Promise<WheatUsdaProgressUpdate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usda_crop_progress")
    .select(
      "wheat_class, week_ending, good_excellent_pct, harvested_pct, headed_pct, planted_pct, ge_pct_yoy_change, condition_index",
    )
    .eq("cgc_grain", "Wheat")
    .eq("state", "US TOTAL")
    .order("week_ending", { ascending: false })
    .limit(60);

  if (error || !Array.isArray(data)) {
    console.error("getWheatUsdaProgressUpdate error:", error?.message ?? "Unexpected response");
    return null;
  }

  return buildWheatUsdaProgressUpdate(normalizeWheatCropProgressRows(data as WheatCropProgressRpcRow[]));
}
