-- Normalize percentiles: rank by delivery pace (% of planned volume) instead of raw tonnage
CREATE OR REPLACE FUNCTION calculate_delivery_percentiles(
  p_crop_year text DEFAULT '2025-26'
)
RETURNS TABLE (
  user_id uuid,
  grain text,
  total_delivered_kt numeric,
  delivery_pace_pct numeric,
  percentile_rank numeric
)
AS $$
  WITH user_totals AS (
    SELECT
      cp.user_id,
      cp.grain,
      COALESCE(
        (SELECT SUM((d->>'amount_kt')::numeric)
         FROM jsonb_array_elements(cp.deliveries) AS d),
        0
      ) AS total_delivered_kt,
      cp.volume_left_to_sell_kt AS planned_volume_kt,
      cp.acres_seeded
    FROM crop_plans cp
    WHERE cp.crop_year = p_crop_year
      AND cp.deliveries IS NOT NULL
      AND jsonb_array_length(cp.deliveries) > 0
  )
  SELECT
    ut.user_id,
    ut.grain,
    ut.total_delivered_kt,
    CASE
      WHEN ut.planned_volume_kt > 0
        THEN (ut.total_delivered_kt / ut.planned_volume_kt) * 100
      WHEN ut.acres_seeded > 0
        THEN (ut.total_delivered_kt / ut.acres_seeded) * 1000
      ELSE 0
    END AS delivery_pace_pct,
    (PERCENT_RANK() OVER (
      PARTITION BY ut.grain
      ORDER BY
        CASE
          WHEN ut.planned_volume_kt > 0
            THEN ut.total_delivered_kt / ut.planned_volume_kt
          WHEN ut.acres_seeded > 0
            THEN ut.total_delivered_kt / NULLIF(ut.acres_seeded, 0)
          ELSE 0
        END
    )) * 100 AS percentile_rank
  FROM user_totals ut;
$$
LANGUAGE sql STABLE;
