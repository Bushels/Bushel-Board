-- Migration: crop_acreage_estimates
-- Annual planted-acres estimates per (country, region, commodity, market_year)
-- Sourced from USDA NASS (US: Prospective Plantings + Acreage) and, when wired,
-- StatsCan FCS (CA: principal field crop intentions / June estimates / etc).
--
-- Why annual + per-region: this is a cross-cutting context table that powers
-- the /seeding card badges ("25% planted of 13.2M ac") and the focus-map
-- tooltip ("Iowa Corn — 28% planted of 13.4M ac, ~3.7M ac in"). It is NOT a
-- weekly time-series — that's what usda_crop_progress is for. Different shape,
-- different lifecycle.
--
-- Schema is generic enough that CA provinces drop in unchanged once the
-- StatsCan importer lands (separate workstream).

CREATE TABLE IF NOT EXISTS crop_acreage_estimates (
  id              bigserial PRIMARY KEY,
  country         text      NOT NULL CHECK (country IN ('US', 'CA')),
  region          text      NOT NULL,
  region_code     text      NOT NULL,
  commodity       text      NOT NULL,
  cgc_grain       text,
  market_year     smallint  NOT NULL,
  planted_acres   numeric,
  source_program  text      NOT NULL,
  source_release_date date,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, region_code, commodity, market_year, source_program)
);

CREATE INDEX IF NOT EXISTS idx_crop_acreage_lookup
  ON crop_acreage_estimates (country, commodity, market_year, region_code);

CREATE INDEX IF NOT EXISTS idx_crop_acreage_us_total
  ON crop_acreage_estimates (commodity, market_year)
  WHERE region_code = 'US TOTAL';

ALTER TABLE crop_acreage_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crop_acreage_estimates_select_all"
  ON crop_acreage_estimates
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE crop_acreage_estimates IS
  'Annual planted-acres estimates per (country, region, commodity, market_year). Sourced from USDA NASS Prospective Plantings / Acreage and StatsCan FCS. Latest source_program per (country, region, commodity, market_year) wins for display; full history retained.';

-- ────────────────────────────────────────────────────────────────────
-- Extend get_seeding_seismograph to JOIN per-state acreage. The RPC now
-- returns an additional planted_acres column. Most-recent source_program
-- wins per state via DISTINCT ON ordered by source_release_date DESC.
-- ────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_seeding_seismograph(text, smallint);

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
  ge_pct_yoy_change  numeric,
  planted_acres   numeric
)
LANGUAGE sql STABLE AS $$
  WITH latest_acreage AS (
    SELECT DISTINCT ON (region_code)
      region_code,
      planted_acres
    FROM crop_acreage_estimates
    WHERE country = 'US'
      AND commodity = p_commodity
      AND market_year = p_market_year
    ORDER BY region_code, source_release_date DESC NULLS LAST, imported_at DESC
  )
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
    p.ge_pct_yoy_change,
    a.planted_acres
  FROM usda_crop_progress p
  JOIN us_state_centroids c
    ON UPPER(c.state_name) = UPPER(p.state)
  LEFT JOIN latest_acreage a
    ON a.region_code = c.state_code
  WHERE p.commodity = p_commodity
    AND EXTRACT(YEAR FROM p.week_ending)::smallint = p_market_year
    AND c.is_grain_belt = true
  ORDER BY c.state_code, p.week_ending;
$$;

GRANT EXECUTE ON FUNCTION get_seeding_seismograph(text, smallint) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
-- New helper: get_us_total_acreage(commodity, market_year)
-- Returns the latest (by release date) US TOTAL planted_acres for a
-- commodity. Used by the small-multiples card badge.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_us_total_acreage(
  p_commodity text,
  p_market_year smallint
)
RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT planted_acres
  FROM crop_acreage_estimates
  WHERE country = 'US'
    AND commodity = p_commodity
    AND market_year = p_market_year
    AND region_code = 'US TOTAL'
  ORDER BY source_release_date DESC NULLS LAST, imported_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_us_total_acreage(text, smallint) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
