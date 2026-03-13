-- =============================================================================
-- Fix crop year format standardization and historical RPC bugs
-- =============================================================================
-- Problems addressed:
-- 1. Intelligence tables use short format "2025-26" but cgc_observations uses
--    long format "2025-2026". Standardize everything to long format.
-- 2. get_historical_average() queries Primary-only for deliveries, but the YoY
--    view uses Primary+Process. Creates apples-to-oranges comparison for crush-
--    heavy grains like Canola (~31% goes directly to processors).
-- 3. get_seasonal_pattern() has a GROUP BY that produces multiple rows for a
--    RETURNS jsonb scalar function — any caller would get a runtime error.
-- =============================================================================

-- ── Step 1: Migrate short-format crop_year to long format ──────────────────

-- Helper: "2025-26" → "2025-2026"
CREATE OR REPLACE FUNCTION _migrate_crop_year(short_cy text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN short_cy ~ '^\d{4}-\d{4}$' THEN short_cy  -- already long format
    WHEN short_cy ~ '^\d{4}-\d{2}$' THEN
      split_part(short_cy, '-', 1) || '-' || (split_part(short_cy, '-', 1)::int + 1)::text
    ELSE short_cy  -- unknown format, leave as-is
  END;
$$;

UPDATE grain_intelligence SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE x_market_signals SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE farm_summaries SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE crop_plans SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE grain_sentiment_votes SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE signal_feedback SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE supply_disposition SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';
UPDATE market_analysis SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ '^\d{4}-\d{2}$';

-- Also update signal_scan_log if it has crop_year
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signal_scan_log' AND column_name = 'crop_year') THEN
    EXECUTE 'UPDATE signal_scan_log SET crop_year = _migrate_crop_year(crop_year) WHERE crop_year ~ ''^\d{4}-\d{2}$''';
  END IF;
END $$;

-- Clean up helper
DROP FUNCTION _migrate_crop_year(text);


-- ── Step 2: Fix get_historical_average — support Primary+Process deliveries ──
-- For metric='Deliveries', we now SUM across both Primary and Process worksheets
-- to match the v_grain_yoy_comparison view's FULL OUTER JOIN approach.

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
  WITH current_cy AS (
    SELECT CASE WHEN EXTRACT(MONTH FROM now()) >= 8
      THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
      ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
    END AS crop_year
  ),
  yearly_values AS (
    SELECT
      o.crop_year,
      SUM(o.ktonnes) AS total_kt
    FROM cgc_observations o, current_cy c
    WHERE o.grain = p_grain
      AND o.grain_week = p_grain_week
      AND o.period = 'Crop Year'
      AND o.grade = ''
      AND o.crop_year != c.crop_year
      -- For Deliveries: combine Primary + Process worksheets (like v_grain_yoy_comparison)
      -- For other metrics: use the specified worksheet only
      AND CASE
        WHEN p_metric = 'Deliveries' AND p_worksheet = 'Primary'
          THEN o.worksheet IN ('Primary', 'Process')
               AND o.metric IN ('Deliveries', 'Producer Deliveries')
        ELSE o.worksheet = p_worksheet AND o.metric = p_metric
      END
    GROUP BY o.crop_year
    ORDER BY o.crop_year DESC
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


-- ── Step 3: Fix get_seasonal_pattern — wrap in subquery for scalar return ──

CREATE OR REPLACE FUNCTION get_seasonal_pattern(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH current_cy AS (
    SELECT CASE WHEN EXTRACT(MONTH FROM now()) >= 8
      THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
      ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
    END AS crop_year
  ),
  weekly_data AS (
    SELECT
      o.grain_week,
      o.crop_year,
      SUM(o.ktonnes) AS total_kt
    FROM cgc_observations o, current_cy c
    WHERE o.grain = p_grain
      AND o.metric = p_metric
      AND o.worksheet = p_worksheet
      AND o.period = 'Crop Year'
      AND o.grade = ''
      AND o.crop_year != c.crop_year
    GROUP BY o.grain_week, o.crop_year
  ),
  recent_years AS (
    SELECT DISTINCT crop_year FROM weekly_data
    ORDER BY crop_year DESC LIMIT p_years_back
  ),
  weekly_agg AS (
    SELECT
      wd.grain_week,
      ROUND(AVG(wd.total_kt)::numeric, 1) AS avg_value,
      ROUND(MIN(wd.total_kt)::numeric, 1) AS min_value,
      ROUND(MAX(wd.total_kt)::numeric, 1) AS max_value
    FROM weekly_data wd
    JOIN recent_years ry ON wd.crop_year = ry.crop_year
    GROUP BY wd.grain_week
    ORDER BY wd.grain_week
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'grain_week', grain_week,
      'avg_value', avg_value,
      'min_value', min_value,
      'max_value', max_value
    ) ORDER BY grain_week),
    '[]'::jsonb
  )
  FROM weekly_agg;
$$;


-- ── Step 4: Fix get_week_percentile — also support Primary+Process ──

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
  WITH current_cy AS (
    SELECT CASE WHEN EXTRACT(MONTH FROM now()) >= 8
      THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
      ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
    END AS crop_year
  ),
  yearly_values AS (
    SELECT
      o.crop_year,
      SUM(o.ktonnes) AS total_kt
    FROM cgc_observations o, current_cy c
    WHERE o.grain = p_grain
      AND o.grain_week = p_grain_week
      AND o.period = 'Crop Year'
      AND o.grade = ''
      AND o.crop_year != c.crop_year
      AND CASE
        WHEN p_metric = 'Deliveries' AND p_worksheet = 'Primary'
          THEN o.worksheet IN ('Primary', 'Process')
               AND o.metric IN ('Deliveries', 'Producer Deliveries')
        ELSE o.worksheet = p_worksheet AND o.metric = p_metric
      END
    GROUP BY o.crop_year
    ORDER BY o.crop_year DESC
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
