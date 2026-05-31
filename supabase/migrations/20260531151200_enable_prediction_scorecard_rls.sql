-- Lock prediction_scorecard down to public read-only access.
-- App summaries read this table through the anon Supabase server client, but writes belong to trusted server/collector roles only.

ALTER TABLE public.prediction_scorecard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prediction_scorecard_public_read" ON public.prediction_scorecard;
CREATE POLICY "prediction_scorecard_public_read"
  ON public.prediction_scorecard
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.prediction_scorecard FROM anon, authenticated;
GRANT SELECT ON public.prediction_scorecard TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prediction_scorecard TO service_role;

NOTIFY pgrst, 'reload schema';
