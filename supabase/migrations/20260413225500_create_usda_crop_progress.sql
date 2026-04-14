CREATE TABLE IF NOT EXISTS usda_crop_progress (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS crop_year TEXT NOT NULL DEFAULT '';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'US TOTAL';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS market_name TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS commodity TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS class_desc TEXT NOT NULL DEFAULT '';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS statisticcat_desc TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS unit_desc TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS short_desc TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS week_ending DATE;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS report_year INTEGER;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS reference_period_desc TEXT;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS value_pct NUMERIC;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS location_desc TEXT NOT NULL DEFAULT 'US TOTAL';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS agg_level_desc TEXT NOT NULL DEFAULT 'NATIONAL';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'usda_nass_quickstats';
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS nass_load_time TIMESTAMPTZ;
ALTER TABLE usda_crop_progress ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE usda_crop_progress DROP CONSTRAINT IF EXISTS usda_crop_progress_commodity_state_week_ending_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usda_crop_progress_unique
  ON usda_crop_progress (market_name, commodity, class_desc, week_ending, statisticcat_desc, unit_desc, location_desc);

CREATE INDEX IF NOT EXISTS idx_usda_crop_progress_market_week
  ON usda_crop_progress (market_name, week_ending DESC);

CREATE INDEX IF NOT EXISTS idx_usda_crop_progress_commodity_week
  ON usda_crop_progress (commodity, week_ending DESC);

COMMENT ON TABLE usda_crop_progress IS 'USDA NASS QuickStats weekly crop progress and crop condition data for the US thesis track.';
COMMENT ON COLUMN usda_crop_progress.market_name IS 'Normalized thesis market name, e.g. Corn, Soybeans, Winter Wheat, Spring Wheat, Oats.';
COMMENT ON COLUMN usda_crop_progress.statisticcat_desc IS 'Statistic category from NASS, e.g. CONDITION or PROGRESS.';
COMMENT ON COLUMN usda_crop_progress.unit_desc IS 'Unit/metric from NASS, e.g. PCT GOOD, PCT EXCELLENT, PCT PLANTED.';
COMMENT ON COLUMN usda_crop_progress.value_pct IS 'Reported percentage value for the weekly condition/progress metric.';

ALTER TABLE usda_crop_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usda_crop_progress'
      AND policyname = 'Authenticated users can read USDA crop progress'
  ) THEN
    CREATE POLICY "Authenticated users can read USDA crop progress"
      ON usda_crop_progress FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
