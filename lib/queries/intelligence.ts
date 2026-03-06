import { createClient } from "@/lib/supabase/server";

export interface GrainIntelligence {
  grain: string;
  crop_year: string;
  grain_week: number;
  thesis_title: string | null;
  thesis_body: string | null;
  insights: Array<{ signal: "bullish" | "bearish" | "watch"; title: string; body: string }>;
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
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as GrainIntelligence;
}

/**
 * Get supply pipeline data for a grain.
 */
export async function getSupplyPipeline(
  grainSlug: string
): Promise<{
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_supply_pipeline")
    .select("carry_in_kt, production_kt, total_supply_kt")
    .eq("grain_slug", grainSlug)
    .single();

  return data;
}
