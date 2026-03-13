-- Sentiment History: archive weekly sentiment snapshots for trend analysis
-- Backlog #10 — Save Community Pulse History

-- 1. Create table
CREATE TABLE sentiment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  grain_slug text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  total_votes integer NOT NULL,
  avg_sentiment numeric(4,2),
  holding_pct numeric(5,2),
  neutral_pct numeric(5,2),
  hauling_pct numeric(5,2),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grain, crop_year, grain_week)
);

-- Index for common query patterns
CREATE INDEX idx_sentiment_history_grain_crop_year
  ON sentiment_history (grain, crop_year, grain_week);

CREATE INDEX idx_sentiment_history_slug_crop_year
  ON sentiment_history (grain_slug, crop_year, grain_week);

-- 2. Enable RLS
ALTER TABLE sentiment_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all sentiment history
CREATE POLICY "Authenticated users can read sentiment history"
  ON sentiment_history FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can insert (Edge Functions)
CREATE POLICY "Service role can insert sentiment history"
  ON sentiment_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service_role can update (upsert from snapshot function)
CREATE POLICY "Service role can update sentiment history"
  ON sentiment_history FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. RPC function to snapshot sentiment for all grains in a given week
CREATE OR REPLACE FUNCTION snapshot_weekly_sentiment(p_crop_year text, p_grain_week integer)
RETURNS void AS $$
  INSERT INTO sentiment_history (grain, grain_slug, crop_year, grain_week, total_votes, avg_sentiment, holding_pct, neutral_pct, hauling_pct)
  SELECT
    gsv.grain,
    g.slug AS grain_slug,
    gsv.crop_year,
    gsv.grain_week,
    COUNT(*) AS total_votes,
    ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment <= 2) / NULLIF(COUNT(*), 0), 2) AS holding_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment = 3) / NULLIF(COUNT(*), 0), 2) AS neutral_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment >= 4) / NULLIF(COUNT(*), 0), 2) AS hauling_pct
  FROM grain_sentiment_votes gsv
  JOIN grains g ON g.name = gsv.grain
  WHERE gsv.crop_year = p_crop_year AND gsv.grain_week = p_grain_week
  GROUP BY gsv.grain, g.slug, gsv.crop_year, gsv.grain_week
  ON CONFLICT (grain, crop_year, grain_week) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    avg_sentiment = EXCLUDED.avg_sentiment,
    holding_pct = EXCLUDED.holding_pct,
    neutral_pct = EXCLUDED.neutral_pct,
    hauling_pct = EXCLUDED.hauling_pct,
    snapshot_at = now();
$$ LANGUAGE sql SECURITY DEFINER;
