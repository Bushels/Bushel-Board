ALTER TABLE crop_plans
  ADD COLUMN IF NOT EXISTS deliveries jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crop_plans' AND column_name = 'volume_left_to_sell_kt'
  ) THEN
    ALTER TABLE crop_plans ADD COLUMN volume_left_to_sell_kt numeric;
  END IF;
END $$;

COMMENT ON COLUMN crop_plans.deliveries IS 'JSON array of {date, amount_kt, destination?} delivery log entries';
