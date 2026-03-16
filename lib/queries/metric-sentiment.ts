import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface MetricSentimentAggregate {
  metric: string;
  bullish_count: number;
  bearish_count: number;
  total_votes: number;
  bullish_pct: number;
}

export interface UserMetricVote {
  metric: string;
  sentiment: string;
}

/**
 * Get per-metric sentiment aggregates for a grain/week.
 * Calls the get_metric_sentiment RPC (server-side aggregation).
 */
export async function getMetricSentiment(
  grain: string,
  grainWeek: number
): Promise<MetricSentimentAggregate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_metric_sentiment", {
    p_grain: grain,
    p_crop_year: CURRENT_CROP_YEAR,
    p_grain_week: grainWeek,
  });

  if (error) {
    console.error("getMetricSentiment error:", error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    metric: String(r.metric),
    bullish_count: Number(r.bullish_count),
    bearish_count: Number(r.bearish_count),
    total_votes: Number(r.total_votes),
    bullish_pct: Number(r.bullish_pct),
  }));
}

/**
 * Get the current user's metric sentiment votes for a grain/week.
 * Returns an array of { metric, sentiment } for each metric the user voted on.
 */
export async function getUserMetricVotes(
  grain: string,
  grainWeek: number
): Promise<UserMetricVote[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("metric_sentiment_votes")
    .select("metric, sentiment")
    .eq("user_id", user.id)
    .eq("grain", grain)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain_week", grainWeek);

  if (error) {
    console.error("getUserMetricVotes error:", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    metric: String(r.metric),
    sentiment: String(r.sentiment),
  }));
}
