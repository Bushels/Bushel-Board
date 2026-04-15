-- Harden metric sentiment vote access:
-- - Raw vote rows are private to the voter
-- - Aggregate RPC remains callable by authenticated users

DROP POLICY IF EXISTS "Authenticated users can read metric sentiment votes"
  ON public.metric_sentiment_votes;

DROP POLICY IF EXISTS "Users can insert their own metric sentiment votes"
  ON public.metric_sentiment_votes;

DROP POLICY IF EXISTS "Users can update their own metric sentiment votes"
  ON public.metric_sentiment_votes;

CREATE POLICY "Users can read their own metric sentiment votes"
  ON public.metric_sentiment_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own metric sentiment votes"
  ON public.metric_sentiment_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Users can update their own metric sentiment votes"
  ON public.metric_sentiment_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_farmer(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_metric_sentiment(
  p_grain TEXT,
  p_crop_year TEXT,
  p_grain_week SMALLINT
)
RETURNS TABLE (
  metric TEXT,
  bullish_count BIGINT,
  bearish_count BIGINT,
  total_votes BIGINT,
  bullish_pct NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    msv.metric,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bullish') AS bullish_count,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bearish') AS bearish_count,
    COUNT(*) AS total_votes,
    ROUND(
      (COUNT(*) FILTER (WHERE msv.sentiment = 'bullish') * 100.0 / NULLIF(COUNT(*), 0))::numeric,
      1
    ) AS bullish_pct
  FROM public.metric_sentiment_votes msv
  WHERE msv.grain = p_grain
    AND msv.crop_year = p_crop_year
    AND msv.grain_week = p_grain_week
  GROUP BY msv.metric
  ORDER BY msv.metric;
$$;

REVOKE ALL ON FUNCTION public.get_metric_sentiment(text, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_metric_sentiment(text, text, smallint) TO authenticated, service_role;
