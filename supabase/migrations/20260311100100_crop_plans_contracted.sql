-- Add contracted/uncontracted split to crop plans
-- contracted_kt = volume committed to buyers but not yet delivered
-- uncontracted_kt = volume available for spot sale
-- Total remaining = contracted_kt + uncontracted_kt
-- Deliveries reduce total remaining inventory regardless of contract status
ALTER TABLE crop_plans
  ADD COLUMN IF NOT EXISTS contracted_kt numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uncontracted_kt numeric DEFAULT 0;

COMMENT ON COLUMN crop_plans.contracted_kt IS 'Volume contracted with buyers (kilotonnes), not yet delivered';
COMMENT ON COLUMN crop_plans.uncontracted_kt IS 'Volume uncontracted/open for spot sale (kilotonnes)';

-- Backfill: existing rows had no contract info, so all remaining volume is uncontracted
UPDATE crop_plans
  SET uncontracted_kt = COALESCE(volume_left_to_sell_kt, 0),
      contracted_kt = 0
  WHERE uncontracted_kt = 0 AND contracted_kt = 0
    AND COALESCE(volume_left_to_sell_kt, 0) > 0;
