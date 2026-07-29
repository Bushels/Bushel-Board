-- Public-safe U.S. Canola/rapeseed balance for Canola Command.
-- Raw USDA PSD rows and the broad mapped view remain private to anon. This
-- function exposes at most one common seed-and-oil snapshot from the official
-- U.S. Rapeseed and U.S. Rapeseed Oil series.

REVOKE ALL ON TABLE public.usda_wasde_raw FROM anon;
REVOKE ALL ON TABLE public.usda_wasde_mapped FROM anon;

CREATE OR REPLACE FUNCTION public.get_canola_us_balance(
  p_market_year text DEFAULT NULL
)
RETURNS TABLE (
  report_month date,
  market_year text,
  seed_production_kt numeric,
  seed_imports_kt numeric,
  seed_crush_kt numeric,
  seed_exports_kt numeric,
  seed_domestic_consumption_kt numeric,
  seed_ending_stocks_kt numeric,
  oil_production_kt numeric,
  oil_imports_kt numeric,
  oil_exports_kt numeric,
  oil_domestic_consumption_kt numeric,
  oil_ending_stocks_kt numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH bounded AS (
    SELECT m.*
    FROM public.usda_wasde_mapped AS m
    WHERE m.country_code = 'US'
      AND (
        (
          m.market_name = 'US Rapeseed'
          AND m.commodity_code = '2226000'
        )
        OR
        (
          m.market_name = 'US Rapeseed Oil'
          AND m.commodity_code = '4239100'
        )
      )
  ),
  common_snapshots AS (
    SELECT
      b.report_month,
      b.market_year
    FROM bounded AS b
    WHERE p_market_year IS NULL OR b.market_year = p_market_year
    GROUP BY b.report_month, b.market_year
    HAVING count(DISTINCT b.market_name) = 2
  ),
  target AS (
    SELECT c.report_month, c.market_year
    FROM common_snapshots AS c
    ORDER BY c.report_month DESC, c.market_year DESC
    LIMIT 1
  )
  SELECT
    target.report_month,
    target.market_year,
    max(b.production_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed') AS seed_production_kt,
    max(b.imports_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed') AS seed_imports_kt,
    max(b.crush_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed') AS seed_crush_kt,
    max(b.exports_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed') AS seed_exports_kt,
    max(b.domestic_consumption_kt)
      FILTER (
        WHERE b.market_name = 'US Rapeseed'
      ) AS seed_domestic_consumption_kt,
    max(b.ending_stocks_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed') AS seed_ending_stocks_kt,
    max(b.production_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed Oil') AS oil_production_kt,
    max(b.imports_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed Oil') AS oil_imports_kt,
    max(b.exports_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed Oil') AS oil_exports_kt,
    max(b.domestic_consumption_kt)
      FILTER (
        WHERE b.market_name = 'US Rapeseed Oil'
      ) AS oil_domestic_consumption_kt,
    max(b.ending_stocks_kt)
      FILTER (WHERE b.market_name = 'US Rapeseed Oil') AS oil_ending_stocks_kt
  FROM target
  JOIN bounded AS b
    ON b.report_month = target.report_month
   AND b.market_year = target.market_year
  GROUP BY target.report_month, target.market_year;
$function$;

REVOKE ALL ON FUNCTION public.get_canola_us_balance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_canola_us_balance(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_canola_us_balance(text) IS
  'Returns at most one common USDA PSD snapshot for total U.S. Rapeseed seed and Rapeseed Oil balances from all origins. It is monthly balance-sheet context, not Canada-origin customs flow.';

NOTIFY pgrst, 'reload schema';
