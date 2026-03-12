-- Harden sentiment snapshot RPCs — security audit findings
-- 1. Set search_path = public on SECURITY DEFINER functions
-- 2. Restrict EXECUTE to service_role only (prevent anon/authenticated from bypassing RLS)

-- Fix snapshot_weekly_sentiment: add search_path
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
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Fix snapshot_daily_sentiment: add search_path
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
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Restrict execution to service_role only
REVOKE ALL ON FUNCTION public.snapshot_weekly_sentiment(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_weekly_sentiment(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.snapshot_daily_sentiment(text, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_sentiment(text, integer, date) TO service_role;
