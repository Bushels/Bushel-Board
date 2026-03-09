import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface XMarketSignal {
  id: string;
  post_summary: string;
  post_author: string | null;
  post_date: string | null;
  relevance_score: number;
  sentiment: string;
  category: string;
  confidence_score: number;
  search_query: string;
}

export async function getXSignalsForGrain(
  grainName: string,
  grainWeek?: number
): Promise<XMarketSignal[]> {
  const supabase = await createClient();
  let query = supabase
    .from("x_market_signals")
    .select("*")
    .eq("grain", grainName)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .gte("relevance_score", 60)
    .order("relevance_score", { ascending: false })
    .limit(20);

  if (grainWeek) {
    query = query.eq("grain_week", grainWeek);
  }

  const { data } = await query;
  return (data ?? []) as XMarketSignal[];
}
