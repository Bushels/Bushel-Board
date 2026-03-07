import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface SupplyDisposition {
  grain_slug: string;
  crop_year: string;
  carry_in_kt: number | null;
  production_kt: number | null;
  imports_kt: number | null;
  total_supply_kt: number | null;
  exports_kt: number | null;
  food_industrial_kt: number | null;
  feed_waste_kt: number | null;
  seed_kt: number | null;
  total_domestic_kt: number | null;
  carry_out_kt: number | null;
  source: string;
}

export async function getSupplyDisposition(
  grainSlug: string,
  cropYear: string = CURRENT_CROP_YEAR,
  source: string = "AAFC_2025-11-24"
): Promise<SupplyDisposition | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supply_disposition")
    .select("*")
    .eq("grain_slug", grainSlug)
    .eq("crop_year", cropYear)
    .eq("source", source)
    .single();
  return data;
}

export async function getSupplyDispositionForGrains(
  grainSlugs: string[],
  cropYear: string = CURRENT_CROP_YEAR
): Promise<SupplyDisposition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supply_disposition")
    .select("*")
    .in("grain_slug", grainSlugs)
    .eq("crop_year", cropYear)
    .eq("source", "AAFC_2025-11-24");
  return data ?? [];
}
