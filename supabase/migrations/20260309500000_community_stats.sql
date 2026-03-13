-- Community stats: aggregate metrics for social proof
-- Acres from crop_plans, tonnes from CGC observations (national deliveries)
CREATE MATERIALIZED VIEW v_community_stats AS
SELECT
  cp.total_acres,
  COALESCE(obs.total_tonnes, 0) AS total_tonnes,
  cp.grain_count,
  cp.farmer_count
FROM (
  SELECT
    COALESCE(SUM(acres_seeded), 0) AS total_acres,
    COUNT(DISTINCT grain) AS grain_count,
    COUNT(DISTINCT user_id) AS farmer_count
  FROM crop_plans
  WHERE crop_year = '2025-26'
) cp
CROSS JOIN (
  SELECT SUM(ktonnes) * 1000 AS total_tonnes
  FROM cgc_observations
  WHERE crop_year = '2025-26'
    AND metric = 'Primary Elevator Receipts'
    AND period = 'Cumulative to Date'
    AND grade = 'All grades combined'
    AND region = 'Canada'
    AND grain_week = (
      SELECT MAX(grain_week) FROM cgc_observations WHERE crop_year = '2025-26'
    )
) obs;

-- Function to read stats (RLS-safe wrapper)
CREATE OR REPLACE FUNCTION get_community_stats()
RETURNS TABLE (total_acres numeric, total_tonnes numeric, grain_count bigint, farmer_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT total_acres, total_tonnes, grain_count, farmer_count
  FROM v_community_stats;
$$;

-- Function to refresh (called by import-cgc-weekly)
CREATE OR REPLACE FUNCTION refresh_community_stats()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW v_community_stats;
$$;
