import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface XMarketSignal {
  id: string;
  grain: string;
  post_summary: string;
  post_url?: string | null;
  post_author: string | null;
  post_date: string | null;
  relevance_score: number;
  sentiment: string;
  category: string;
  confidence_score: number;
  search_query: string;
  searched_at?: string | null;
  source?: "x" | "web" | null;
  search_mode?: "pulse" | "deep" | null;
}

export interface XSignalWithFeedback extends XMarketSignal {
  user_voted: boolean;
  user_relevant: boolean | null;
  blended_relevance: number;
  is_new: boolean;
}

export interface FeedStats {
  total_signals: number;
  voted_count: number;
  relevant_count: number;
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

/**
 * Get X signals for a grain with the current user's feedback status.
 * LEFT JOINs signal_feedback to show vote state on each card,
 * and LEFT JOINs v_signal_relevance_scores for blended relevance ordering.
 * Includes searched_at, source, search_mode, and is_new fields.
 */
export async function getXSignalsWithFeedback(
  supabase: SupabaseClient,
  grainName: string,
  grainWeek?: number,
  lastSeen?: string | null
): Promise<XSignalWithFeedback[]> {
  const { data, error } = await supabase.rpc("get_signals_with_feedback", {
    p_grain: grainName,
    p_crop_year: CURRENT_CROP_YEAR,
    p_grain_week: grainWeek ?? null,
    p_last_seen: lastSeen ?? null,
  });

  if (error) {
    console.error("getXSignalsWithFeedback error:", error.message);
    const basic = await getXSignalsForGrain(grainName, grainWeek);
    return basic.map((s) => ({
      ...s,
      user_voted: false,
      user_relevant: null,
      blended_relevance: s.relevance_score,
      is_new: false,
    }));
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    grain: row.grain as string,
    post_summary: row.post_summary as string,
    post_url: (row.post_url as string | null | undefined) ?? null,
    post_author: row.post_author as string | null,
    post_date: row.post_date as string | null,
    relevance_score: row.relevance_score as number,
    sentiment: row.sentiment as string,
    category: row.category as string,
    confidence_score: row.confidence_score as number,
    search_query: row.search_query as string,
    searched_at: (row.searched_at as string | null | undefined) ?? null,
    source: (row.source as "x" | "web" | null | undefined) ?? null,
    search_mode: (row.search_mode as "pulse" | "deep" | null | undefined) ?? null,
    is_new: (row.is_new as boolean | undefined) ?? false,
    user_voted: row.user_voted as boolean,
    user_relevant: row.user_relevant as boolean | null,
    blended_relevance: row.blended_relevance as number,
  }));
}

/**
 * Get latest X signals across ALL grains for the overview signal tape.
 * No grain filter — returns the most recent high-relevance signals.
 */
export async function getLatestXSignals(
  limit = 20
): Promise<XMarketSignal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("x_market_signals")
    .select("*")
    .eq("crop_year", CURRENT_CROP_YEAR)
    .gte("relevance_score", 60)
    .order("searched_at", { ascending: false })
    .order("relevance_score", { ascending: false })
    .limit(limit);
  return (data ?? []) as XMarketSignal[];
}

/**
 * Get user's feed stats for the "Your impact" summary bar.
 */
export async function getUserFeedStats(
  supabase: SupabaseClient,
  userId: string,
  cropYear: string,
  grainWeek: number
): Promise<FeedStats> {
  const { data, error } = await supabase
    .from("signal_feedback")
    .select("relevant")
    .eq("user_id", userId)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek);

  if (error || !data) {
    return { total_signals: 0, voted_count: 0, relevant_count: 0 };
  }

  return {
    total_signals: 0, // Will be set by the component from total signals count
    voted_count: data.length,
    relevant_count: data.filter((d) => d.relevant).length,
  };
}
