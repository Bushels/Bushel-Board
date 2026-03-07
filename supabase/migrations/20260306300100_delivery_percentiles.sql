CREATE OR REPLACE FUNCTION calculate_delivery_percentiles(
  p_crop_year text DEFAULT '2025-2026'
)
RETURNS TABLE (
  user_id uuid,
  grain text,
  total_delivered_kt numeric,
  percentile_rank numeric
)
LANGUAGE sql STABLE
AS $$
  WITH user_totals AS (
    SELECT
      cp.user_id,
      cp.grain,
      COALESCE(
        (SELECT SUM((d->>'amount_kt')::numeric)
         FROM jsonb_array_elements(cp.deliveries) AS d),
        0
      ) AS total_delivered_kt
    FROM crop_plans cp
    WHERE cp.crop_year = p_crop_year
      AND cp.deliveries IS NOT NULL
      AND jsonb_array_length(cp.deliveries) > 0
  )
  SELECT
    ut.user_id,
    ut.grain,
    ut.total_delivered_kt,
    (PERCENT_RANK() OVER (PARTITION BY ut.grain ORDER BY ut.total_delivered_kt)) * 100
      AS percentile_rank
  FROM user_totals ut;
$$;
