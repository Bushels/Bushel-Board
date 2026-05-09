-- Repair the forward-fill CAD normalization function to avoid referencing the
-- UPDATE target table from a FROM/LATERAL clause.

CREATE OR REPLACE FUNCTION public.recalculate_grain_prices_cad(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  usd_rows_updated integer,
  cad_rows_updated integer,
  missing_fx_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usd_rows_updated integer := 0;
  v_cad_rows_updated integer := 0;
  v_missing_fx_rows integer := 0;
BEGIN
  UPDATE public.grain_prices gp
  SET cad_price = gp.settlement_price
  WHERE gp.currency = 'CAD'
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND gp.cad_price IS DISTINCT FROM gp.settlement_price;

  GET DIAGNOSTICS v_cad_rows_updated = ROW_COUNT;

  UPDATE public.grain_prices gp
  SET cad_price = round((
    gp.settlement_price * (
      SELECT fx.rate
      FROM public.fx_rates fx
      WHERE fx.pair = 'USD/CAD'
        AND fx.date <= gp.price_date
      ORDER BY fx.date DESC
      LIMIT 1
    )
  )::numeric, 6)
  WHERE gp.currency = 'USD'
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND EXISTS (
      SELECT 1
      FROM public.fx_rates fx
      WHERE fx.pair = 'USD/CAD'
        AND fx.date <= gp.price_date
    )
    AND gp.cad_price IS DISTINCT FROM round((
      gp.settlement_price * (
        SELECT fx.rate
        FROM public.fx_rates fx
        WHERE fx.pair = 'USD/CAD'
          AND fx.date <= gp.price_date
        ORDER BY fx.date DESC
        LIMIT 1
      )
    )::numeric, 6);

  GET DIAGNOSTICS v_usd_rows_updated = ROW_COUNT;

  SELECT count(*)::integer
  INTO v_missing_fx_rows
  FROM public.grain_prices gp
  WHERE gp.currency = 'USD'
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND NOT EXISTS (
      SELECT 1
      FROM public.fx_rates fx
      WHERE fx.pair = 'USD/CAD'
        AND fx.date <= gp.price_date
    );

  RETURN QUERY SELECT v_usd_rows_updated, v_cad_rows_updated, v_missing_fx_rows;
END;
$$;

COMMENT ON FUNCTION public.recalculate_grain_prices_cad(date, date) IS
  'Backfills CAD-equivalent grain_prices.cad_price. Uses latest USD/CAD rate on or before the price date for USD contracts; CAD contracts pass through.';

GRANT EXECUTE ON FUNCTION public.recalculate_grain_prices_cad(date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
