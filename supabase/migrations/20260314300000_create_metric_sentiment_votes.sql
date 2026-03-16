-- metric_sentiment_votes: per-card bullish/bearish voting on key metrics
-- Pattern mirrors grain_sentiment_votes but scoped to metric categories

CREATE TABLE metric_sentiment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  grain TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  grain_week SMALLINT NOT NULL CHECK (grain_week BETWEEN 1 AND 52),
  metric TEXT NOT NULL CHECK (metric IN ('deliveries', 'processing', 'exports', 'stocks')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish')),
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, grain, crop_year, grain_week, metric)
);

-- RLS
ALTER TABLE metric_sentiment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read metric sentiment votes"
  ON metric_sentiment_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own metric sentiment votes"
  ON metric_sentiment_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own metric sentiment votes"
  ON metric_sentiment_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for aggregation queries
CREATE INDEX idx_metric_sentiment_votes_agg
  ON metric_sentiment_votes (grain, crop_year, grain_week, metric);

-- RPC: aggregate metric sentiment per grain/week
CREATE OR REPLACE FUNCTION get_metric_sentiment(
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
LANGUAGE sql STABLE
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
  FROM metric_sentiment_votes msv
  WHERE msv.grain = p_grain
    AND msv.crop_year = p_crop_year
    AND msv.grain_week = p_grain_week
  GROUP BY msv.metric
  ORDER BY msv.metric;
$$;
