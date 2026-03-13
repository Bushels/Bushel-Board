-- RPC function to return pre-aggregated pipeline velocity data per grain week.
-- Replaces 5 separate PostgREST queries that hit max_rows=1000 limit.
-- Terminal Receipts alone has ~3,648 rows per grain (20 grades × 6 ports × 30 weeks),
-- and Terminal Exports ~1,050 rows — both silently truncated by PostgREST.
CREATE OR REPLACE FUNCTION get_pipeline_velocity(
  p_grain text,
  p_crop_year text
)
RETURNS TABLE (
  grain_week int,
  week_ending_date text,
  producer_deliveries_kt numeric,
  terminal_receipts_kt numeric,
  exports_kt numeric,
  processing_kt numeric
) LANGUAGE sql STABLE AS $$
  WITH
  -- Primary elevator deliveries (provincial: AB, SK, MB) — grade='' aggregate rows
  primary_del AS (
    SELECT grain_week, MAX(week_ending_date::text) AS wed, SUM(ktonnes) AS kt
    FROM cgc_observations
    WHERE crop_year = p_crop_year AND grain = p_grain AND grade = ''
      AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Crop Year'
      AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    GROUP BY grain_week
  ),
  -- Direct-to-processor deliveries (national total, grade='')
  process_del AS (
    SELECT grain_week, SUM(ktonnes) AS kt
    FROM cgc_observations
    WHERE crop_year = p_crop_year AND grain = p_grain AND grade = ''
      AND worksheet = 'Process' AND metric = 'Producer Deliveries' AND period = 'Crop Year'
    GROUP BY grain_week
  ),
  -- Terminal receipts — NO grade='' aggregate rows exist, must sum all grades × ports
  receipts AS (
    SELECT grain_week, SUM(ktonnes) AS kt
    FROM cgc_observations
    WHERE crop_year = p_crop_year AND grain = p_grain
      AND worksheet = 'Terminal Receipts' AND metric = 'Receipts' AND period = 'Crop Year'
    GROUP BY grain_week
  ),
  -- Terminal exports — NO grade='' aggregate rows, must sum all grades × ports
  exports AS (
    SELECT grain_week, SUM(ktonnes) AS kt
    FROM cgc_observations
    WHERE crop_year = p_crop_year AND grain = p_grain
      AND worksheet = 'Terminal Exports' AND metric = 'Exports' AND period = 'Crop Year'
    GROUP BY grain_week
  ),
  -- Processing / crush (grade='' aggregate)
  processing AS (
    SELECT grain_week, SUM(ktonnes) AS kt
    FROM cgc_observations
    WHERE crop_year = p_crop_year AND grain = p_grain AND grade = ''
      AND worksheet = 'Process' AND metric = 'Milled/Mfg Grain' AND period = 'Crop Year'
    GROUP BY grain_week
  ),
  -- Union of all weeks across metrics
  all_weeks AS (
    SELECT DISTINCT grain_week FROM (
      SELECT grain_week FROM primary_del
      UNION SELECT grain_week FROM process_del
      UNION SELECT grain_week FROM receipts
      UNION SELECT grain_week FROM exports
      UNION SELECT grain_week FROM processing
    ) w
  )
  SELECT
    aw.grain_week::int,
    COALESCE(pd.wed, '')::text AS week_ending_date,
    COALESCE(pd.kt, 0) + COALESCE(dp.kt, 0) AS producer_deliveries_kt,
    COALESCE(r.kt, 0)  AS terminal_receipts_kt,
    COALESCE(e.kt, 0)  AS exports_kt,
    COALESCE(p.kt, 0)  AS processing_kt
  FROM all_weeks aw
  LEFT JOIN primary_del pd ON pd.grain_week = aw.grain_week
  LEFT JOIN process_del dp ON dp.grain_week = aw.grain_week
  LEFT JOIN receipts r     ON r.grain_week = aw.grain_week
  LEFT JOIN exports e      ON e.grain_week = aw.grain_week
  LEFT JOIN processing p   ON p.grain_week = aw.grain_week
  ORDER BY aw.grain_week;
$$;
