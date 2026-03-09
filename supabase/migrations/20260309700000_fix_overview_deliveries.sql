-- ============================================================
-- Fix v_grain_overview: include direct-to-processor deliveries
-- Issue: cy_deliveries_kt, cw_deliveries_kt, prev_deliveries_kt
-- only counted Primary Elevator intake, missing ~44% for canola
-- and other oilseeds that go direct to processors.
-- ============================================================

-- First, update v_grain_deliveries to UNION both delivery pathways.
-- Primary Elevator deliveries have regional breakdown (AB, SK, MB).
-- Process Producer Deliveries are national only (region = '').
-- We keep them separate since downstream queries filter by region.
CREATE OR REPLACE VIEW v_grain_deliveries AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  period,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Primary'
  AND metric = 'Deliveries';

-- Now fix v_grain_overview to include Process.Producer Deliveries
-- alongside Primary.Deliveries. The process deliveries have region=''
-- (national total), so they need separate CTEs that don't filter by region.
CREATE OR REPLACE VIEW v_grain_overview AS
WITH latest_week AS (
  SELECT MAX(grain_week) AS max_week, crop_year
  FROM cgc_observations
  GROUP BY crop_year
  ORDER BY crop_year DESC
  LIMIT 1
),
-- Primary elevator deliveries (provincial: AB, SK, MB)
cy_primary AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Crop Year'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
-- Direct-to-processor deliveries (national total, region='')
cy_process AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM cgc_observations
  CROSS JOIN latest_week lw
  WHERE worksheet = 'Process'
    AND metric = 'Producer Deliveries'
    AND period = 'Crop Year'
    AND cgc_observations.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND grade = ''
  GROUP BY grain
),
-- Combined crop-year deliveries
cy_deliveries AS (
  SELECT
    COALESCE(p.grain, pr.grain) AS grain,
    COALESCE(p.kt, 0) + COALESCE(pr.kt, 0) AS cy_deliveries_kt
  FROM cy_primary p
  FULL OUTER JOIN cy_process pr ON p.grain = pr.grain
),
-- Current week: primary elevator
cw_primary AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
-- Current week: direct-to-processor
cw_process AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM cgc_observations
  CROSS JOIN latest_week lw
  WHERE worksheet = 'Process'
    AND metric = 'Producer Deliveries'
    AND period = 'Current Week'
    AND cgc_observations.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND grade = ''
  GROUP BY grain
),
cw_deliveries AS (
  SELECT
    COALESCE(p.grain, pr.grain) AS grain,
    COALESCE(p.kt, 0) + COALESCE(pr.kt, 0) AS cw_deliveries_kt
  FROM cw_primary p
  FULL OUTER JOIN cw_process pr ON p.grain = pr.grain
),
-- Previous week: primary elevator
prev_primary AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week - 1
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
-- Previous week: direct-to-processor
prev_process AS (
  SELECT grain, SUM(ktonnes) AS kt
  FROM cgc_observations
  CROSS JOIN latest_week lw
  WHERE worksheet = 'Process'
    AND metric = 'Producer Deliveries'
    AND period = 'Current Week'
    AND cgc_observations.crop_year = lw.crop_year
    AND grain_week = lw.max_week - 1
    AND grade = ''
  GROUP BY grain
),
prev_deliveries AS (
  SELECT
    COALESCE(p.grain, pr.grain) AS grain,
    COALESCE(p.kt, 0) + COALESCE(pr.kt, 0) AS prev_deliveries_kt
  FROM prev_primary p
  FULL OUTER JOIN prev_process pr ON p.grain = pr.grain
)
SELECT
  g.name AS grain,
  g.slug,
  g.display_order,
  COALESCE(cy.cy_deliveries_kt, 0) AS cy_deliveries_kt,
  COALESCE(cw.cw_deliveries_kt, 0) AS cw_deliveries_kt,
  COALESCE(prev.prev_deliveries_kt, 0) AS prev_deliveries_kt,
  CASE
    WHEN COALESCE(prev.prev_deliveries_kt, 0) > 0
    THEN ROUND(((cw.cw_deliveries_kt - prev.prev_deliveries_kt) / prev.prev_deliveries_kt * 100)::numeric, 1)
    ELSE 0
  END AS wow_pct_change
FROM grains g
LEFT JOIN cy_deliveries cy ON cy.grain = g.name
LEFT JOIN cw_deliveries cw ON cw.grain = g.name
LEFT JOIN prev_deliveries prev ON prev.grain = g.name
WHERE g.category = 'Canadian'
ORDER BY g.display_order;
