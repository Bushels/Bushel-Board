import { createClient } from "@/lib/supabase/server";

export interface CommunityStats {
  total_acres: number;
  total_tonnes: number;
  grain_count: number;
  farmer_count: number;
}

export async function getCommunityStats(): Promise<CommunityStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_community_stats").maybeSingle();
  if (error || !data) return null;
  const stats = data as unknown as CommunityStats;
  return stats;
}
