import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { GrainAmountUnit } from "@/lib/utils/grain-units";

export type DeliveryMarketingType = "contracted" | "open" | "legacy_unspecified";

export interface DeliveryEntry {
  date: string;
  amount_kt: number;
  destination?: string;
  marketing_type?: DeliveryMarketingType;
}

export interface CropPlan {
  id: string;
  user_id: string;
  crop_year: string;
  grain: string;
  acres_seeded: number;
  starting_grain_kt?: number;
  bushel_weight_lbs?: number;
  inventory_unit_preference?: GrainAmountUnit;
  volume_left_to_sell_kt?: number;
  contracted_kt?: number;
  uncontracted_kt?: number;
  deliveries?: DeliveryEntry[];
}

/**
 * Get all crop plans for a user in a given crop year.
 */
export async function getUserCropPlans(
  userId: string,
  cropYear: string = CURRENT_CROP_YEAR
): Promise<CropPlan[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("crop_year", cropYear);

    if (error) {
      console.error("getUserCropPlans error:", error.message);
      return [];
    }
    return (data as CropPlan[]) || [];
  } catch (err) {
    console.error("getUserCropPlans failed:", err);
    return [];
  }
}

/**
 * Get the list of grain names a user has unlocked.
 */
export async function getUserUnlockedGrains(
  userId: string,
  cropYear: string = CURRENT_CROP_YEAR
): Promise<string[]> {
  const plans = await getUserCropPlans(userId, cropYear);
  return plans.map((p) => p.grain);
}

/**
 * Check if a specific grain is unlocked for a user.
 */
export function isGrainUnlocked(
  unlockedGrains: string[],
  grainName: string
): boolean {
  return unlockedGrains.includes(grainName);
}

/**
 * Get cumulative user deliveries mapped to grain weeks for the pace chart.
 */
export async function getUserDeliveryCumulative(
  userId: string,
  grain: string,
  cropYear: string = CURRENT_CROP_YEAR
): Promise<{ grain_week: number; cumulative_kt: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crop_plan_deliveries")
    .select("delivery_date, amount_kt")
    .eq("user_id", userId)
    .eq("crop_year", cropYear)
    .eq("grain", grain)
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (!data?.length) return [];

  const cropYearStart = parseInt(cropYear.split("-")[0]);
  const weekStart = new Date(cropYearStart, 7, 1); // Aug 1

  let cumulative = 0;
  return data.map((d: { delivery_date: string; amount_kt: number }) => {
    cumulative += d.amount_kt;
    const deliveryDate = new Date(d.delivery_date);
    const weekNum = Math.ceil(
      (deliveryDate.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    return { grain_week: Math.max(1, weekNum), cumulative_kt: cumulative };
  });
}
