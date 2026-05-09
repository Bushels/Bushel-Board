-- Re-apply get_usda_wasde_context with CGC↔USDA market_name mapping.
--
-- Background: migration 20260427120000 codified the live WASDE read path
-- (reads from usda_wasde_mapped, kt->mmt conversion, LAG-based revision_direction).
-- That migration is recorded as applied, but the live function body lacked the
-- CGC-name → USDA-market_name mapping clause, so callers like the desk that
-- pass `Canola` or `Amber Durum` got back empty results.
--
-- This migration is purely additive: same function signature and shape as
-- 20260427120000, with the requested-market CTE that translates CGC grain
-- names to the USDA PSD market names actually present in usda_wasde_mapped:
--   Amber Durum / Durum -> Wheat
--   Canola              -> Soybeans (best US proxy until canola-specific PSD data is wired in)
-- Otherwise the input is initcap'd to align with PSD market_name casing.

CREATE OR REPLACE FUNCTION public.get_usda_wasde_context(
  p_cgc_grain text,
  p_months_back int DEFAULT 3
)
RETURNS TABLE (
  report_date date,
  commodity text,
  country text,
  market_year text,
  ending_stocks_mmt numeric,
  stocks_to_use_pct numeric,
  revision_direction text,
  stocks_change_mmt numeric,
  production_mmt numeric,
  exports_mmt numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH requested_market AS (
    SELECT CASE lower(trim(p_cgc_grain))
      WHEN 'amber durum' THEN 'Wheat'
      WHEN 'durum' THEN 'Wheat'
      WHEN 'canola' THEN 'Soybeans'
      ELSE initcap(trim(p_cgc_grain))
    END AS market_name
  ),
  base AS (
    SELECT
      m.report_month AS report_date,
      m.market_name AS commodity,
      CASE
        WHEN m.country_code = 'US' THEN 'United States'
        ELSE m.country_code
      END AS country,
      m.market_year,
      (m.ending_stocks_kt / 1000.0)::numeric AS ending_stocks_mmt,
      m.stocks_to_use_pct,
      (m.production_kt / 1000.0)::numeric AS production_mmt,
      (m.exports_kt / 1000.0)::numeric AS exports_mmt,
      lag(m.ending_stocks_kt) OVER (
        PARTITION BY m.market_name, m.country_code, m.market_year
        ORDER BY m.report_month
      ) AS prior_ending_stocks_kt
    FROM public.usda_wasde_mapped m
    JOIN requested_market r
      ON lower(m.market_name) = lower(r.market_name)
    WHERE m.country_code = 'US'
  )
  SELECT
    b.report_date,
    b.commodity,
    b.country,
    b.market_year,
    b.ending_stocks_mmt,
    b.stocks_to_use_pct,
    CASE
      WHEN b.prior_ending_stocks_kt IS NULL OR b.ending_stocks_mmt IS NULL THEN NULL
      WHEN b.ending_stocks_mmt < (b.prior_ending_stocks_kt / 1000.0) THEN 'down'
      WHEN b.ending_stocks_mmt > (b.prior_ending_stocks_kt / 1000.0) THEN 'up'
      ELSE 'unchanged'
    END AS revision_direction,
    CASE
      WHEN b.prior_ending_stocks_kt IS NULL OR b.ending_stocks_mmt IS NULL THEN NULL
      ELSE b.ending_stocks_mmt - (b.prior_ending_stocks_kt / 1000.0)
    END AS stocks_change_mmt,
    b.production_mmt,
    b.exports_mmt
  FROM base b
  ORDER BY b.report_date DESC, b.market_year DESC, b.country
  LIMIT greatest(p_months_back, 0);
$$;

COMMENT ON FUNCTION public.get_usda_wasde_context(text, int) IS
  'WASDE/PSD context by market from usda_wasde_mapped. CGC name mapping: Amber Durum/Durum->Wheat, Canola->Soybeans, else initcap(input). KT->MMT conversion + LAG-based revision_direction inline. usda_wasde_estimates is deprecated; do not write to it. p_months_back caps monthly US rows; World coverage not yet mapped.';

COMMENT ON TABLE public.usda_wasde_estimates IS
  'Deprecated/orphaned for active reads. Retained for migration compatibility; current WASDE context reads public.usda_wasde_raw via public.usda_wasde_mapped (see get_usda_wasde_context).';

-- Trigger PostgREST schema reload so the new function shape is served immediately.
NOTIFY pgrst, 'reload schema';
