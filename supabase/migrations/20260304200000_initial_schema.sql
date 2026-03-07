-- ============================================================
-- Bushel Board MVP: Initial Database Schema
-- Task 3 — CGC observations, grains lookup, profiles, audit log
-- ============================================================

-- Drop existing objects from prior project iterations (safe idempotent cleanup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
DROP TABLE IF EXISTS cgc_observations CASCADE;
DROP TABLE IF EXISTS cgc_imports CASCADE;
DROP TABLE IF EXISTS grains CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- CGC observations: raw grain statistics in long format
-- One row per measurement (crop_year × week × worksheet × metric × period × grain × grade × region)
CREATE TABLE cgc_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  week_ending_date date NOT NULL,
  worksheet text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  grain text NOT NULL,
  grade text DEFAULT '',
  region text NOT NULL,
  ktonnes numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),

  -- Idempotent imports: same observation can be upserted safely
  UNIQUE(crop_year, grain_week, worksheet, metric, period, grain, grade, region)
);

-- Performance indexes aligned to dashboard query patterns
CREATE INDEX idx_cgc_obs_grain_week ON cgc_observations(grain, grain_week);
CREATE INDEX idx_cgc_obs_worksheet_metric ON cgc_observations(worksheet, metric);
CREATE INDEX idx_cgc_obs_crop_year ON cgc_observations(crop_year);
CREATE INDEX idx_cgc_obs_period ON cgc_observations(period);
CREATE INDEX idx_cgc_obs_region ON cgc_observations(region);

-- Import audit log — tracks every data load (backfill, weekly Edge Function, integrity check)
CREATE TABLE cgc_imports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_at timestamptz DEFAULT now(),
  crop_year text,
  grain_week int,
  source_file text,
  rows_inserted int DEFAULT 0,
  rows_skipped int DEFAULT 0,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial', 'integrity_check')),
  error_message text
);

-- Grain lookup table for display ordering and slugs (16 primary Canadian grains)
CREATE TABLE grains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  category text DEFAULT 'Canadian' CHECK (category IN ('Canadian', 'Imported', 'US')),
  display_order int DEFAULT 999
);

-- Seed the 16 primary Canadian grains
INSERT INTO grains (name, slug, category, display_order) VALUES
  ('Canola', 'canola', 'Canadian', 1),
  ('Wheat', 'wheat', 'Canadian', 2),
  ('Amber Durum', 'amber-durum', 'Canadian', 3),
  ('Barley', 'barley', 'Canadian', 4),
  ('Oats', 'oats', 'Canadian', 5),
  ('Peas', 'peas', 'Canadian', 6),
  ('Lentils', 'lentils', 'Canadian', 7),
  ('Flaxseed', 'flaxseed', 'Canadian', 8),
  ('Soybeans', 'soybeans', 'Canadian', 9),
  ('Corn', 'corn', 'Canadian', 10),
  ('Rye', 'rye', 'Canadian', 11),
  ('Mustard Seed', 'mustard-seed', 'Canadian', 12),
  ('Canaryseed', 'canaryseed', 'Canadian', 13),
  ('Chick Peas', 'chick-peas', 'Canadian', 14),
  ('Sunflower', 'sunflower', 'Canadian', 15),
  ('Beans', 'beans', 'Canadian', 16);

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  province text CHECK (province IN ('AB', 'SK', 'MB', 'BC', 'ON', NULL)),
  nearest_town text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE cgc_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgc_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE grains ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- CGC data is publicly readable (public dashboard, no auth required to view)
CREATE POLICY "CGC observations are publicly readable"
  ON cgc_observations FOR SELECT
  USING (true);

-- Only service role can insert/update/delete CGC data (Edge Functions + backfill script)
CREATE POLICY "Only service role can insert CGC observations"
  ON cgc_observations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update CGC observations"
  ON cgc_observations FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete CGC observations"
  ON cgc_observations FOR DELETE
  USING (auth.role() = 'service_role');

-- Import log is publicly readable (powers freshness indicator in dashboard header)
CREATE POLICY "CGC imports are publicly readable"
  ON cgc_imports FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify CGC imports"
  ON cgc_imports FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Grains lookup is publicly readable
CREATE POLICY "Grains are publicly readable"
  ON grains FOR SELECT
  USING (true);

-- Profiles: users can only read and update their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
