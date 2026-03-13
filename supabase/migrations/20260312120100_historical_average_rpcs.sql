-- Historical analysis RPCs for analyze-market-data Edge Function
-- NOTE: These are superseded by 20260312130000_fix_crop_year_format_and_rpcs.sql
-- which fixes Primary+Process delivery comparison and seasonal pattern GROUP BY.
-- Kept as no-op to preserve migration history.

-- Original functions created here are replaced by CREATE OR REPLACE in the fix migration.
-- See 20260312130000 for the corrected implementations.

-- RPC: get_historical_average (placeholder — replaced by fix migration)
CREATE OR REPLACE FUNCTION get_historical_average(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_grain_week integer,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT '{}'::jsonb; -- Placeholder, replaced by 20260312130000
$$;

GRANT EXECUTE ON FUNCTION get_historical_average(text, text, text, integer, integer) TO authenticated;

-- RPC: get_seasonal_pattern (placeholder — replaced by fix migration)
CREATE OR REPLACE FUNCTION get_seasonal_pattern(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT '[]'::jsonb; -- Placeholder, replaced by 20260312130000
$$;

GRANT EXECUTE ON FUNCTION get_seasonal_pattern(text, text, text, integer) TO authenticated;

-- RPC: get_week_percentile (placeholder — replaced by fix migration)
CREATE OR REPLACE FUNCTION get_week_percentile(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_grain_week integer,
  p_current_value numeric,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT '{}'::jsonb; -- Placeholder, replaced by 20260312130000
$$;

GRANT EXECUTE ON FUNCTION get_week_percentile(text, text, text, integer, numeric, integer) TO authenticated;
