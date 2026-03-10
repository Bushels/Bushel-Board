-- RPC: anonymized aggregate delivery analytics per grain
-- Returns mean/median/percentile delivery pace across all farmers
-- Privacy: only returns data when at least 5 farmers have crop plans for a grain
-- Excludes observer accounts from calculations
CREATE OR REPLACE FUNCTION get_delivery_analytics(
  p_crop_year text,
  p_grain text DEFAULT NULL
)
RETURNS TABLE (
  grain text,
  farmer_count int,
  total_delivered_kt numeric,
  mean_delivered_kt numeric,
  median_delivered_kt numeric,
  mean_pace_pct numeric,
  p25_pace_pct numeric,
  p50_pace_pct numeric,
  p75_pace_pct numeric
)
LANGUAGE sql STABLE
AS $$
  WITH user_stats AS (
    SELECT
      cp.grain,
      cp.user_id,
      COALESCE(
        (SELECT SUM((d->>'amount_kt')::numeric)
         FROM jsonb_array_elements(cp.deliveries) AS d), 0
      ) AS delivered_kt,
      CASE WHEN COALESCE(cp.volume_left_to_sell_kt, 0) > 0
        THEN LEAST(100, COALESCE(
          (SELECT SUM((d->>'amount_kt')::numeric)
           FROM jsonb_array_elements(cp.deliveries) AS d), 0
        ) / cp.volume_left_to_sell_kt * 100)
        ELSE 0
      END AS pace_pct
    FROM crop_plans cp
    JOIN profiles pr ON pr.id = cp.user_id AND pr.role = 'farmer'
    WHERE cp.crop_year = p_crop_year
      AND (p_grain IS NULL OR cp.grain = p_grain)
  )
  SELECT
    us.grain,
    COUNT(DISTINCT us.user_id)::int AS farmer_count,
    ROUND(SUM(us.delivered_kt)::numeric, 3) AS total_delivered_kt,
    ROUND(AVG(us.delivered_kt)::numeric, 3) AS mean_delivered_kt,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY us.delivered_kt))::numeric, 3) AS median_delivered_kt,
    ROUND(AVG(us.pace_pct)::numeric, 1) AS mean_pace_pct,
    ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY us.pace_pct))::numeric, 1) AS p25_pace_pct,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY us.pace_pct))::numeric, 1) AS p50_pace_pct,
    ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY us.pace_pct))::numeric, 1) AS p75_pace_pct
  FROM user_stats us
  GROUP BY us.grain
  HAVING COUNT(DISTINCT us.user_id) >= 5;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_delivery_analytics(text, text) TO authenticated;
