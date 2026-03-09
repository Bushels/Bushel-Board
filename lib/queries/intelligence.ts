import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface GrainIntelligence {
  grain: string;
  crop_year: string;
  grain_week: number;
  thesis_title: string | null;
  thesis_body: string | null;
  insights: Array<{ signal: "bullish" | "bearish" | "watch" | "social"; title: string; body: string }>;
  kpi_data: Record<string, number | null>;
  generated_at: string;
}

/**
 * Get the latest intelligence for a grain (most recent grain_week).
 */
export async function getGrainIntelligence(
  grainName: string
): Promise<GrainIntelligence | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grain_intelligence")
    .select("*")
    .eq("grain", grainName)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as GrainIntelligence;
}

/**
 * Get supply pipeline data for a grain (AAFC balance sheet only).
 */
export async function getSupplyPipeline(
  grainSlug: string
): Promise<{
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  exports_kt: number | null;
  food_industrial_kt: number | null;
  feed_waste_kt: number | null;
  carry_out_kt: number | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_supply_pipeline")
    .select("carry_in_kt, production_kt, total_supply_kt, exports_kt, food_industrial_kt, feed_waste_kt, carry_out_kt")
    .eq("grain_slug", grainSlug)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .single();

  return data;
}

export interface FarmSummary {
  user_id: string;
  crop_year: string;
  grain_week: number;
  summary_text: string;
  percentiles: Record<string, number>;
  generated_at: string;
}

/**
 * Get the latest farm summary for a user.
 */
export async function getFarmSummary(
  userId: string
): Promise<FarmSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as FarmSummary;
}
