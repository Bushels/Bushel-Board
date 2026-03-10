-- RPC function: get_signals_with_feedback
-- Returns X signals LEFT JOINed with the current user's feedback
-- and blended relevance scores from v_signal_relevance_scores.
-- Used by the grain detail page to render the signal feed with vote state.

CREATE OR REPLACE FUNCTION get_signals_with_feedback(
  p_grain text,
  p_crop_year text,
  p_user_id uuid,
  p_grain_week int DEFAULT NULL
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
  user_voted boolean,
  user_relevant boolean,
  blended_relevance int
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
    (sf.id IS NOT NULL) AS user_voted,
    sf.relevant AS user_relevant,
    COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance
  FROM x_market_signals xs
  LEFT JOIN signal_feedback sf
    ON sf.signal_id = xs.id AND sf.user_id = p_user_id
  LEFT JOIN v_signal_relevance_scores vrs
    ON vrs.signal_id = xs.id
  WHERE xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.relevance_score >= 60
    AND (p_grain_week IS NULL OR xs.grain_week = p_grain_week)
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 20;
$$;
