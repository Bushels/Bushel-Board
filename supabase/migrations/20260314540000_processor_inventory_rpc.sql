-- Processor inventory: current stocks and weeks of supply
-- Stocks = how much grain processors are sitting on
-- Weeks of supply = Stocks / Weekly Processing rate

CREATE OR REPLACE FUNCTION get_processor_inventory(
  p_grain text,
  p_crop_year text
)
RETURNS TABLE (
  grain_week int,
  stocks_kt numeric,
  weekly_processing_kt numeric,
  weeks_of_supply numeric
)
LANGUAGE sql STABLE
AS $$
  WITH stocks AS (
    -- Process.Stocks is per-province, must SUM for national total
    SELECT
      o.grain_week,
      SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year = p_crop_year
      AND o.worksheet = 'Process'
      AND o.metric = 'Stocks'
      AND o.period = 'Current Week'
      AND o.grade = ''
    GROUP BY o.grain_week
  ),
  processing AS (
    SELECT
      o.grain_week,
      o.ktonnes AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year = p_crop_year
      AND o.worksheet = 'Process'
      AND o.metric = 'Milled/Mfg Grain'
      AND o.period = 'Current Week'
      AND o.region = ''
      AND o.grade = ''
  )
  SELECT
    COALESCE(s.grain_week, p.grain_week)::int AS grain_week,
    COALESCE(s.kt, 0) AS stocks_kt,
    COALESCE(p.kt, 0) AS weekly_processing_kt,
    CASE WHEN COALESCE(p.kt, 0) > 0
      THEN ROUND((COALESCE(s.kt, 0) / p.kt)::numeric, 1)
      ELSE NULL
    END AS weeks_of_supply
  FROM stocks s
  FULL OUTER JOIN processing p ON s.grain_week = p.grain_week
  ORDER BY grain_week;
$$;

GRANT EXECUTE ON FUNCTION get_processor_inventory(text, text) TO authenticated;
