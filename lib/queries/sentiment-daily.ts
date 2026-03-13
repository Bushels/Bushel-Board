import { createClient } from "@/lib/supabase/server";

export interface DailySentimentSnapshot {
  id: string;
  grain: string;
  grain_slug: string;
  crop_year: string;
  grain_week: number;
  snapshot_date: string;
  total_votes: number;
  avg_sentiment: number | null;
  new_votes_today: number;
  sentiment_delta: number | null;
  snapshot_at: string;
}

/**
 * Get all daily sentiment snapshots for a grain in a given week.
 * Returns snapshots ordered by date ascending — useful for rendering
 * intra-week sentiment trajectory charts.
 */
export async function getDailySentimentRollup(
  grain: string,
  cropYear: string,
  grainWeek: number
): Promise<DailySentimentSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sentiment_daily_rollup")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .order("snapshot_date", { ascending: true });

  if (error) {
    console.error("getDailySentimentRollup error:", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}

/**
 * Get daily sentiment rollups across all weeks for a grain in a crop year.
 * Returns a continuous timeline for trend analysis — useful for sparklines
 * or full-season sentiment trajectory views.
 */
export async function getSentimentTrajectory(
  grain: string,
  cropYear: string
): Promise<DailySentimentSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sentiment_daily_rollup")
    .select("*")
    .eq("grain", grain)
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: true })
    .order("snapshot_date", { ascending: true });

  if (error) {
    console.error("getSentimentTrajectory error:", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}

/** Map raw PostgREST row to typed snapshot, coercing numeric strings. */
function mapRow(r: Record<string, unknown>): DailySentimentSnapshot {
  return {
    id: String(r.id),
    grain: String(r.grain),
    grain_slug: String(r.grain_slug),
    crop_year: String(r.crop_year),
    grain_week: Number(r.grain_week),
    snapshot_date: String(r.snapshot_date),
    total_votes: Number(r.total_votes),
    avg_sentiment: r.avg_sentiment != null ? Number(r.avg_sentiment) : null,
    new_votes_today: Number(r.new_votes_today),
    sentiment_delta:
      r.sentiment_delta != null ? Number(r.sentiment_delta) : null,
    snapshot_at: String(r.snapshot_at),
  };
}
