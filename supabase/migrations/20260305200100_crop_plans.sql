-- Crop plans: tracks which grains a farmer grows and their acreage
-- Drop any pre-existing crop_plans table from prior iterations
DROP TABLE IF EXISTS crop_plans CASCADE;

CREATE TABLE crop_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  crop_year text NOT NULL,
  grain text NOT NULL,
  acres_seeded int NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, crop_year, grain)
);

CREATE INDEX IF NOT EXISTS idx_crop_plans_user_year ON crop_plans(user_id, crop_year);

ALTER TABLE crop_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own crop plans"
  ON crop_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crop plans"
  ON crop_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crop plans"
  ON crop_plans FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own crop plans"
  ON crop_plans FOR DELETE USING (auth.uid() = user_id);
