import { createClient } from "@/lib/supabase/server";

export interface SentimentHistoryRow {
  id: string;
  grain: string;
  grain_slug: string;
  crop_year: string;
  grain_week: number;
  total_votes: number;
  avg_sentiment: number;
  holding_pct: number;
  neutral_pct: number;
  hauling_pct: number;
  snapshot_at: string;
}

function toSentimentHistoryRow(r: Record<string, unknown>): SentimentHistoryRow {
  return {
    id: String(r.id),
    grain: String(r.grain),
    grain_slug: String(r.grain_slug),
    crop_year: String(r.crop_year),
    grain_week: Number(r.grain_week),
    total_votes: Number(r.total_votes),
    avg_sentiment: Number(r.avg_sentiment),
    holding_pct: Number(r.holding_pct),
    neutral_pct: Number(r.neutral_pct),
    hauling_pct: Number(r.hauling_pct),
    snapshot_at: String(r.snapshot_at),
  };
}

/**
 * Get all weekly sentiment snapshots for a grain in a crop year,
 * ordered by grain_week ascending for trend charting.
 */
export async function getSentimentHistory(
  grain: string,
  cropYear: string
): Promise<SentimentHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sentiment_history")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: true });

  if (error) {
    console.error("getSentimentHistory error:", error.message);
    return [];
  }
  return (data ?? []).map(toSentimentHistoryRow);
}

/**
 * Get the most recent sentiment snapshot for a grain in a crop year.
 */
export async function getLatestSentimentSnapshot(
  grain: string,
  cropYear: string
): Promise<SentimentHistoryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sentiment_history")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestSentimentSnapshot error:", error.message);
    return null;
  }
  if (!data) return null;
  return toSentimentHistoryRow(data);
}
