-- Per-grain weekly terminal flow (receipts vs exports)
CREATE OR REPLACE FUNCTION public.get_weekly_terminal_flow(
  p_grain text,
  p_crop_year text DEFAULT '2025-2026'
)
RETURNS TABLE (
  grain_week smallint,
  week_ending_date date,
  terminal_receipts_kt numeric,
  exports_kt numeric,
  net_flow_kt numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH receipts AS (
    SELECT grain_week, MIN(week_ending_date::date) AS week_ending_date,
           SUM(ktonnes) AS terminal_receipts_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Receipts'
      AND metric = 'Receipts'
      AND period = 'Current Week'
      AND grain = p_grain
      AND crop_year = p_crop_year
    GROUP BY grain_week
  ),
  exports AS (
    SELECT grain_week,
           SUM(ktonnes) AS exports_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Exports'
      AND metric = 'Exports'
      AND period = 'Current Week'
      AND grain = p_grain
      AND crop_year = p_crop_year
    GROUP BY grain_week
  )
  SELECT
    COALESCE(r.grain_week, e.grain_week)::smallint AS grain_week,
    r.week_ending_date,
    COALESCE(r.terminal_receipts_kt, 0) AS terminal_receipts_kt,
    COALESCE(e.exports_kt, 0) AS exports_kt,
    COALESCE(r.terminal_receipts_kt, 0) - COALESCE(e.exports_kt, 0) AS net_flow_kt
  FROM receipts r
  FULL OUTER JOIN exports e ON r.grain_week = e.grain_week
  ORDER BY grain_week;
$$;

-- System-wide aggregate (all grains) for Overview sparkline
CREATE OR REPLACE FUNCTION public.get_aggregate_terminal_flow(
  p_crop_year text DEFAULT '2025-2026'
)
RETURNS TABLE (
  grain_week smallint,
  terminal_receipts_kt numeric,
  exports_kt numeric,
  net_flow_kt numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH receipts AS (
    SELECT grain_week,
           SUM(ktonnes) AS terminal_receipts_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Receipts'
      AND metric = 'Receipts'
      AND period = 'Current Week'
      AND crop_year = p_crop_year
    GROUP BY grain_week
  ),
  exports AS (
    SELECT grain_week,
           SUM(ktonnes) AS exports_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Exports'
      AND metric = 'Exports'
      AND period = 'Current Week'
      AND crop_year = p_crop_year
    GROUP BY grain_week
  )
  SELECT
    COALESCE(r.grain_week, e.grain_week)::smallint AS grain_week,
    COALESCE(r.terminal_receipts_kt, 0) AS terminal_receipts_kt,
    COALESCE(e.exports_kt, 0) AS exports_kt,
    COALESCE(r.terminal_receipts_kt, 0) - COALESCE(e.exports_kt, 0) AS net_flow_kt
  FROM receipts r
  FULL OUTER JOIN exports e ON r.grain_week = e.grain_week
  ORDER BY grain_week;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_weekly_terminal_flow(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_terminal_flow(text) TO authenticated, anon;
