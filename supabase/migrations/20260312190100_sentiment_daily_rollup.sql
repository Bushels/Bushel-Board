-- Sentiment Daily Rollup: intra-week sentiment trajectory via daily snapshots
-- Backlog #12 — Record Sentiment Snapshots (Daily Rollups)

-- 1. Create table
CREATE TABLE sentiment_daily_rollup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  grain_slug text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  snapshot_date date NOT NULL,
  total_votes integer NOT NULL,
  avg_sentiment numeric(4,2),
  new_votes_today integer NOT NULL DEFAULT 0,
  sentiment_delta numeric(4,2),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grain, crop_year, grain_week, snapshot_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_sentiment_daily_grain_week
  ON sentiment_daily_rollup (grain, crop_year, grain_week, snapshot_date);

CREATE INDEX idx_sentiment_daily_slug
  ON sentiment_daily_rollup (grain_slug, crop_year);

-- 2. Enable RLS
ALTER TABLE sentiment_daily_rollup ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all daily rollups
CREATE POLICY "Authenticated users can read daily sentiment rollups"
  ON sentiment_daily_rollup FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can insert (Edge Functions / RPC with SECURITY DEFINER)
CREATE POLICY "Service role can insert daily sentiment rollups"
  ON sentiment_daily_rollup FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service_role can update (upsert from snapshot function)
CREATE POLICY "Service role can update daily sentiment rollups"
  ON sentiment_daily_rollup FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. RPC function to snapshot daily sentiment for all grains
CREATE OR REPLACE FUNCTION snapshot_daily_sentiment(
  p_crop_year text,
  p_grain_week integer,
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS void AS $$
  WITH current_stats AS (
    SELECT
      gsv.grain,
      g.slug AS grain_slug,
      gsv.crop_year,
      gsv.grain_week,
      COUNT(*) AS total_votes,
      ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
      COUNT(*) FILTER (WHERE gsv.voted_at::date = p_snapshot_date) AS new_votes_today
    FROM grain_sentiment_votes gsv
    JOIN grains g ON g.name = gsv.grain
    WHERE gsv.crop_year = p_crop_year
      AND gsv.grain_week = p_grain_week
      AND gsv.voted_at::date <= p_snapshot_date
    GROUP BY gsv.grain, g.slug, gsv.crop_year, gsv.grain_week
  ),
  prev_day AS (
    SELECT grain, crop_year, grain_week, avg_sentiment AS prev_avg
    FROM sentiment_daily_rollup
    WHERE crop_year = p_crop_year
      AND grain_week = p_grain_week
      AND snapshot_date = p_snapshot_date - interval '1 day'
  )
  INSERT INTO sentiment_daily_rollup (
    grain, grain_slug, crop_year, grain_week, snapshot_date,
    total_votes, avg_sentiment, new_votes_today, sentiment_delta
  )
  SELECT
    cs.grain,
    cs.grain_slug,
    cs.crop_year,
    cs.grain_week,
    p_snapshot_date,
    cs.total_votes,
    cs.avg_sentiment,
    cs.new_votes_today,
    CASE
      WHEN pd.prev_avg IS NOT NULL
      THEN ROUND((cs.avg_sentiment - pd.prev_avg)::numeric, 2)
      ELSE NULL
    END
  FROM current_stats cs
  LEFT JOIN prev_day pd
    ON pd.grain = cs.grain
    AND pd.crop_year = cs.crop_year
    AND pd.grain_week = cs.grain_week
  ON CONFLICT (grain, crop_year, grain_week, snapshot_date) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    avg_sentiment = EXCLUDED.avg_sentiment,
    new_votes_today = EXCLUDED.new_votes_today,
    sentiment_delta = EXCLUDED.sentiment_delta,
    snapshot_at = now();
$$ LANGUAGE sql SECURITY DEFINER;
