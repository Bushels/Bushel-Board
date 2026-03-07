-- ============================================================
-- Bushel Board MVP: Dashboard SQL Views
-- Task 4 — Views that power the grain dashboard UI
-- ============================================================

-- Primary elevator deliveries by grain, week, and province
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

-- Primary elevator shipments by grain, week, and province
CREATE OR REPLACE VIEW v_grain_shipments AS
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
  AND metric = 'Shipments';

-- Summary stocks by grain and location type
CREATE OR REPLACE VIEW v_grain_stocks AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  period,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Summary'
  AND metric = 'Stocks';

-- Terminal exports by port (current week only)
CREATE OR REPLACE VIEW v_terminal_exports AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  region,
  ktonnes
FROM cgc_observations
WHERE worksheet = 'Terminal Exports'
  AND period = 'Current Week';

-- Shipment distribution (where grain goes: Pacific, Thunder Bay, domestic, etc.)
CREATE OR REPLACE VIEW v_shipment_distribution AS
SELECT
  grain,
  crop_year,
  grain_week,
  week_ending_date,
  worksheet,
  metric,
  period,
  region,
  ktonnes
FROM cgc_observations
WHERE worksheet LIKE '%Shipment Distribution%';

-- Latest import info (for freshness indicator in dashboard header)
CREATE OR REPLACE VIEW v_latest_import AS
SELECT
  grain_week,
  crop_year,
  imported_at,
  rows_inserted,
  status
FROM cgc_imports
WHERE status = 'success'
ORDER BY imported_at DESC
LIMIT 1;

-- Grain overview: latest week summary per grain (powers the all-grains overview table)
-- Computes crop-year deliveries, current-week deliveries, previous-week deliveries,
-- and week-over-week percentage change for each of the 16 Canadian grains.
CREATE OR REPLACE VIEW v_grain_overview AS
WITH latest_week AS (
  SELECT MAX(grain_week) AS max_week, crop_year
  FROM cgc_observations
  GROUP BY crop_year
  ORDER BY crop_year DESC
  LIMIT 1
),
cy_deliveries AS (
  SELECT grain, SUM(ktonnes) AS cy_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Crop Year'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
cw_deliveries AS (
  SELECT grain, SUM(ktonnes) AS cw_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
),
prev_deliveries AS (
  SELECT grain, SUM(ktonnes) AS prev_deliveries_kt
  FROM v_grain_deliveries
  CROSS JOIN latest_week lw
  WHERE period = 'Current Week'
    AND v_grain_deliveries.crop_year = lw.crop_year
    AND grain_week = lw.max_week - 1
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
  GROUP BY grain
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
