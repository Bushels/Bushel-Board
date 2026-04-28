import { createClient } from "@/lib/supabase/server";

export interface GrainStorageComparison {
  grain: string;
  farmer_count: number;
  your_remaining_kt: number;
  your_total_kt: number;
  median_remaining_kt: number;
  pct_farmers_with_more_remaining: number;
  percentile_rank: number;
}

/**
 * Fetch the calling farmer's storage comparison for a single grain.
 *
 * Returns null when:
 *   - No session / RPC error
 *   - Privacy threshold not met (< 5 farmers tracking this grain)
 *   - The calling farmer has no crop_plans row for this grain
 */
type GrainStorageComparisonRow = {
  grain: string;
  farmer_count: number;
  your_remaining_kt: number | string;
  your_total_kt: number | string;
  median_remaining_kt: number | string;
  pct_farmers_with_more_remaining: number | string;
  percentile_rank: number | string;
};

export async function getGrainStorageComparison(
  grain: string
): Promise<GrainStorageComparison | null> {
  const supabase = await createClient();

  // Cast to never-typed RPC: the generated Supabase types haven't picked up
  // get_grain_storage_comparison yet (it's defined in migration
  // 20260428100000_grain_storage_comparison.sql). Once the type generator is
  // re-run, this cast can be removed.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => {
    maybeSingle: () => Promise<{
      data: GrainStorageComparisonRow | null;
      error: { message: string } | null;
    }>;
  })("get_grain_storage_comparison", { p_grain: grain }).maybeSingle();

  if (error) {
    console.error(`getGrainStorageComparison(${grain}) error:`, error.message);
    return null;
  }

  if (!data) return null;

  return {
    grain: String(data.grain),
    farmer_count: Number(data.farmer_count),
    your_remaining_kt: Number(data.your_remaining_kt),
    your_total_kt: Number(data.your_total_kt),
    median_remaining_kt: Number(data.median_remaining_kt),
    pct_farmers_with_more_remaining: Number(data.pct_farmers_with_more_remaining),
    percentile_rank: Number(data.percentile_rank),
  };
}
