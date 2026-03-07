-- Add gamification column to crop_plans
ALTER TABLE crop_plans ADD COLUMN IF NOT EXISTS volume_left_to_sell_kt numeric DEFAULT 0;

-- Create macro_estimates table
CREATE TABLE IF NOT EXISTS macro_estimates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_year text NOT NULL,
  grain text NOT NULL,
  production_kt numeric NOT NULL,
  carry_over_kt numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(crop_year, grain)
);

ALTER TABLE macro_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Macro estimates are readable by everyone" ON macro_estimates;
CREATE POLICY "Macro estimates are readable by everyone" ON macro_estimates FOR SELECT USING (true);

-- Insert 2025/2026 Production Estimates derived from PrincipleFieldCrops_Nov2025.csv
INSERT INTO macro_estimates (crop_year, grain, production_kt) VALUES
('2025-26', 'Wheat', 39955),
('2025-26', 'Amber Durum', 7135),
('2025-26', 'Canola', 21804),
('2025-26', 'Barley', 9725),
('2025-26', 'Peas', 3934),
('2025-26', 'Oats', 3920),
('2025-26', 'Lentils', 3363),
('2025-26', 'Soybeans', 6793),
('2025-26', 'Flaxseed', 454),
('2025-26', 'Mustard Seed', 140),
('2025-26', 'Canaryseed', 235),
('2025-26', 'Beans', 438),
('2025-26', 'Corn', 14867),
('2025-26', 'Rye', 672),
('2025-26', 'Chick Peas', 482),
('2025-26', 'Sunflower', 69)
ON CONFLICT (crop_year, grain) DO UPDATE SET 
  production_kt = EXCLUDED.production_kt,
  updated_at = now();
