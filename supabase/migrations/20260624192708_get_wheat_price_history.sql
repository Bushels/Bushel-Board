-- Public-safe Wheat futures history for the farmer-facing thesis board.
--
-- grain_prices itself is not public-read. This RPC exposes only the bounded
-- Wheat contract rows needed for visual price confirmation on /thesis.

CREATE OR REPLACE FUNCTION public.get_wheat_price_history(
  p_days integer DEFAULT 60
)
RETURNS TABLE (
  price_leg text,
  grain text,
  contract text,
  exchange text,
  price_date date,
  settlement_price numeric,
  change_pct numeric,
  currency text,
  unit text,
  source text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH bounds AS (
    SELECT greatest(7, least(coalesce(p_days, 60), 180))::integer AS days
  ),
  classified AS (
    SELECT
      CASE
        WHEN upper(gp.contract) LIKE 'MW%'
          OR upper(gp.exchange) IN ('MGEX', 'MGE')
          OR gp.grain ILIKE '%spring wheat%'
          THEN 'Spring Wheat'
        WHEN upper(gp.contract) LIKE 'KE%'
          OR upper(gp.exchange) IN ('KCBT', 'KC')
          OR gp.grain ILIKE '%hrw%'
          OR gp.grain ILIKE '%hard red%'
          THEN 'HRW Wheat'
        WHEN upper(gp.contract) LIKE 'ZW%'
          OR (gp.grain ILIKE 'Wheat' AND upper(gp.exchange) IN ('CBOT', 'CME'))
          OR gp.grain ILIKE '%srw%'
          OR gp.grain ILIKE '%soft red%'
          THEN 'SRW Wheat'
        ELSE NULL
      END AS price_leg,
      gp.grain,
      gp.contract,
      gp.exchange,
      gp.price_date,
      gp.settlement_price,
      gp.change_pct,
      gp.currency,
      gp.unit,
      gp.source
    FROM public.grain_prices gp
    CROSS JOIN bounds b
    WHERE gp.price_date >= current_date - b.days
      AND gp.settlement_price IS NOT NULL
      AND (
        upper(gp.contract) LIKE 'MW%'
        OR upper(gp.contract) LIKE 'KE%'
        OR upper(gp.contract) LIKE 'ZW%'
        OR gp.grain ILIKE '%wheat%'
      )
  )
  SELECT
    classified.price_leg,
    classified.grain,
    classified.contract,
    classified.exchange,
    classified.price_date,
    classified.settlement_price,
    classified.change_pct,
    classified.currency,
    classified.unit,
    classified.source
  FROM classified
  WHERE classified.price_leg IS NOT NULL
  ORDER BY
    CASE classified.price_leg
      WHEN 'Spring Wheat' THEN 1
      WHEN 'HRW Wheat' THEN 2
      WHEN 'SRW Wheat' THEN 3
      ELSE 4
    END,
    classified.price_date ASC,
    classified.contract ASC;
$$;

REVOKE ALL ON FUNCTION public.get_wheat_price_history(integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_wheat_price_history(integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_wheat_price_history(integer) IS
  'Returns a bounded public-safe Wheat futures history for Spring Wheat, HRW, and SRW price-confirmation visuals. Does not expose broad grain_prices table access.';

NOTIFY pgrst, 'reload schema';
