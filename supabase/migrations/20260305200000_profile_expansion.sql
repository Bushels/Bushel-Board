-- Expand profiles table for farmer onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farm_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farmer_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_acres int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- Allow service role to insert profiles (for signup flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can insert profiles'
  ) THEN
    CREATE POLICY "Service role can insert profiles"
      ON profiles FOR INSERT
      WITH CHECK (true);
  END IF;
END
$$;
