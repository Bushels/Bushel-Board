-- Add is_approximate flag for grains with estimated carry-over values
ALTER TABLE supply_disposition
  ADD COLUMN IF NOT EXISTS is_approximate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN supply_disposition.is_approximate
  IS 'True when carry-in or production values are approximate (~) estimates, not confirmed figures';
