-- RPC function: get_signals_for_intelligence
-- Used by the generate-intelligence Edge Function (service role) to fetch
-- X signals with farmer-blended relevance scores for prompt construction.

CREATE OR REPLACE FUNCTION get_signals_for_intelligence(
  p_grain text,
  p_crop_year text,
  p_grain_week int
)
RETURNS TABLE (
  id uuid,
  post_summary text,
  post_author text,
  post_date timestamptz,
  relevance_score int,
  sentiment text,
  category text,
  confidence_score int,
  search_query text,
  blended_relevance int,
  total_votes bigint,
  farmer_relevance_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    xs.id,
    xs.post_summary,
    xs.post_author,
    xs.post_date,
    xs.relevance_score,
    xs.sentiment,
    xs.category,
    xs.confidence_score,
    xs.search_query,
    COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance,
    COALESCE(vrs.total_votes, 0) AS total_votes,
    vrs.farmer_relevance_pct
  FROM x_market_signals xs
  LEFT JOIN v_signal_relevance_scores vrs ON vrs.signal_id = xs.id
  WHERE xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.grain_week = p_grain_week
    AND COALESCE(vrs.blended_relevance, xs.relevance_score) >= 60
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 10;
$$;
