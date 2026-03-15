-- =============================================================================
-- Fix Exports and Commercial Stocks definitions across pipeline RPCs and views
--
-- Bug 1: Exports only counted Terminal Exports, but CGC "Exports" in Summary
--         = Terminal Exports + Primary Shipment Distribution "Export Destinations"
--         This under-reported exports by ~100+ Kt for grains with direct exports.
--
-- Bug 2: Commercial Stocks only counted Primary + Process Elevators, but CGC
--         Total Commercial Stocks includes all terminal locations (Vancouver,
--         Thunder Bay, Prince Rupert, Bay & Lakes, St. Lawrence, Churchill).
--         This under-reported stocks by ~300-500 Kt.
--
-- Affected objects:
--   - get_pipeline_velocity()
--   - get_pipeline_velocity_avg()
--   - v_grain_yoy_comparison
-- =============================================================================

-- 1. Fix get_pipeline_velocity: add PSD Export Destinations to exports
CREATE OR REPLACE FUNCTION public.get_pipeline_velocity(
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
)
LANGUAGE sql
STABLE
AS $$
  WITH deliveries AS (
    SELECT
      vcpd.grain_week,
      MAX(vcpd.week_ending_date::text) AS wed,
      MAX(vcpd.total_kt) AS kt
    FROM public.v_country_producer_deliveries vcpd
    WHERE vcpd.crop_year = p_crop_year
      AND vcpd.grain = p_grain
      AND vcpd.period = 'Crop Year'
    GROUP BY vcpd.grain_week
  ),
  receipts AS (
    SELECT o.grain_week, SUM(o.ktonnes) AS kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain = p_grain
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Crop Year'
    GROUP BY o.grain_week
  ),
  exports AS (
    -- CGC "Exports" = Terminal Exports + PSD Export Destinations (direct exports)
    SELECT o.grain_week, SUM(o.ktonnes) AS kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain = p_grain
      AND o.period = 'Crop Year'
      AND (
        (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
        OR
        (o.worksheet = 'Primary Shipment Distribution'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export Destinations')
      )
    GROUP BY o.grain_week
  ),
  processing AS (
    SELECT o.grain_week, SUM(o.ktonnes) AS kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain = p_grain
      AND o.grade = ''
      AND o.worksheet = 'Process'
      AND o.metric = 'Milled/Mfg Grain'
      AND o.period = 'Crop Year'
    GROUP BY o.grain_week
  ),
  all_weeks AS (
    SELECT DISTINCT grain_week FROM (
      SELECT grain_week FROM deliveries
      UNION SELECT grain_week FROM receipts
      UNION SELECT grain_week FROM exports
      UNION SELECT grain_week FROM processing
    ) w
  )
  SELECT
    aw.grain_week::int,
    COALESCE(d.wed, '')::text AS week_ending_date,
    COALESCE(d.kt, 0) AS producer_deliveries_kt,
    COALESCE(r.kt, 0) AS terminal_receipts_kt,
    COALESCE(e.kt, 0) AS exports_kt,
    COALESCE(p.kt, 0) AS processing_kt
  FROM all_weeks aw
  LEFT JOIN deliveries d ON d.grain_week = aw.grain_week
  LEFT JOIN receipts r ON r.grain_week = aw.grain_week
  LEFT JOIN exports e ON e.grain_week = aw.grain_week
  LEFT JOIN processing p ON p.grain_week = aw.grain_week
  ORDER BY aw.grain_week;
$$;

-- 2. Fix get_pipeline_velocity_avg: add PSD Export Destinations to exports
CREATE OR REPLACE FUNCTION public.get_pipeline_velocity_avg(
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
LANGUAGE sql
STABLE
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
    SELECT vcpd.crop_year, vcpd.grain_week, vcpd.total_kt AS kt
    FROM public.v_country_producer_deliveries vcpd
    WHERE vcpd.grain = p_grain
      AND vcpd.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND vcpd.period = 'Crop Year'
  ),
  receipts AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM public.cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Crop Year'
    GROUP BY o.crop_year, o.grain_week
  ),
  exports AS (
    -- CGC "Exports" = Terminal Exports + PSD Export Destinations
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM public.cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.period = 'Crop Year'
      AND (
        (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
        OR
        (o.worksheet = 'Primary Shipment Distribution'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export Destinations')
      )
    GROUP BY o.crop_year, o.grain_week
  ),
  processing AS (
    SELECT o.crop_year, o.grain_week, o.ktonnes AS kt
    FROM public.cgc_observations o
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
      SELECT grain_week FROM deliveries
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
      COALESCE(d.kt, 0) AS deliveries_kt,
      COALESCE(r.kt, 0) AS receipts_kt,
      COALESCE(e.kt, 0) AS exports_kt,
      COALESCE(p.kt, 0) AS processing_kt
    FROM grid g
    LEFT JOIN deliveries d ON g.crop_year = d.crop_year AND g.grain_week = d.grain_week
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

-- 3. Fix v_grain_yoy_comparison: exports + stocks definitions
CREATE OR REPLACE VIEW public.v_grain_yoy_comparison AS
WITH latest AS (
  SELECT crop_year, MAX(grain_week) AS max_week
  FROM public.cgc_observations
  WHERE crop_year = (
    SELECT crop_year
    FROM public.cgc_observations
    ORDER BY crop_year DESC
    LIMIT 1
  )
  GROUP BY crop_year
),
prior_year AS (
  SELECT DISTINCT crop_year
  FROM public.cgc_observations
  WHERE crop_year < (SELECT crop_year FROM latest)
  ORDER BY crop_year DESC
  LIMIT 1
),
current_deliveries AS (
  SELECT vcpd.grain, vcpd.total_kt AS cy_deliveries
  FROM public.v_country_producer_deliveries vcpd, latest l
  WHERE vcpd.crop_year = l.crop_year
    AND vcpd.grain_week = l.max_week
    AND vcpd.period = 'Crop Year'
),
current_week_deliveries AS (
  SELECT vcpd.grain, vcpd.total_kt AS cw_deliveries
  FROM public.v_country_producer_deliveries vcpd, latest l
  WHERE vcpd.crop_year = l.crop_year
    AND vcpd.grain_week = l.max_week
    AND vcpd.period = 'Current Week'
),
prior_week_deliveries AS (
  SELECT vcpd.grain, vcpd.total_kt AS pw_deliveries
  FROM public.v_country_producer_deliveries vcpd, latest l
  WHERE vcpd.crop_year = l.crop_year
    AND vcpd.grain_week = (l.max_week - 1)
    AND vcpd.period = 'Current Week'
),
current_terminal_receipts AS (
  SELECT o.grain, SUM(o.ktonnes) AS cw_terminal_receipts
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = l.max_week
    AND o.worksheet = 'Terminal Receipts'
    AND o.metric = 'Receipts'
    AND o.period = 'Current Week'
  GROUP BY o.grain
),
cy_terminal_receipts AS (
  SELECT o.grain, SUM(o.ktonnes) AS cy_terminal_receipts
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = l.max_week
    AND o.worksheet = 'Terminal Receipts'
    AND o.metric = 'Receipts'
    AND o.period = 'Crop Year'
  GROUP BY o.grain
),
pw_terminal_receipts AS (
  SELECT o.grain, SUM(o.ktonnes) AS pw_terminal_receipts
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = (l.max_week - 1)
    AND o.worksheet = 'Terminal Receipts'
    AND o.metric = 'Receipts'
    AND o.period = 'Current Week'
  GROUP BY o.grain
),
-- FIX: Total exports = Terminal Exports + PSD Export Destinations
current_exports AS (
  SELECT o.grain, SUM(o.ktonnes) AS cy_exports
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = l.max_week
    AND o.period = 'Crop Year'
    AND (
      (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
      OR
      (o.worksheet = 'Primary Shipment Distribution'
       AND o.metric = 'Shipment Distribution'
       AND o.region = 'Export Destinations')
    )
  GROUP BY o.grain
),
current_crush AS (
  SELECT o.grain, SUM(o.ktonnes) AS cy_crush
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = l.max_week
    AND o.worksheet = 'Process'
    AND o.metric = 'Milled/Mfg Grain'
    AND o.period = 'Crop Year'
    AND o.region = ''
  GROUP BY o.grain
),
-- FIX: Total commercial stocks = ALL Summary Stocks regions (not just Primary+Process)
current_stocks AS (
  SELECT o.grain, SUM(o.ktonnes) AS commercial_stocks
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = l.max_week
    AND o.worksheet = 'Summary'
    AND o.metric = 'Stocks'
    AND o.period = 'Current Week'
    AND o.grade = ''
  GROUP BY o.grain
),
prior_stocks AS (
  SELECT o.grain, SUM(o.ktonnes) AS prev_stocks
  FROM public.cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year
    AND o.grain_week = (l.max_week - 1)
    AND o.worksheet = 'Summary'
    AND o.metric = 'Stocks'
    AND o.period = 'Current Week'
    AND o.grade = ''
  GROUP BY o.grain
),
prior_deliveries AS (
  SELECT vcpd.grain, vcpd.total_kt AS py_deliveries
  FROM public.v_country_producer_deliveries vcpd, latest l, prior_year py
  WHERE vcpd.crop_year = py.crop_year
    AND vcpd.grain_week = l.max_week
    AND vcpd.period = 'Crop Year'
),
-- FIX: Prior year exports also needs PSD Export Destinations
prior_exports AS (
  SELECT o.grain, SUM(o.ktonnes) AS py_exports
  FROM public.cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year
    AND o.grain_week = l.max_week
    AND o.period = 'Crop Year'
    AND (
      (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
      OR
      (o.worksheet = 'Primary Shipment Distribution'
       AND o.metric = 'Shipment Distribution'
       AND o.region = 'Export Destinations')
    )
  GROUP BY o.grain
),
prior_crush AS (
  SELECT o.grain, SUM(o.ktonnes) AS py_crush
  FROM public.cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year
    AND o.grain_week = l.max_week
    AND o.worksheet = 'Process'
    AND o.metric = 'Milled/Mfg Grain'
    AND o.period = 'Crop Year'
    AND o.region = ''
  GROUP BY o.grain
)
SELECT
  cd.grain,
  (SELECT crop_year FROM latest) AS crop_year,
  (SELECT max_week FROM latest) AS grain_week,
  COALESCE(cd.cy_deliveries, 0) AS cy_deliveries_kt,
  COALESCE(cwd.cw_deliveries, 0) AS cw_deliveries_kt,
  COALESCE(ce.cy_exports, 0) AS cy_exports_kt,
  COALESCE(cc.cy_crush, 0) AS cy_crush_kt,
  COALESCE(cs.commercial_stocks, 0) AS commercial_stocks_kt,
  COALESCE(ctr.cw_terminal_receipts, 0) AS cw_terminal_receipts_kt,
  COALESCE(cytr.cy_terminal_receipts, 0) AS cy_terminal_receipts_kt,
  CASE
    WHEN COALESCE(pwd.pw_deliveries, 0) > 0
      THEN ROUND(((COALESCE(cwd.cw_deliveries, 0) - pwd.pw_deliveries) / pwd.pw_deliveries * 100)::numeric, 1)
    ELSE NULL
  END AS wow_deliveries_pct,
  COALESCE(cs.commercial_stocks, 0) - COALESCE(ps.prev_stocks, 0) AS wow_stocks_change_kt,
  CASE
    WHEN COALESCE(pwtr.pw_terminal_receipts, 0) > 0
      THEN ROUND(((COALESCE(ctr.cw_terminal_receipts, 0) - pwtr.pw_terminal_receipts) / pwtr.pw_terminal_receipts * 100)::numeric, 1)
    ELSE NULL
  END AS wow_terminal_receipts_pct,
  COALESCE(pd.py_deliveries, 0) AS py_deliveries_kt,
  COALESCE(pe.py_exports, 0) AS py_exports_kt,
  COALESCE(pc.py_crush, 0) AS py_crush_kt,
  CASE
    WHEN COALESCE(pd.py_deliveries, 0) > 0
      THEN ROUND(((COALESCE(cd.cy_deliveries, 0) - pd.py_deliveries) / pd.py_deliveries * 100)::numeric, 1)
    ELSE NULL
  END AS yoy_deliveries_pct,
  CASE
    WHEN COALESCE(pe.py_exports, 0) > 0
      THEN ROUND(((COALESCE(ce.cy_exports, 0) - pe.py_exports) / pe.py_exports * 100)::numeric, 1)
    ELSE NULL
  END AS yoy_exports_pct,
  CASE
    WHEN COALESCE(pc.py_crush, 0) > 0
      THEN ROUND(((COALESCE(cc.cy_crush, 0) - pc.py_crush) / pc.py_crush * 100)::numeric, 1)
    ELSE NULL
  END AS yoy_crush_pct
FROM current_deliveries cd
LEFT JOIN current_week_deliveries cwd ON cd.grain = cwd.grain
LEFT JOIN prior_week_deliveries pwd ON cd.grain = pwd.grain
LEFT JOIN current_terminal_receipts ctr ON cd.grain = ctr.grain
LEFT JOIN cy_terminal_receipts cytr ON cd.grain = cytr.grain
LEFT JOIN pw_terminal_receipts pwtr ON cd.grain = pwtr.grain
LEFT JOIN current_exports ce ON cd.grain = ce.grain
LEFT JOIN current_crush cc ON cd.grain = cc.grain
LEFT JOIN current_stocks cs ON cd.grain = cs.grain
LEFT JOIN prior_stocks ps ON cd.grain = ps.grain
LEFT JOIN prior_deliveries pd ON cd.grain = pd.grain
LEFT JOIN prior_exports pe ON cd.grain = pe.grain
LEFT JOIN prior_crush pc ON cd.grain = pc.grain;

-- Re-grant permissions (CREATE OR REPLACE preserves grants for functions,
-- but views need no separate grant since they inherit from table permissions)
GRANT EXECUTE ON FUNCTION public.get_pipeline_velocity(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pipeline_velocity_avg(text, text, int) TO authenticated, service_role;
