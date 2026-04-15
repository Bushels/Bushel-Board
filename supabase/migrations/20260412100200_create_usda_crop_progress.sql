-- USDA Crop Progress & Condition Reports
-- Source: https://quickstats.nass.usda.gov/api/
-- Updated weekly on Mondays ~4 PM ET during growing season (Apr-Nov)
-- Provides supply-side weather/condition signals for new-crop pricing

CREATE TABLE usda_crop_progress (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity       text NOT NULL,           -- USDA commodity (e.g., 'WHEAT, SPRING', 'CORN', 'SOYBEANS')
  cgc_grain       text,                    -- Mapped CGC grain name
  state           text NOT NULL DEFAULT 'US TOTAL',  -- State or 'US TOTAL'
  week_ending     date NOT NULL,           -- Report week ending (Sunday)
  crop_year       smallint NOT NULL,       -- Planting year (e.g., 2026)

  -- Progress stages (percentage complete)
  planted_pct         numeric,
  emerged_pct         numeric,
  headed_pct          numeric,             -- For wheat/barley
  blooming_pct        numeric,             -- For soybeans
  setting_pods_pct    numeric,             -- For soybeans
  turning_color_pct   numeric,
  mature_pct          numeric,
  harvested_pct       numeric,

  -- Condition ratings (percentage of crop in each category)
  condition_very_poor_pct  numeric,
  condition_poor_pct       numeric,
  condition_fair_pct       numeric,
  condition_good_pct       numeric,
  condition_excellent_pct  numeric,

  -- Computed composites
  good_excellent_pct  numeric,             -- good + excellent (the market-moving number)
  condition_index     numeric,             -- Weighted index: VP=1, P=2, F=3, G=4, E=5, scaled 1-5

  -- Year-over-year comparison (computed at import)
  ge_pct_yoy_change   numeric,             -- good_excellent vs same week last year
  planted_pct_vs_avg  numeric,             -- vs 5-year average pace

  -- Metadata
  source          text DEFAULT 'USDA-NASS',
  imported_at     timestamptz DEFAULT now(),

  UNIQUE (commodity, state, week_ending)
);

-- Indexes for intelligence pipeline
CREATE INDEX idx_crop_progress_cgc_grain ON usda_crop_progress(cgc_grain, week_ending DESC);
CREATE INDEX idx_crop_progress_commodity ON usda_crop_progress(commodity, crop_year, week_ending DESC);

-- RLS
ALTER TABLE usda_crop_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read crop progress"
  ON usda_crop_progress FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert crop progress"
  ON usda_crop_progress FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update crop progress"
  ON usda_crop_progress FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE usda_crop_progress IS 'USDA NASS weekly crop progress & condition — supply-side weather signals for grain pricing. Source: quickstats.nass.usda.gov';

-- RPC: Get latest crop conditions for a grain
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
  SELECT
    c.week_ending,
    c.commodity,
    c.good_excellent_pct,
    c.condition_index,
    c.ge_pct_yoy_change,
    c.planted_pct,
    c.harvested_pct,
    c.planted_pct_vs_avg
  FROM usda_crop_progress c
  WHERE c.cgc_grain = p_cgc_grain
    AND c.state = 'US TOTAL'
  ORDER BY c.week_ending DESC
  LIMIT p_weeks_back;
$$;
