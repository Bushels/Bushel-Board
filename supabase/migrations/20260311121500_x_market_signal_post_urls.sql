ALTER TABLE public.x_market_signals
ADD COLUMN IF NOT EXISTS post_url text;

COMMENT ON COLUMN public.x_market_signals.post_url IS
  'Canonical outbound URL to the X post when available from the intelligence search step.';

UPDATE public.x_market_signals
SET post_url = NULL
WHERE post_url = '';

DROP FUNCTION IF EXISTS public.get_signals_with_feedback(text, text, int);

CREATE OR REPLACE FUNCTION public.get_signals_with_feedback(
  p_grain text,
  p_crop_year text,
  p_grain_week int DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  grain text,
  post_summary text,
  post_url text,
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
SET search_path = public
AS $$
  SELECT
    xs.id,
    xs.grain,
    xs.post_summary,
    xs.post_url,
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
  FROM public.x_market_signals xs
  LEFT JOIN public.signal_feedback sf
    ON sf.signal_id = xs.id
   AND sf.user_id = auth.uid()
  LEFT JOIN public.v_signal_relevance_scores vrs
    ON vrs.signal_id = xs.id
  WHERE auth.uid() IS NOT NULL
    AND xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.relevance_score >= 60
    AND (p_grain_week IS NULL OR xs.grain_week = p_grain_week)
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_signals_with_feedback(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_signals_with_feedback(text, text, int) TO authenticated;

DROP FUNCTION IF EXISTS public.get_signals_for_intelligence(text, text, int);

CREATE OR REPLACE FUNCTION public.get_signals_for_intelligence(
  p_grain text,
  p_crop_year text,
  p_grain_week int
)
RETURNS TABLE (
  id uuid,
  post_summary text,
  post_url text,
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
SET search_path = public
AS $$
  SELECT
    xs.id,
    xs.post_summary,
    xs.post_url,
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
  FROM public.x_market_signals xs
  LEFT JOIN public.v_signal_relevance_scores vrs ON vrs.signal_id = xs.id
  WHERE xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.grain_week = p_grain_week
    AND COALESCE(vrs.blended_relevance, xs.relevance_score) >= 60
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_signals_for_intelligence(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signals_for_intelligence(text, text, int) TO service_role;
