ALTER TABLE usda_crop_progress
  DROP CONSTRAINT IF EXISTS usda_crop_progress_commodity_state_week_ending_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usda_crop_progress_unique_v2
  ON usda_crop_progress (market_name, commodity, class_desc, week_ending, statisticcat_desc, unit_desc, location_desc);
