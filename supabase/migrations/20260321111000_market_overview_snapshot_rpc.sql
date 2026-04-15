-- Canonical market overview snapshot RPC.
-- Aggregates all-grain overview totals server-side to avoid PostgREST truncation
-- on Terminal Receipts / Exports while preserving the full CGC exports formula.

CREATE OR REPLACE FUNCTION public.get_market_overview_snapshot(
  p_crop_year text,
  p_grain_week smallint
)
RETURNS TABLE (
  grain_week smallint,
  week_ending_date date,
  producer_deliveries_current_week_kt numeric,
  producer_deliveries_previous_week_kt numeric,
  producer_deliveries_crop_year_kt numeric,
  terminal_receipts_current_week_kt numeric,
  terminal_receipts_previous_week_kt numeric,
  terminal_receipts_crop_year_kt numeric,
  exports_current_week_kt numeric,
  exports_previous_week_kt numeric,
  exports_crop_year_kt numeric,
  commercial_stocks_current_week_kt numeric,
  commercial_stocks_previous_week_kt numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH target_week AS (
    SELECT p_grain_week AS grain_week
  ),
  previous_week AS (
    SELECT GREATEST((SELECT grain_week FROM target_week) - 1, 0)::smallint AS grain_week
  ),
  producer_deliveries_current AS (
    SELECT SUM(vcpd.total_kt) AS total_kt
    FROM public.v_country_producer_deliveries vcpd
    WHERE vcpd.crop_year = p_crop_year
      AND vcpd.grain_week = (SELECT grain_week FROM target_week)
      AND vcpd.period = 'Current Week'
  ),
  producer_deliveries_previous AS (
    SELECT SUM(vcpd.total_kt) AS total_kt
    FROM public.v_country_producer_deliveries vcpd
    WHERE vcpd.crop_year = p_crop_year
      AND vcpd.grain_week = (SELECT grain_week FROM previous_week)
      AND vcpd.period = 'Current Week'
  ),
  producer_deliveries_crop_year AS (
    SELECT SUM(vcpd.total_kt) AS total_kt
    FROM public.v_country_producer_deliveries vcpd
    WHERE vcpd.crop_year = p_crop_year
      AND vcpd.grain_week = (SELECT grain_week FROM target_week)
      AND vcpd.period = 'Crop Year'
  ),
  terminal_receipts_current AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Current Week'
  ),
  terminal_receipts_previous AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM previous_week)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Current Week'
  ),
  terminal_receipts_crop_year AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Crop Year'
  ),
  exports_current AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
      AND o.period = 'Current Week'
      AND (
        (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
        OR
        (o.worksheet = 'Primary Shipment Distribution'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export Destinations')
        OR
        (o.worksheet = 'Producer Cars'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export')
      )
  ),
  exports_previous AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM previous_week)
      AND o.period = 'Current Week'
      AND (
        (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
        OR
        (o.worksheet = 'Primary Shipment Distribution'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export Destinations')
        OR
        (o.worksheet = 'Producer Cars'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export')
      )
  ),
  exports_crop_year AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
      AND o.period = 'Crop Year'
      AND (
        (o.worksheet = 'Terminal Exports' AND o.metric = 'Exports')
        OR
        (o.worksheet = 'Primary Shipment Distribution'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export Destinations')
        OR
        (o.worksheet = 'Producer Cars'
         AND o.metric = 'Shipment Distribution'
         AND o.region = 'Export')
      )
  ),
  commercial_stocks_current AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
      AND o.worksheet = 'Summary'
      AND o.metric = 'Stocks'
      AND o.period = 'Current Week'
      AND o.grade = ''
  ),
  commercial_stocks_previous AS (
    SELECT SUM(o.ktonnes) AS total_kt
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM previous_week)
      AND o.worksheet = 'Summary'
      AND o.metric = 'Stocks'
      AND o.period = 'Current Week'
      AND o.grade = ''
  ),
  week_ending AS (
    SELECT MIN(o.week_ending_date::date) AS week_ending_date
    FROM public.cgc_observations o
    WHERE o.crop_year = p_crop_year
      AND o.grain_week = (SELECT grain_week FROM target_week)
  )
  SELECT
    (SELECT grain_week FROM target_week) AS grain_week,
    (SELECT week_ending_date FROM week_ending) AS week_ending_date,
    COALESCE((SELECT total_kt FROM producer_deliveries_current), 0) AS producer_deliveries_current_week_kt,
    COALESCE((SELECT total_kt FROM producer_deliveries_previous), 0) AS producer_deliveries_previous_week_kt,
    COALESCE((SELECT total_kt FROM producer_deliveries_crop_year), 0) AS producer_deliveries_crop_year_kt,
    COALESCE((SELECT total_kt FROM terminal_receipts_current), 0) AS terminal_receipts_current_week_kt,
    COALESCE((SELECT total_kt FROM terminal_receipts_previous), 0) AS terminal_receipts_previous_week_kt,
    COALESCE((SELECT total_kt FROM terminal_receipts_crop_year), 0) AS terminal_receipts_crop_year_kt,
    COALESCE((SELECT total_kt FROM exports_current), 0) AS exports_current_week_kt,
    COALESCE((SELECT total_kt FROM exports_previous), 0) AS exports_previous_week_kt,
    COALESCE((SELECT total_kt FROM exports_crop_year), 0) AS exports_crop_year_kt,
    COALESCE((SELECT total_kt FROM commercial_stocks_current), 0) AS commercial_stocks_current_week_kt,
    COALESCE((SELECT total_kt FROM commercial_stocks_previous), 0) AS commercial_stocks_previous_week_kt;
$$;

REVOKE ALL ON FUNCTION public.get_market_overview_snapshot(text, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_market_overview_snapshot(text, smallint) TO anon, authenticated, service_role;
