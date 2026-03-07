-- Fix overly permissive profile INSERT policy
-- Previous: WITH CHECK (true) allowed any user to insert profiles for other users
-- Fixed: WITH CHECK (auth.uid() = id) restricts inserts to own profile only

DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
