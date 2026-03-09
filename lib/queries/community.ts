import { createClient } from "@/lib/supabase/server";

export interface CommunityStats {
  total_acres: number;
  total_tonnes: number;
  grain_count: number;
  farmer_count: number;
}

export async function getCommunityStats(): Promise<CommunityStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_community_stats").single();
  if (error || !data) return null;
  const stats = data as unknown as CommunityStats;
  // Privacy threshold: don't display if fewer than 10 farmers
  if (stats.farmer_count < 10) return null;
  return stats;
}
