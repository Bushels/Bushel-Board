-- Migration: get_seeding_seismograph RPC
-- Returns per-(state, week) rows shaped for the /seeding map glyph.
-- ~480 rows for a full season (15 states x 32 weeks). Well under PostgREST 1000-row cap.

CREATE OR REPLACE FUNCTION get_seeding_seismograph(
  p_commodity text,
  p_market_year smallint
)
RETURNS TABLE (
  state_code      text,
  state_name      text,
  centroid_lng    numeric,
  centroid_lat    numeric,
  week_ending     date,
  planted_pct     numeric,
  emerged_pct     numeric,
  harvested_pct   numeric,
  planted_pct_vs_avg numeric,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change  numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.state_code,
    c.state_name,
    c.centroid_lng,
    c.centroid_lat,
    p.week_ending,
    p.planted_pct,
    p.emerged_pct,
    p.harvested_pct,
    p.planted_pct_vs_avg,
    p.good_excellent_pct,
    p.condition_index,
    p.ge_pct_yoy_change
  FROM usda_crop_progress p
  JOIN us_state_centroids c
    ON UPPER(c.state_name) = UPPER(p.state)
  WHERE p.commodity = p_commodity
    AND EXTRACT(YEAR FROM p.week_ending)::smallint = p_market_year
    AND c.is_grain_belt = true
  ORDER BY c.state_code, p.week_ending;
$$;

GRANT EXECUTE ON FUNCTION get_seeding_seismograph(text, smallint) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
