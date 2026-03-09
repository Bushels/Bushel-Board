-- Aggregate sentiment view (readable by all authenticated users)
CREATE VIEW v_grain_sentiment AS
SELECT
  grain,
  crop_year,
  grain_week,
  COUNT(*)::int AS vote_count,
  ROUND(AVG(sentiment)::numeric, 2) AS avg_sentiment,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
FROM grain_sentiment_votes
GROUP BY grain, crop_year, grain_week;

-- Grant authenticated users SELECT on the aggregate view
GRANT SELECT ON v_grain_sentiment TO authenticated;
