-- Add role column to profiles for farmer/observer distinction
-- Observers can browse dashboards but cannot vote, add crops, or log deliveries
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'farmer'
  CHECK (role IN ('farmer', 'observer'));

-- Index for aggregate queries that filter by role
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Update handle_new_user() to read role from auth.users raw_user_meta_data
-- The signup page passes role via signUp({ options: { data: { role } } })
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'farmer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
