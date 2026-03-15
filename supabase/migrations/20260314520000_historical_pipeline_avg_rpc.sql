-- Returns the N-year average cumulative pipeline metrics per grain week.
-- Averages producer_deliveries, terminal_receipts, exports, processing across
-- the N crop years preceding the given crop year.

CREATE OR REPLACE FUNCTION get_pipeline_velocity_avg(
  p_grain text,
  p_crop_year text,
  p_years_back int DEFAULT 5
)
RETURNS TABLE (
  grain_week int,
  avg_deliveries_kt numeric,
  avg_receipts_kt numeric,
  avg_exports_kt numeric,
  avg_processing_kt numeric,
  years_count int
)
LANGUAGE sql STABLE
AS $$
  WITH crop_year_start AS (
    SELECT LEFT(p_crop_year, 4)::int AS start_year
  ),
  prior_years AS (
    SELECT
      (cys.start_year - g.n)::text || '-' || (cys.start_year - g.n + 1)::text AS crop_year
    FROM crop_year_start cys,
         generate_series(1, p_years_back) AS g(n)
  ),
  deliveries AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Primary'
      AND o.metric = 'Deliveries'
      AND o.period = 'Crop Year'
      AND o.grade = ''
      AND o.region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    GROUP BY o.crop_year, o.grain_week
  ),
  proc_deliveries AS (
    SELECT o.crop_year, o.grain_week, o.ktonnes AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Process'
      AND o.metric = 'Producer Deliveries'
      AND o.period = 'Crop Year'
      AND o.region = ''
      AND o.grade = ''
  ),
  combined_deliveries AS (
    SELECT
      COALESCE(d.crop_year, pd.crop_year) AS crop_year,
      COALESCE(d.grain_week, pd.grain_week) AS grain_week,
      COALESCE(d.kt, 0) + COALESCE(pd.kt, 0) AS kt
    FROM deliveries d
    FULL OUTER JOIN proc_deliveries pd
      ON d.crop_year = pd.crop_year AND d.grain_week = pd.grain_week
  ),
  receipts AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Crop Year'
    GROUP BY o.crop_year, o.grain_week
  ),
  exports AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Terminal Exports'
      AND o.metric = 'Exports'
      AND o.period = 'Crop Year'
    GROUP BY o.crop_year, o.grain_week
  ),
  processing AS (
    SELECT o.crop_year, o.grain_week, o.ktonnes AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Process'
      AND o.metric = 'Milled/Mfg Grain'
      AND o.period = 'Crop Year'
      AND o.region = ''
      AND o.grade = ''
  ),
  all_weeks AS (
    SELECT DISTINCT grain_week FROM (
      SELECT grain_week FROM combined_deliveries
      UNION SELECT grain_week FROM receipts
      UNION SELECT grain_week FROM exports
      UNION SELECT grain_week FROM processing
    ) AS w
  ),
  all_years AS (
    SELECT crop_year FROM prior_years
  ),
  grid AS (
    SELECT ay.crop_year, aw.grain_week
    FROM all_years ay CROSS JOIN all_weeks aw
  ),
  merged AS (
    SELECT
      g.crop_year,
      g.grain_week,
      COALESCE(cd.kt, 0) AS deliveries_kt,
      COALESCE(r.kt, 0) AS receipts_kt,
      COALESCE(e.kt, 0) AS exports_kt,
      COALESCE(p.kt, 0) AS processing_kt
    FROM grid g
    LEFT JOIN combined_deliveries cd ON g.crop_year = cd.crop_year AND g.grain_week = cd.grain_week
    LEFT JOIN receipts r ON g.crop_year = r.crop_year AND g.grain_week = r.grain_week
    LEFT JOIN exports e ON g.crop_year = e.crop_year AND g.grain_week = e.grain_week
    LEFT JOIN processing p ON g.crop_year = p.crop_year AND g.grain_week = p.grain_week
  )
  SELECT
    m.grain_week::int,
    ROUND(AVG(m.deliveries_kt)::numeric, 1) AS avg_deliveries_kt,
    ROUND(AVG(m.receipts_kt)::numeric, 1) AS avg_receipts_kt,
    ROUND(AVG(m.exports_kt)::numeric, 1) AS avg_exports_kt,
    ROUND(AVG(m.processing_kt)::numeric, 1) AS avg_processing_kt,
    COUNT(DISTINCT m.crop_year)::int AS years_count
  FROM merged m
  GROUP BY m.grain_week
  ORDER BY m.grain_week;
$$;

GRANT EXECUTE ON FUNCTION get_pipeline_velocity_avg(text, text, int) TO authenticated;
