-- Restore USDA crop progress to canonical weekly rows.
-- This backfills the existing raw QuickStats rows, reinstates the canonical
-- uniqueness guard, and repairs the reader RPC contract.

BEGIN;

DROP INDEX IF EXISTS idx_usda_crop_progress_unique;
DROP INDEX IF EXISTS idx_usda_crop_progress_unique_v2;
ALTER TABLE usda_crop_progress
  DROP CONSTRAINT IF EXISTS usda_crop_progress_commodity_state_week_ending_key;

CREATE TEMP TABLE tmp_usda_crop_progress_canonical
ON COMMIT DROP
AS
WITH raw_rows AS (
  SELECT
    CASE
      WHEN commodity = 'CORN' THEN 'CORN'
      WHEN commodity = 'SOYBEANS' THEN 'SOYBEANS'
      WHEN commodity = 'BARLEY' THEN 'BARLEY'
      WHEN commodity = 'OATS' THEN 'OATS'
      WHEN commodity = 'WHEAT' THEN 'WHEAT'
      ELSE NULL
    END AS commodity,
    CASE
      WHEN commodity = 'CORN' THEN 'Corn'
      WHEN commodity = 'SOYBEANS' THEN 'Soybeans'
      WHEN commodity = 'BARLEY' THEN 'Barley'
      WHEN commodity = 'OATS' THEN 'Oats'
      WHEN commodity = 'WHEAT' THEN 'Wheat'
      ELSE NULL
    END AS cgc_grain,
    COALESCE(NULLIF(state, ''), NULLIF(location_desc, ''), 'US TOTAL') AS state,
    week_ending,
    COALESCE(NULLIF(crop_year::text, ''), NULLIF(report_year::text, ''), EXTRACT(YEAR FROM week_ending)::text)::smallint AS crop_year,
    COALESCE(report_year, EXTRACT(YEAR FROM week_ending)::integer) AS report_year,
    statisticcat_desc,
    unit_desc,
    value_pct,
    COALESCE(nass_load_time, imported_at, now()) AS load_time,
    CASE
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'WINTER' THEN 1
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'SPRING, (EXCL DURUM)' THEN 2
      ELSE 1
    END AS condition_rank,
    CASE
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'SPRING, (EXCL DURUM)' THEN 1
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'WINTER' THEN 2
      ELSE 1
    END AS planting_rank,
    CASE
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'WINTER' THEN 1
      WHEN commodity = 'WHEAT' AND COALESCE(class_desc, '') = 'SPRING, (EXCL DURUM)' THEN 2
      ELSE 1
    END AS progress_rank
  FROM usda_crop_progress
  WHERE week_ending IS NOT NULL
    AND statisticcat_desc IS NOT NULL
    AND unit_desc IS NOT NULL
    AND value_pct IS NOT NULL
    AND commodity IN ('CORN', 'SOYBEANS', 'BARLEY', 'OATS', 'WHEAT')
),
rolled AS (
  SELECT
    commodity,
    cgc_grain,
    state,
    week_ending,
    crop_year,
    MAX(report_year) AS report_year,
    MAX(load_time) AS nass_load_time,
    (ARRAY_AGG(value_pct ORDER BY planting_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT PLANTED'))[1] AS planted_pct,
    (ARRAY_AGG(value_pct ORDER BY planting_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT EMERGED'))[1] AS emerged_pct,
    (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT HEADED'))[1] AS headed_pct,
    (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT BLOOMING'))[1] AS blooming_pct,
    (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT SETTING PODS'))[1] AS setting_pods_pct,
    COALESCE(
      (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT TURNING COLOR'))[1],
      (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT DROPPING LEAVES'))[1]
    ) AS turning_color_pct,
    (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT MATURE'))[1] AS mature_pct,
    (ARRAY_AGG(value_pct ORDER BY progress_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS' AND unit_desc = 'PCT HARVESTED'))[1] AS harvested_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION' AND unit_desc = 'PCT VERY POOR'))[1] AS condition_very_poor_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION' AND unit_desc = 'PCT POOR'))[1] AS condition_poor_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION' AND unit_desc = 'PCT FAIR'))[1] AS condition_fair_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION' AND unit_desc = 'PCT GOOD'))[1] AS condition_good_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION' AND unit_desc = 'PCT EXCELLENT'))[1] AS condition_excellent_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION, PREVIOUS YEAR' AND unit_desc = 'PCT GOOD'))[1] AS prev_good_pct,
    (ARRAY_AGG(value_pct ORDER BY condition_rank) FILTER (WHERE statisticcat_desc = 'CONDITION, PREVIOUS YEAR' AND unit_desc = 'PCT EXCELLENT'))[1] AS prev_excellent_pct,
    (ARRAY_AGG(value_pct ORDER BY planting_rank) FILTER (WHERE statisticcat_desc = 'PROGRESS, 5 YEAR AVG' AND unit_desc = 'PCT PLANTED'))[1] AS planted_pct_5yr_avg
  FROM raw_rows
  WHERE cgc_grain IS NOT NULL
  GROUP BY commodity, cgc_grain, state, week_ending, crop_year
)
SELECT
  cgc_grain AS market_name,
  commodity,
  cgc_grain,
  state,
  week_ending,
  crop_year,
  planted_pct,
  emerged_pct,
  headed_pct,
  blooming_pct,
  setting_pods_pct,
  turning_color_pct,
  mature_pct,
  harvested_pct,
  condition_very_poor_pct,
  condition_poor_pct,
  condition_fair_pct,
  condition_good_pct,
  condition_excellent_pct,
  CASE
    WHEN condition_good_pct IS NOT NULL AND condition_excellent_pct IS NOT NULL
      THEN ROUND((condition_good_pct + condition_excellent_pct)::numeric, 3)
    ELSE NULL
  END AS good_excellent_pct,
  CASE
    WHEN condition_very_poor_pct IS NOT NULL
      AND condition_poor_pct IS NOT NULL
      AND condition_fair_pct IS NOT NULL
      AND condition_good_pct IS NOT NULL
      AND condition_excellent_pct IS NOT NULL
      THEN ROUND((
        (
          condition_very_poor_pct * 1
          + condition_poor_pct * 2
          + condition_fair_pct * 3
          + condition_good_pct * 4
          + condition_excellent_pct * 5
        ) / 100
      )::numeric, 3)
    ELSE NULL
  END AS condition_index,
  CASE
    WHEN condition_good_pct IS NOT NULL
      AND condition_excellent_pct IS NOT NULL
      AND prev_good_pct IS NOT NULL
      AND prev_excellent_pct IS NOT NULL
      THEN ROUND(((condition_good_pct + condition_excellent_pct) - (prev_good_pct + prev_excellent_pct))::numeric, 3)
    ELSE NULL
  END AS ge_pct_yoy_change,
  CASE
    WHEN planted_pct IS NOT NULL AND planted_pct_5yr_avg IS NOT NULL
      THEN ROUND((planted_pct - planted_pct_5yr_avg)::numeric, 3)
    ELSE NULL
  END AS planted_pct_vs_avg,
  'usda_nass_quickstats'::text AS source,
  now() AS imported_at,
  ''::text AS class_desc,
  NULL::text AS statisticcat_desc,
  NULL::text AS unit_desc,
  NULL::text AS short_desc,
  report_year,
  NULL::text AS reference_period_desc,
  NULL::numeric AS value_pct,
  state AS location_desc,
  'NATIONAL'::text AS agg_level_desc,
  nass_load_time
FROM rolled;

DELETE FROM usda_crop_progress
WHERE statisticcat_desc IS NOT NULL
   OR unit_desc IS NOT NULL
   OR value_pct IS NOT NULL
   OR cgc_grain IS NULL;

DELETE FROM usda_crop_progress AS existing
USING tmp_usda_crop_progress_canonical AS canonical
WHERE existing.commodity = canonical.commodity
  AND existing.state = canonical.state
  AND existing.week_ending = canonical.week_ending;

INSERT INTO usda_crop_progress (
  market_name,
  commodity,
  cgc_grain,
  state,
  week_ending,
  crop_year,
  planted_pct,
  emerged_pct,
  headed_pct,
  blooming_pct,
  setting_pods_pct,
  turning_color_pct,
  mature_pct,
  harvested_pct,
  condition_very_poor_pct,
  condition_poor_pct,
  condition_fair_pct,
  condition_good_pct,
  condition_excellent_pct,
  good_excellent_pct,
  condition_index,
  ge_pct_yoy_change,
  planted_pct_vs_avg,
  source,
  imported_at,
  class_desc,
  statisticcat_desc,
  unit_desc,
  short_desc,
  report_year,
  reference_period_desc,
  value_pct,
  location_desc,
  agg_level_desc,
  nass_load_time
)
SELECT
  market_name,
  commodity,
  cgc_grain,
  state,
  week_ending,
  crop_year,
  planted_pct,
  emerged_pct,
  headed_pct,
  blooming_pct,
  setting_pods_pct,
  turning_color_pct,
  mature_pct,
  harvested_pct,
  condition_very_poor_pct,
  condition_poor_pct,
  condition_fair_pct,
  condition_good_pct,
  condition_excellent_pct,
  good_excellent_pct,
  condition_index,
  ge_pct_yoy_change,
  planted_pct_vs_avg,
  source,
  imported_at,
  class_desc,
  statisticcat_desc,
  unit_desc,
  short_desc,
  report_year,
  reference_period_desc,
  value_pct,
  location_desc,
  agg_level_desc,
  nass_load_time
FROM tmp_usda_crop_progress_canonical;

DELETE FROM usda_crop_progress AS dedupe
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY commodity, state, week_ending
      ORDER BY imported_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM usda_crop_progress
) AS ranked
WHERE dedupe.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE usda_crop_progress
  ALTER COLUMN cgc_grain SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'usda_nass_quickstats';

CREATE UNIQUE INDEX idx_usda_crop_progress_canonical_unique
  ON usda_crop_progress (commodity, state, week_ending);

ALTER TABLE usda_crop_progress
  ADD CONSTRAINT usda_crop_progress_commodity_state_week_ending_key
  UNIQUE USING INDEX idx_usda_crop_progress_canonical_unique;

COMMENT ON TABLE usda_crop_progress IS 'USDA NASS weekly crop progress and condition canonical rows for the US thesis track. Source: quickstats.nass.usda.gov';
COMMENT ON COLUMN usda_crop_progress.market_name IS 'Canonical thesis market name, e.g. Corn, Soybeans, Wheat, Barley, Oats.';

CREATE OR REPLACE FUNCTION get_usda_crop_conditions(
  p_cgc_grain text,
  p_weeks_back int DEFAULT 6
)
RETURNS TABLE (
  week_ending date,
  commodity text,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change numeric,
  planted_pct numeric,
  harvested_pct numeric,
  planted_pct_vs_avg numeric
)
LANGUAGE sql STABLE
AS $$
  WITH resolved AS (
    SELECT CASE WHEN p_cgc_grain = 'Canola' THEN 'Soybeans' ELSE p_cgc_grain END AS cgc_grain
  )
  SELECT
    c.week_ending,
    c.commodity,
    c.good_excellent_pct,
    c.condition_index,
    c.ge_pct_yoy_change,
    c.planted_pct,
    c.harvested_pct,
    c.planted_pct_vs_avg
  FROM usda_crop_progress AS c
  CROSS JOIN resolved AS r
  WHERE c.cgc_grain = r.cgc_grain
    AND c.state = 'US TOTAL'
  ORDER BY c.week_ending DESC
  LIMIT p_weeks_back;
$$;

GRANT EXECUTE ON FUNCTION get_usda_crop_conditions(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_usda_crop_conditions(text, int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
