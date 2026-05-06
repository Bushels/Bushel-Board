-- Keep the Canola Council inventory boundary explicit:
-- public clients can read inventory metadata, only service-role collectors write.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.canola_council_market_stats_inventory
  FROM anon, authenticated;

GRANT SELECT
  ON public.canola_council_market_stats_inventory
  TO anon, authenticated;

GRANT ALL
  ON public.canola_council_market_stats_inventory
  TO service_role;

NOTIFY pgrst, 'reload schema';
