-- Public users can read intraday quotes; only service-role collectors write.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.grain_price_intraday
  FROM anon, authenticated;

GRANT SELECT
  ON public.grain_price_intraday
  TO anon, authenticated;

GRANT ALL
  ON public.grain_price_intraday
  TO service_role;

NOTIFY pgrst, 'reload schema';
