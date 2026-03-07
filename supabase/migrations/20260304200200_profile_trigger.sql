-- Profile auto-creation trigger
-- Automatically creates a row in the profiles table when a new user signs up
-- via Supabase Auth (magic link or any other provider).
--
-- NOTE: This migration assumes the profiles table already exists from
-- 001_initial_schema.sql. If the profiles table and trigger were already
-- created there, this migration is a safe no-op due to CREATE OR REPLACE
-- and IF NOT EXISTS.

-- Function: insert a profiles row for each new auth.users row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger first if it exists, then recreate to ensure clean state
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
