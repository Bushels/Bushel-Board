-- RPC: get_historical_average
-- Returns 5-year (configurable) average, min, max, stddev for a given grain/metric/worksheet at a specific grain_week
-- Used by analyze-market-data Edge Function for historical context
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
  WITH yearly_values AS (
    SELECT
      crop_year,
      SUM(ktonnes) AS total_kt
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
      AND grain_week = p_grain_week
      AND period = 'Crop Year'
      AND grade = ''
      AND crop_year != (
        -- Exclude current crop year
        CASE WHEN EXTRACT(MONTH FROM now()) >= 8
          THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
          ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
        END
      )
    GROUP BY crop_year
    ORDER BY crop_year DESC
    LIMIT p_years_back
  )
  SELECT jsonb_build_object(
    'avg_value', ROUND(AVG(total_kt)::numeric, 1),
    'min_value', ROUND(MIN(total_kt)::numeric, 1),
    'max_value', ROUND(MAX(total_kt)::numeric, 1),
    'stddev', ROUND(COALESCE(STDDEV(total_kt), 0)::numeric, 1),
    'years_count', COUNT(*),
    'values_by_year', jsonb_object_agg(crop_year, ROUND(total_kt::numeric, 1))
  )
  FROM yearly_values;
$$;

GRANT EXECUTE ON FUNCTION get_historical_average(text, text, text, integer, integer) TO authenticated;

-- RPC: get_seasonal_pattern
-- Returns weekly aggregates across historical years for a given grain/metric
-- Used for seasonal pattern analysis
CREATE OR REPLACE FUNCTION get_seasonal_pattern(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH weekly_data AS (
    SELECT
      grain_week,
      crop_year,
      SUM(ktonnes) AS total_kt
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
      AND period = 'Crop Year'
      AND grade = ''
      AND crop_year != (
        CASE WHEN EXTRACT(MONTH FROM now()) >= 8
          THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
          ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
        END
      )
    GROUP BY grain_week, crop_year
    ORDER BY crop_year DESC
  ),
  recent_years AS (
    SELECT DISTINCT crop_year FROM weekly_data
    ORDER BY crop_year DESC LIMIT p_years_back
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'grain_week', wd.grain_week,
      'avg_value', ROUND(AVG(wd.total_kt)::numeric, 1),
      'min_value', ROUND(MIN(wd.total_kt)::numeric, 1),
      'max_value', ROUND(MAX(wd.total_kt)::numeric, 1)
    ) ORDER BY wd.grain_week
  ), '[]'::jsonb)
  FROM weekly_data wd
  JOIN recent_years ry ON wd.crop_year = ry.crop_year
  GROUP BY wd.grain_week;
$$;

GRANT EXECUTE ON FUNCTION get_seasonal_pattern(text, text, text, integer) TO authenticated;

-- RPC: get_week_percentile
-- Returns where the current week's value sits vs historical distribution
-- Used by analyze-market-data for percentile-based context
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
  WITH yearly_values AS (
    SELECT
      crop_year,
      SUM(ktonnes) AS total_kt
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
      AND grain_week = p_grain_week
      AND period = 'Crop Year'
      AND grade = ''
      AND crop_year != (
        CASE WHEN EXTRACT(MONTH FROM now()) >= 8
          THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
          ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
        END
      )
    GROUP BY crop_year
    ORDER BY crop_year DESC
    LIMIT p_years_back
  )
  SELECT jsonb_build_object(
    'percentile', ROUND(
      (SELECT COUNT(*)::numeric FROM yearly_values WHERE total_kt <= p_current_value)
      / GREATEST(1, (SELECT COUNT(*) FROM yearly_values))
      * 100, 1
    ),
    'years_above', (SELECT COUNT(*) FROM yearly_values WHERE total_kt > p_current_value),
    'years_below', (SELECT COUNT(*) FROM yearly_values WHERE total_kt <= p_current_value),
    'years_count', (SELECT COUNT(*) FROM yearly_values)
  );
$$;

GRANT EXECUTE ON FUNCTION get_week_percentile(text, text, text, integer, numeric, integer) TO authenticated;
