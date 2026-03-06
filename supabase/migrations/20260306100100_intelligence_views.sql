-- ============================================================
-- Bushel Board: Intelligence Views (Task 4)
-- YoY comparison + supply pipeline for generate-intelligence
-- ============================================================

-- Year-over-year comparison: current crop year vs. prior crop year
-- Returns latest-week CY totals and YoY % changes per grain
CREATE OR REPLACE VIEW v_grain_yoy_comparison AS
WITH latest AS (
  SELECT crop_year, MAX(grain_week) as max_week
  FROM cgc_observations
  WHERE crop_year = (
    SELECT crop_year FROM cgc_observations ORDER BY crop_year DESC LIMIT 1
  )
  GROUP BY crop_year
),
prior_year AS (
  SELECT DISTINCT crop_year
  FROM cgc_observations
  WHERE crop_year < (SELECT crop_year FROM latest)
  ORDER BY crop_year DESC
  LIMIT 1
),
-- Current year CY totals (deliveries, exports, crush)
current_deliveries AS (
  SELECT grain, SUM(ktonnes) as cy_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_week_deliveries AS (
  SELECT grain, SUM(ktonnes) as cw_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Current Week'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
prior_week_deliveries AS (
  SELECT grain, SUM(ktonnes) as pw_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week - 1
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Current Week'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_exports AS (
  SELECT grain, SUM(ktonnes) as cy_exports
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Terminal Exports' AND metric = 'Exports' AND period = 'Crop Year'
    AND grade = 'All grades combined'
  GROUP BY grain
),
current_crush AS (
  SELECT grain, SUM(ktonnes) as cy_crush
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Process' AND metric = 'Milled/Mfg Grain' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_stocks AS (
  SELECT grain, SUM(ktonnes) as commercial_stocks
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Summary' AND metric = 'Stocks' AND period = 'Current Week'
    AND grade = ''
    AND region IN ('Primary Elevators', 'Process Elevators')
  GROUP BY grain
),
prior_stocks AS (
  SELECT grain, SUM(ktonnes) as prev_stocks
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week - 1
    AND worksheet = 'Summary' AND metric = 'Stocks' AND period = 'Current Week'
    AND grade = ''
    AND region IN ('Primary Elevators', 'Process Elevators')
  GROUP BY grain
),
-- Prior year same-week totals for YoY
prior_deliveries AS (
  SELECT grain, SUM(ktonnes) as py_deliveries
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
prior_exports AS (
  SELECT grain, SUM(ktonnes) as py_exports
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Terminal Exports' AND metric = 'Exports' AND period = 'Crop Year'
    AND grade = 'All grades combined'
  GROUP BY grain
),
prior_crush AS (
  SELECT grain, SUM(ktonnes) as py_crush
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Process' AND metric = 'Milled/Mfg Grain' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
)
SELECT
  cd.grain,
  (SELECT crop_year FROM latest) as crop_year,
  (SELECT max_week FROM latest) as grain_week,
  -- Current values
  COALESCE(cd.cy_deliveries, 0) as cy_deliveries_kt,
  COALESCE(cwd.cw_deliveries, 0) as cw_deliveries_kt,
  COALESCE(ce.cy_exports, 0) as cy_exports_kt,
  COALESCE(cc.cy_crush, 0) as cy_crush_kt,
  COALESCE(cs.commercial_stocks, 0) as commercial_stocks_kt,
  -- Week-over-week changes
  CASE WHEN COALESCE(pwd.pw_deliveries, 0) > 0
    THEN ROUND(((cwd.cw_deliveries - pwd.pw_deliveries) / pwd.pw_deliveries * 100)::numeric, 1)
    ELSE NULL END as wow_deliveries_pct,
  COALESCE(cs.commercial_stocks, 0) - COALESCE(ps.prev_stocks, 0) as wow_stocks_change_kt,
  -- Year-over-year
  COALESCE(pd.py_deliveries, 0) as py_deliveries_kt,
  COALESCE(pe.py_exports, 0) as py_exports_kt,
  COALESCE(pc.py_crush, 0) as py_crush_kt,
  CASE WHEN COALESCE(pd.py_deliveries, 0) > 0
    THEN ROUND(((cd.cy_deliveries - pd.py_deliveries) / pd.py_deliveries * 100)::numeric, 1)
    ELSE NULL END as yoy_deliveries_pct,
  CASE WHEN COALESCE(pe.py_exports, 0) > 0
    THEN ROUND(((ce.cy_exports - pe.py_exports) / pe.py_exports * 100)::numeric, 1)
    ELSE NULL END as yoy_exports_pct,
  CASE WHEN COALESCE(pc.py_crush, 0) > 0
    THEN ROUND(((cc.cy_crush - pc.py_crush) / pc.py_crush * 100)::numeric, 1)
    ELSE NULL END as yoy_crush_pct
FROM current_deliveries cd
LEFT JOIN current_week_deliveries cwd ON cd.grain = cwd.grain
LEFT JOIN prior_week_deliveries pwd ON cd.grain = pwd.grain
LEFT JOIN current_exports ce ON cd.grain = ce.grain
LEFT JOIN current_crush cc ON cd.grain = cc.grain
LEFT JOIN current_stocks cs ON cd.grain = cs.grain
LEFT JOIN prior_stocks ps ON cd.grain = ps.grain
LEFT JOIN prior_deliveries pd ON cd.grain = pd.grain
LEFT JOIN prior_exports pe ON cd.grain = pe.grain
LEFT JOIN prior_crush pc ON cd.grain = pc.grain;

-- Supply pipeline: AAFC supply minus CY deliveries = estimated on-farm
CREATE OR REPLACE VIEW v_supply_pipeline AS
SELECT
  sd.grain_slug,
  sd.crop_year,
  sd.production_kt,
  sd.carry_in_kt,
  COALESCE(sd.production_kt, 0) + COALESCE(sd.carry_in_kt, 0) + COALESCE(sd.imports_kt, 0) as total_supply_kt,
  sd.exports_kt as projected_exports_kt,
  sd.food_industrial_kt as projected_crush_kt,
  sd.carry_out_kt as projected_carry_out_kt,
  g.name as grain_name
FROM supply_disposition sd
JOIN grains g ON g.slug = sd.grain_slug;
