import type { SupabaseClient } from "@supabase/supabase-js";

export interface GrainSentiment {
  grain: string;
  crop_year: string;
  grain_week: number;
  vote_count: number;
  avg_sentiment: number;
  pct_hauling: number;
  pct_holding: number;
  pct_neutral: number;
}

/**
 * Get aggregate sentiment for a grain in a given week.
 */
export async function getGrainSentiment(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<GrainSentiment | null> {
  const { data, error } = await supabase
    .from("v_grain_sentiment")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .single();

  if (error || !data) return null;
  return data as GrainSentiment;
}

/**
 * Get the current user's sentiment vote for a grain/week.
 */
export async function getUserSentimentVote(
  supabase: SupabaseClient,
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<number | null> {
  const { data, error } = await supabase
    .from("grain_sentiment_votes")
    .select("sentiment")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .single();

  if (error || !data) return null;
  return data.sentiment;
}

/**
 * Upsert a sentiment vote for the current user.
 */
export async function submitSentimentVote(
  supabase: SupabaseClient,
  userId: string,
  grain: string,
  cropYear: string,
  grainWeek: number,
  sentiment: number
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("grain_sentiment_votes")
    .upsert(
      {
        user_id: userId,
        grain,
        crop_year: cropYear,
        grain_week: grainWeek,
        sentiment,
        voted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,grain,crop_year,grain_week" }
    );

  if (error) return { error: error.message };
  return {};
}
