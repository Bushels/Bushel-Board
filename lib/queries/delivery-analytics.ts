import { createClient } from "@/lib/supabase/server";

export interface DeliveryAnalytics {
  grain: string;
  farmer_count: number;
  total_delivered_kt: number;
  mean_delivered_kt: number;
  median_delivered_kt: number;
  mean_pace_pct: number;
  p25_pace_pct: number;
  p50_pace_pct: number;
  p75_pace_pct: number;
}

/**
 * Get anonymized aggregate delivery analytics per grain.
 * Only returns data when >= 5 farmers have crop plans (privacy threshold).
 * Excludes observer accounts.
 */
export async function getDeliveryAnalytics(
  cropYear: string,
  grain?: string
): Promise<DeliveryAnalytics[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_delivery_analytics", {
    p_crop_year: cropYear,
    p_grain: grain ?? null,
  });

  if (error) {
    console.error("getDeliveryAnalytics error:", error.message);
    return [];
  }

  // PostgREST returns numeric as string — wrap in Number()
  return (data ?? []).map((r: Record<string, unknown>) => ({
    grain: String(r.grain),
    farmer_count: Number(r.farmer_count),
    total_delivered_kt: Number(r.total_delivered_kt),
    mean_delivered_kt: Number(r.mean_delivered_kt),
    median_delivered_kt: Number(r.median_delivered_kt),
    mean_pace_pct: Number(r.mean_pace_pct),
    p25_pace_pct: Number(r.p25_pace_pct),
    p50_pace_pct: Number(r.p50_pace_pct),
    p75_pace_pct: Number(r.p75_pace_pct),
  }));
}
