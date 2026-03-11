-- Crop inventory unit preferences
-- 1. Preserve the farmer's preferred planning unit (metric tonnes, bushels, pounds)
-- 2. Store the bushel weight used for conversions so yield and MT comparisons stay stable

ALTER TABLE public.crop_plans
  ADD COLUMN IF NOT EXISTS inventory_unit_preference text,
  ADD COLUMN IF NOT EXISTS bushel_weight_lbs numeric;

ALTER TABLE public.crop_plans
  ALTER COLUMN inventory_unit_preference SET DEFAULT 'metric_tonnes';

UPDATE public.crop_plans
SET inventory_unit_preference = COALESCE(inventory_unit_preference, 'metric_tonnes')
WHERE inventory_unit_preference IS NULL;

ALTER TABLE public.crop_plans
  ALTER COLUMN inventory_unit_preference SET NOT NULL;

UPDATE public.crop_plans
SET bushel_weight_lbs = CASE grain
  WHEN 'Wheat' THEN 60
  WHEN 'Amber Durum' THEN 60
  WHEN 'Canola' THEN 50
  WHEN 'Barley' THEN 48
  WHEN 'Oats' THEN 34
  WHEN 'Peas' THEN 60
  WHEN 'Lentils' THEN 60
  WHEN 'Flaxseed' THEN 56
  WHEN 'Soybeans' THEN 60
  WHEN 'Corn' THEN 56
  WHEN 'Rye' THEN 56
  WHEN 'Mustard Seed' THEN 50
  WHEN 'Canaryseed' THEN 50
  WHEN 'Chick Peas' THEN 60
  WHEN 'Sunflower' THEN 30
  WHEN 'Sunflower Seed' THEN 30
  WHEN 'Beans' THEN 60
  ELSE 60
END
WHERE bushel_weight_lbs IS NULL;

COMMENT ON COLUMN public.crop_plans.inventory_unit_preference IS
  'Farmer-preferred planning unit for crop amounts: metric_tonnes, bushels, or pounds';

COMMENT ON COLUMN public.crop_plans.bushel_weight_lbs IS
  'Bushel weight in pounds per bushel used when converting bushel-based inventory to metric tonnes';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crop_plans_inventory_unit_preference_check'
  ) THEN
    ALTER TABLE public.crop_plans
      ADD CONSTRAINT crop_plans_inventory_unit_preference_check
      CHECK (inventory_unit_preference IN ('metric_tonnes', 'bushels', 'pounds'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crop_plans_bushel_weight_lbs_check'
  ) THEN
    ALTER TABLE public.crop_plans
      ADD CONSTRAINT crop_plans_bushel_weight_lbs_check
      CHECK (bushel_weight_lbs IS NULL OR bushel_weight_lbs > 0);
  END IF;
END
$$;
