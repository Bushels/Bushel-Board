-- Migration: enable RLS on us_state_centroids
-- The reference table is read-only after seed and contains no sensitive data,
-- but the project pattern (and Supabase advisor) require RLS on every public
-- table. Permissive SELECT policy for anon + authenticated; no INSERT / UPDATE
-- / DELETE policies, so writes are blocked through the API entirely (only
-- service-role bypasses RLS).

ALTER TABLE us_state_centroids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "us_state_centroids_select_all"
  ON us_state_centroids
  FOR SELECT
  TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
