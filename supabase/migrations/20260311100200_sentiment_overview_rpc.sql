-- RPC to get per-grain sentiment aggregates for a given crop_year + grain_week
-- Used by the overview dashboard sentiment banner
-- Follows the established RPC pattern (get_pipeline_velocity, get_signals_with_feedback)
CREATE OR REPLACE FUNCTION get_sentiment_overview(
  p_crop_year text,
  p_grain_week integer
)
RETURNS TABLE (
  grain text,
  vote_count int,
  avg_sentiment numeric,
  pct_holding numeric,
  pct_hauling numeric,
  pct_neutral numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    grain,
    COUNT(*)::int AS vote_count,
    ROUND(AVG(sentiment)::numeric, 2) AS avg_sentiment,
    ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
    ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
    ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
  FROM grain_sentiment_votes
  WHERE crop_year = p_crop_year AND grain_week = p_grain_week
  GROUP BY grain;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_sentiment_overview(text, integer) TO authenticated;
