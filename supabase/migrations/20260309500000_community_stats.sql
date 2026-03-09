-- Community stats: aggregate metrics for social proof
CREATE MATERIALIZED VIEW v_community_stats AS
SELECT
  COALESCE(SUM(acres_seeded), 0) AS total_acres,
  COALESCE(SUM(planned_volume_kt) * 1000, 0) AS total_tonnes,
  COUNT(DISTINCT grain) AS grain_count,
  COUNT(DISTINCT user_id) AS farmer_count
FROM crop_plans
WHERE crop_year = '2025-26';

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
