-- Restrict CAD price recalculation to service-role collectors.
--
-- This function updates grain_prices. It is used by collector scripts with the
-- service-role key and should not be executable by normal authenticated users.

REVOKE ALL ON FUNCTION public.recalculate_grain_prices_cad(date, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recalculate_grain_prices_cad(date, date)
  TO service_role;

COMMENT ON FUNCTION public.recalculate_grain_prices_cad(date, date) IS
  'Backfills CAD-equivalent grain_prices.cad_price. Uses latest USD/CAD rate on or before the price date for USD contracts; CAD contracts pass through. Service-role collectors only.';

NOTIFY pgrst, 'reload schema';
